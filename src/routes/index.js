import { Router } from 'express'
import { sendSuccess } from '../utils/apiResponse.js'
import equipmentRouter from './equipment/index.js'
import favoriteRouter from './favorites/index.js'
import bookingsRouter from './bookings/index.js'
import usersRouter from './users/index.js'
const router = Router()

router.get('/test', (req, res) => {
  sendSuccess(res, { status: 'ok' }, 'API is running')
})

// Equipment routes
router.use('/equipment', equipmentRouter)
router.use('/favorite', favoriteRouter)
router.use('/bookings', bookingsRouter)
router.use('/users', usersRouter)

export default router
