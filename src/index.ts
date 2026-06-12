import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { errorHandler } from './middleware/errorHandler';
import authRouter from './routes/auth';
import adminRouter from './routes/admin';
import assetsRouter from './routes/assets';
import employeesRouter from './routes/employees';
import departmentsRouter from './routes/departments';
import maintenanceRouter from './routes/maintenance';
import licensesRouter from './routes/licenses';
import vendorsRouter from './routes/vendors';
import purchaseOrdersRouter from './routes/purchaseOrders';
import auditLogsRouter from './routes/auditLogs';
import notificationsRouter from './routes/notifications';
import reportsRouter from './routes/reports';
import { seedRoles } from './db/seedRoles';
import { startScheduledJobs } from './jobs/scheduledJobs';

dotenv.config();

const app = express();
const PORT = process.env.PORT ?? 4000;

// Security middleware
app.use(helmet());

// CORS
const allowedOrigins = (process.env.FRONTEND_URL ?? 'http://localhost:3000')
  .split(',')
  .map((o) => o.trim());

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g. curl, mobile apps, server-to-server)
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`CORS: origin '${origin}' not allowed`));
      }
    },
    credentials: true,
  })
);

// Request logging
app.use(morgan('combined'));

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Root route — confirms the API is running
app.get('/', (_req, res) => {
  res.json({
    name: 'ITAM API',
    version: '1.0.0',
    status: 'running',
    docs: '/health',
  });
});

// API routes
app.use('/api/auth', authRouter);
app.use('/api/admin', adminRouter);
app.use('/api/assets', assetsRouter);
app.use('/api/employees', employeesRouter);
app.use('/api/departments', departmentsRouter);
app.use('/api/maintenance', maintenanceRouter);
app.use('/api/licenses', licensesRouter);
app.use('/api/vendors', vendorsRouter);
app.use('/api/purchase-orders', purchaseOrdersRouter);
app.use('/api/audit-logs', auditLogsRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/reports', reportsRouter);

// Fallback for unmatched API routes
app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Centralised error handler — must be registered after all routes
app.use(errorHandler);

// Start server
if (require.main === module) {
  seedRoles()
    .then(() => {
      startScheduledJobs();
      app.listen(PORT, () => {
        console.log(`ITAM backend listening on port ${PORT}`);
      });
    })
    .catch((err) => {
      console.error('[startup] Failed to seed roles:', err);
      process.exit(1);
    });
}

export default app;
