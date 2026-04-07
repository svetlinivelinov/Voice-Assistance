const { retryWithBackoff } = require('../utils/retry-with-backoff');

function createTelnyxApiClient(config, logger) {
  const baseUrl = config.telnyxApiBaseUrl;
  const timeoutMs = config.telnyxApiTimeoutMs;
  const maxRetries = config.maxRetries;

  async function request(path, init = {}) {
    if (!config.telnyxApiKey) {
      const err = new Error('TELNYX_API_KEY is not configured');
      err.statusCode = 400;
      throw err;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`${baseUrl}${path}`, {
        ...init,
        signal: controller.signal,
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${config.telnyxApiKey}`,
          ...(init.headers || {})
        }
      });

      if (!response.ok) {
        const err = new Error(`Telnyx API request failed with status ${response.status}`);
        err.statusCode = response.status;
        throw err;
      }

      return response;
    } finally {
      clearTimeout(timeout);
    }
  }

  async function requestWithRetry(path, init = {}) {
    return retryWithBackoff(
      () => request(path, init),
      {
        retries: maxRetries,
        shouldRetry: (error) => !error.statusCode || error.statusCode >= 500,
        onRetry: ({ attempt, delay, error }) => {
          logger.warn({
            message: 'Retrying Telnyx API request',
            attempt,
            delay,
            reason: error.message
          });
        }
      }
    );
  }

  return {
    requestWithRetry
  };
}

module.exports = {
  createTelnyxApiClient
};