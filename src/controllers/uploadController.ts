import { Request, Response } from 'express';
import { successResponse, errorResponse } from '../utils/response';

export const uploadImage = async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return errorResponse(res, 'No file uploaded', 400);
    }
    
    // Construct the public URL for the file
    // Assuming Express is serving the 'public' folder directly
    // Wait, let's see how static files are served in the app. Usually it's mapped to root.
    // So /uploads/filename.ext
    const fileUrl = `/uploads/${req.file.filename}`;
    
    return successResponse(res, { url: fileUrl });
  } catch (error) {
    console.error('Upload error:', error);
    return errorResponse(res, 'errors.internal_error', 500);
  }
};
