import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      requestId: string;
    }
  }
}

/**
 * Middleware to add a unique request ID to each request
 */
export function requestId(req: Request, res: Response, next: NextFunction): void {
  // Use existing request ID from header or generate new one
  const id = (req.headers['x-request-id'] as string) || uuidv4();

  req.requestId = id;
  res.setHeader('X-Request-Id', id);

  next();
}
