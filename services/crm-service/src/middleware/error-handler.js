const { error: errorResponse, ERROR_CODES } = require('@voice-assistant/shared');

function errorHandler(err, req, res, _next) {
  const status = err.statusCode || err.status || 500;
  const code = err.code || ERROR_CODES.INTERNAL_ERROR || 'INTERNAL_ERROR';
  const message = err.message || 'Internal Server Error';
  const details = {
    requestId: req.requestId,
    ...(err.details || {})
  };

  return errorResponse(res, code, message, details, status);
}

module.exports = errorHandler;
