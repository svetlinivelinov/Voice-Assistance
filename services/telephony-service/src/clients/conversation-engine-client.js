const { retryWithBackoff } = require('../utils/retry-with-backoff');

function createConversationEngineClient(config, logger) {
  if (!config.conversationEngineEnabled || !config.conversationEngineBaseUrl) {
    return null;
  }

  async function planReply({ sessionId, intent = 'collect_requirements', entities = {}, requestId }) {
    return retryWithBackoff(
      async () => {
        const controller = new AbortController();
        const timeout = setTimeout(() => {
          controller.abort();
        }, config.conversationEngineTimeoutMs);

        try {
          const headers = {
            'content-type': 'application/json'
          };
          if (requestId) {
            headers['x-request-id'] = requestId;
          }

          const response = await fetch(`${config.conversationEngineBaseUrl}/api/session`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              session_id: sessionId,
              intent,
              entities
            }),
            signal: controller.signal
          });

          if (!response.ok) {
            const err = new Error(`Conversation engine request failed with status ${response.status}`);
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
            message: 'Retrying conversation-engine request',
            attempt,
            delay,
            reason: error.message
          });
        }
      }
    );
  }

  return {
    planReply
  };
}

module.exports = {
  createConversationEngineClient
};
