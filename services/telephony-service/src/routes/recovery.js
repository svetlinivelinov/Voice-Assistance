const express = require('express');
const { error: errorResponse, ok, ERROR_CODES, Joi } = require('@voice-assistant/shared');

const router = express.Router();

const replaySchema = Joi.object({
  max_items: Joi.number().integer().min(1).max(100).default(20)
});

const cleanupSchema = Joi.object({
  max_age_hours: Joi.number().integer().min(1).max(24 * 365).optional()
});

router.get('/recovery/metrics', (req, res) => {
  const queue = req.app.locals.pendingLeadQueue;
  const config = req.app.locals.config;
  const ttlHours = Number(config.crmRecoveryQueueTtlHours || 168);

  return ok(res, {
    queue_enabled: Boolean(config.crmRecoveryQueueEnabled),
    metrics: queue.getMetrics({ maxAgeHours: ttlHours }),
    requestId: req.requestId
  });
});

router.get('/recovery/pending-leads', (req, res) => {
  const queue = req.app.locals.pendingLeadQueue;
  const config = req.app.locals.config;
  const ttlHours = Number(config.crmRecoveryQueueTtlHours || 168);

  const cleanup = queue.pruneExpired({ maxAgeHours: ttlHours });

  return ok(res, {
    pending_leads: queue.list(),
    count: queue.size(),
    cleanup,
    requestId: req.requestId
  });
});

router.post('/recovery/pending-leads/replay', async (req, res) => {
  const queue = req.app.locals.pendingLeadQueue;
  const crmClient = req.app.locals.crmClient;
  const config = req.app.locals.config;
  const ttlHours = Number(config.crmRecoveryQueueTtlHours || 168);

  if (!config.crmRecoveryQueueEnabled) {
    return errorResponse(
      res,
      ERROR_CODES.FORBIDDEN,
      'CRM recovery queue is disabled by feature flag',
      { requestId: req.requestId },
      403
    );
  }

  if (!crmClient?.upsertLead) {
    return errorResponse(
      res,
      ERROR_CODES.INTERNAL_ERROR,
      'CRM service client not configured',
      { requestId: req.requestId },
      503
    );
  }

  const { error: validationError, value } = replaySchema.validate(req.body || {}, {
    abortEarly: false,
    stripUnknown: true
  });

  if (validationError) {
    return errorResponse(
      res,
      ERROR_CODES.VALIDATION_ERROR,
      'Invalid replay request payload',
      {
        requestId: req.requestId,
        issues: validationError.details.map((detail) => detail.message)
      },
      400
    );
  }

  const result = await queue.replay({
    replayFn: (lead, requestId) => crmClient.upsertLead(lead, requestId),
    requestId: req.requestId,
    maxItems: value.max_items
  });

  const cleanup = queue.pruneExpired({ maxAgeHours: ttlHours });

  return ok(res, {
    ...result,
    cleanup,
    requestId: req.requestId
  });
});

router.post('/recovery/pending-leads/cleanup', (req, res) => {
  const queue = req.app.locals.pendingLeadQueue;
  const config = req.app.locals.config;

  if (!config.crmRecoveryQueueEnabled) {
    return errorResponse(
      res,
      ERROR_CODES.FORBIDDEN,
      'CRM recovery queue is disabled by feature flag',
      { requestId: req.requestId },
      403
    );
  }

  const { error: validationError, value } = cleanupSchema.validate(req.body || {}, {
    abortEarly: false,
    stripUnknown: true
  });

  if (validationError) {
    return errorResponse(
      res,
      ERROR_CODES.VALIDATION_ERROR,
      'Invalid cleanup request payload',
      {
        requestId: req.requestId,
        issues: validationError.details.map((detail) => detail.message)
      },
      400
    );
  }

  const cleanup = queue.pruneExpired({
    maxAgeHours: value.max_age_hours || Number(config.crmRecoveryQueueTtlHours || 168)
  });

  return ok(res, {
    ...cleanup,
    requestId: req.requestId
  });
});

module.exports = router;
