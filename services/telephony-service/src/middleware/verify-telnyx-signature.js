const {
  error: errorResponse,
  ERROR_CODES
} = require('@voice-assistant/shared');
const {
  TelnyxWebhook,
  TelnyxWebhookVerificationError
} = require('telnyx/lib/webhooks');

function normalizeHeaders(headers = {}) {
  return Object.entries(headers).reduce((acc, [key, value]) => {
    if (Array.isArray(value)) {
      acc[key] = value[0];
      return acc;
    }

    acc[key] = value;
    return acc;
  }, {});
}

async function verifyTelnyxSignature(req, res, next) {
  const { telnyxPublicKey } = req.app.locals.config;

  if (!telnyxPublicKey) {
    return errorResponse(
      res,
      ERROR_CODES.INTERNAL_ERROR,
      'TELNYX_PUBLIC_KEY is not configured',
      {
        requestId: req.requestId,
        route: '/api/webhooks'
      },
      500
    );
  }

  if (!req.rawBody) {
    return errorResponse(
      res,
      ERROR_CODES.BAD_REQUEST,
      'Missing raw webhook payload',
      {
        requestId: req.requestId,
        route: '/api/webhooks'
      },
      400
    );
  }

  try {
    const verifier = new TelnyxWebhook(telnyxPublicKey);
    await verifier.verify(req.rawBody, normalizeHeaders(req.headers));
    return next();
  } catch (error) {
    if (error instanceof TelnyxWebhookVerificationError) {
      return errorResponse(
        res,
        ERROR_CODES.UNAUTHORIZED,
        'Invalid Telnyx webhook signature',
        {
          requestId: req.requestId,
          reason: error.message
        },
        401
      );
    }

    return next(error);
  }
}

module.exports = verifyTelnyxSignature;