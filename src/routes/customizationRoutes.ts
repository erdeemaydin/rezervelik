import { Router } from 'express';
import * as customizationController from '../controllers/customizationController';
import { authMiddleware, requirePermission } from '../middlewares/auth';

const router = Router();

router.use(authMiddleware);
router.use(requirePermission('manage_settings'));

router.get('/', customizationController.getCustomization);
router.put('/', customizationController.updateCustomization);

export default router;
