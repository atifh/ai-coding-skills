import { Router } from 'express'
import Post from '../models/Post.js'
import User from '../models/User.js'

const router = Router()

// No lean(), no limit, N+1 author fetch
router.get('/', async (req, res) => {
  const posts = await Post.find({ status: 'published' }).sort({ createdAt: -1 })

  for (const post of posts) {
    post._doc.author = await User.findById(post.authorId) // N+1, no lean()
  }

  res.json(posts)
})

// $where causes a full collection scan
router.get('/search', async (req, res) => {
  const { q } = req.query
  const posts = await Post.find({
    $where: `this.title.includes('${q}') || this.content.includes('${q}')`,
  })
  res.json(posts)
})

// Pulls entire collection into memory for a count
router.get('/stats', async (req, res) => {
  const posts = await Post.find() // no lean(), no limit, no index
  const byStatus = posts.reduce((acc, p) => {
    acc[p.status] = (acc[p.status] || 0) + 1
    return acc
  }, {})
  res.json(byStatus)
})

// Queries on unindexed array field, sorts on unindexed numeric field
router.get('/by-tag/:tag', async (req, res) => {
  const posts = await Post.find({ tags: req.params.tag })
    .sort({ viewCount: -1 })
  res.json(posts)
})

// Finds user by unindexed email field
router.get('/by-author-email', async (req, res) => {
  const user = await User.findOne({ email: req.query.email }) // no lean(), email unindexed
  if (!user) return res.status(404).json({ error: 'Not found' })
  const posts = await Post.find({ authorId: user._id }).sort({ createdAt: -1 }) // authorId unindexed
  res.json(posts)
})

export default router
