import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
// No pool configuration — using Prisma defaults

// N+1: loading orders then fetching items individually in a loop
export async function getUserDashboard(userId: number) {
  const orders = await prisma.order.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  })

  for (const order of orders) {
    (order as any).items = await prisma.orderItem.findMany({
      where: { orderId: order.id },
    })
  }

  return orders
}

// Unbounded query — no take/skip
export async function getAllProducts() {
  return prisma.product.findMany()
}

// Redundant fetch + app-side average instead of SQL aggregate
export async function getProductDetail(productId: number) {
  const product = await prisma.product.findUnique({ where: { id: productId } })
  const reviews = await prisma.review.findMany({ where: { productId } })

  const avgRating = reviews.length
    ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
    : null

  // Fetches product a second time unnecessarily
  const freshProduct = await prisma.product.findUnique({ where: { id: productId } })

  return { ...freshProduct, reviews, avgRating }
}

// Multiple writes with no transaction — partial failure leaves DB in broken state
export async function placeOrder(userId: number, items: Array<{ productId: number; quantity: number; price: number }>) {
  const total = items.reduce((s, i) => s + i.price * i.quantity, 0)

  const order = await prisma.order.create({
    data: { userId, status: 'pending', total },
  })

  for (const item of items) {
    await prisma.orderItem.create({
      data: { orderId: order.id, productId: item.productId, quantity: item.quantity, price: item.price },
    })
    await prisma.product.update({
      where: { id: item.productId },
      data: { stock: { decrement: item.quantity } },
    })
  }

  return order
}

// Filtering by unindexed column with ORDER BY on another unindexed column
export async function getOrdersByStatus(status: string) {
  return prisma.order.findMany({
    where: { status },
    orderBy: { createdAt: 'desc' },
  })
}
