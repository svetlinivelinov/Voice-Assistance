const express = require('express');
const { error: errorResponse, ERROR_CODES } = require('@voice-assistant/shared');

const router = express.Router();

router.all('/logs', (req, res) => {
  return errorResponse(
    res,
    ERROR_CODES.NOT_IMPLEMENTED || 'NOT_IMPLEMENTED',
    'log ingestion endpoint not implemented',
    {
      service: req.app.locals.config.serviceName,
      route: '/api/logs',
      requestId: req.requestId
    },
    501
  );
});

module.exports = router;
