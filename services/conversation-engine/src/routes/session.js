const express = require('express');
const {
  error: errorResponse,
  ok,
  ERROR_CODES,
  Joi
} = require('@voice-assistant/shared');
const { sessionSchema } = require('@voice-assistant/shared');
const { buildNextSessionState } = require('../services/state-machine');

const router = express.Router();

const incomingSessionSchema = Joi.object({
  session_id: Joi.string().trim().required(),
  step: Joi.string().allow('').default(''),
  intent: Joi.string().allow('').default(''),
  entities: Joi.object().default({})
});

router.post('/session', (req, res) => {
  if (!req.app.locals.config.conversationStateMachineEnabled) {
    return errorResponse(
      res,
      ERROR_CODES.FORBIDDEN,
      'conversation state machine is disabled by feature flag',
      {
        requestId: req.requestId,
        route: '/api/session'
      },
      403
    );
  }

  const { error: validationError, value } = incomingSessionSchema.validate(req.body, {
    abortEarly: false,
    stripUnknown: true
  });

  if (validationError) {
    return errorResponse(
      res,
      ERROR_CODES.VALIDATION_ERROR,
      'Invalid session payload',
      {
        requestId: req.requestId,
        route: '/api/session',
        issues: validationError.details.map((detail) => detail.message)
      },
      400
    );
  }

  let replyText = '';

  const nextSession = req.app.locals.sessionStore.upsert(value.session_id, (previousSession) => {
    const result = buildNextSessionState({
      previousSession,
      incomingSession: value
    });

    replyText = result.replyText;
    return result.session;
  });

  const { error: contractError } = sessionSchema.validate(nextSession);

  if (contractError) {
    return errorResponse(
      res,
      ERROR_CODES.INTERNAL_ERROR,
      'Generated session payload failed contract validation',
      {
        requestId: req.requestId,
        route: '/api/session',
        issues: contractError.details.map((detail) => detail.message)
      },
      500
    );
  }

  return ok(res, {
    session: nextSession,
    reply_text: replyText,
    requestId: req.requestId
  });
});

router.get('/session/:sessionId', (req, res) => {
  const session = req.app.locals.sessionStore.get(req.params.sessionId);

  if (!session) {
    return errorResponse(
      res,
      ERROR_CODES.NOT_FOUND,
      'Session not found',
      {
        requestId: req.requestId,
        route: '/api/session/:sessionId',
        session_id: req.params.sessionId
      },
      404
    );
  }

  return ok(res, {
    session,
    requestId: req.requestId
  });
});

module.exports = router;
