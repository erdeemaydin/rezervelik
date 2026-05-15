import { Router } from 'express';
import { 
  getWaitTimeConfig, 
  updateWaitTimeConfig,
  getWaitlist,
  joinWaitlist,
  updateWaitlistStatus
} from '../controllers/waitTimeController';

const router = Router();

router.get('/config', getWaitTimeConfig);
router.put('/config', updateWaitTimeConfig);

router.get('/entries', getWaitlist);
router.post('/entries', joinWaitlist);
router.put('/entries/:entryId/status', updateWaitlistStatus);

export default router;
