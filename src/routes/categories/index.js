import { Router } from 'express'
import {
  checkAuthenticatedUser,
  verifyRole,
} from '../../middlewares/checkAuthenticatedUser.js'
import { categoriesCollection } from '../../config/db.js'
import { sendSuccess } from '../../utils/apiResponse.js'

const router = Router()

router.post(
  '/',
  checkAuthenticatedUser,
  verifyRole(['admin']),
  async (req, res) => {
    try {
      const { name, slug } = req.body
      console.log(name)
      // Validate required fields
      if (!name || !slug) {
        return res.status(400).json({
          success: false,
          message: 'Category name and slug are required',
        })
      }

      // Check admin permission
      if (req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          message: 'Only admin can create categories',
        })
      }

      // Check existing category
      const existingCategory = await categoriesCollection.findOne({
        $or: [{ name }, { slug }],
      })

      if (existingCategory) {
        return res.status(409).json({
          success: false,
          message: 'Category already exists',
        })
      }

      // Create category
      const category = {
        name: name.trim(),
        slug: slug.trim().toLowerCase(),
        createdAt: new Date(),
      }

      const result = await categoriesCollection.insertOne(category)

      sendSuccess(
        res,
        {
          _id: result.insertedId,
          ...category,
        },
        'Category created successfully',
        201
      )
    } catch (error) {
      console.error('Create Category Error:', error)

      res.status(500).json({
        success: false,
        message: 'Failed to create category',
      })
    }
  }
)

// category get

router.get('/all-categories', async (req, res) => {
  try {
    const categories = await categoriesCollection
      .find()
      .sort({ name: 1 })
      .toArray()

    sendSuccess(res, categories, 'Categories fetched successfully')
  } catch (error) {
    console.error('Get Categories Error:', error)

    res.status(500).json({
      success: false,
      message: 'Failed to fetch categories',
    })
  }
})

export default router
