const express = require('express');
const { error: errorResponse, ERROR_CODES } = require('@voice-assistant/shared');

const router = express.Router();

router.all('/leads', (req, res) => {
  return errorResponse(
    res,
    ERROR_CODES.NOT_IMPLEMENTED || 'NOT_IMPLEMENTED',
    'CRM leads endpoint not implemented',
    {
      service: req.app.locals.config.serviceName,
      route: '/api/leads',
      requestId: req.requestId
    },
    501
  );
});

module.exports = router;
