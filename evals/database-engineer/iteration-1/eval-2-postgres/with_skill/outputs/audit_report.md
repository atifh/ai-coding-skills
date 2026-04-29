# Database Audit Report

**Database**: PostgreSQL (via Prisma ORM)
**Files reviewed**: `schema.prisma`, `services/orderService.ts`

## Summary

Found 9 issues. The most critical are: `placeOrder` has no transaction (a crash mid-order leaves stock decremented but items unrecorded), and zero `@@index` directives in the entire schema — every FK lookup is a sequential scan. The N+1 in `getUserDashboard` and the redundant double-fetch in `getProductDetail` are compounding the slowness as data grows.

---

## 🔴 Critical

**1. `placeOrder` writes without a transaction**
- **Location**: `orderService.ts:46-61`
- **Impact**: The order is created first, then items and stock decrements are written in separate awaits. A failure halfway through (network blip, constraint violation, crash) leaves: an order with no items, or stock decremented but no OrderItem record. Money and inventory can desync permanently.
- **Fix**:
```ts
export async function placeOrder(userId: number, items: Array<...>) {
  return prisma.$transaction(async (tx) => {
    const total = items.reduce((s, i) => s + i.price * i.quantity, 0)
    const order = await tx.order.create({ data: { userId, status: 'pending', total } })

    for (const item of items) {
      await tx.orderItem.create({
        data: { orderId: order.id, productId: item.productId, quantity: item.quantity, price: item.price },
      })
      await tx.product.update({
        where: { id: item.productId },
        data: { stock: { decrement: item.quantity } },
      })
    }
    return order
  })
}
```

**2. No indexes on any foreign key fields**
- **Location**: `schema.prisma` — entire file has zero `@@index` directives
- **Impact**: PostgreSQL does NOT auto-index FK columns (only the PK target). Every relation lookup is a sequential scan:
  - `Order.userId` — used in `getUserDashboard` WHERE clause
  - `OrderItem.orderId` — used in N+1 loop WHERE clause
  - `OrderItem.productId` — used in product relation lookups
  - `Review.userId`, `Review.productId` — used whenever reviews are loaded by product or user
- **Fix** — add to each model:
```prisma
model Order {
  // ...existing fields...
  @@index([userId])
  @@index([status, createdAt(sort: Desc)])
}

model OrderItem {
  // ...existing fields...
  @@index([orderId])
  @@index([productId])
}

model Review {
  // ...existing fields...
  @@index([productId])
  @@index([userId])
}
```

---

## 🟡 Important

**3. N+1 in `getUserDashboard`**
- **Location**: `orderService.ts:8-17`
- **Impact**: Fetches all orders, then fires one `orderItem.findMany` per order. 20 orders = 21 queries. Use Prisma's `include` instead:
- **Fix**:
```ts
const orders = await prisma.order.findMany({
  where: { userId },
  orderBy: { createdAt: 'desc' },
  include: { items: true },
})
```

**4. Redundant double-fetch in `getProductDetail`**
- **Location**: `orderService.ts:29-39` — `findUnique` called twice for the same product ID
- **Impact**: Unnecessary round-trip to the database on every product page load.
- **Fix**: Remove the second `findUnique`. Use `product` from the first call:
```ts
const [product, reviews] = await Promise.all([
  prisma.product.findUnique({ where: { id: productId } }),
  prisma.review.findMany({ where: { productId }, select: { rating: true, comment: true, user: { select: { name: true } } } }),
])
const avgRating = reviews.length
  ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
  : null
return { ...product, reviews, avgRating }
```

**5. App-side average in `getProductDetail`**
- **Location**: `orderService.ts:32-34`
- **Impact**: Fetches all review rows (including `comment`, `userId`, etc.) just to compute an average. Grows with review count.
- **Fix**: Use Prisma aggregate:
```ts
const { _avg } = await prisma.review.aggregate({
  where: { productId },
  _avg: { rating: true },
})
```

**6. Unbounded `getAllProducts`**
- **Location**: `orderService.ts:23-25`
- **Impact**: Returns every product row with no limit. Will break under catalog growth.
- **Fix**: Add `take` and `skip` pagination parameters.

**7. Unindexed `status` filter + `ORDER BY createdAt` in `getOrdersByStatus`**
- **Location**: `orderService.ts:64-68`
- **Impact**: PostgreSQL will do a seq scan on `orders` filtered by `status`, then sort. The composite index `@@index([status, createdAt(sort: Desc)])` from fix #2 covers this.

---

## 🟢 Nice to have

**8. No connection pool configuration**
- **Location**: `orderService.ts:3` — `new PrismaClient()` with no options
- **Impact**: Prisma defaults to a pool size of `num_cpus * 2 + 1`. Fine for dev, but set explicitly for production and consider a connection limit per replica:
```ts
const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } },
  log: process.env.NODE_ENV === 'development' ? ['query', 'warn', 'error'] : ['warn', 'error'],
})
```

**9. `getAllProducts` fetches all columns including `description`**
- **Location**: `orderService.ts:23-25`
- **Impact**: `description` is likely a long TEXT field. Add `select` to return only what the list view needs.

---

## What's already good

- `User.email @unique` — correct, Prisma creates a unique index automatically
- Prisma's relational model is clean and well-typed
- `@id @default(autoincrement())` on all models — efficient integer PKs

---

Want me to apply all fixes, or select specific ones to apply?
