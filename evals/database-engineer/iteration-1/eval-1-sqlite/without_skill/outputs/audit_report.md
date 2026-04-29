# SQLite Database Review

Looking at your `db.js` and `routes/posts.js`, here are some things to improve:

## Performance Issues

**N+1 Queries in GET /**
In your main posts route, you're running queries inside a loop:
```js
for (const post of posts) {
  post.comments = db.prepare('SELECT * FROM comments WHERE post_id = ?').all(post.id)
  post.author = db.prepare('SELECT * FROM users WHERE id = ?').get(post.user_id)
  post.likes = db.prepare('SELECT COUNT(*) as count FROM likes WHERE post_id = ?').get(post.id)
}
```
This runs 3 queries per post. You should fetch all data in batch queries instead.

**Missing Indexes**
Your schema doesn't have indexes on foreign key columns. SQLite doesn't create these automatically. You should add:
- `CREATE INDEX ON posts(user_id)`
- `CREATE INDEX ON comments(post_id)` 
- `CREATE INDEX ON likes(post_id)`

**App-side aggregation in /stats**
Instead of pulling all posts and filtering in JS:
```js
const allPosts = db.prepare('SELECT * FROM posts').all()
```
Use SQL:
```sql
SELECT status, COUNT(*) as count FROM posts GROUP BY status
```

**No LIMIT on search**
The `/search` route returns all matching rows with no limit. Add pagination.

## Missing Transactions

The DELETE route does 3 separate writes without a transaction. If one fails, you get partial deletes:
```js
db.prepare('DELETE FROM likes WHERE post_id = ?').run(req.params.id)
db.prepare('DELETE FROM comments WHERE post_id = ?').run(req.params.id)
db.prepare('DELETE FROM posts WHERE id = ?').run(req.params.id)
```
Wrap these in `db.transaction(...)`.

## SQLite Configuration

You should set some pragmas when you open the database:
- `journal_mode = WAL` for better concurrent access
- `foreign_keys = ON` so your foreign key references actually get enforced
- Consider setting `cache_size` to something larger than the default

## Summary

The main issues are the N+1 query pattern and missing indexes. Fix those first and you'll see the biggest performance improvement. The transaction fix is important for data integrity.
