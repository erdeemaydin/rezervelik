import { Router } from 'express';
import * as categoryController from '../controllers/categoryController';
import { authMiddleware, requirePermission } from '../middlewares/auth';

const router = Router();

router.use(authMiddleware);
router.get('/', categoryController.getCategories);

router.use(requirePermission('manage_menu'));
router.post('/', categoryController.createCategory);
router.put('/:id', categoryController.updateCategory);
router.delete('/:id', categoryController.deleteCategory);

export default router;
