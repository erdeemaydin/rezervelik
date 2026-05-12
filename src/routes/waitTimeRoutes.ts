import { Router } from 'express';
import { getWaitTimeConfig, updateWaitTimeConfig } from '../controllers/waitTimeController';

const router = Router();

router.get('/', getWaitTimeConfig);
router.put('/', updateWaitTimeConfig);

export default router;
