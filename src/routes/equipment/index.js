import { Router } from 'express'
import { bookingsCollection, equipmentCollection } from '../../config/db.js'
import { sendSuccess } from '../../utils/apiResponse.js'
import { ObjectId } from 'mongodb'
import {
  checkAuthenticatedUser,
  verifyRole,
} from '../../middlewares/checkAuthenticatedUser.js'
/** @type {import("express").Router} */
const router = Router()

//create equipment
router.post(
  '/add-equipment',
  checkAuthenticatedUser,
  verifyRole('owner'),
  async (req, res) => {
    try {
      const equipmentData = {
        ...req.body,
        status: 'pending',
        createdAt: new Date(),
      }
      console.log(equipmentData)
      const result = await equipmentCollection.insertOne(equipmentData)

      sendSuccess(
        res,
        { insertedId: result.insertedId },
        'Equipment added successfully',
        201
      )
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to add equipment',
      })
    }
  }
)

export default router

// get all equipment
router.get('/equipments', async (req, res) => {
  try {
    const query = {}

    // Search Filter
    const search = req.query.search

    if (search) {
      const searchRegex = search
        .trim()
        .split(/\s+/)
        .map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('.*')

      query.$or = [
        { name: { $regex: searchRegex, $options: 'i' } },
        { description: { $regex: searchRegex, $options: 'i' } },
        { location: { $regex: searchRegex, $options: 'i' } },
      ]
    }

    // Category Filter
    if (req.query.category) {
      query.category = {
        $regex: `^${req.query.category}$`,
        $options: 'i',
      }
    }

    // Rental Type Filter
    if (req.query.rentalType) {
      query.rentalType = {
        $regex: `^${req.query.rentalType}$`,
        $options: 'i',
      }
    }

    // Price Range Filter
    if (req.query.minPrice || req.query.maxPrice) {
      query.rentalPrice = {}

      if (req.query.minPrice) {
        query.rentalPrice.$gte = Number(req.query.minPrice)
      }

      if (req.query.maxPrice) {
        query.rentalPrice.$lte = Number(req.query.maxPrice)
      }
    }

    // Availability Filter
    const availability = req.query.availability

    if (availability === 'true') {
      query.availableQuantity = { $gt: 0 }
    } else if (availability === 'false') {
      query.availableQuantity = { $lte: 0 }
    }

    //sorting

    const sort = req.query.sort
    let sortOption = {}
    if (sort === 'price-low-to-high') {
      sortOption = { rentalPrice: 1 }
    } else if (sort === 'price-high-to-low') {
      sortOption = { rentalPrice: -1 }
    } else if (sort === 'recently-added') {
      sortOption = { createdAt: -1 }
    }

    // Fetch Equipments
    const equipments = await equipmentCollection
      .find(query)
      .sort(sortOption)
      .toArray()

    sendSuccess(res, equipments, 'Equipments fetched successfully')
  } catch (error) {
    console.error('Get Equipments Error:', error)

    res.status(500).json({
      success: false,
      message: 'Failed to fetch equipment',
    })
  }
})

// single equipment api
router.get('/equipment/:id', checkAuthenticatedUser, async (req, res) => {
  try {
    const { id } = req.params

    const equipment = await equipmentCollection.findOne({
      _id: new ObjectId(id),
    })

    if (!equipment) {
      return res.status(404).json({
        success: false,
        message: 'Equipment not found',
      })
    }

    sendSuccess(res, equipment, 'Equipment fetched successfully')
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch equipment',
    })
  }
})

// owner dashboard: my-equipment
router.get('/my-equipments', checkAuthenticatedUser, async (req, res) => {
  const ownerId = req.user.id

  try {
    const myEquipments = await equipmentCollection
      .find({ 'owner.ownerId': ownerId })
      .sort({ createdAt: -1 })
      .toArray()

    sendSuccess(res, myEquipments, 'My equipments fetched successfully')
  } catch (error) {
    console.error('Get My Equipments Error:', error)

    res.status(500).json({
      success: false,
      message: 'Failed to fetch my equipments',
    })
  }
})

router.delete(
  '/delete-equipment/:id',
  checkAuthenticatedUser,
  verifyRole(['owner', 'admin']),
  async (req, res) => {
    const { id } = req.params

    try {
      if (!ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid equipment ID',
        })
      }

      const result = await equipmentCollection.deleteOne({
        _id: new ObjectId(id),
      })
      if (result.deletedCount === 0) {
        return res.status(404).json({
          success: false,
          message: 'Equipment not found',
        })
      }

      sendSuccess(res, null, 'Equipment deleted successfully')
    } catch (error) {
      console.error('Delete Equipment Error:', error)

      res.status(500).json({
        success: false,
        message: 'Failed to delete equipment',
      })
    }
  }
)

router.patch(
  '/update-equipment/:id',
  checkAuthenticatedUser,
  verifyRole(['owner', 'admin']),
  async (req, res) => {
    const { id } = req.params
    try {
      if (!ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid equipment ID',
        })
      }
      const { _id, ...updatedEquipment } = req.body
      const result = await equipmentCollection.updateOne(
        {
          _id: new ObjectId(id),
        },
        {
          $set: updatedEquipment,
        }
      )
      if (result.matchedCount === 0) {
        return res.status(404).json({
          success: false,
          message: 'Equipment not found',
        })
      }
      res.status(200).json({
        success: true,
        message: 'Equipment updated successfully',
      })
    } catch (error) {
      console.error('Update Equipment Error:', error)

      res.status(500).json({
        success: false,
        message: error.message || 'Failed to update equipment',
      })
    }
  }
)

// my equipment rental

router.get(
  '/my-equipment-rentals',
  checkAuthenticatedUser,
  async (req, res) => {
    try {
      const ownerId = req.user.id

      // get owner equipments
      const myEquipments = await equipmentCollection
        .find({
          'owner.ownerId': ownerId,
        })
        .toArray()

      // Get equipment IDs

      const equipmentId = myEquipments.map((equipment) => equipment._id)

      // get all rentalBookings
      const result = await bookingsCollection
        .find({
          equipmentId: { $in: equipmentId },
        })
        .sort({ createdAt: -1 })
        .toArray()

      res.status(200).json({
        success: true,
        message: 'My equipment rentals fetched successfully',
        data: result,
      })
    } catch (error) {
      console.error('My Equipment Rentals Error:', error)

      res.status(500).json({
        success: false,
        message: 'Failed to fetch equipment rentals',
      })
    }
  }
)

// feature equipment

router.get('/featured-equipment', async (req, res) => {
  try {
    const equipments = await equipmentCollection
      .find({ status: 'approved' })
      .sort({ createdAt: -1 })
      .limit(6)
      .toArray()

    sendSuccess(res, equipments, 'Featured equipment fetched successfully')
  } catch (error) {
    console.error('Featured Equipment Error:', error)

    res.status(500).json({
      success: false,
      message: 'Failed to fetch featured equipment',
    })
  }
})
