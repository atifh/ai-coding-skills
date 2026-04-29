import { Router } from 'express'
import db from '../db.js'

const router = Router()

// GET /posts — N+1: fetches comments and author per post in a loop
router.get('/', (req, res) => {
  const posts = db.prepare('SELECT * FROM posts WHERE status = ?').all('published')

  for (const post of posts) {
    post.comments = db.prepare('SELECT * FROM comments WHERE post_id = ?').all(post.id)
    post.author = db.prepare('SELECT * FROM users WHERE id = ?').get(post.user_id)
    post.likes = db.prepare('SELECT COUNT(*) as count FROM likes WHERE post_id = ?').get(post.id)
  }

  res.json(posts)
})

// GET /posts/search — unbounded result, ORDER BY on unindexed column
router.get('/search', (req, res) => {
  const { q } = req.query
  const posts = db.prepare(`
    SELECT * FROM posts
    WHERE title LIKE ? OR content LIKE ?
    ORDER BY created_at DESC
  `).all(`%${q}%`, `%${q}%`)
  res.json(posts)
})

// GET /posts/stats — app-side aggregation (pulls all rows into memory)
router.get('/stats', (req, res) => {
  const allPosts = db.prepare('SELECT * FROM posts').all()
  const stats = {
    total: allPosts.length,
    published: allPosts.filter(p => p.status === 'published').length,
    draft: allPosts.filter(p => p.status === 'draft').length,
  }
  res.json(stats)
})

// GET /posts/by-user/:userId — unindexed filter
router.get('/by-user/:userId', (req, res) => {
  const posts = db.prepare(`
    SELECT * FROM posts WHERE user_id = ? ORDER BY created_at DESC
  `).all(req.params.userId)
  res.json(posts)
})

// DELETE /posts/:id — 3 related writes without a transaction
router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM likes WHERE post_id = ?').run(req.params.id)
  db.prepare('DELETE FROM comments WHERE post_id = ?').run(req.params.id)
  db.prepare('DELETE FROM posts WHERE id = ?').run(req.params.id)
  res.sendStatus(204)
})

export default router
