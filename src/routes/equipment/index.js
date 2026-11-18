import { Router } from 'express'
import { equipmentCollection } from '../../config/db.js'
import { sendSuccess } from '../../utils/apiResponse.js'

const router = Router()

router.post('/add-equipment', async (req, res) => {
  try {
    const equipmentData = req.body

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
})

export default router
