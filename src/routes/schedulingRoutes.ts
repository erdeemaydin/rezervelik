import { Router } from 'express';
import {
  getShifts,
  createShift,
  updateShift,
  deleteShift,
  getAvailabilities,
  setAvailability,
  getAssignments,
  publishAssignments,
  unpublishAssignments,
  assignShift,
  removeAssignment
} from '../controllers/schedulingController';
import { authMiddleware, roleMiddleware } from '../middlewares/auth';
import { tenantMiddleware } from '../middlewares/tenant';

const router = Router();

// All routes require authentication and a valid tenant
router.use(tenantMiddleware);
router.use(authMiddleware);

// --- SHIFTS ---
router.get('/shifts', getShifts);
router.post('/shifts', roleMiddleware(['ADMIN', 'MANAGER']), createShift);
router.put('/shifts/:id', roleMiddleware(['ADMIN', 'MANAGER']), updateShift);
router.delete('/shifts/:id', roleMiddleware(['ADMIN', 'MANAGER']), deleteShift);

// --- AVAILABILITIES ---
// Everyone can view availabilities (filtered in controller based on role)
router.get('/availabilities', getAvailabilities);
// Everyone can set their own availability
router.post('/availabilities', setAvailability);

// --- ASSIGNMENTS ---
// Everyone can view assignments
router.get('/assignments', getAssignments);
// Only Admin/Manager can assign/remove shifts/publish
router.post('/assignments', roleMiddleware(['ADMIN', 'MANAGER']), assignShift);
router.post('/assignments/publish', roleMiddleware(['ADMIN', 'MANAGER']), publishAssignments);
router.post('/assignments/unpublish', roleMiddleware(['ADMIN', 'MANAGER']), unpublishAssignments);
router.delete('/assignments/:id', roleMiddleware(['ADMIN', 'MANAGER']), removeAssignment);

export default router;
