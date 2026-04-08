const express = require('express');
const { ok } = require('@voice-assistant/shared');
const verifyTelnyxSignature = require('../middleware/verify-telnyx-signature');
const { logger } = require('../logging/logger');
const { maskPII } = require('../logging/mask-pii');
const { handleWebhookEvent } = require('../services/handle-webhook-event');
const { executeAction } = require('../services/execute-action');

const router = express.Router();

router.post('/webhooks', verifyTelnyxSignature, async (req, res) => {
  const result = handleWebhookEvent({
    payload: req.body,
    store: req.app.locals.callSessionStore
  });

  const execution = await executeAction({
    action: result.action,
    session: result.session,
    payload: req.body,
    callSessionStore: req.app.locals.callSessionStore,
    telnyxClient: req.app.locals.telnyxClient,
    asrAdapter: req.app.locals.asrAdapter,
    ttsAdapter: req.app.locals.ttsAdapter,
    conversationClient: req.app.locals.conversationClient,
    crmClient: req.app.locals.crmClient,
    conversationEngineEnabled: req.app.locals.config.conversationEngineEnabled,
    crmServiceEnabled: req.app.locals.config.crmServiceEnabled,
    asrMinConfidence: req.app.locals.config.asrMinConfidence,
    greetingMessage: req.app.locals.config.voiceLoopGreeting,
    logger,
    requestId: req.requestId
  });

  logger.info({
    message: 'Telnyx webhook received',
    service: req.app.locals.config.serviceName,
    requestId: req.requestId,
    conversationId: result.session.conversationId,
    sessionId: result.session.sessionId,
    provider: 'telnyx',
    eventType: result.eventType,
    action: result.action,
    session: result.session,
    execution,
    payload: maskPII(req.body)
  });

  return ok(res, {
    received: true,
    provider: 'telnyx',
    conversationId: result.session.conversationId,
    sessionId: result.session.sessionId,
    eventType: result.eventType,
    action: result.action,
    session: result.session,
    execution,
    service: req.app.locals.config.serviceName,
    requestId: req.requestId
  });
});

module.exports = router;
