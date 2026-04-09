require('dotenv').config();

const express = require('express');
const { getConfig } = require('./config');
const requestContext = require('./middleware/request-context');
const errorHandler = require('./middleware/error-handler');
const healthRoutes = require('./routes/health');
const webhooksRoutes = require('./routes/webhooks');
const recoveryRoutes = require('./routes/recovery');
const { createCallSessionStore } = require('./services/call-session-store');
const { createPendingLeadQueue } = require('./services/pending-lead-queue');
const { createTelnyxApiClient } = require('./clients/telnyx-api-client');
const { logger } = require('./logging/logger');
const { createWhisperAsrAdapter } = require('./adapters/whisper-asr-adapter');
const { createElevenLabsTtsAdapter } = require('./adapters/elevenlabs-tts-adapter');
const { createConversationEngineClient } = require('./clients/conversation-engine-client');
const { createCrmServiceClient } = require('./clients/crm-service-client');
const { createNlpServiceClient } = require('./clients/nlp-service-client');

function setupRecoveryMetricsReporter(app) {
  const config = app.locals.config;
  if (!config.crmRecoveryMetricsLogEnabled) {
    return;
  }

  const interval = setInterval(() => {
    const metrics = app.locals.pendingLeadQueue.getMetrics({
      maxAgeHours: config.crmRecoveryQueueTtlHours
    });
    logger.info({
      message: 'Recovery queue metrics snapshot',
      service: config.serviceName,
      recovery_queue: metrics
    });
  }, config.crmRecoveryMetricsLogIntervalMs);

  if (interval.unref) {
    interval.unref();
  }

  app.locals.recoveryMetricsInterval = interval;
}

function createApp(configOverride) {
  const app = express();
  const config = configOverride || getConfig();

  app.locals.config = config;
  app.locals.callSessionStore = createCallSessionStore();
  app.locals.pendingLeadQueue = createPendingLeadQueue({
    persistEnabled: config.crmRecoveryQueuePersistEnabled,
    persistFilePath: config.crmRecoveryQueueFilePath
  });
  app.locals.telnyxClient = createTelnyxApiClient(config, logger);
  app.locals.asrAdapter = createWhisperAsrAdapter(config, logger);
  app.locals.ttsAdapter = createElevenLabsTtsAdapter(config, logger);
  app.locals.conversationClient = createConversationEngineClient(config, logger);
  app.locals.crmClient = createCrmServiceClient(config, logger);
  app.locals.nlpClient = createNlpServiceClient(config, logger);
  setupRecoveryMetricsReporter(app);

  app.use(express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf.toString('utf8');
    }
  }));
  app.use(requestContext);

  app.use('/', healthRoutes);
  app.use('/api', webhooksRoutes);
  app.use('/api', recoveryRoutes);

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
