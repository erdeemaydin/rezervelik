import { Router } from 'express';
import * as timeEntryController from '../controllers/timeEntryController';
import { authMiddleware } from '../middlewares/auth';

const router = Router();

// Any authenticated staff member can log their own hours; managers can log for
// others (enforced in the controller). No manage_staff permission gate here so
// regular staff can use their own portal.
router.use(authMiddleware);

router.get('/', timeEntryController.getTimeEntries);
router.put('/', timeEntryController.upsertTimeEntry);
router.get('/summary', timeEntryController.getWorkedHoursSummary);
router.delete('/:id', timeEntryController.deleteTimeEntry);

export default router;
