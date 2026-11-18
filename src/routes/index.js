import { Router } from 'express'
import { sendSuccess } from '../utils/apiResponse.js'
import equipmentRouter from './equipment/index.js'

const router = Router()

router.get('/test', (req, res) => {
  sendSuccess(res, { status: 'ok' }, 'API is running')
})

// Equipment routes
router.use('/equipment', equipmentRouter)

export default router
