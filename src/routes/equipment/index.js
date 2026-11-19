import { Router } from 'express'
import { equipmentCollection } from '../../config/db.js'
import { sendSuccess } from '../../utils/apiResponse.js'
import { ObjectId } from 'mongodb'
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
    const query = {}
    // console.log(req.query.search)
    // search title and description, location
    if (req.query.search) {
      query.$or = [
        {
          title: { $regex: req.query.search, $options: 'i' },
        },
        {
          description: { $regex: req.query.search, $options: 'i' },
        },
        {
          location: { $regex: req.query.search, $options: 'i' },
        },
      ]
    }

    const equipments = await equipmentCollection.find(query).toArray()
    sendSuccess(res, equipments, 'Equipments fetched successfully')
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch equipment',
    })
  }
})

// single equipment api
router.get('/equipment/:id', async (req, res) => {
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
