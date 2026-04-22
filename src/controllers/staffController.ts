import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import prisma from '../config/prisma';
import { successResponse, errorResponse } from '../utils/response';

export const getStaffMembers = async (req: Request, res: Response) => {
  try {
    const restaurantId = req.restaurantId!;
    const users = await prisma.user.findMany({
      where: { restaurantId, role: { not: 'SUPER_ADMIN' } },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        permissions: true,
        createdAt: true
      },
      orderBy: { createdAt: 'desc' }
    });

    return successResponse(res, users);
  } catch (error) {
    console.error('Get staff error:', error);
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

export const createStaffMember = async (req: Request, res: Response) => {
  try {
    const restaurantId = req.restaurantId!;
    const { email, password, firstName, lastName, role, permissions } = req.body;

    if (!email || !password || !firstName || !lastName || !role) {
      return errorResponse(res, 'errors.validation_error', 400, { message: 'Missing required fields' });
    }

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return errorResponse(res, 'errors.validation_error', 400, { message: 'Email already in use' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        restaurantId,
        email,
        passwordHash: hashedPassword,
        firstName,
        lastName,
        role,
        permissions: Array.isArray(permissions) ? permissions.join(',') : permissions
      },
      select: { id: true, email: true, firstName: true, lastName: true, role: true, permissions: true }
    });

    return successResponse(res, user, 'Staff member created successfully', 201);
  } catch (error) {
    console.error('Create staff error:', error);
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

export const updateStaffMember = async (req: Request, res: Response) => {
  try {
    const restaurantId = req.restaurantId!;
    const { id } = req.params;
    const { email, password, firstName, lastName, role, permissions } = req.body;

    // Prevent modifying other tenants' users or super admins
    const targetUser = await prisma.user.findUnique({ where: { id } });
    if (!targetUser || targetUser.restaurantId !== restaurantId || targetUser.role === 'SUPER_ADMIN') {
      return errorResponse(res, 'errors.unauthorized', 403, { message: 'Cannot modify this user' });
    }

    // Prevent tenant admin from locking themselves out (basic protection)
    if (targetUser.id === req.user?.userId && role !== 'ADMIN') {
        return errorResponse(res, 'errors.forbidden', 403, { message: 'Cannot demote yourself' });
    }

    const updateData: any = {
      firstName,
      lastName,
      role,
      permissions: Array.isArray(permissions) ? permissions.join(',') : permissions
    };

    if (email && email !== targetUser.email) {
      const emailCheck = await prisma.user.findUnique({ where: { email } });
      if (emailCheck) return errorResponse(res, 'errors.validation_error', 400, { message: 'Email already in use' });
      updateData.email = email;
    }

    if (password) {
      updateData.passwordHash = await bcrypt.hash(password, 10);
    }

    const user = await prisma.user.update({
      where: { id },
      data: updateData,
      select: { id: true, email: true, firstName: true, lastName: true, role: true, permissions: true }
    });

    return successResponse(res, user, 'Staff member updated');
  } catch (error) {
    console.error('Update staff error:', error);
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

export const deleteStaffMember = async (req: Request, res: Response) => {
  try {
    const restaurantId = req.restaurantId!;
    const { id } = req.params;

    const targetUser = await prisma.user.findUnique({ where: { id } });
    
    if (!targetUser || targetUser.restaurantId !== restaurantId || targetUser.role === 'SUPER_ADMIN') {
      return errorResponse(res, 'errors.unauthorized', 403, { message: 'Cannot delete this user' });
    }

    if (targetUser.id === req.user?.userId) {
        return errorResponse(res, 'errors.forbidden', 403, { message: 'Cannot delete yourself' });
    }

    await prisma.user.delete({ where: { id } });
    return successResponse(res, null, 'Staff member removed');
  } catch (error) {
    console.error('Delete staff error:', error);
    return errorResponse(res, 'errors.internal_error', 500);
  }
};
