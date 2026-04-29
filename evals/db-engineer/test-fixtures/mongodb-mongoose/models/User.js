import mongoose from 'mongoose'

// No indexes — email not indexed, role not indexed
const userSchema = new mongoose.Schema({
  name: String,
  email: String,        // should be unique + indexed
  role: String,
  createdAt: { type: Date, default: Date.now },
})

export default mongoose.model('User', userSchema)
