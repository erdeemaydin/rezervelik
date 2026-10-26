import { Request, Response } from 'express';
import prisma from '../config/prisma';
import { successResponse, errorResponse } from '../utils/response';

// Vendor directory for the organizer/wedding vertical (Phase 5). Vendors are
// owned per-tenant (photographers, DJs, florists…) and linked to specific events
// via EventVendor (see eventController). Every query is scoped to req.restaurantId.

export const VENDOR_CATEGORIES = [
  'PHOTOGRAPHER', 'VIDEOGRAPHER', 'DJ', 'MUSIC', 'FLORIST',
  'CATERING', 'DECOR', 'TRANSPORT', 'CAKE', 'OTHER',
];

export const getVendors = async (req: Request, res: Response) => {
  try {
    const restaurantId = req.restaurantId!;
    const { category } = req.query;
    const vendors = await prisma.vendor.findMany({
      where: { restaurantId, ...(typeof category === 'string' && category ? { category } : {}) },
      include: { _count: { select: { eventVendors: true } } },
      orderBy: { name: 'asc' },
    });
    return successResponse(res, vendors);
  } catch (error) {
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

export const createVendor = async (req: Request, res: Response) => {
  try {
    const restaurantId = req.restaurantId!;
    const { name, category, contactName, phone, email, notes } = req.body;
    if (!name) return errorResponse(res, 'errors.validation_error', 400, { message: 'name is required' });
    if (category && !VENDOR_CATEGORIES.includes(category)) {
      return errorResponse(res, 'errors.validation_error', 400, { message: `Invalid category. One of: ${VENDOR_CATEGORIES.join(', ')}` });
    }
    const vendor = await prisma.vendor.create({
      data: {
        restaurantId,
        name,
        category: category || 'OTHER',
        contactName: contactName || null,
        phone: phone || null,
        email: email || null,
        notes: notes || null,
      },
    });
    return successResponse(res, vendor, 'Vendor created', 201);
  } catch (error) {
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

export const updateVendor = async (req: Request, res: Response) => {
  try {
    const restaurantId = req.restaurantId!;
    const { id } = req.params;
    const existing = await prisma.vendor.findFirst({ where: { id, restaurantId }, select: { id: true } });
    if (!existing) return errorResponse(res, 'errors.not_found', 404);

    const b = req.body;
    if (b.category !== undefined && !VENDOR_CATEGORIES.includes(b.category)) {
      return errorResponse(res, 'errors.validation_error', 400, { message: 'Invalid category' });
    }
    const vendor = await prisma.vendor.update({
      where: { id },
      data: {
        name: b.name,
        category: b.category,
        contactName: b.contactName,
        phone: b.phone,
        email: b.email,
        notes: b.notes,
      },
    });
    return successResponse(res, vendor);
  } catch (error) {
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

export const deleteVendor = async (req: Request, res: Response) => {
  try {
    const restaurantId = req.restaurantId!;
    const { id } = req.params;
    const existing = await prisma.vendor.findFirst({ where: { id, restaurantId }, select: { id: true } });
    if (!existing) return errorResponse(res, 'errors.not_found', 404);
    // EventVendor rows cascade-delete with the vendor (schema onDelete: Cascade).
    await prisma.vendor.delete({ where: { id } });
    return successResponse(res, null, 'Vendor deleted');
  } catch (error) {
    return errorResponse(res, 'errors.internal_error', 500);
  }
};
