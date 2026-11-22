import { MongoClient } from 'mongodb'
import { env } from './env.js'

export const DB_NAME = 'rentora'

export const client = new MongoClient(env.MONGO_CLIENT_URI)
/** @type {import("mongodb").Db} */
let db = client.db(DB_NAME)

async function connectToMongoDB() {
  try {
    await client.connect()

    db = client.db(DB_NAME)

    await db.command({ ping: 1 })

    // Create unique index for Stripe session ID
    await db.collection('bookings').createIndex(
      { stripeSessionId: 1 },
      {
        unique: true,
        partialFilterExpression: {
          stripeSessionId: { $type: 'string' },
        },
      }
    )

    await db.collection('payments').createIndex(
      { stripeSessionId: 1 },
      {
        unique: true,
        partialFilterExpression: {
          stripeSessionId: { $type: 'string' },
        },
      }
    )

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
export const checkoutIntentsCollection = db.collection('checkoutIntents')
export const bookingsCollection = db.collection('bookings')
export const paymentsCollection = db.collection('payments')
export const categoriesCollection = db.collection('categories')
export default connectToMongoDB
