import { Router } from 'express';
import * as staffController from '../controllers/staffController';
import { authMiddleware, requirePermission } from '../middlewares/auth';

const router = Router();

router.use(authMiddleware);
router.use(requirePermission('manage_staff'));

router.get('/', staffController.getStaffMembers);
router.post('/', staffController.createStaffMember);
router.put('/:id', staffController.updateStaffMember);
router.delete('/:id', staffController.deleteStaffMember);

export default router;
