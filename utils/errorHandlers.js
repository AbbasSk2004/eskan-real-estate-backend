// Utility to install global process-level error handlers so that we can
// see exactly why Render (or any Node host) terminates the container with
// exit code 1.  Import this once at application start (index.js).

const logger = require('./logger');

function gracefulShutdown(code, reason) {
  try {
    logger.error('🚨  Graceful shutdown initiated', { code, reason });
  } finally {
    // Ensure the process really exits – some hosts keep the event-loop alive
    // if we just return.
    process.exit(typeof code === 'number' ? code : 1);
  }
}

function setupGlobalErrorHandlers() {
  // Already installed? Avoid double-registration in tests / hot-reload.
  if (setupGlobalErrorHandlers._installed) return;
  setupGlobalErrorHandlers._installed = true;

  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Promise Rejection ⛔', {
      reason: reason instanceof Error ? reason.message : reason,
      stack: reason instanceof Error ? reason.stack : undefined
    });
    gracefulShutdown(1, 'unhandledRejection');
  });

  process.on('uncaughtException', (err) => {
    logger.error('Uncaught Exception 💥', {
      message: err.message,
      stack: err.stack
    });
    gracefulShutdown(1, 'uncaughtException');
  });

  process.on('SIGTERM', () => {
    logger.warn('SIGTERM signal received. Shutting down...');
    gracefulShutdown(0, 'SIGTERM');
  });

  process.on('SIGINT', () => {
    logger.warn('SIGINT (Ctrl-C) signal received. Shutting down...');
    gracefulShutdown(0, 'SIGINT');
  });

  process.on('exit', (code) => {
    logger.error(`Process exiting with code ${code}`);
  });
}

module.exports = setupGlobalErrorHandlers; 