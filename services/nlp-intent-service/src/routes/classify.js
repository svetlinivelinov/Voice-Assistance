const express = require('express');
const { error: errorResponse, ok, ERROR_CODES, Joi } = require('@voice-assistant/shared');
const { classifyIntent } = require('../services/intent-classifier');
const { extractEntities } = require('../services/nlp-entity-extractor');

const router = express.Router();

const textInputSchema = Joi.object({
  text: Joi.string().trim().min(1).max(2000).required()
});

router.post('/classify-intent', (req, res) => {
  const { error: validationError, value } = textInputSchema.validate(req.body, {
    abortEarly: false,
    stripUnknown: true
  });

  if (validationError) {
    return errorResponse(
      res,
      ERROR_CODES.VALIDATION_ERROR,
      'Invalid request payload',
      {
        requestId: req.requestId,
        issues: validationError.details.map((d) => d.message)
      },
      400
    );
  }

  const result = classifyIntent(value.text);

  return ok(res, {
    intent: result.intent,
    confidence: result.confidence,
    alternatives: result.alternatives,
    provider: req.app.locals.config.nlpProvider,
    requestId: req.requestId
  });
});

router.post('/extract-entities', (req, res) => {
  const { error: validationError, value } = textInputSchema.validate(req.body, {
    abortEarly: false,
    stripUnknown: true
  });

  if (validationError) {
    return errorResponse(
      res,
      ERROR_CODES.VALIDATION_ERROR,
      'Invalid request payload',
      {
        requestId: req.requestId,
        issues: validationError.details.map((d) => d.message)
      },
      400
    );
  }

  const entities = extractEntities(value.text);

  return ok(res, {
    entities,
    provider: req.app.locals.config.nlpProvider,
    requestId: req.requestId
  });
});

module.exports = router;
