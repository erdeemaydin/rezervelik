import { Router } from 'express';
import * as orderController from '../controllers/orderController';
import { authMiddleware, requirePermission } from '../middlewares/auth';
import { requireOnlineOrderingAddon } from '../middlewares/onlineOrdering';

const router = Router();

// Staff order-station surface — /api/orders/*. Mounted behind tenantMiddleware
// in app.ts. `manage_orders` is a new tenant permission key (see
// docs/architecture/PROJECT_LOGIC.md's role/permission model) — a free-string entry in
// User.permissions, granted the same way manage_menu/manage_reservations are;
// no registry file to update (requirePermission is a plain string check).
router.use(authMiddleware);
router.use(requireOnlineOrderingAddon({ notFoundWhenOff: false }));
router.use(requirePermission('manage_orders'));

router.get('/', orderController.listOrders);
router.get('/stream', orderController.streamOrders);
router.patch('/:id/status', orderController.updateOrderStatus);

router.get('/customers', orderController.listCustomers);
router.get('/customers/:id', orderController.getCustomerDetail);

router.get('/order-settings', orderController.getOrderSettings);
router.put('/order-settings', orderController.updateOrderSettings);

router.get('/delivery-zones', orderController.listDeliveryZones);
router.post('/delivery-zones', orderController.createDeliveryZone);
router.put('/delivery-zones/:id', orderController.updateDeliveryZone);
router.delete('/delivery-zones/:id', orderController.deleteDeliveryZone);

router.patch('/menu/:id/orderable', orderController.setMenuItemOrderable);

export default router;
