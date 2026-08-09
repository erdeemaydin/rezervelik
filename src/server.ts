// Critical bug fixed here: this file used to `import app from './app'` (which
// transitively imports src/utils/jwt.ts, evaluated at import time) BEFORE
// calling `dotenv.config()` below. Because TypeScript's CommonJS output runs
// import side effects in file order, jwt.ts's module-scope code was reading
// `process.env.JWT_SECRET` before dotenv had populated it from .env — meaning
// any deployment that set JWT_SECRET only in .env (as .env.example instructs)
// was silently signing every session token with jwt.ts's hardcoded fallback
// secret, not the real one, regardless of what was actually in .env.
import './env'; // must be the first import — loads .env synchronously before anything else runs
import app from './app';
import { startPriceUpdater } from './workers/priceUpdater';

const PORT = process.env.PORT || 3000;

// Initialize background workers
startPriceUpdater();

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
