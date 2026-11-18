import 'dotenv/config'

// Get MongoDB connection string
const MONGO_CLIENT_URI = process.env.MONGO_CLIENT_URI

// Validate required environment variables
if (!MONGO_CLIENT_URI) {
  throw new Error(
    'Missing required environment variable: MONGO_CLIENT_URI. Please check your .env file.'
  )
}

// Export environment variables
export const env = {
  PORT: Number(process.env.PORT) || 5000,
  MONGO_CLIENT_URI,
  CLIENT_URL: process.env.CLIENT_URL || 'http://localhost:3000',
}
