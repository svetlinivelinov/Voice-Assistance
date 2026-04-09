const { retryWithBackoff } = require('../utils/retry-with-backoff');

/**
 * HTTP client from telephony-service to nlp-intent-service.
 * Returns null when the NLP service is disabled.
 */
function createNlpServiceClient(config, logger) {
  if (!config.nlpServiceEnabled || !config.nlpServiceBaseUrl) {
    return null;
  }

  async function post(path, body, requestId) {
    return retryWithBackoff(
      async () => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), config.nlpServiceTimeoutMs);

        try {
          const headers = { 'content-type': 'application/json' };
          if (requestId) {
            headers['x-request-id'] = requestId;
          }

          const response = await fetch(`${config.nlpServiceBaseUrl}${path}`, {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
            signal: controller.signal
          });

          if (!response.ok) {
            const err = new Error(`NLP service request failed with status ${response.status}`);
            err.statusCode = response.status;
            throw err;
          }

          return response.json();
        } finally {
          clearTimeout(timeout);
        }
      },
      {
        retries: config.maxRetries,
        shouldRetry: (error) => !error.statusCode || error.statusCode >= 500,
        onRetry: ({ attempt, delay, error }) => {
          logger.error({
            message: 'Retrying NLP service request',
            attempt,
            delay,
            reason: error.message
          });
        }
      }
    );
  }

  async function classifyIntent(text, requestId) {
    const result = await post('/api/classify-intent', { text }, requestId);
    return result?.data ?? { intent: 'unknown', confidence: 0, alternatives: [] };
  }

  async function extractEntities(text, requestId) {
    const result = await post('/api/extract-entities', { text }, requestId);
    return result?.data?.entities ?? {};
  }

  return { classifyIntent, extractEntities };
}

module.exports = { createNlpServiceClient };
