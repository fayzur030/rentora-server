import { Router } from 'express'
import { equipmentCollection, userCollection } from '../../config/db.js'
import { sendSuccess } from '../../utils/apiResponse.js'
import {
  checkAuthenticatedUser,
  verifyRole,
} from '../../middlewares/checkAuthenticatedUser.js'
import { ObjectId } from 'mongodb'
const router = Router()

router.get(
  '/all-users',
  checkAuthenticatedUser,
  verifyRole(['admin']),
  async (req, res) => {
    try {
      const result = await userCollection.find().toArray()
      return sendSuccess(res, result, 'Users fetched successfully')
    } catch (error) {
      console.error('Get User Error:', error)

      return res.status(500).json({
        success: false,
        message: 'Failed to fetch users',
      })
    }
  }
)

// update role
router.patch(
  '/update-role/:id',
  checkAuthenticatedUser,
  verifyRole(['admin']),
  async (req, res) => {
    const { id } = req.params
    const { role } = req.body

    try {
      if (!ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid user ID',
        })
      }

      const allowedRoles = ['customer', 'owner', 'admin']

      if (!allowedRoles.includes(role)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid role',
        })
      }

      const result = await userCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { role: role.trim() } }
      )

      if (result.matchedCount === 0) {
        return res.status(404).json({
          success: false,
          message: 'User not found',
        })
      }

      return sendSuccess(res, null, 'User role updated successfully')
    } catch (error) {
      console.error('Update Role Error:', error)

      return res.status(500).json({
        success: false,
        message: 'Failed to update user role',
      })
    }
  }
)

// update customer's status

router.patch(
  '/update-status/:id',
  checkAuthenticatedUser,
  verifyRole(['admin']),
  async (req, res) => {
    const { id } = req.params
    const { status } = req.body

    try {
      if (!ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid equipment ID',
        })
      }

      const allowedStatuses = ['pending', 'approved', 'rejected']

      if (!allowedStatuses.includes(status)) {
        return res.status(400).json({
          success: false,
          message: 'Status must be pending, approved, or rejected',
        })
      }

      const result = await equipmentCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { status } }
      )

      if (result.matchedCount === 0) {
        return res.status(404).json({
          success: false,
          message: 'Equipment not found',
        })
      }

      return sendSuccess(res, null, 'Equipment status updated successfully')
    } catch (error) {
      console.error('Equipment Status Error:', error)

      return res.status(500).json({
        success: false,
        message: 'Failed to update equipment status',
      })
    }
  }
)

export default router
