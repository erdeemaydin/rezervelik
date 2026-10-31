import { Router } from 'express';
import * as orderController from '../controllers/orderController';
import * as orderMenuController from '../controllers/orderMenuController';
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

// Phone-scoped customer bans. Declared before nothing parameterised at this
// prefix, but kept above /:id-style siblings by convention.
router.get('/bans', orderController.listBans);
router.post('/bans', orderController.createBan);
router.patch('/bans/:id/lift', orderController.liftBan);

router.get('/order-settings', orderController.getOrderSettings);
router.put('/order-settings', orderController.updateOrderSettings);

// The restaurant's own map pin — the origin every delivery-distance
// calculation measures from.
router.put('/restaurant-location', orderController.updateRestaurantLocation);

router.get('/delivery-zones', orderController.listDeliveryZones);
router.post('/delivery-zones', orderController.createDeliveryZone);
router.put('/delivery-zones/:id', orderController.updateDeliveryZone);
router.delete('/delivery-zones/:id', orderController.deleteDeliveryZone);

// Curated online-order catalog (the dashboard "Order Menu" window). The
// literal /reorder, /items and /categories segments are declared before the
// parameterised /items/:id routes they'd otherwise shadow.
router.get('/order-menu', orderMenuController.getOrderMenu);
router.put('/order-menu/reorder', orderMenuController.reorder);

router.post('/order-menu/items', orderMenuController.addCatalogItem);
router.put('/order-menu/items/:id', orderMenuController.updateCatalogItem);
router.patch('/order-menu/items/:id/pause', orderMenuController.pauseCatalogItem);
router.delete('/order-menu/items/:id', orderMenuController.removeCatalogItem);

router.post('/order-menu/categories', orderMenuController.createOrderCategory);
router.put('/order-menu/categories/:id', orderMenuController.updateOrderCategory);
router.delete('/order-menu/categories/:id', orderMenuController.deleteOrderCategory);

// Legacy per-item toggle on dashboard/menus. Superseded by /order-menu above
// (it mirrors its writes into OrderMenuItem); kept until A7 replaces that UI.
router.patch('/menu/:id/orderable', orderController.setMenuItemOrderable);

export default router;
