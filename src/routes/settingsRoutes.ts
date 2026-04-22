import { Router } from 'express';
import * as settingsController from '../controllers/settingsController';
import { authMiddleware, requirePermission } from '../middlewares/auth';

const router = Router();

router.use(authMiddleware);

router.get('/', settingsController.getSettings);

router.use(requirePermission('manage_settings'));
router.put('/', settingsController.updateSettings);

export default router;
