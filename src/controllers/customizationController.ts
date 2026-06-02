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
      theme, 
      primaryColor, 
      announcementText, 
      showAboutUs, 
      aboutUsText, 
      showLegal, 
      legalText, 
      socialLinks 
    } = req.body;

    const customization = await prisma.frontendCustomization.upsert({
      where: { restaurantId },
      update: {
        theme,
        primaryColor,
        announcementText,
        showAboutUs,
        aboutUsText,
        showLegal,
        legalText,
        socialLinks
      },
      create: {
        restaurantId,
        theme,
        primaryColor,
        announcementText,
        showAboutUs,
        aboutUsText,
        showLegal,
        legalText,
        socialLinks
      }
    });

    return successResponse(res, customization);
  } catch (error) {
    console.error('Update customization error:', error);
    return errorResponse(res, 'errors.internal_error', 500);
  }
};
