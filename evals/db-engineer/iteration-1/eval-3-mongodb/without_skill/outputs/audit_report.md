# MongoDB Performance Review

Here's what I see looking at your models and routes:

## Missing Indexes

Your Post and User models have no indexes defined at all. As your collection grows this will get very slow. You should add indexes for the fields you query most:

```js
// In Post model
postSchema.index({ status: 1 })
postSchema.index({ authorId: 1 })
postSchema.index({ tags: 1 })

// In User model  
userSchema.index({ email: 1 }, { unique: true })
```

## Performance Issues

**N+1 queries in GET /**
You're fetching the author for each post inside a loop — that's one extra query per post. Use Mongoose `populate` instead:
```js
const posts = await Post.find({ status: 'published' })
  .sort({ createdAt: -1 })
  .populate('authorId')
```
(You'll also need to add `ref: 'User'` to the authorId field in your schema.)

**$where is slow and dangerous**
`$where` in your search route runs JavaScript on every document — it can't use indexes and will scan your entire collection. Use `$regex` or MongoDB text search instead. Also note that string interpolation in `$where` can be exploited.

**Missing .lean()**
Your queries return full Mongoose documents which have a lot of overhead. For read-only routes add `.lean()`:
```js
const posts = await Post.find({ status: 'published' }).lean()
```

**App-side counting in /stats**
You're loading every post document just to count them. Use aggregation instead:
```js
const stats = await Post.aggregate([
  { $group: { _id: '$status', count: { $sum: 1 } } }
])
```

**No limits on queries**
None of your listing routes have a `.limit()`. Add pagination to avoid returning huge result sets.

## Summary

Main things to fix:
1. Add indexes to both models
2. Replace $where with $regex or text search
3. Add .lean() to read-only queries
4. Fix N+1 with populate
5. Add limits/pagination
