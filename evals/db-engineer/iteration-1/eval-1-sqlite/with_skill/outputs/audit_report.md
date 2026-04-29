# Database Audit Report

**Database**: SQLite (better-sqlite3)
**Files reviewed**: `db.js`, `routes/posts.js`

## Summary

Found 10 issues across schema, queries, and configuration. The most critical are: zero SQLite PRAGMAs configured (the database is running with unsafe defaults), three unindexed foreign key columns that get queried on every request, and an N+1 pattern in `GET /` that fires 3 queries per post. The delete route is also a data integrity risk — three writes with no transaction.

---

## 🔴 Critical

**1. No SQLite PRAGMAs configured**
- **Location**: `db.js:3` — connection opened with zero configuration
- **Impact**: `journal_mode` defaults to DELETE (no concurrent reads), `foreign_keys` defaults to OFF (FK constraints silently ignored), `cache_size` defaults to ~2 MB (excessive I/O), `synchronous = FULL` causes an fsync on every write
- **Fix**:
```js
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')
db.pragma('synchronous = NORMAL')
db.pragma('cache_size = -32000')   // 32 MB
db.pragma('temp_store = MEMORY')
db.pragma('mmap_size = 67108864')  // 64 MB
```

**2. N+1 query pattern in `GET /`**
- **Location**: `routes/posts.js:10-14`
- **Impact**: For N published posts, this fires `1 + 3N` queries. With 50 posts: 151 queries per request. Grows unbounded with data.
- **Fix**: Use a single JOIN query to fetch posts with authors, then batch-fetch comments and likes by post ID:
```js
const posts = db.prepare(`
  SELECT p.*, u.name AS author_name, u.email AS author_email
  FROM posts p JOIN users u ON u.id = p.user_id
  WHERE p.status = ?
`).all('published')

const ids = posts.map(p => p.id)
const placeholders = ids.map(() => '?').join(',')
const comments = db.prepare(`SELECT * FROM comments WHERE post_id IN (${placeholders})`).all(...ids)
const likes = db.prepare(`SELECT post_id, COUNT(*) as count FROM likes WHERE post_id IN (${placeholders}) GROUP BY post_id`).all(...ids)
```

**3. Missing transaction on DELETE `/:id`**
- **Location**: `routes/posts.js:50-54`
- **Impact**: If the server crashes or an error occurs between the three `DELETE` statements, the database is left in a partially deleted state (e.g., likes deleted but post still exists, or comments orphaned).
- **Fix**:
```js
db.transaction(() => {
  db.prepare('DELETE FROM likes WHERE post_id = ?').run(req.params.id)
  db.prepare('DELETE FROM comments WHERE post_id = ?').run(req.params.id)
  db.prepare('DELETE FROM posts WHERE id = ?').run(req.params.id)
})()
```

---

## 🟡 Important

**4. Missing index on `posts.user_id` (FK, unindexed)**
- **Location**: `db.js:22` — `user_id INTEGER REFERENCES users(id)` with no index
- **Impact**: `GET /by-user/:userId` and the balance query in `GET /` both scan the full `posts` table. SQLite never auto-creates FK indexes.
- **Fix**: `CREATE INDEX IF NOT EXISTS idx_posts_user_id ON posts(user_id);`

**5. Missing index on `comments.post_id` (FK, unindexed)**
- **Location**: `db.js:31` — used in the N+1 loop `WHERE post_id = ?`
- **Impact**: Every `WHERE post_id = ?` is a full table scan on `comments`.
- **Fix**: `CREATE INDEX IF NOT EXISTS idx_comments_post_id ON comments(post_id);`

**6. Missing index on `likes.post_id` (FK, unindexed)**
- **Location**: `db.js:38` — used in the count query `WHERE post_id = ?` per post
- **Impact**: Every like count is a full scan of the `likes` table.
- **Fix**: `CREATE INDEX IF NOT EXISTS idx_likes_post_id ON likes(post_id);`

**7. Missing index on `posts.status` + `posts.created_at`**
- **Location**: `db.js:23-27` — `WHERE status = ? ORDER BY created_at DESC` used in `GET /` and `GET /search`
- **Impact**: Full table scan + in-memory sort on every request to the two most-used routes.
- **Fix**: `CREATE INDEX IF NOT EXISTS idx_posts_status_created ON posts(status, created_at DESC);`

**8. Unbounded result in `GET /search`**
- **Location**: `routes/posts.js:22-27`
- **Impact**: A query like `?q=the` could return tens of thousands of rows with no limit.
- **Fix**: Add `LIMIT ? OFFSET ?` with pagination parameters.

---

## 🟢 Nice to have

**9. App-side aggregation in `GET /stats`**
- **Location**: `routes/posts.js:32-39`
- **Impact**: Pulls every post row into Node.js memory just to count. Use SQL aggregates instead:
- **Fix**:
```js
const stats = db.prepare(`
  SELECT
    COUNT(*) AS total,
    COUNT(CASE WHEN status = 'published' THEN 1 END) AS published,
    COUNT(CASE WHEN status = 'draft' THEN 1 END) AS draft
  FROM posts
`).get()
```

**10. Missing index on `comments.user_id`**
- **Location**: `db.js:32` — if comments are ever filtered or joined by user
- **Fix**: `CREATE INDEX IF NOT EXISTS idx_comments_user_id ON comments(user_id);`

---

## What's already good

- `email TEXT UNIQUE NOT NULL` on users — correct, implicit index
- Primary keys are integers (fast rowid lookups)
- better-sqlite3 is used synchronously — no async/callback complexity

---

Want me to apply all fixes, or select specific ones to apply?
