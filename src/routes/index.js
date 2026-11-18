import { Router } from 'express'
import { sendSuccess } from '../utils/apiResponse.js'

const router = Router()

router.get('/test', (req, res) => {
  sendSuccess(res, { status: 'ok' }, 'API is running')
})

export default router
