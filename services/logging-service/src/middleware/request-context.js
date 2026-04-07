const { createRequestContextMiddleware } = require('@voice-assistant/shared');

const baseRequestContext = createRequestContextMiddleware();

function requestContext(req, res, next) {
  baseRequestContext(req, res, () => {
    if (req.requestId) {
      res.setHeader('X-Request-Id', req.requestId);
    }
    next();
  });
}

module.exports = requestContext;
