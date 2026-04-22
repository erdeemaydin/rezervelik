import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import prisma from '../config/prisma';
import { successResponse, errorResponse } from '../utils/response';

export const getAllTenants = async (req: Request, res: Response) => {
  try {
    const tenants = await prisma.restaurant.findMany({
      include: {
        settings: true,
        users: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            role: true
          }
        }
      }
    });
    return successResponse(res, tenants);
  } catch (error) {
    console.error('Get all tenants error:', error);
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

export const createTenant = async (req: Request, res: Response) => {
  try {
    const { name, contactEmail, adminFirstName, adminLastName, adminPassword } = req.body;

    if (!name || !contactEmail || !adminFirstName || !adminLastName || !adminPassword) {
      return errorResponse(res, 'errors.validation_error', 400, { message: 'All fields are required' });
    }

    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const existingUser = await prisma.user.findUnique({ where: { email: contactEmail } });

    if (existingUser) {
      return errorResponse(res, 'errors.validation_error', 400, { message: 'Admin email already exists' });
    }

    const hashedPassword = await bcrypt.hash(adminPassword, 10);

    const result = await prisma.$transaction(async (prisma) => {
      const restaurant = await prisma.restaurant.create({
        data: {
          name,
          slug: `${slug}-${Date.now()}`,
          contactEmail,
          settings: {
            create: {}
          }
        }
      });

      const user = await prisma.user.create({
        data: {
          email: contactEmail,
          passwordHash: hashedPassword,
          firstName: adminFirstName,
          lastName: adminLastName,
          role: 'ADMIN',
          permissions: 'manage_reservations,manage_tables,manage_menu,manage_calendar,manage_staff,manage_settings',
          restaurantId: restaurant.id
        }
      });

      return { restaurant, adminUser: user };
    });

    return successResponse(res, result, undefined, 201);
  } catch (error) {
    console.error('Create tenant error:', error);
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

export const updateTenantSettings = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { isVipEnabled, isInternalNotesEnabled, isCategoriesEnabled } = req.body;

    const updated = await prisma.restaurantSettings.update({
      where: { restaurantId: id },
      data: {
        isVipEnabled,
        isInternalNotesEnabled,
        isCategoriesEnabled
      }
    });

    return successResponse(res, updated);
  } catch (error) {
    console.error('Update tenant settings error:', error);
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

export const updateTenantUserPermissions = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { permissions } = req.body;

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        permissions: Array.isArray(permissions) ? permissions.join(',') : permissions
      }
    });

    return successResponse(res, updatedUser);
  } catch (error) {
    console.error('Update tenant user permissions error:', error);
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

export const createSuperAdmin = async (req: Request, res: Response) => {
  // NOTE: In production, this should be a CLI script or heavily protected.
  // We leave it open for initial setup, but ideally you check for a secret token.
  try {
    const { email, password, firstName, lastName, secretToken } = req.body;

    if (secretToken !== 'SETUP_SECRET_TOKEN_123') {
      return errorResponse(res, 'errors.unauthorized', 403, { message: 'Invalid setup token' });
    }

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return errorResponse(res, 'errors.validation_error', 400, { message: 'Email already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash: hashedPassword,
        firstName,
        lastName,
        role: 'SUPER_ADMIN'
        // restaurantId remains null
      }
    });

    return successResponse(res, user, undefined, 201);
  } catch (error) {
    console.error('Create super admin error:', error);
    return errorResponse(res, 'errors.internal_error', 500);
  }
};
