const { retryWithBackoff } = require('../utils/retry-with-backoff');

/**
 * HTTP client from telephony-service to nlp-intent-service.
 * Returns null when the NLP service is disabled.
 */
function createNlpServiceClient(config, logger) {
  if (!config.nlpServiceEnabled || !config.nlpServiceBaseUrl) {
    return null;
  }

  async function post(path, body) {
    return retryWithBackoff(
      async () => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), config.nlpServiceTimeoutMs);

        try {
          const response = await fetch(`${config.nlpServiceBaseUrl}${path}`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
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

  async function classifyIntent(text) {
    const result = await post('/api/classify-intent', { text });
    return result?.data ?? { intent: 'unknown', confidence: 0, alternatives: [] };
  }

  async function extractEntities(text) {
    const result = await post('/api/extract-entities', { text });
    return result?.data?.entities ?? {};
  }

  return { classifyIntent, extractEntities };
}

module.exports = { createNlpServiceClient };
