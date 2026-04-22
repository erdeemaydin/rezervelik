import { Request, Response, NextFunction } from 'express';

declare global {
  namespace Express {
    interface Request {
      restaurantId?: string;
    }
  }
}

export const tenantMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const restaurantId = req.headers['x-restaurant-id'] as string;

  if (!restaurantId) {
    return res.status(400).json({
      error: 'X-Restaurant-ID header is required',
    });
  }

  req.restaurantId = restaurantId;
  next();
};
