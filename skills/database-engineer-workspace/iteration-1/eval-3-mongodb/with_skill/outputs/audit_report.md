# Database Audit Report

**Database**: MongoDB (Mongoose ODM)
**Files reviewed**: `models/Post.js`, `models/User.js`, `routes/posts.js`

## Summary

Found 10 issues. The most severe: `$where` in `/search` forces a full collection scan and is also a JavaScript injection vulnerability; `GET /stats` loads every document into Node.js memory to count; and both models have zero indexes — every query is a `COLLSCAN`. The N+1 author fetch and missing `.lean()` compound the problem on every request.

---

## 🔴 Critical

**1. `$where` in `/search` — full collection scan + injection risk**
- **Location**: `routes/posts.js:21-24`
- **Impact**: `$where` executes a JavaScript expression against every document in the collection. It cannot use any index. It also allows JavaScript injection — `?q=') || true || ('` would return all documents.
- **Fix**: Use `$regex` or MongoDB text search:
```js
// Option A: regex (uses index if text index exists)
Post.find({
  $or: [
    { title: { $regex: q, $options: 'i' } },
    { content: { $regex: q, $options: 'i' } },
  ]
})

// Option B: full-text search (add text index to schema first)
// postSchema.index({ title: 'text', content: 'text' })
Post.find({ $text: { $search: q } }).lean()
```

**2. No indexes on any fields in either model**
- **Location**: `models/Post.js:4-12`, `models/User.js` (all fields)
- **Impact**: Every query in the entire app is a `COLLSCAN` — MongoDB reads every document in the collection to find results. All queries below hit this.
- **Fix** — add to `Post` schema:
```js
postSchema.index({ status: 1, createdAt: -1 })  // GET / and general listing
postSchema.index({ authorId: 1, createdAt: -1 }) // GET /by-author-email second query
postSchema.index({ tags: 1 })                    // GET /by-tag (multikey index on array)
postSchema.index({ title: 'text', content: 'text' }) // for /search
```
Add to `User` schema:
```js
userSchema.index({ email: 1 }, { unique: true }) // GET /by-author-email lookup
```

**3. App-side aggregation in `/stats`**
- **Location**: `routes/posts.js:29-34`
- **Impact**: `Post.find()` with no filter, no limit, no projection — loads every document including `title` and `content` (likely large fields) into Node.js memory just to count by status. Will OOM as collection grows.
- **Fix**: Use MongoDB aggregation pipeline:
```js
const stats = await Post.aggregate([
  { $group: { _id: '$status', count: { $sum: 1 } } }
])
// Or simpler with countDocuments:
const [total, published, draft] = await Promise.all([
  Post.countDocuments(),
  Post.countDocuments({ status: 'published' }),
  Post.countDocuments({ status: 'draft' }),
])
```

---

## 🟡 Important

**4. N+1 in `GET /`**
- **Location**: `routes/posts.js:11-13`
- **Impact**: One `User.findById` per post inside a loop. 30 posts = 31 queries. Use Mongoose `populate` or a single batched lookup:
- **Fix**:
```js
// Option A: Mongoose populate
const posts = await Post.find({ status: 'published' })
  .sort({ createdAt: -1 })
  .populate('authorId', 'name email')
  .lean()

// Option B: manual batch
const posts = await Post.find({ status: 'published' }).sort({ createdAt: -1 }).lean()
const authorIds = [...new Set(posts.map(p => p.authorId.toString()))]
const authors = await User.find({ _id: { $in: authorIds } }).lean()
const authorMap = Object.fromEntries(authors.map(a => [a._id.toString(), a]))
```

**5. Missing `.lean()` on all read-only queries**
- **Location**: `routes/posts.js:9, 29, 38, 46, 48`
- **Impact**: Every `Post.find()` and `User.findOne()` without `.lean()` hydrates full Mongoose documents — creates getter/setter proxies, tracks changes, adds ~2-5x memory overhead compared to plain objects. For read-only responses, this is pure waste.
- **Fix**: Add `.lean()` to every query that isn't being modified before save.

**6. Unindexed sort on `viewCount` in `/by-tag`**
- **Location**: `routes/posts.js:40`
- **Impact**: Even after adding an index on `tags`, the `.sort({ viewCount: -1 })` requires a separate in-memory sort pass. Add `viewCount` to the compound index:
- **Fix**: `postSchema.index({ tags: 1, viewCount: -1 })`

**7. No LIMIT on any listing query**
- **Location**: `routes/posts.js:9, 38, 48`
- **Impact**: All three listing routes return unbounded result sets. A collection with 100k posts will attempt to serialize and send all of them.
- **Fix**: Add `.limit(50)` (or a paginated `skip`/`limit`) to all listing queries.

---

## 🟢 Nice to have

**8. `User.findOne({ email })` without `.lean()`**
- **Location**: `routes/posts.js:46`
- **Impact**: Returns a full Mongoose document for a lookup that only needs `_id`. Add `.lean().select('_id')`.

**9. `$where` aside — string interpolation in queries is unsafe**
- **Location**: `routes/posts.js:22`
- Even after replacing `$where` with `$regex`, use a variable directly rather than template string interpolation. `$regex: q` (not `$regex: \`${q}\``) avoids double-stringification issues.

**10. `postSchema` has no `_id` reference for `authorId`**
- **Location**: `models/Post.js:7`
- `authorId: mongoose.Schema.Types.ObjectId` works, but adding `ref: 'User'` enables `populate()` and makes the schema self-documenting:
```js
authorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
```

---

## What's already good

- Using `mongoose.Schema.Types.ObjectId` for the authorId type — correct type for references
- Route structure is clean and readable
- Default values defined in the schema (`status: 'draft'`, `viewCount: 0`)

---

Want me to apply all fixes, or select specific ones to apply?
