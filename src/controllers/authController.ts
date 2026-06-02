import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import prisma from '../config/prisma';
import { generateToken } from '../utils/jwt';
import { successResponse, errorResponse } from '../utils/response';

export const register = async (req: Request, res: Response) => {
  try {
    const { email, password, firstName, lastName, restaurantName } = req.body;

    // Basic validation
    if (!email || !password || !firstName || !lastName || !restaurantName) {
      return errorResponse(res, 'errors.validation_error', 400, { message: 'All fields are required' });
    }

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return errorResponse(res, 'errors.validation_error', 400, { message: 'Email already in use' });
    }

    // Generate a slug from restaurant name
    const slug = restaurantName.toLowerCase().replace(/[^a-z0-9]+/g, '-');

    const hashedPassword = await bcrypt.hash(password, 10);

    // Create Restaurant and Admin User in a transaction
    const result = await prisma.$transaction(async (prisma) => {
      const restaurant = await prisma.restaurant.create({
        data: {
          name: restaurantName,
          slug: `${slug}-${Date.now()}`, // Ensure uniqueness
          contactEmail: email,
          settings: {
            create: {}
          }
        }
      });

      const user = await prisma.user.create({
        data: {
          email,
          passwordHash: hashedPassword,
          firstName,
          lastName,
          role: 'ADMIN',
          permissions: 'manage_reservations,manage_tables,manage_menu,manage_calendar,manage_staff,manage_settings',
          restaurantId: restaurant.id
        }
      });

      return { restaurant, user };
    });

    const token = generateToken(result.user.id, result.restaurant.id, result.user.role);

    return successResponse(res, {
      user: {
        id: result.user.id,
        email: result.user.email,
        firstName: result.user.firstName,
        lastName: result.user.lastName,
        role: result.user.role
      },
      restaurant: result.restaurant,
      token
    }, 'messages.welcome', 201);

  } catch (error) {
    console.error('Registration error:', error);
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

export const login = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    console.log(`[Auth] Login attempt: ${email}`);

    if (!email || !password) {
      return errorResponse(res, 'errors.validation_error', 400, { message: 'Email and password are required' });
    }

    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      console.log(`[Auth] User not found: ${email}`);
      return errorResponse(res, 'errors.unauthorized', 401, { message: 'Invalid credentials' });
    }

    const isValidPassword = await bcrypt.compare(password, user.passwordHash);

    if (!isValidPassword) {
      console.log(`[Auth] Invalid password for: ${email}`);
      return errorResponse(res, 'errors.unauthorized', 401, { message: 'Invalid credentials' });
    }

    console.log(`[Auth] Login successful: ${user.id} (${user.role})`);
    const token = generateToken(user.id, user.restaurantId, user.role);

    return successResponse(res, {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        restaurantId: user.restaurantId
      },
      token
    });

  } catch (error: any) {
    console.error('[Auth] Critical Login Error:', error.message, error.stack);
    return errorResponse(res, 'errors.internal_error', 500, { detail: error.message });
  }
};
