import { MongoClient } from 'mongodb'
import { env } from './env.js'

export const DB_NAME = 'rentora'

const client = new MongoClient(env.MONGO_CLIENT_URI)
/** @type {import("mongodb").Db} */
let db = client.db(DB_NAME)

async function connectToMongoDB() {
  try {
    await client.connect()

    db = client.db(DB_NAME)

    await db.command({ ping: 1 })

    console.log('You successfully connected to MongoDB!')

    return db
  } catch (error) {
    console.error('MongoDB Connection Failed:', error)
    throw error
  }
}
export const userCollection = db.collection('user')
export const equipmentCollection = db.collection('equipment')
export const favoritesCollection = db.collection('favorites')
export const bookingsCollection = db.collection('bookings')

export default connectToMongoDB
