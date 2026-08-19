const path = require('path');
const http = require('http');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const compression = require('compression');
const cookieParser = require('cookie-parser');


const { connectToMongo } = require('./config/mongo');
const authRoutes = require('./routes/auth');
const profileRoutes = require('./routes/profile');
const chatRoutes = require('./routes/chat');
const propertyRoutes = require('./routes/properties');
const testimonialsRoutes = require('./routes/testimonials');
const similarPropertiesRoutes = require('./routes/similarProperties');
const faqRoutes = require('./routes/faqs');
const typepageRoutes = require('./routes/typepage');
const contactRoutes = require('./routes/contact');
const notificationRoutes = require('./routes/notifications');
const favoriteRoutes = require('./routes/favorites');

// Admin routes
const adminAuthRoutes = require('./routes/admin/auth');
const adminUsersRoutes = require('./routes/admin/users');
const adminPropertiesRoutes = require('./routes/admin/properties');
const adminTestimonialsRoutes = require('./routes/admin/testimonials');
const adminContactSubmissionsRoutes = require('./routes/admin/contact-submissions');
const adminPropertyInquiriesRoutes = require('./routes/admin/property-inquiries');
const adminFaqRoutes = require('./routes/admin/faqs');
const adminAnalyticsRoutes = require('./routes/admin/analytics');
const adminDashboardRoutes = require('./routes/admin/dashboard');
const adminProfileRoutes = require('./routes/admin/profile');
const adminPropertyViewsRoutes = require('./routes/admin/property-views');
const adminNotificationsRoutes = require('./routes/admin/notifications');

const { setupWebSocket } = require('./websocket');

const app = express();

app.set('trust proxy', process.env.NODE_ENV === 'production' ? 1 : false);

app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(compression());

if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// Build a normalized list of allowed origins from env vars.
// Supports comma-separated values in ALLOWED_ORIGINS and a single FRONTEND_URL.
const allowedOrigins = (process.env.ALLOWED_ORIGINS || process.env.FRONTEND_URL || '')
  .split(',')
  .map(url => url.trim())
  .filter(Boolean);

// In local development, explicitly allow the local frontend origin(s).
if (process.env.NODE_ENV === 'development') {
  const localDevOrigins = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:5000',
    'http://127.0.0.1:5000'
  ];
  localDevOrigins.forEach((origin) => {
    if (!allowedOrigins.includes(origin)) {
      allowedOrigins.push(origin);
    }
  });
}

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests from tools like Postman or curl (no Origin header)
    if (!origin) {
      return callback(null, true);
    }

    // Normalize the origin for consistent comparisons (strip trailing slashes, etc.)
    let normalizedOrigin = origin;
    try {
      normalizedOrigin = new URL(origin).origin;
    } catch (err) {
      // If the origin value isn't a valid URL, fall back to raw comparison.
    }

    if (allowedOrigins.length === 0 || allowedOrigins.includes(normalizedOrigin)) {
      return callback(null, true);
    }

    return callback(new Error(`Origin ${origin} not allowed by CORS`));
  },
  credentials: true,
  // X-Visitor-Id lets cookie-less clients carry their own anonymous
  // personalization id (see middleware/auth.js attachVisitorId).
  // Cache-Control / Pragma are sent by profile.service.js (getProfile) to force a
  // fresh read; neither is CORS-safelisted, so they must be allowed here or the
  // preflight fails ("cache-control is not allowed by Access-Control-Allow-Headers").
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Visitor-Id', 'Cache-Control', 'Pragma'],
  // Cache preflight responses (X-Requested-With triggers OPTIONS checks)
  maxAge: 86400
}));

// CSRF defense: require the custom header on all state-changing requests.
// Must run after CORS (so preflights are answered) and before the routes.
const csrfGuard = require('./middleware/csrfGuard');
app.use(csrfGuard);

// Health check
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'healthy', timestamp: new Date().toISOString() });
});

app.use('/api/auth', authRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/properties', propertyRoutes);
app.use('/api/testimonials', testimonialsRoutes);
app.use('/api/similar-properties', similarPropertiesRoutes);
app.use('/api/faqs', faqRoutes);
app.use('/api/typepage', typepageRoutes);
app.use('/api/contact', contactRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/favorites', favoriteRoutes);

// Admin routes (protected by auth + admin role)
app.use('/api/admin/auth', adminAuthRoutes);
app.use('/api/admin/users', adminUsersRoutes);
app.use('/api/admin/properties', adminPropertiesRoutes);
app.use('/api/admin/testimonials', adminTestimonialsRoutes);
app.use('/api/admin/contact-submissions', adminContactSubmissionsRoutes);
app.use('/api/admin/property-inquiries', adminPropertyInquiriesRoutes);
app.use('/api/admin/faqs', adminFaqRoutes);
app.use('/api/admin/analytics', adminAnalyticsRoutes);
app.use('/api/admin/dashboard', adminDashboardRoutes);
app.use('/api/admin/profile', adminProfileRoutes);
app.use('/api/admin/property-views', adminPropertyViewsRoutes);
app.use('/api/admin/notifications', adminNotificationsRoutes);

// Global error handler: log full details server-side, but never leak stack
// traces or internal messages to clients in production.
app.use((err, req, res, next) => {
  const status = err.status || err.statusCode || 500;
  console.error(`[Error ${status}]`, err);

  if (res.headersSent) {
    return next(err);
  }

  const isProduction = process.env.NODE_ENV === 'production';
  const isServerError = status >= 500;
  // Only expose the message when it is deliberately client-safe (err.expose)
  // and not a server error; everything else is masked in production.
  const canExpose = !isProduction || (status < 500 && err.expose === true);

  res.status(status).json({
    success: false,
    error: err.code || 'server_error',
    message: canExpose ? err.message || 'Internal Server Error' : 'Internal Server Error'
  });
});

const start = async () => {
  await connectToMongo();

  const port = process.env.PORT || 3001;
  const server = http.createServer(app);
  setupWebSocket(server);
  server.listen(port, () => {
    console.log(`Server listening on port ${port}`);
  });
};

if (require.main === module) {
  start().catch((err) => {
    console.error('Failed to start server', err);
    process.exit(1);
  });
}

module.exports = { app, start };
