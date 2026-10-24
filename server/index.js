import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/auth.js';
import adminRoutes from './routes/admin.js';
import frontdeskRoutes from './routes/frontdesk.js';
import housekeepingRoutes from './routes/housekeeping.js';
import billingRoutes from './routes/billing.js';
import { seedDatabase } from './seed.js';

dotenv.config();

const app = express();
const PORT = parseInt(process.env.PORT || '5000', 10);

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health Check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    app: 'VEYRA Hotel Management API',
    database: process.env.DB_NAME || 'VEYRA',
    time: new Date().toISOString(),
  });
});

// Portals and Auth Routes
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/frontdesk', frontdeskRoutes);
app.use('/api/housekeeping', housekeepingRoutes);
app.use('/api/billing', billingRoutes);

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('Unhandled server error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
  });
});

// Start Server & verify database
async function start() {
  try {
    await seedDatabase();
    app.listen(PORT, () => {
      console.log(`VEYRA Backend Server listening on port ${PORT}`);
      console.log(`Connected to MySQL database '${process.env.DB_NAME || 'VEYRA'}' at ${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || 3306}`);
    });
  } catch (err) {
    console.error('Failed to start VEYRA server:', err);
  }
}

start();

export default app;
