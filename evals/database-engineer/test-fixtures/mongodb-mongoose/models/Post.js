import mongoose from 'mongoose'

// No indexes defined — all fields unindexed
const postSchema = new mongoose.Schema({
  title: String,
  content: String,
  authorId: mongoose.Schema.Types.ObjectId,
  tags: [String],
  status: { type: String, default: 'draft' },
  viewCount: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
})

export default mongoose.model('Post', postSchema)
