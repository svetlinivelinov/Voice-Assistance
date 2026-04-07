const { retryWithBackoff } = require('../utils/retry-with-backoff');

function createElevenLabsTtsAdapter(config, logger) {
  const enabled = config.ttsEnabled;
  const apiKey = config.elevenlabsApiKey;
  const voiceId = config.elevenlabsVoiceId;
  const model = config.elevenlabsModel;
  const timeoutMs = config.ttsTimeoutMs;

  function status() {
    if (!enabled) {
      return { enabled: false, ready: false, reason: 'tts_disabled' };
    }
    if (!apiKey) {
      return { enabled: true, ready: false, reason: 'missing_elevenlabs_api_key' };
    }
    if (!voiceId) {
      return { enabled: true, ready: false, reason: 'missing_elevenlabs_voice_id' };
    }
    return { enabled: true, ready: true, model, voiceId };
  }

  async function synthesizeText({ text } = {}) {
    const adapterStatus = status();
    if (!adapterStatus.ready) {
      return {
        status: 'skipped',
        reason: adapterStatus.reason
      };
    }

    if (!text || !text.trim()) {
      return {
        status: 'skipped',
        reason: 'missing_tts_text'
      };
    }

    return retryWithBackoff(
      async () => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);

        try {
          const response = await fetch(
            `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
            {
              method: 'POST',
              signal: controller.signal,
              headers: {
                'content-type': 'application/json',
                'xi-api-key': apiKey
              },
              body: JSON.stringify({
                text,
                model_id: model
              })
            }
          );

          if (!response.ok) {
            const err = new Error(`ElevenLabs synthesis failed with status ${response.status}`);
            err.statusCode = response.status;
            throw err;
          }

          const audioArrayBuffer = await response.arrayBuffer();
          return {
            status: 'ok',
            audioBase64: Buffer.from(audioArrayBuffer).toString('base64'),
            mimeType: 'audio/mpeg'
          };
        } finally {
          clearTimeout(timeout);
        }
      },
      {
        retries: config.maxRetries,
        shouldRetry: (error) => !error.statusCode || error.statusCode >= 500,
        onRetry: ({ attempt, delay, error }) => {
          logger.warn({
            message: 'Retrying ElevenLabs synthesis',
            attempt,
            delay,
            reason: error.message
          });
        }
      }
    );
  }

  return {
    status,
    synthesizeText
  };
}

module.exports = {
  createElevenLabsTtsAdapter
};