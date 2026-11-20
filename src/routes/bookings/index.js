import { Router } from 'express'
import { ObjectId } from 'mongodb'
import { bookingsCollection, equipmentCollection } from '../../config/db.js'
import { stripe } from '../../config/stripe.js'
const router = Router()

router.post('/create-checkout-session', async (req, res) => {
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
    // console.log('Booking User Email:', userEmail)
    // console.log('Booking Payload:', req.body)
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
        message: 'ALl required fields are required',
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
    // Step 3: Validate rental dates
    const rentalStartDate = new Date(`${startDate}T00:00:00.000Z`)
    const rentalEndDate = new Date(`${endDate}T00:00:00.000Z`)
    const today = new Date()
    today.setUTCHours(0, 0, 0, 0)
    if (
      Number.isNaN(rentalStartDate.getTime()) ||
      Number.isNaN(rentalEndDate.getTime()) ||
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
        equipment: new ObjectId(equipmentId),
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
        message: `Only ${Math.max(availableQuantity, 0)} equipment available`,
      })
    }
    // Step 6: Calculate total rental amount
    const pricePerDay = equipment.rentalPrice
    const totalAmount = pricePerDay * rentalDuration * quantity

    // Step 7: Create booking with pending status
    const booking = {
      userEmail,
      //   userId: req.user.id,
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

      bookingStatus: 'pending',
      paymentStatus: 'pending',

      createdAt: new Date(),
      updatedAt: new Date(),
    }
    const bookingCreateResult = await bookingsCollection.insertOne(booking)

    // Step 8: Create Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: equipment.name,
              description: equipment.description,
            },
            unit_amount: Math.round(totalAmount * 0.0084 * 100), // Convert to cents and apply conversion rate
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${process.env.CLIENT_URL}/booking/success?bookingId=${bookingCreateResult.insertedId.toString()}`,
      cancel_url: `${process.env.CLIENT_URL}/booking/cancel`,
      metadata: {
        bookingId: bookingCreateResult.insertedId.toString(),
        // userId,
        userEmail,
      },
    })

    // Step 9: Save Stripe session ID
    await bookingsCollection.updateOne(
      { _id: bookingCreateResult.insertedId },
      {
        $set: {
          stripeSessionId: session.id,
          updatedAt: new Date(),
        },
      }
    )
    // Step 10: Send Checkout URL
    return res.status(201).json({
      success: true,
      message: 'Checkout session created successfully',
      data: {
        bookingId: bookingCreateResult.insertedId,
        redirectUrl: session.url,
      },
    })
  } catch (error) {
    console.error('Create Booking Error:', error)

    return res.status(500).json({
      success: false,
      message: error.message,
    })
  }
})

export default router
