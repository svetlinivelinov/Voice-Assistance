require('dotenv').config();

const express = require('express');
const { getConfig } = require('./config');
const requestContext = require('./middleware/request-context');
const errorHandler = require('./middleware/error-handler');
const healthRoutes = require('./routes/health');
const placeholderRoutes = require('./routes/webhooks');
const { createCallSessionStore } = require('./services/call-session-store');
const { createTelnyxApiClient } = require('./clients/telnyx-api-client');
const { logger } = require('./logging/logger');
const { createWhisperAsrAdapter } = require('./adapters/whisper-asr-adapter');
const { createElevenLabsTtsAdapter } = require('./adapters/elevenlabs-tts-adapter');

function createApp(configOverride) {
  const app = express();
  const config = configOverride || getConfig();

  app.locals.config = config;
  app.locals.callSessionStore = createCallSessionStore();
  app.locals.telnyxClient = createTelnyxApiClient(config, logger);
  app.locals.asrAdapter = createWhisperAsrAdapter(config, logger);
  app.locals.ttsAdapter = createElevenLabsTtsAdapter(config, logger);

  app.use(express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf.toString('utf8');
    }
  }));
  app.use(requestContext);

  app.use('/', healthRoutes);
  app.use('/api', placeholderRoutes);

  app.use((req, _res, next) => {
    const err = new Error('Not Found');
    err.statusCode = 404;
    err.code = 'NOT_FOUND';
    next(err);
  });

  app.use(errorHandler);

  return app;
}

module.exports = {
  createApp
};
