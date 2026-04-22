import { Router } from 'express';
import * as tableTypeController from '../controllers/tableTypeController';
import { authMiddleware, requirePermission } from '../middlewares/auth';

const router = Router();

// Protect all table type routes with auth
router.use(authMiddleware);
router.use(requirePermission('manage_tables'));

router.get('/', tableTypeController.getTableTypes);
router.post('/', tableTypeController.createTableType);
router.put('/:id', tableTypeController.updateTableType);
router.delete('/:id', tableTypeController.deleteTableType);

export default router;
