import { Request, Response } from 'express';
import sanitizeHtml from 'sanitize-html';
import prisma from '../config/prisma';
import { successResponse, errorResponse } from '../utils/response';

// Security-audit finding: reservationInfoText/reservationWarningText were
// stored verbatim from req.body and rendered on the public booking page via
// dangerouslySetInnerHTML in all four layout components (ClassicLayout,
// PremiumLayout, OldenLayout, GardenLayout) with no sanitization on either
// side — any tenant staffer with manage_settings could plant a stored-XSS
// payload that executes in every anonymous visitor's browser. Sanitizing on
// write (rather than only on render) means every current and future reader
// of these fields gets a value that's already safe, not just the React
// components that happen to remember to escape it.
const sanitizeRichText = (value: unknown): string | null | undefined => {
  if (value === undefined) return undefined; // not provided -> leave field unchanged
  if (value === null) return null; // explicit clear
  return sanitizeHtml(String(value), {
    allowedTags: ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 'ul', 'ol', 'li', 'a'],
    allowedAttributes: { a: ['href', 'target', 'rel'] },
    allowedSchemes: ['http', 'https', 'mailto', 'tel'],
    transformTags: {
      a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer', target: '_blank' }),
    },
  });
};

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
    // docs/architecture/PROJECT_LOGIC.md §8 it's a SysAdmin-exclusive design-architecture choice, set
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
      reservationWarningText,
      privacyNoticeText
    } = req.body;

    const sanitizedInfoText = sanitizeRichText(reservationInfoText);
    const sanitizedWarningText = sanitizeRichText(reservationWarningText);
    // Same rich-text/XSS treatment as reservationInfoText/reservationWarningText
    // above — this KVKK "aydınlatma metni" override is rendered on the public
    // /r/[slug]/privacy page via dangerouslySetInnerHTML, so it needs the same
    // write-time sanitization, not just the same optional/tenant-editable pattern.
    const sanitizedPrivacyNoticeText = sanitizeRichText(privacyNoticeText);

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
        reservationInfoText: sanitizedInfoText,
        reservationWarningText: sanitizedWarningText,
        privacyNoticeText: sanitizedPrivacyNoticeText
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
        reservationInfoText: sanitizedInfoText,
        reservationWarningText: sanitizedWarningText,
        privacyNoticeText: sanitizedPrivacyNoticeText
      }
    });

    return successResponse(res, customization);
  } catch (error) {
    console.error('Update customization error:', error);
    return errorResponse(res, 'errors.internal_error', 500);
  }
};
