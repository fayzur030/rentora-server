import 'dotenv/config'

// Get MongoDB connection string
const MONGO_CLIENT_URI = process.env.MONGO_CLIENT_URI
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET

// Validate required environment variables
if (!MONGO_CLIENT_URI || !STRIPE_SECRET_KEY || !STRIPE_WEBHOOK_SECRET) {
  const missingVariables = [
    ['MONGO_CLIENT_URI', MONGO_CLIENT_URI],
    ['STRIPE_SECRET_KEY', STRIPE_SECRET_KEY],
    ['STRIPE_WEBHOOK_SECRET', STRIPE_WEBHOOK_SECRET],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name)

  throw new Error(
    `Missing required environment variable(s): ${missingVariables.join(', ')}. Please check your .env file.`
  )
}

// Export environment variables
export const env = {
  PORT: Number(process.env.PORT) || 5000,
  MONGO_CLIENT_URI,
  CLIENT_URL: process.env.CLIENT_URL || 'http://localhost:3000',
  STRIPE_SECRET_KEY,
  STRIPE_WEBHOOK_SECRET,
}
