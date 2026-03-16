const path = require('path');
const http = require('http');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const compression = require('compression');


const { connectToMongo } = require('./config/mongo');
const authRoutes = require('./routes/auth');
const profileRoutes = require('./routes/profile');
const chatRoutes = require('./routes/chat');
const propertyRoutes = require('./routes/properties');
const agentRoutes = require('./routes/agents');
const blogRoutes = require('./routes/blogs');
const propertyViewsRoutes = require('./routes/propertyViews');
const recommendationRoutes = require('./routes/recommendations');
const testimonialsRoutes = require('./routes/testimonials');
const similarPropertiesRoutes = require('./routes/similarProperties');
const faqRoutes = require('./routes/faqs');
const typepageRoutes = require('./routes/typepage');
const contactRoutes = require('./routes/contact');
const notificationRoutes = require('./routes/notifications');
const favoriteRoutes = require('./routes/favorites');
const { setupWebSocket } = require('./websocket');

const app = express();

app.set('trust proxy', process.env.NODE_ENV === 'production' ? 1 : false);

app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
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
  const localDevOrigins = ['http://localhost:3000', 'http://127.0.0.1:3000'];
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
  credentials: true
}));

// Health check
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'healthy', timestamp: new Date().toISOString() });
});

app.use('/api/auth', authRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/properties', propertyRoutes);
app.use('/api/property-views', propertyViewsRoutes);
app.use('/api/blogs', blogRoutes);
app.use('/api/agents', agentRoutes);
app.use('/api/testimonials', testimonialsRoutes);
app.use('/api/similar-properties', similarPropertiesRoutes);
app.use('/api/recommendations', recommendationRoutes);
app.use('/api/faqs', faqRoutes);
app.use('/api/typepage', typepageRoutes);
app.use('/api/contact', contactRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/favorites', favoriteRoutes);

app.use((err, req, res, next) => {
  console.error(err);

  const status = err.status || 500;

  res.status(status).json({
    success: false,
    message: err.message || 'Internal Server Error'
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
