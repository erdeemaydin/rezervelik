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
    const { 
      layoutStyle,
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
        layoutStyle,
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
        layoutStyle,
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
