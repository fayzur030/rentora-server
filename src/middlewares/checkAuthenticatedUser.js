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
