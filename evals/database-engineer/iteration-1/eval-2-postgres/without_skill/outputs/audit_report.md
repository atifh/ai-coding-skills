# Prisma + PostgreSQL Performance Review

Here's what I found looking at your schema and service files:

## Schema Issues

**Missing indexes on foreign keys**
Your Prisma schema has no `@@index` directives at all. PostgreSQL doesn't automatically create indexes on FK columns (only on the referenced PK). You need to add indexes on:
- `Order.userId`
- `OrderItem.orderId` and `OrderItem.productId`  
- `Review.userId` and `Review.productId`

Example:
```prisma
model Order {
  @@index([userId])
}
```

## Query Issues

**N+1 in getUserDashboard**
You're fetching orders then querying items for each one in a loop. Use Prisma's `include` to get it in one query:
```ts
const orders = await prisma.order.findMany({
  where: { userId },
  include: { items: true }
})
```

**Redundant query in getProductDetail**
You're calling `findUnique` twice for the same product (lines 29 and 37). Remove the second call and use the result from the first.

**Unbounded getAllProducts**
`prisma.product.findMany()` with no `take` will return every product. Add pagination.

**No transaction in placeOrder**
This is a data integrity issue. You create an order, then create items and update stock in separate awaits. If something fails mid-way, you'll have an order with missing items or incorrect stock. Wrap everything in `prisma.$transaction()`.

## Configuration

You're creating PrismaClient with default settings. For production you should configure the connection pool size explicitly based on your server resources.

## Summary

Priority fixes:
1. Add `@@index` to all FK fields in schema.prisma
2. Fix the N+1 in getUserDashboard with `include`
3. Wrap placeOrder in a transaction
4. Add pagination to getAllProducts
