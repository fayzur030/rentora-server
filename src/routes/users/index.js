import { Router } from 'express'
import { userCollection } from '../../config/db.js'
import { sendSuccess } from '../../utils/apiResponse.js'
import { checkAuthenticatedUser } from '../../middlewares/checkAuthenticatedUser.js'
const router = Router()

router.get('/all-users', checkAuthenticatedUser, async (req, res) => {
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
})

export default router
