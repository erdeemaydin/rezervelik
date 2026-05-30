import { Router } from 'express';
import { 
  getFloorElements, 
  createFloorElement, 
  updateFloorElement, 
  deleteFloorElement 
} from '../controllers/floorElementController';

const router = Router();

router.get('/', getFloorElements);
router.post('/', createFloorElement);
router.put('/:id', updateFloorElement);
router.delete('/:id', deleteFloorElement);

export default router;
