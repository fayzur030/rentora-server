import express from 'express'
import cors from 'cors'
import routes from './routes/index.js'
import { env } from './config/env.js'
import { stripe } from './config/stripe.js'
import {
  bookingsCollection,
  checkoutIntentsCollection,
  paymentsCollection,
} from './config/db.js'
import { ObjectId } from 'mongodb'

const app = express()

// CORS middleware
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
        env.STRIPE_WEBHOOK_SECRET
      )
    } catch (error) {
      console.error('Stripe webhook verification failed:', error.message)

      return res.status(400).send(`Webhook Error: ${error.message}`)
    }

    try {
      // Step 2: Handle successful payment events.
      if (
        event.type !== 'checkout.session.completed' &&
        event.type !== 'checkout.session.async_payment_succeeded'
      ) {
        return res.json({ received: true })
      }

      const session = event.data.object

      // Step 3: Check payment status.
      if (session.payment_status !== 'paid') {
        return res.json({ received: true })
      }

      // Step 4: Get checkout intent ID.
      const intentId = session.metadata?.checkoutIntentId

      if (!intentId || !ObjectId.isValid(intentId)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid checkout intent ID',
        })
      }

      // Step 5: Find checkout intent.
      const intent = await checkoutIntentsCollection.findOne({
        _id: new ObjectId(intentId),
      })

      // Check if checkout intent exists.
      if (!intent) {
        return res.status(404).json({
          success: false,
          message: 'Checkout information not found',
        })
      }

      // Verify Stripe session ID.
      if (intent.stripeSessionId !== session.id) {
        return res.status(400).json({
          success: false,
          message: 'Stripe session ID does not match',
        })
      }

      // Step 6: Verify payment amount and currency.
      if (
        session.amount_total !== intent.amountInCents ||
        session.currency !== intent.currency
      ) {
        return res.status(400).json({
          success: false,
          message: 'Payment amount does not match',
        })
      }

      // Step 7: Create booking after successful payment.

      const booking = {
        // 1. Stripe Session ID
        stripeSessionId: session.id,
        equipmentName: intent.equipmentName,
        // 2. Rental Information
        startDate: intent.startDate,
        endDate: intent.endDate,
        rentalDuration: intent.rentalDuration,

        // 3. Equipment Information
        equipmentId: intent.equipmentId,
        quantity: intent.quantity,
        pricePerDay: intent.pricePerDay,
        totalAmount: intent.totalAmount,

        // 4. Customer Information
        userEmail: intent.userEmail,
        contactNumber: intent.contactNumber,
        deliveryAddress: intent.deliveryAddress,

        // 5. Additional Information
        additionalNotes: intent.additionalNotes,

        // 6. Booking Status
        bookingStatus: 'confirmed',

        // 7. Payment Information
        paymentStatus: 'paid',

        transaction: {
          paymentIntentId: session.payment_intent,
          amount: session.amount_total,
          currency: session.currency,
          paidAt: new Date(),
        },

        // 8. Timestamps
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      // Step 8: Check if booking already exists.
      const existingBooking = await bookingsCollection.findOne({
        stripeSessionId: session.id,
      })

      if (!existingBooking) {
        try {
          // Insert new booking.
          const result = await bookingsCollection.insertOne(booking)

          console.log('Booking created successfully:', result.insertedId)
        } catch (error) {
          // Handle duplicate webhook requests.
          if (error.code === 11000) {
            console.log('Booking already exists:', session.id)
          } else {
            throw error
          }
        }
      } else {
        console.log('Booking already exists:', session.id)
      }

      const savedBooking = await bookingsCollection.findOne({
        stripeSessionId: session.id,
      })

      if (!savedBooking) {
        throw new Error(
          `Booking was not found for Stripe session ${session.id}`
        )
      }

      // Check if payment already exists
      const existingPayment = await paymentsCollection.findOne({
        stripeSessionId: session.id,
      })

      // Save payment if it does not exist
      if (!existingPayment) {
        const payment = {
          checkoutIntentId: intent._id,
          bookingId: savedBooking._id,
          stripeSessionId: session.id,
          paymentIntentId:
            typeof session.payment_intent === 'string'
              ? session.payment_intent
              : session.payment_intent?.id,
          customerEmail: session.customer_details?.email || intent.userEmail,
          amount: session.amount_total,
          currency: session.currency,
          paymentStatus: 'paid',
          paidAt: new Date(),
          createdAt: new Date(),
        }

        await paymentsCollection.insertOne(payment)

        console.log('Payment saved successfully')
      } else {
        console.log('Payment already exists')
      }
      // Mark the checkout intent paid after both records are persisted.
      await checkoutIntentsCollection.updateOne(
        { _id: intent._id },
        {
          $set: {
            status: 'paid',
            updatedAt: new Date(),
          },
        }
      )

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
