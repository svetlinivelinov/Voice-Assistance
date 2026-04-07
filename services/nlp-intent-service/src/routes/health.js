const express = require('express');
const { ok } = require('@voice-assistant/shared');

const router = express.Router();

router.get('/health', (req, res) => {
  return ok(res, {
    status: 'ok',
    service: req.app.locals.config.serviceName,
    requestId: req.requestId
  });
});

router.get('/ready', (req, res) => {
  return ok(res, {
    status: 'ready',
    service: req.app.locals.config.serviceName,
    requestId: req.requestId
  });
});

module.exports = router;
