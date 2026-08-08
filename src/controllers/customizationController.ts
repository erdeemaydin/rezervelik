import { Request, Response } from 'express';
import prisma from '../config/prisma';
import { successResponse, errorResponse } from '../utils/response';

export const getCustomization = async (req: Request, res: Response) => {
  try {
    const restaurantId = req.restaurantId!;
    let customization = await prisma.frontendCustomization.findUnique({
      where: { restaurantId }
    });

    if (!customization) {
      customization = await prisma.frontendCustomization.create({
        data: { restaurantId }
      });
    }

    return successResponse(res, customization);
  } catch (error) {
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

export const updateCustomization = async (req: Request, res: Response) => {
  try {
    const restaurantId = req.restaurantId!;
    // layoutStyle is deliberately not destructured/accepted here: per
    // PROJECT_LOGIC.md §8 it's a SysAdmin-exclusive design-architecture choice, set
    // only via PUT /api/system/tenants/:id/settings (systemController.ts). This
    // route is reachable by any tenant staffer with manage_settings — accepting
    // layoutStyle from req.body here would let a tenant admin flip their own public
    // page's layout with a direct API call, bypassing that restriction entirely
    // (the dashboard UI simply never showing a control for it isn't enforcement).
    const {
      typography,
      colorPalette,
      primaryColor,
      announcementText,
      showAboutUs,
      aboutUsText,
      showLegal,
      legalText,
      socialLinks,
      reservationInfoText,
      reservationWarningText
    } = req.body;

    const customization = await prisma.frontendCustomization.upsert({
      where: { restaurantId },
      update: {
        typography,
        colorPalette,
        primaryColor,
        announcementText,
        showAboutUs,
        aboutUsText,
        showLegal,
        legalText,
        socialLinks,
        reservationInfoText,
        reservationWarningText
      },
      create: {
        restaurantId,
        typography,
        colorPalette,
        primaryColor,
        announcementText,
        showAboutUs,
        aboutUsText,
        showLegal,
        legalText,
        socialLinks,
        reservationInfoText,
        reservationWarningText
      }
    });

    return successResponse(res, customization);
  } catch (error) {
    console.error('Update customization error:', error);
    return errorResponse(res, 'errors.internal_error', 500);
  }
};
