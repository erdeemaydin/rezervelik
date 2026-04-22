import { Router } from 'express';
import * as menuController from '../controllers/menuController';
import { authMiddleware, requirePermission } from '../middlewares/auth';

const router = Router();

// Publicly accessible for customer frontend
router.get('/', menuController.getMenus);

// Protected for restaurant admin
router.use(authMiddleware);
router.use(requirePermission('manage_menu'));

router.post('/', menuController.createMenu);
router.put('/:id', menuController.updateMenu);
router.delete('/:id', menuController.deleteMenu);

router.post('/categories', menuController.createCategory);
router.put('/categories/:id', menuController.updateCategory);
router.delete('/categories/:id', menuController.deleteCategory);

router.post('/categories/:categoryId/items', menuController.createMenuItem);
router.put('/items/:id', menuController.updateMenuItem);
router.delete('/items/:id', menuController.deleteMenuItem);

router.post('/import', menuController.importMenuFromImage);

export default router;
