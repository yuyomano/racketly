import { Request, Response, NextFunction } from 'express'
import { Sentry } from '@racketly/utils/observability'

export class AppError extends Error {
  public readonly statusCode: number
  public readonly isOperational: boolean

  constructor(message: string, statusCode: number, isOperational = true) {
    super(message)
    this.statusCode = statusCode
    this.isOperational = isOperational
    Error.captureStackTrace(this, this.constructor)
  }
}

export function errorHandler(
  err: Error | AppError,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      error: err.message,
    })
  }

  console.error('Unhandled error:', err)
  Sentry.captureException(err)
  return res.status(500).json({
    success: false,
    error: 'Error interno del servidor',
  })
}
