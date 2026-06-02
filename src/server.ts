import dotenv from 'dotenv';
import app from './app';
import { startPriceUpdater } from './workers/priceUpdater';

dotenv.config();

const PORT = process.env.PORT || 3000;

// Initialize background workers
startPriceUpdater();

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
