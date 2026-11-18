import { Router } from 'express'
import { equipmentCollection } from '../../config/db.js'
import { sendSuccess } from '../../utils/apiResponse.js'

const router = Router()

//create equipment
router.post('/add-equipment', async (req, res) => {
  try {
    const equipmentData = {
      ...req.body,
      status: 'pending',
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
})

export default router

// get all equipment

router.get('/equipments', async (req, res) => {
  try {
    const equipments = await equipmentCollection.find().toArray()
    sendSuccess(res, equipments, 'Equipment fetched successfully')
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch equipment',
    })
  }
})
