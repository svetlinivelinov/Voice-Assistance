const express = require('express');
const { Joi, ok, error: errorResponse, ERROR_CODES } = require('@voice-assistant/shared');
const { upsertLead } = require('../services/lead-store');

const router = express.Router();

const upsertSchema = Joi.object({
  client_id: Joi.string().optional(),
  name: Joi.string().optional(),
  phone: Joi.string().optional(),
  budget: Joi.number().optional(),
  location: Joi.string().optional(),
  property_type: Joi.string().optional(),
  move_in_date: Joi.string().isoDate().optional(),
  viewing_date: Joi.string().isoDate().optional(),
  notes: Joi.string().optional(),
  status: Joi.string().valid('new', 'qualified', 'scheduled', 'closed').optional(),
  session_id: Joi.string().optional()
}).min(1);

function requireSheetsClient(req, res, next) {
  if (!req.app.locals.sheetsClient) {
    return errorResponse(
      res,
      'SERVICE_UNAVAILABLE',
      'CRM service is not configured',
      { requestId: req.requestId },
      503
    );
  }
  next();
}

// POST /api/leads — create or update a lead
router.post('/leads', requireSheetsClient, async (req, res, next) => {
  try {
    const { error, value } = upsertSchema.validate(req.body, { abortEarly: false });
    if (error) {
      return errorResponse(
        res,
        ERROR_CODES.VALIDATION_ERROR,
        'Invalid lead data',
        { details: error.details.map((d) => d.message), requestId: req.requestId },
        400
      );
    }

    const result = await upsertLead({
      lead: value,
      sheetsClient: req.app.locals.sheetsClient
    });

    const statusCode = result.action === 'created' ? 201 : 200;
    return ok(res, { ...result, requestId: req.requestId }, statusCode);
  } catch (err) {
    next(err);
  }
});

// GET /api/leads/:clientIdOrPhone — retrieve a single lead
router.get('/leads/:clientIdOrPhone', requireSheetsClient, async (req, res, next) => {
  try {
    const key = req.params.clientIdOrPhone;
    // Phones are formatted with digits, dashes, spaces, and leading +
    const isPhone = /^[\d\s().+-]+$/.test(key);

    const lead = await req.app.locals.sheetsClient.getLead({
      clientId: isPhone ? undefined : key,
      phone: isPhone ? key : undefined
    });

    if (!lead) {
      return errorResponse(
        res,
        ERROR_CODES.NOT_FOUND || 'NOT_FOUND',
        'Lead not found',
        { key, requestId: req.requestId },
        404
      );
    }

    return ok(res, { lead, requestId: req.requestId });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
