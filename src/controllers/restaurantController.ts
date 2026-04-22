import { Request, Response } from 'express';
import * as restaurantService from '../services/restaurantService';
import { successResponse, errorResponse } from '../utils/response';

export const getRestaurant = async (req: Request, res: Response) => {
  try {
    const restaurantId = req.restaurantId!;
    const restaurant = await restaurantService.getRestaurantById(restaurantId);

    if (!restaurant) {
      return errorResponse(res, 'errors.restaurant_not_found', 404);
    }

    return successResponse(res, restaurant);
  } catch (error) {
    console.error('Get restaurant error:', error);
    return errorResponse(res, 'errors.internal_error', 500);
  }
};
