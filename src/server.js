import app from './app.js'
import connectToMongoDB from './config/db.js'
import { env } from './config/env.js'

async function startServer() {
  try {
    await connectToMongoDB()

    app.listen(env.PORT, () => {
      console.log(`Server running on port ${env.PORT}`)
    })
  } catch (error) {
    console.error(error)
  }
}
startServer()
