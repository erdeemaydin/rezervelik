import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import prisma from '../config/prisma';
import { successResponse, errorResponse } from '../utils/response';
import { generateResetToken } from '../utils/resetToken';
import { isValidPhone } from '../utils/phone';
import { logAudit } from '../services/auditService';

const resetLinkFor = (rawToken: string) =>
  `${process.env.APP_PUBLIC_URL || 'http://localhost:3001'}/auth/reset/${rawToken}`;

// Attach a fresh single-use reset token to a user and return the one-time link.
async function issueResetLink(userId: string): Promise<string> {
  const { rawToken, tokenHash, expiresAt } = generateResetToken();
  await prisma.user.update({
    where: { id: userId },
    data: { resetTokenHash: tokenHash, resetTokenExpiresAt: expiresAt },
  });
  return resetLinkFor(rawToken);
}

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
        phone: true,
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
    const { email, firstName, lastName, role, permissions, phone } = req.body;

    if (!email || !firstName || !lastName || !role) {
      return errorResponse(res, 'errors.validation_error', 400, { message: 'Missing required fields' });
    }

    if (phone && !isValidPhone(phone)) {
      return errorResponse(res, 'errors.validation_error', 400, { message: 'Invalid phone number' });
    }

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return errorResponse(res, 'errors.validation_error', 400, { message: 'Email already in use' });
    }

    // Staff set their own password via a reset link (#7.1) — never chosen by the
    // admin. Store a random unusable hash until the user completes the reset.
    const randomHash = await bcrypt.hash(crypto.randomBytes(24).toString('hex'), 10);

    const user = await prisma.user.create({
      data: {
        restaurantId,
        email,
        passwordHash: randomHash,
        firstName,
        lastName,
        role,
        phone: phone || null,
        permissions: Array.isArray(permissions) ? permissions.join(',') : permissions
      },
      select: { id: true, email: true, firstName: true, lastName: true, role: true, permissions: true, phone: true }
    });

    const resetLink = await issueResetLink(user.id);

    logAudit({
      req,
      restaurantId,
      category: 'PERMISSIONS',
      action: 'STAFF_CREATED',
      targetType: 'User',
      targetId: user.id,
      targetLabel: user.email,
      metadata: { role: user.role, permissions: user.permissions },
    });

    return successResponse(res, { ...user, resetLink }, 'Staff member created successfully', 201);
  } catch (error: any) {
    // The findUnique check above is a fail-fast convenience, not the real guard —
    // User.email is DB-unique, so two near-simultaneous creates with the same email
    // can both pass that check and race to this create() call. Without this, the
    // loser got an opaque 500 instead of the same "Email already in use" message.
    if (error?.code === 'P2002') {
      return errorResponse(res, 'errors.validation_error', 400, { message: 'Email already in use' });
    }
    console.error('Create staff error:', error);
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

export const updateStaffMember = async (req: Request, res: Response) => {
  try {
    const restaurantId = req.restaurantId!;
    const { id } = req.params;
    const { email, firstName, lastName, role, permissions, phone, sendResetLink } = req.body;

    // Prevent modifying other tenants' users or super admins
    const targetUser = await prisma.user.findUnique({ where: { id } });
    if (!targetUser || targetUser.restaurantId !== restaurantId || targetUser.role === 'SUPER_ADMIN') {
      return errorResponse(res, 'errors.unauthorized', 403, { message: 'Cannot modify this user' });
    }

    // Prevent tenant admin from locking themselves out (basic protection).
    // Bug fix: this used to block ANY self-edit unless the submitted `role`
    // was literally 'ADMIN' — so a MANAGER/STAFF editing their own phone
    // number, or an ADMIN updating an unrelated field without resubmitting
    // role, got rejected as "Cannot demote yourself" even though nothing was
    // being demoted. The actual intent (only an ADMIN can lock themselves
    // out of admin access) requires checking the target's CURRENT role, and
    // only treating it as a demotion attempt when `role` is actually being
    // changed to something else.
    if (targetUser.id === req.user?.userId && targetUser.role === 'ADMIN' && role !== undefined && role !== 'ADMIN') {
        return errorResponse(res, 'errors.forbidden', 403, { message: 'Cannot demote yourself' });
    }

    if (phone && !isValidPhone(phone)) {
      return errorResponse(res, 'errors.validation_error', 400, { message: 'Invalid phone number' });
    }

    const updateData: any = {
      firstName,
      lastName,
      role,
      permissions: Array.isArray(permissions) ? permissions.join(',') : permissions
    };
    if (phone !== undefined) updateData.phone = phone || null;

    if (email && email !== targetUser.email) {
      const emailCheck = await prisma.user.findUnique({ where: { email } });
      if (emailCheck) return errorResponse(res, 'errors.validation_error', 400, { message: 'Email already in use' });
      updateData.email = email;
    }

    const user = await prisma.user.update({
      where: { id },
      data: updateData,
      select: { id: true, email: true, firstName: true, lastName: true, role: true, permissions: true, phone: true }
    });

    // Passwords are never set directly by the admin (#7.1). If a password change
    // was requested, issue a reset link the staff member uses to set their own.
    const resetLink = sendResetLink ? await issueResetLink(id) : undefined;

    logAudit({
      req,
      restaurantId,
      category: 'PERMISSIONS',
      action: 'STAFF_UPDATED',
      targetType: 'User',
      targetId: user.id,
      targetLabel: user.email,
      metadata: {
        previousRole: targetUser.role,
        newRole: user.role,
        previousPermissions: targetUser.permissions,
        newPermissions: user.permissions,
      },
    });

    return successResponse(res, { ...user, ...(resetLink ? { resetLink } : {}) }, 'Staff member updated');
  } catch (error: any) {
    // Same check-then-write race as createStaffMember's email uniqueness check.
    if (error?.code === 'P2002') {
      return errorResponse(res, 'errors.validation_error', 400, { message: 'Email already in use' });
    }
    console.error('Update staff error:', error);
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

// POST /staff/:id/reset-link — issue a fresh password-reset link for a staff member
// so they can (re)set their own password (#7.1).
export const createStaffResetLink = async (req: Request, res: Response) => {
  try {
    const restaurantId = req.restaurantId!;
    const { id } = req.params;
    const targetUser = await prisma.user.findUnique({ where: { id } });
    if (!targetUser || targetUser.restaurantId !== restaurantId || targetUser.role === 'SUPER_ADMIN') {
      return errorResponse(res, 'errors.unauthorized', 403, { message: 'Cannot modify this user' });
    }
    const resetLink = await issueResetLink(id);
    return successResponse(res, { resetLink }, 'Reset link generated');
  } catch (error) {
    console.error('Create staff reset link error:', error);
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

    logAudit({
      req,
      restaurantId,
      category: 'PERMISSIONS',
      action: 'STAFF_DELETED',
      targetType: 'User',
      targetId: targetUser.id,
      targetLabel: targetUser.email,
      metadata: { role: targetUser.role },
    });

    return successResponse(res, null, 'Staff member removed');
  } catch (error) {
    console.error('Delete staff error:', error);
    return errorResponse(res, 'errors.internal_error', 500);
  }
};
