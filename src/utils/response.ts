import { Response } from 'express';
import i18next from '../config/i18n';

export const successResponse = (res: Response, data: any, messageKey?: string, status: number = 200) => {
  const message = messageKey ? i18next.t(messageKey) : undefined;
  return res.status(status).json({
    success: true,
    data,
    message,
  });
};

export const errorResponse = (res: Response, errorKey: string, status: number = 400, details?: any) => {
  const message = i18next.t(errorKey);
  return res.status(status).json({
    success: false,
    error: message,
    details,
  });
};
