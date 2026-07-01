import { Router } from 'express';
import { 
  getWaitTimeConfig, 
  updateWaitTimeConfig,
  getWaitlist,
  joinWaitlist,
  updateWaitlistStatus,
  sendOffer
} from '../controllers/waitTimeController';

const router = Router();

router.get('/config', getWaitTimeConfig);
router.put('/config', updateWaitTimeConfig);

router.get('/entries', getWaitlist);
router.post('/entries', joinWaitlist);
router.put('/entries/:entryId/status', updateWaitlistStatus);
router.post('/entries/:entryId/offer', sendOffer);

export default router;
