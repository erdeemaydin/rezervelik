import { Router } from 'express';
import * as menuController from '../controllers/menuController';
import * as priceUpdateController from '../controllers/priceUpdateController';
import { authMiddleware, requirePermission } from '../middlewares/auth';
import { requireFeature } from '../middlewares/feature';

const router = Router();

router.use(requireFeature('hasMenuFeature'));

// Publicly accessible for customer frontend
router.get('/', menuController.getMenus);

router.use(authMiddleware);
router.use(requirePermission('manage_menu'));

router.post('/', menuController.createMenu);
router.put('/:id', menuController.updateMenu);
router.delete('/:id', menuController.deleteMenu);

router.post('/categories', menuController.createCategory);
router.put('/categories/:id', menuController.updateCategory);
router.delete('/categories/:id', menuController.deleteCategory);

router.post('/items', menuController.createMenuItem);
router.put('/items/:id', menuController.updateMenuItem);
router.delete('/items/:id', menuController.deleteMenuItem);

router.post('/prices/bulk', priceUpdateController.bulkUpdatePrices);
router.post('/prices/set', priceUpdateController.setItemPrices);

router.post('/import', menuController.importMenuFromImage);

export default router;
