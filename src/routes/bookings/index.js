import { Router } from 'express'
import { ObjectId } from 'mongodb'
import {
  checkoutIntentsCollection,
  equipmentCollection,
  bookingsCollection,
  userCollection,
  client,
  paymentsCollection,
} from '../../config/db.js'
import { stripe } from '../../config/stripe.js'
import { env } from '../../config/env.js'
import {
  checkAuthenticatedUser,
  verifyRole,
} from '../../middlewares/checkAuthenticatedUser.js'
import { sendSuccess } from '../../utils/apiResponse.js'

const router = Router()

router.post(
  '/create-checkout-session',
  checkAuthenticatedUser,
  async (req, res) => {
    const session = client.startSession()

    try {
      const {
        equipmentId,
        startDate,
        endDate,
        quantity,
        contactNumber,
        deliveryAddress,
        additionalNotes,
      } = req.body

      // Step 1: Validate required fields
      if (
        !equipmentId ||
        !startDate ||
        !endDate ||
        !quantity ||
        !contactNumber ||
        !deliveryAddress
      ) {
        return res.status(400).json({
          success: false,
          message: 'All required fields are required',
        })
      }

      if (!ObjectId.isValid(equipmentId)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid equipment ID',
        })
      }

      if (!Number.isInteger(quantity) || quantity < 1) {
        return res.status(400).json({
          success: false,
          message: 'Invalid quantity',
        })
      }

      // Step 2: Validate rental dates
      const datePattern = /^\d{4}-\d{2}-\d{2}$/

      if (!datePattern.test(startDate) || !datePattern.test(endDate)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid date format',
        })
      }

      const rentalStartDate = new Date(`${startDate}T00:00:00.000Z`)
      const rentalEndDate = new Date(`${endDate}T00:00:00.000Z`)

      const today = new Date()
      today.setUTCHours(0, 0, 0, 0)

      if (
        rentalStartDate.toISOString().slice(0, 10) !== startDate ||
        rentalEndDate.toISOString().slice(0, 10) !== endDate ||
        rentalStartDate < today ||
        rentalEndDate <= rentalStartDate
      ) {
        return res.status(400).json({
          success: false,
          message: 'Invalid rental dates',
        })
      }

      // Step 3: Calculate rental duration
      const rentalDuration = Math.ceil(
        (rentalEndDate - rentalStartDate) / (1000 * 60 * 60 * 24)
      )

      const equipmentObjectId = new ObjectId(equipmentId)

      const userName = req.user.name
      const userEmail = req.user.email

      let intent

      // Step 4: Check availability and reserve quantity atomically
      await session.withTransaction(async () => {
        const equipment = await equipmentCollection.findOne(
          { _id: equipmentObjectId },
          { session }
        )

        if (!equipment) {
          throw new Error('EQUIPMENT_NOT_FOUND')
        }

        if (equipment.status !== 'approved') {
          throw new Error('EQUIPMENT_NOT_AVAILABLE')
        }

        // Write to equipment document to prevent concurrent
        // booking transactions from reserving the same inventory.
        await equipmentCollection.updateOne(
          { _id: equipmentObjectId },
          { $inc: { bookingLock: 1 } },
          { session }
        )

        // Find overlapping confirmed bookings
        const existingBookings = await bookingsCollection
          .find(
            {
              equipmentId: equipmentObjectId,
              bookingStatus: {
                $in: ['pending', 'confirmed', 'active'],
              },
              startDate: { $lt: rentalEndDate },
              endDate: { $gt: rentalStartDate },
            },
            { session }
          )
          .toArray()

        // Find overlapping active checkout intents
        const pendingIntents = await checkoutIntentsCollection
          .find(
            {
              equipmentId: equipmentObjectId,
              status: 'pending',
              expiresAt: { $gt: new Date() },
              startDate: { $lt: rentalEndDate },
              endDate: { $gt: rentalStartDate },
            },
            { session }
          )
          .toArray()

        const bookedQuantity = existingBookings.reduce(
          (total, booking) => total + booking.quantity,
          0
        )

        const reservedQuantity = pendingIntents.reduce(
          (total, intent) => total + intent.quantity,
          0
        )

        const remainingQuantity =
          equipment.availableQuantity - bookedQuantity - reservedQuantity

        if (quantity > remainingQuantity) {
          throw new Error('INSUFFICIENT_QUANTITY')
        }

        // Step 5: Calculate rental amount
        const pricePerDay = equipment.rentalPrice

        const totalAmount = pricePerDay * rentalDuration * quantity

        const amountInCents = Math.round(totalAmount * 0.0084 * 100)

        if (amountInCents < 50) {
          throw new Error('PAYMENT_AMOUNT_TOO_SMALL')
        }

        // Step 6: Create checkout intent
        const newIntent = {
          equipmentName: equipment.name,
          userName,
          userEmail,
          equipmentId: equipmentObjectId,
          startDate: rentalStartDate,
          endDate: rentalEndDate,
          rentalDuration,
          quantity,
          contactNumber,
          deliveryAddress,
          additionalNotes: additionalNotes || '',
          pricePerDay,
          totalAmount,
          amountInCents,
          currency: 'usd',
          status: 'pending',
          expiresAt: new Date(Date.now() + 30 * 60 * 1000),
          createdAt: new Date(),
          updatedAt: new Date(),
        }

        const intentResult = await checkoutIntentsCollection.insertOne(
          newIntent,
          { session }
        )

        intent = {
          ...newIntent,
          _id: intentResult.insertedId,
        }
      })

      // Step 7: Create Stripe Checkout Session
      let stripeSession

      try {
        stripeSession = await stripe.checkout.sessions.create({
          line_items: [
            {
              price_data: {
                currency: 'usd',
                product_data: {
                  name: intent.equipmentName,
                },
                unit_amount: intent.amountInCents,
              },
              quantity: 1,
            },
          ],
          mode: 'payment',

          expires_at: Math.floor(intent.expiresAt.getTime() / 1000),

          success_url: `${env.CLIENT_URL}/booking/success?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${env.CLIENT_URL}/booking/cancel?intent_id=${intent._id.toString()}`,
          // cancel_url: `${env.CLIENT_URL}/booking/cancel`,

          metadata: {
            checkoutIntentId: intent._id.toString(),
          },
        })
      } catch (error) {
        // Release reservation if Stripe session creation fails
        await checkoutIntentsCollection.updateOne(
          { _id: intent._id },
          {
            $set: {
              status: 'failed',
              updatedAt: new Date(),
            },
          }
        )

        throw error
      }

      // Step 8: Save Stripe Session ID
      await checkoutIntentsCollection.updateOne(
        { _id: intent._id },
        {
          $set: {
            stripeSessionId: stripeSession.id,
            updatedAt: new Date(),
          },
        }
      )

      // Step 9: Send Checkout URL
      return res.status(201).json({
        success: true,
        message: 'Checkout session created successfully',
        data: {
          redirectUrl: stripeSession.url,
        },
      })
    } catch (error) {
      console.error('Create Checkout Session Error:', error)

      if (error.message === 'EQUIPMENT_NOT_FOUND') {
        return res.status(404).json({
          success: false,
          message: 'Equipment not found',
        })
      }

      if (error.message === 'EQUIPMENT_NOT_AVAILABLE') {
        return res.status(400).json({
          success: false,
          message: 'Equipment is not available for booking',
        })
      }

      if (error.message === 'INSUFFICIENT_QUANTITY') {
        return res.status(400).json({
          success: false,
          message: 'Not enough equipment available for selected dates',
        })
      }

      if (error.message === 'PAYMENT_AMOUNT_TOO_SMALL') {
        return res.status(400).json({
          success: false,
          message: 'Payment amount is too small',
        })
      }

      return res.status(500).json({
        success: false,
        message: 'Failed to create checkout session',
      })
    } finally {
      await session.endSession()
    }
  }
)

// cancel booking api
router.post(
  '/cancel-checkout/:intentId',
  checkAuthenticatedUser,
  async (req, res) => {
    try {
      const { intentId } = req.params

      // Validate intent ID
      if (!ObjectId.isValid(intentId)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid checkout intent ID',
        })
      }

      // Find checkout intent belonging to the logged-in user
      const intent = await checkoutIntentsCollection.findOne({
        _id: new ObjectId(intentId),
        userEmail: req.user.email,
        status: 'pending',
      })

      if (!intent) {
        return res.status(404).json({
          success: false,
          message: 'Checkout intent not found or already processed',
        })
      }

      // Find Stripe session
      const session = await stripe.checkout.sessions.retrieve(
        intent.stripeSessionId
      )

      // Do not cancel an already completed payment
      if (session.status === 'complete' || session.payment_status === 'paid') {
        return res.status(409).json({
          success: false,
          message: 'Payment has already been completed',
        })
      }

      // Expire the Stripe session to prevent later payment
      if (session.status === 'open') {
        await stripe.checkout.sessions.expire(session.id)
      }

      // Atomically update checkout intent
      const updateResult = await checkoutIntentsCollection.updateOne(
        {
          _id: intent._id,
          status: 'pending',
        },
        {
          $set: {
            status: 'cancelled',
            updatedAt: new Date(),
          },
        }
      )

      if (updateResult.modifiedCount === 0) {
        return res.status(409).json({
          success: false,
          message: 'Checkout has already been processed',
        })
      }

      // Check if booking already exists
      const existingBooking = await bookingsCollection.findOne({
        stripeSessionId: session.id,
      })

      if (!existingBooking) {
        const booking = {
          stripeSessionId: session.id,
          equipmentName: intent.equipmentName,

          startDate: intent.startDate,
          endDate: intent.endDate,
          rentalDuration: intent.rentalDuration,

          equipmentId: intent.equipmentId,
          quantity: intent.quantity,
          pricePerDay: intent.pricePerDay,
          totalAmount: intent.totalAmount,

          customerName: intent.userName,
          userEmail: intent.userEmail,
          contactNumber: intent.contactNumber,
          deliveryAddress: intent.deliveryAddress,

          additionalNotes: intent.additionalNotes,

          bookingStatus: 'cancelled',
          paymentStatus: 'unpaid',

          cancelledAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        }

        await bookingsCollection.insertOne(booking)
      }

      return res.json({
        success: true,
        message: 'Booking cancellation recorded successfully',
      })
    } catch (error) {
      console.error('Cancel checkout error:', error)

      return res.status(500).json({
        success: false,
        message: 'Failed to cancel checkout',
      })
    }
  }
)

router.get('/my-rentals', checkAuthenticatedUser, async (req, res) => {
  const userEmail = req.user.email
  try {
    const bookingRental = await bookingsCollection
      .find({ userEmail })
      .sort({ createdAt: -1 })
      .toArray()

    res.send({
      success: true,
      message: 'Booking rental successfully',
      data: bookingRental,
    })
  } catch (error) {
    console.error('Error fetching bookings rental', error)
    res.status(500).send({
      success: false,
      message: 'Failed to fetch bookings rental',
      error: error.message,
    })
  }
})

// all rental

router.get(
  '/admin/rentals',
  checkAuthenticatedUser,
  verifyRole(['admin']),
  async (req, res) => {
    try {
      // 1. Get all bookings
      const bookings = await bookingsCollection
        .find({})
        .sort({ createdAt: -1 })
        .toArray()

      const bookingIds = bookings.map((booking) => booking._id)
      const payments = await paymentsCollection
        .find({ bookingId: { $in: bookingIds } })
        .toArray()
      const paymentsByBookingId = new Map(
        payments.map((payment) => [payment.bookingId.toString(), payment])
      )

      const rentals = []

      // 2. Get customer, equipment and owner information

      for (const booking of bookings) {
        const customer = await userCollection.findOne({
          email: booking.userEmail,
        })

        const equipment = await equipmentCollection.findOne({
          _id: booking.equipmentId,
        })

        const owner = equipment?.owner || null

        // 3. Store all information together
        const payment = paymentsByBookingId.get(booking._id.toString())

        rentals.push({
          ...booking,
          payment: payment
            ? {
                paymentStatus: payment.paymentStatus,
                amount: payment.amount,
                currency: payment.currency,
                paidAt: payment.paidAt,
              }
            : null,
          customer,
          owner,
          equipment,
        })
      }
      return sendSuccess(res, rentals, 'All rentals retrieved successfully')
    } catch (error) {
      console.error(error)

      return res.status(500).json({
        success: false,
        message: 'Failed to retrieve rentals',
      })
    }
  }
)

export default router
