import { Router } from 'express';
import * as daySettingController from '../controllers/daySettingController';
import { authMiddleware, requirePermission } from '../middlewares/auth';
import { tenantMiddleware } from '../middlewares/tenant';

const router = Router();

router.use(tenantMiddleware);
router.use(authMiddleware);
router.use(requirePermission('manage_calendar'));

router.get('/', daySettingController.getDaySettings);
router.post('/', daySettingController.upsertDaySetting);
router.post('/bulk', daySettingController.bulkUpsertDaySettings);
router.delete('/:date', daySettingController.deleteDaySetting);

export default router;
