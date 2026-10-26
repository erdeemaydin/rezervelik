import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import i18next, { resolveLanguage } from './config/i18n';
import { tenantMiddleware } from './middlewares/tenant';
import { errorHandler, notFoundHandler } from './middlewares/errorHandler';
import { maintenanceMiddleware } from './middlewares/maintenance';

import restaurantRoutes from './routes/restaurantRoutes';
import authRoutes from './routes/authRoutes';
import tableTypeRoutes from './routes/tableTypeRoutes';
import tableRoutes from './routes/tableRoutes';
import settingsRoutes from './routes/settingsRoutes';
import reservationRoutes from './routes/reservationRoutes';
import menuRoutes from './routes/menuRoutes';
import categoryRoutes from './routes/categoryRoutes';
import eventRoutes from './routes/eventRoutes';
import vendorRoutes from './routes/vendorRoutes';
import daySettingRoutes from './routes/daySettingRoutes';
import systemRoutes from './routes/systemRoutes';
import publicRoutes from './routes/publicRoutes';
import staffRoutes from './routes/staffRoutes';
import schedulingRoutes from './routes/schedulingRoutes';
import waitTimeRoutes from './routes/waitTimeRoutes';
import floorElementRoutes from './routes/floorElementRoutes';
import customizationRoutes from './routes/customizationRoutes';
import uploadRoutes from './routes/uploadRoutes';
import paymentRoutes from './routes/paymentRoutes';
import timeEntryRoutes from './routes/timeEntryRoutes';
import auditRoutes from './routes/auditRoutes';
import reviewRoutes from './routes/reviewRoutes';
import publicOrderRoutes from './routes/publicOrderRoutes';
import orderRoutes from './routes/orderRoutes';
import path from 'path';

const app = express();

// Cookie-based auth (see utils/authCookie.ts) requires an explicit origin
// allowlist + credentials:true — browsers reject `Access-Control-Allow-Origin:
// *` combined with credentials, and won't send/accept cookies on a
// cross-origin XHR without both being set correctly. CORS_ORIGIN is a
// comma-separated list; falls back to APP_PUBLIC_URL (already used elsewhere
// for the frontend's own public URL) and then a sane local-dev default.
const allowedOrigins = (process.env.CORS_ORIGIN || process.env.APP_PUBLIC_URL || 'http://localhost:3001')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

// Middlewares
// hsts: false until HTTPS in front of this server is confirmed live. helmet's
// default HSTS header goes out on every response regardless of whether the
// connection is actually TLS — a browser (esp. iOS Safari) that sees it force-
// upgrades all future requests to https://, which a plain-HTTP origin can't
// answer, silently locking users out. Flip back to helmet's default (remove
// this override) once TLS/Caddy is confirmed live in front of the app — see
// docs/planning/PRODUCTION_ROADMAP.md §10 #1/#5.
app.use(helmet({ hsts: false, crossOriginResourcePolicy: false })); // Allow cross origin for images
app.use(cors({
  origin(origin, callback) {
    // No Origin header = same-origin, curl, or a server-to-server call (e.g.
    // PayTR's payment callback) — never subject to CORS enforcement anyway.
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error(`Origin ${origin} is not allowed by CORS`));
  },
  credentials: true,
}));
app.use(express.json());

// Serve static uploads
app.use(express.static(path.join(__dirname, '../public')));

// Localization middleware. Attach a per-request, fixed-language translator
// (`req.t`) instead of mutating i18next's global language — the old
// `changeLanguage()` approach was racy under concurrency (one request could
// answer in another's language). Response helpers and the error handler read
// this `req.t` so every message is localized to the caller that made the request.
app.use((req, res, next) => {
  const lang = resolveLanguage(req.headers['accept-language'] as string | undefined);
  (req as any).language = lang;
  (req as any).t = i18next.getFixedT(lang);
  next();
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Maintenance gate — when enabled, turns away tenant + public API traffic with a
// 503. Exempts /auth (so admins can still sign in) and /system (so a SUPER_ADMIN
// can toggle it back off); the guard itself also always lets SUPER_ADMIN through.
app.use('/api', (req, res, next) => {
  if (req.path.startsWith('/auth') || req.path.startsWith('/system')) return next();
  return maintenanceMiddleware(req, res, next);
});

// API Routes
app.use('/api/public', publicRoutes);
// Online-ordering customer surface. Behind tenantMiddleware (X-Restaurant-ID)
// like the guest reservation-create path (POST /api/reservations below) —
// the frontend already resolved the restaurant id from GET
// /api/public/restaurant/:slug before hitting anything here.
app.use('/api/public/order', tenantMiddleware, publicOrderRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/system', systemRoutes);
app.use('/api/restaurants', tenantMiddleware, restaurantRoutes);
app.use('/api/table-types', tenantMiddleware, tableTypeRoutes);
app.use('/api/tables', tenantMiddleware, tableRoutes);
app.use('/api/floor-elements', tenantMiddleware, floorElementRoutes);
app.use('/api/settings', tenantMiddleware, settingsRoutes);
app.use('/api/reservations', tenantMiddleware, reservationRoutes);
app.use('/api/categories', tenantMiddleware, categoryRoutes);
app.use('/api/events', tenantMiddleware, eventRoutes);
app.use('/api/vendors', tenantMiddleware, vendorRoutes);
app.use('/api/day-settings', daySettingRoutes);
app.use('/api/menus', tenantMiddleware, menuRoutes);
app.use('/api/staff', tenantMiddleware, staffRoutes);
app.use('/api/scheduling', tenantMiddleware, schedulingRoutes);
app.use('/api/time-entries', tenantMiddleware, timeEntryRoutes);
app.use('/api/wait-time', tenantMiddleware, waitTimeRoutes);
app.use('/api/customization', tenantMiddleware, customizationRoutes);
app.use('/api/payments', tenantMiddleware, paymentRoutes);
app.use('/api/audit', tenantMiddleware, auditRoutes);
app.use('/api/reviews', tenantMiddleware, reviewRoutes);
app.use('/api/uploads', tenantMiddleware, uploadRoutes);
app.use('/api/orders', tenantMiddleware, orderRoutes);

// Unknown /api path → standard JSON 404 (not Express's HTML default).
app.use('/api', notFoundHandler);

// Central error handler — must be last so it catches everything above. Also
// reports to Sentry when SENTRY_DSN is set (see src/middlewares/errorHandler.ts).
app.use(errorHandler);

export default app;
