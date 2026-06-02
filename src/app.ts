import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import i18next from './config/i18n';
import { tenantMiddleware } from './middlewares/tenant';

import restaurantRoutes from './routes/restaurantRoutes';
import authRoutes from './routes/authRoutes';
import tableTypeRoutes from './routes/tableTypeRoutes';
import tableRoutes from './routes/tableRoutes';
import settingsRoutes from './routes/settingsRoutes';
import reservationRoutes from './routes/reservationRoutes';
import menuRoutes from './routes/menuRoutes';
import categoryRoutes from './routes/categoryRoutes';
import daySettingRoutes from './routes/daySettingRoutes';
import systemRoutes from './routes/systemRoutes';
import publicRoutes from './routes/publicRoutes';
import staffRoutes from './routes/staffRoutes';
import schedulingRoutes from './routes/schedulingRoutes';
import waitTimeRoutes from './routes/waitTimeRoutes';
import floorElementRoutes from './routes/floorElementRoutes';
import customizationRoutes from './routes/customizationRoutes';

const app = express();

// Middlewares
app.use(helmet());
app.use(cors());
app.use(express.json());

// Localization middleware to set language based on header or query
app.use((req, res, next) => {
  const lang = req.headers['accept-language'] || 'en';
  i18next.changeLanguage(lang as string);
  next();
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// API Routes
app.use('/api/public', publicRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/system', systemRoutes);
app.use('/api/restaurants', tenantMiddleware, restaurantRoutes);
app.use('/api/table-types', tenantMiddleware, tableTypeRoutes);
app.use('/api/tables', tenantMiddleware, tableRoutes);
app.use('/api/floor-elements', tenantMiddleware, floorElementRoutes);
app.use('/api/settings', tenantMiddleware, settingsRoutes);
app.use('/api/reservations', tenantMiddleware, reservationRoutes);
app.use('/api/categories', tenantMiddleware, categoryRoutes);
app.use('/api/day-settings', daySettingRoutes);
app.use('/api/menus', tenantMiddleware, menuRoutes);
app.use('/api/staff', tenantMiddleware, staffRoutes);
app.use('/api/scheduling', tenantMiddleware, schedulingRoutes);
app.use('/api/wait-time', tenantMiddleware, waitTimeRoutes);
app.use('/api/customization', tenantMiddleware, customizationRoutes);

export default app;
