'use strict';

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');

const config = require('./config');
const logger = require('./utils/logger');
const { ensureMigrated } = require('./db/migrations');

const healthRoutes = require('./routes/health.routes');
const webhookRoutes = require('./routes/webhook.routes');
const activitiesRoutes = require('./routes/activities.routes');
const reportsRoutes = require('./routes/reports.routes');
const messagesRoutes = require('./routes/messages.routes');
const pagesRoutes = require('./routes/pages.routes');
const submissionsRoutes = require('./routes/submissions.routes');
const adminRoutes = require('./routes/admin.routes');
const { errorHandler } = require('./middleware/errorHandler');

const app = express();

app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use(helmet());
app.use(
  cors({
    origin: config.corsOrigin === '*' ? true : config.corsOrigin.split(',').map((s) => s.trim()),
  })
);
app.use(morgan(config.isProduction ? 'combined' : 'dev'));
app.use(cookieParser());

// helmet's default CSP blocks inline styles; relax it for the /admin UI.
app.use(
  helmet.contentSecurityPolicy({
    useDefaults: true,
    directives: {
      'img-src': ["'self'", 'https:', 'data:'],
      'style-src': ["'self'", "'unsafe-inline'"],
    },
  })
);

// Capture raw body for signature validation; applies to all JSON requests.
app.use(
  express.json({
    limit: '1mb',
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  })
);

// Basic global rate limit (lenient; webhook traffic should be modest).
app.use(
  rateLimit({
    windowMs: 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

// Health route is mounted BEFORE the migration middleware so liveness checks
// never depend on DB connectivity.
app.use(healthRoutes);

// Lazily ensure DB schema before serving DB-backed requests (works for
// serverless cold starts). The webhook GET handshake also runs after this,
// but it only reads env config and is fine if migration succeeds.
app.use((req, res, next) => {
  ensureMigrated().then(() => next()).catch((err) => next(err));
});

app.use(webhookRoutes);
app.use(activitiesRoutes);
app.use(reportsRoutes);
app.use(messagesRoutes);
app.use(pagesRoutes);
app.use(submissionsRoutes);
app.use(adminRoutes);

app.use((req, res) => res.status(404).json({ error: 'Not Found' }));
app.use(errorHandler);

if (!config.appSecret) logger.warn('APP_SECRET is not set.');
if (!config.verifyToken) logger.warn('VERIFY_TOKEN is not set — webhook verification will fail.');
if (!config.pageAccessToken) logger.warn('PAGE_ACCESS_TOKEN is not set — outbound messages disabled.');
if (!config.databaseUrl) logger.warn('DATABASE_URL is not set — Postgres operations will fail.');

module.exports = app;
