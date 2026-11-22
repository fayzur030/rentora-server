import { Router } from 'express'
import {
  checkAuthenticatedUser,
  verifyRole,
} from '../../middlewares/checkAuthenticatedUser.js'
import { categoriesCollection } from '../../config/db.js'
import { sendSuccess } from '../../utils/apiResponse.js'
import { ObjectId } from 'mongodb'

const router = Router()

router.post(
  '/',
  checkAuthenticatedUser,
  verifyRole(['admin']),
  async (req, res) => {
    try {
      const { name, slug, image } = req.body

      // Validate required fields
      if (!name || !slug || !image) {
        return res.status(400).json({
          success: false,
          message: 'Category name, slug and image are required',
        })
      }

      // Check existing category
      const existingCategory = await categoriesCollection.findOne({
        $or: [{ name: name.trim() }, { slug: slug.trim().toLowerCase() }],
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
        image: image.trim(),
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

// Get categories (public)
router.get('/', async (req, res) => {
  try {
    const categories = await categoriesCollection
      .find(
        {},
        {
          projection: {
            name: 1,
            slug: 1,
            image: 1,
            createdAt: 1,
          },
        }
      )
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

// Delete category (admin only)
router.delete(
  '/delete-category/:id',
  checkAuthenticatedUser,
  verifyRole(['admin']),
  async (req, res) => {
    const { id } = req.params

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid category ID',
      })
    }

    try {
      const result = await categoriesCollection.deleteOne({
        _id: new ObjectId(id),
      })

      if (result.deletedCount === 0) {
        return res.status(404).json({
          success: false,
          message: 'Category not found',
        })
      }

      sendSuccess(res, null, 'Category deleted successfully')
    } catch (error) {
      console.error('Delete Category Error:', error)

      res.status(500).json({
        success: false,
        message: 'Failed to delete category',
      })
    }
  }
)

// Update category (admin only)
router.patch(
  '/update-category/:id',
  checkAuthenticatedUser,
  verifyRole(['admin']),
  async (req, res) => {
    const { id } = req.params

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid category ID',
      })
    }

    const body = req.body || {}
    const updatedCategory = {}

    // Validate and update name
    if (body.name !== undefined) {
      if (typeof body.name !== 'string' || !body.name.trim()) {
        return res.status(400).json({
          success: false,
          message: 'Category name cannot be empty',
        })
      }

      updatedCategory.name = body.name.trim()
    }

    // Validate and update slug
    if (body.slug !== undefined) {
      if (typeof body.slug !== 'string' || !body.slug.trim()) {
        return res.status(400).json({
          success: false,
          message: 'Category slug cannot be empty',
        })
      }

      updatedCategory.slug = body.slug.trim().toLowerCase()
    }

    // Validate and update image
    if (body.image !== undefined) {
      if (typeof body.image !== 'string' || !body.image.trim()) {
        return res.status(400).json({
          success: false,
          message: 'Category image cannot be empty',
        })
      }

      updatedCategory.image = body.image.trim()
    }

    // Check empty update
    if (Object.keys(updatedCategory).length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Provide category details to update',
      })
    }

    try {
      // Check duplicate name and slug
      const duplicateConditions = []

      if (updatedCategory.name) {
        duplicateConditions.push({ name: updatedCategory.name })
      }

      if (updatedCategory.slug) {
        duplicateConditions.push({ slug: updatedCategory.slug })
      }

      if (duplicateConditions.length > 0) {
        const existingCategory = await categoriesCollection.findOne({
          _id: { $ne: new ObjectId(id) },
          $or: duplicateConditions,
        })

        if (existingCategory) {
          return res.status(409).json({
            success: false,
            message: 'Category already exists',
          })
        }
      }

      // Update category
      const result = await categoriesCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: updatedCategory }
      )

      if (result.matchedCount === 0) {
        return res.status(404).json({
          success: false,
          message: 'Category not found',
        })
      }

      sendSuccess(res, null, 'Category updated successfully')
    } catch (error) {
      console.error('Update Category Error:', error)

      res.status(500).json({
        success: false,
        message: 'Failed to update category',
      })
    }
  }
)

export default router
