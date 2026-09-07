import { Request, Response, NextFunction } from 'express'
import { Sentry } from '@racketly/utils/observability'

export class AppError extends Error {
  constructor(
    public message: string,
    public statusCode: number
  ) {
    super(message)
  }
}

export function errorHandler(
  err: Error | AppError,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  const status = err instanceof AppError ? err.statusCode : 500
  const message = err instanceof AppError ? err.message : 'Error interno del servidor'
  if (!(err instanceof AppError)) {
    console.error(err)
    Sentry.captureException(err)
  }
  return res.status(status).json({ success: false, error: message })
}
