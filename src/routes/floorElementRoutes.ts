import { Router } from 'express';
import {
  getFloorElements,
  createFloorElement,
  updateFloorElement,
  deleteFloorElement
} from '../controllers/floorElementController';
import { authMiddleware, requirePermission } from '../middlewares/auth';

const router = Router();

// Security-audit finding: this router had zero auth — only tenantMiddleware
// (mounted in app.ts, requires just an X-Restaurant-ID header) gated it, so
// anyone who knew a tenant's restaurant id (exposed as the public `id` field
// by GET /api/public/restaurant/:slug) could read/write/delete their floor
// plan with no session at all. Same permission as the sibling table/zone
// routes (tableRoutes.ts, tableTypeRoutes.ts), since floor elements are part
// of the same floor-plan editor feature.
router.use(authMiddleware);
router.use(requirePermission('manage_tables'));

router.get('/', getFloorElements);
router.post('/', createFloorElement);
router.put('/:id', updateFloorElement);
router.delete('/:id', deleteFloorElement);

export default router;
