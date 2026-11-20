import { Router } from 'express'
import { ObjectId } from 'mongodb'
import {
  checkoutIntentsCollection,
  equipmentCollection,
  bookingsCollection,
} from '../../config/db.js'
import { stripe } from '../../config/stripe.js'
import { env } from '../../config/env.js'
import { checkAuthenticatedUser } from '../../middlewares/checkAuthenticatedUser.js'

const router = Router()

router.post(
  '/create-checkout-session',
  checkAuthenticatedUser,
  async (req, res) => {
    try {
      const {
        userEmail,
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
        !userEmail ||
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

      // Step 2: Find equipment
      const equipment = await equipmentCollection.findOne({
        _id: new ObjectId(equipmentId),
      })

      if (!equipment) {
        return res.status(404).json({
          success: false,
          message: 'Equipment not found',
        })
      }
      const equipmentName = equipment.name

      // Step 3: Validate rental dates
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
        Number.isNaN(rentalStartDate.getTime()) ||
        Number.isNaN(rentalEndDate.getTime()) ||
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

      // Step 4: Calculate rental duration
      const rentalDuration = Math.ceil(
        (rentalEndDate - rentalStartDate) / (1000 * 60 * 60 * 24)
      )

      // Step 5: Check equipment availability
      const existingBookings = await bookingsCollection
        .find({
          equipmentId: new ObjectId(equipmentId),
          bookingStatus: { $in: ['pending', 'confirmed'] },
          startDate: { $lt: rentalEndDate },
          endDate: { $gt: rentalStartDate },
        })
        .toArray()

      const bookedQuantity = existingBookings.reduce(
        (total, booking) => total + booking.quantity,
        0
      )

      const availability = equipment.availability - bookedQuantity

      if (quantity > availability) {
        return res.status(400).json({
          success: false,
          message: `Only ${Math.max(availability, 0)} equipment available`,
        })
      }

      // Step 6: Calculate total rental amount
      const pricePerDay = equipment.rentalPrice
      const totalAmount = pricePerDay * rentalDuration * quantity

      // Step 7: Convert BDT to USD cents
      const amountInCents = Math.round(totalAmount * 0.0084 * 100)

      if (amountInCents < 50) {
        return res.status(400).json({
          success: false,
          message: 'Payment amount is too small',
        })
      }

      // Step 8: Create temporary checkout intent
      const intent = {
        equipmentName,
        userEmail,
        equipmentId: new ObjectId(equipmentId),
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
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      const intentResult = await checkoutIntentsCollection.insertOne(intent)

      // Step 9: Create Stripe Checkout Session
      let session

      try {
        session = await stripe.checkout.sessions.create({
          line_items: [
            {
              price_data: {
                currency: 'usd',
                product_data: {
                  name: equipment.name,
                  description: equipment.description,
                },
                unit_amount: amountInCents,
              },
              quantity: 1,
            },
          ],
          mode: 'payment',
          success_url: `${env.CLIENT_URL}/booking/success?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${env.CLIENT_URL}/booking/cancel`,
          metadata: {
            checkoutIntentId: intentResult.insertedId.toString(),
          },
        })
      } catch (error) {
        // Remove intent if Stripe session creation fails
        await checkoutIntentsCollection.deleteOne({
          _id: intentResult.insertedId,
        })

        throw error
      }

      // Step 10: Save Stripe session ID
      await checkoutIntentsCollection.updateOne(
        { _id: intentResult.insertedId },
        {
          $set: {
            stripeSessionId: session.id,
            updatedAt: new Date(),
          },
        }
      )

      // Step 11: Send Checkout URL
      return res.status(201).json({
        success: true,
        message: 'Checkout session created successfully',
        data: {
          redirectUrl: session.url,
        },
      })
    } catch (error) {
      console.error('Create Checkout Session Error:', error)

      return res.status(500).json({
        success: false,
        message: 'Failed to create checkout session',
      })
    }
  }
)

// Customer dashboard my-rentals api:

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

export default router
