import { Router } from 'express';
import * as tableController from '../controllers/tableController';
import { authMiddleware, requirePermission } from '../middlewares/auth';

const router = Router();

// Protect all table routes with auth
router.use(authMiddleware);
router.use(requirePermission('manage_tables'));

router.get('/', tableController.getTables);
router.post('/', tableController.createTable);
router.put('/:id', tableController.updateTable);
router.delete('/:id', tableController.deleteTable);

export default router;
