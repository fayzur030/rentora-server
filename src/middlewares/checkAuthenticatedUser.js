import { createRemoteJWKSet, jwtVerify } from 'jose'
import { env } from '../config/env.js'

export const checkAuthenticatedUser = async (req, res, next) => {
  const token = req.headers.authorization

  if (!token) {
    return res.status(401).json({
      message: 'Unauthorized',
    })
  }

  const parseToken = token.split(' ')[1]

  try {
    const JWKS = createRemoteJWKSet(new URL(`${env.CLIENT_URL}/api/auth/jwks`))

    const { payload } = await jwtVerify(parseToken, JWKS, {
      issuer: env.CLIENT_URL,
      audience: env.CLIENT_URL,
    })

    req.user = {
      name: payload.name,
      email: payload.email,
      role: payload.role,
      id: payload.sub,
    }

    next()
  } catch (error) {
    return res.status(401).json({
      message: 'Unauthorized: Invalid token',
    })
  }
}

export const verifyRole = (roles) => {
  // verify user role
  const allowedRoles = Array.isArray(roles) ? roles : [roles]

  return (req, res, next) => {
    const role = req.user?.role

    if (!allowedRoles.includes(role)) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission...',
      })
    }

    next()
  }
}
