const { retryWithBackoff } = require('../utils/retry-with-backoff');

function createCrmServiceClient(config, logger) {
  if (!config.crmServiceEnabled || !config.crmServiceBaseUrl) {
    return null;
  }

  async function upsertLead(lead, requestId) {
    return retryWithBackoff(
      async () => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), config.crmServiceTimeoutMs);

        try {
          const headers = {
            'content-type': 'application/json'
          };
          if (requestId) {
            headers['x-request-id'] = requestId;
          }

          const response = await fetch(`${config.crmServiceBaseUrl}/api/leads`, {
            method: 'POST',
            headers,
            body: JSON.stringify(lead),
            signal: controller.signal
          });

          if (!response.ok) {
            const err = new Error(`CRM service request failed with status ${response.status}`);
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
            message: 'Retrying CRM service request',
            attempt,
            delay,
            reason: error.message
          });
        }
      }
    );
  }

  return {
    upsertLead
  };
}

module.exports = {
  createCrmServiceClient
};