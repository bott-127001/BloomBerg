require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const path = require('path');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const authMiddleware = require('./middleware/auth');
const User = require('./models/User');
const authRoutes = require('./routes/auth');
const signalRoutes = require('./routes/signal');
const scanRoutes = require('./routes/scan');
const marketRoutes = require('./routes/market');
const { initScheduler } = require('./strategy/scheduler');

const app = express();

const frontendOrigin = process.env.FRONTEND_ORIGIN;
app.use(
  cors({
    origin: (origin, cb) => {
      // Allow same-origin (no Origin header) for health checks, server-side calls, etc.
      if (!origin) return cb(null, true);
      // In dev, allow localhost/127.0.0.1.
      if (process.env.NODE_ENV !== 'production') {
        if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return cb(null, true);
      }
      // In prod, lock to configured frontend origin (Render service URL).
      if (frontendOrigin && origin === frontendOrigin) return cb(null, true);
      return cb(new Error(`CORS blocked for origin: ${origin}`), false);
    },
    credentials: true
  })
);
app.use(express.json());
app.use(cookieParser());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});
app.head('/health', (_req, res) => {
  res.status(200).end();
});

app.use('/api/auth', authRoutes);
app.use('/api', authMiddleware);
app.use('/api/signal', signalRoutes);
app.use('/api/scan', scanRoutes);
app.use('/api/market', marketRoutes);

const publicDir = path.join(__dirname, 'public');
app.use(express.static(publicDir));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  return res.sendFile(path.join(publicDir, 'index.html'));
});

async function seedUser() {
  const count = await User.countDocuments();
  if (count > 0) return;
  if (!process.env.AUTH_USERNAME || !process.env.AUTH_PASSWORD) return;
  const passwordHash = await bcrypt.hash(process.env.AUTH_PASSWORD, 10);
  await User.create({ username: process.env.AUTH_USERNAME, passwordHash });
}

async function bootstrap() {
  await mongoose.connect(process.env.MONGODB_URI);
  await seedUser();
  initScheduler();
  const port = process.env.PORT || 10000;
  app.listen(port, () => {
    console.log(`Server running on ${port}`);
  });
}

bootstrap().catch((error) => {
  console.error('Bootstrap failed', error);
  process.exit(1);
});
