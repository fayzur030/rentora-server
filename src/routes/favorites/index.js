import { Router } from 'express'
import { ObjectId } from 'mongodb'
import { equipmentCollection, favoritesCollection } from '../../config/db.js'
import { sendSuccess } from '../../utils/apiResponse.js'
import {
  checkAuthenticatedUser,
  verifyRole,
} from '../../middlewares/checkAuthenticatedUser.js'
const router = Router()

// Add to Favorites
router.post(
  '/add-favorite',
  checkAuthenticatedUser,
  verifyRole(['customer', 'admin']),
  async (req, res) => {
    try {
      const userId = req.user.id
      const { equipmentId } = req.body
      // Validate required fields
      if (!userId || !equipmentId) {
        return res.status(400).send({
          success: false,
          message: 'User ID and Equipment ID are required',
        })
      }

      if (!ObjectId.isValid(equipmentId)) {
        return res.status(400).send({
          success: false,
          message: 'Invalid equipment ID',
        })
      }
      // Check equipment exists
      const equipment = await equipmentCollection.findOne({
        _id: new ObjectId(equipmentId),
      })
      if (!equipment) {
        return res.status(404).send({
          success: false,
          message: 'Equipment not found',
        })
      }
      // Check existing favorite
      const existingFavorite = await favoritesCollection.findOne({
        userId,
        equipmentId: new ObjectId(equipmentId),
      })

      if (existingFavorite) {
        return res.status(409).send({
          success: false,
          message: 'Equipment already added to favorites',
        })
      }
      // create favorite
      const favorite = {
        userId,
        equipmentId: new ObjectId(equipmentId),
        createdAt: new Date(),
      }

      const result = await favoritesCollection.insertOne(favorite)
      sendSuccess(
        res,
        { favoriteId: result.insertedId },
        'Equipment added to favorites successfully',
        201
      )
    } catch (error) {
      console.error('Add Favorite Error:', error)

      return res.status(500).json({
        success: false,
        message: 'Failed to add favorite',
      })
    }
  }
)

// Remove Favorite

router.delete(
  '/remove-favorite',
  checkAuthenticatedUser,
  verifyRole(['customer']),
  async (req, res) => {
    try {
      const { equipmentId, userId } = req.body
      if (!equipmentId || !userId) {
        return res.status(400).json({
          success: false,
          message: 'User ID and Equipment ID are required',
        })
      }
      if (!ObjectId.isValid(equipmentId)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid equipment ID',
        })
      }
      const result = await favoritesCollection.deleteOne({
        userId,
        equipmentId: new ObjectId(equipmentId),
      })
      if (result.deletedCount === 0) {
        return res.status(404).json({
          success: false,
          message: 'Favorite not found',
        })
      }
      return sendSuccess(res, null, 'Removed from favorites successfully')
    } catch (error) {
      console.error('Remove Favorite Error:', error)

      return res.status(500).json({
        success: false,
        message: 'Internal server error',
      })
    }
  }
)

// Get User Favorites

router.get('/favorites', checkAuthenticatedUser, async (req, res) => {
  try {
    const { userId } = req.query

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User ID is required',
      })
    }

    const favorites = await favoritesCollection.find({ userId }).toArray()

    const equipmentId = favorites.map((favorite) => favorite.equipmentId)

    const equipmentDetails = await equipmentCollection
      .find({
        _id: { $in: equipmentId },
      })
      .toArray()

    return sendSuccess(res, equipmentDetails, 'Favorites fetched successfully')
  } catch (error) {
    console.error('Get Favorites Error:', error)

    return res.status(500).json({
      success: false,
      message: 'Failed to fetch favorites',
    })
  }
})

export default router
