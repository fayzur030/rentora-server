import express from 'express'
import cors from 'cors'
import routes from './routes/index.js'
import { env } from './config/env.js'
import { stripe } from './config/stripe.js'
import { bookingsCollection } from './config/db.js'
import { ObjectId } from 'mongodb'

const app = express()

app.use(
  cors({
    origin: env.CLIENT_URL,
  })
)

// Stripe Webhook

app.post(
  '/api/webhooks/stripe',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    // Step 1: Verify Stripe webhook signature.
    let event

    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        req.headers['stripe-signature'],
        process.env.STRIPE_WEBHOOK_SECRET
      )
    } catch (error) {
      console.error('Stripe webhook verification failed:', error.message)

      return res.status(400).send(`Webhook Error: ${error.message}`)
    }

    // Step 2: Handle checkout session completed event.
    try {
      if (event.type === 'checkout.session.completed') {
        const session = event.data.object

        // Step 3: Get booking ID from Stripe metadata.
        const bookingId = session.metadata?.bookingId

        console.log('Payment completed for booking:', bookingId)

        // Step 4: Validate booking ID.
        if (!bookingId || !ObjectId.isValid(bookingId)) {
          console.error('Invalid booking ID:', bookingId)

          return res.status(400).json({
            success: false,
            message: 'Invalid booking ID',
          })
        }

        // Step 5: Check payment status.
        if (session.payment_status !== 'paid') {
          return res.json({ received: true })
        }

        // Step 6: Update booking in MongoDB.
        const result = await bookingsCollection.updateOne(
          {
            _id: new ObjectId(bookingId),
            stripeSessionId: session.id,
            paymentStatus: { $ne: 'paid' },
          },
          {
            $set: {
              bookingStatus: 'confirmed',
              paymentStatus: 'paid',
              updatedAt: new Date(),
            },
          }
        )

        // Step 7: Check booking update result.
        if (result.matchedCount === 0) {
          const existingBooking = await bookingsCollection.findOne({
            _id: new ObjectId(bookingId),
            stripeSessionId: session.id,
            paymentStatus: 'paid',
            bookingStatus: 'confirmed',
          })

          if (existingBooking) {
            console.log('Booking already confirmed:', bookingId)

            return res.json({ received: true })
          }

          console.error('Booking not found or session mismatch:', bookingId)

          return res.status(404).json({
            success: false,
            message: 'Booking not found or session mismatch',
          })
        }

        console.log('Booking confirmed successfully:', bookingId)
      }

      // Step 8: Acknowledge Stripe webhook.
      return res.json({ received: true })
    } catch (error) {
      console.error('Webhook processing error:', error)

      return res.status(500).json({
        success: false,
        message: 'Webhook processing failed',
      })
    }
  }
)

// JSON middleware
app.use(express.json())

// API routes
app.use('/api', routes)

export default app
