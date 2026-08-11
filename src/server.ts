import dotenv from 'dotenv';

dotenv.config();

// Initialize Sentry before anything else is imported so its instrumentation can
// hook in cleanly. This is a no-op unless SENTRY_DSN is set (see src/config/sentry.ts).
import Sentry from './config/sentry';

import app from './app';
import { startPriceUpdater } from './workers/priceUpdater';

const PORT = process.env.PORT || 3000;

// Process-level safety net: catch errors that occur outside any request context
// (e.g. in the price-updater worker's timers, or anywhere else that isn't wrapped
// by Express's request handling and therefore never reaches src/middlewares/errorHandler.ts).
// Sentry.captureException() is a safe no-op when SENTRY_DSN is unset.
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection:', reason);
  Sentry.captureException(reason);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
  Sentry.captureException(err);
  // Per Node.js/Sentry guidance, the process is in an undefined state after an
  // uncaught exception — flush the event to Sentry, then let PM2 restart the
  // process cleanly rather than keep running in a possibly-corrupted state.
  Sentry.flush(2000).finally(() => process.exit(1));
});

// Initialize background workers
startPriceUpdater();

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
