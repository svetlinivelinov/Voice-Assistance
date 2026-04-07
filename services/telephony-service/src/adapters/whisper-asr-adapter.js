const { retryWithBackoff } = require('../utils/retry-with-backoff');

function createWhisperAsrAdapter(config, logger) {
  const enabled = config.asrEnabled;
  const apiKey = config.openaiApiKey;
  const model = config.openaiWhisperModel;
  const timeoutMs = config.asrTimeoutMs;

  function status() {
    if (!enabled) {
      return { enabled: false, ready: false, reason: 'asr_disabled' };
    }
    if (!apiKey) {
      return { enabled: true, ready: false, reason: 'missing_openai_api_key' };
    }
    return { enabled: true, ready: true, model };
  }

  async function transcribeAudio({ audioBase64, mimeType = 'audio/wav' } = {}) {
    const adapterStatus = status();
    if (!adapterStatus.ready) {
      return {
        status: 'skipped',
        reason: adapterStatus.reason
      };
    }

    if (!audioBase64) {
      return {
        status: 'skipped',
        reason: 'missing_audio_payload'
      };
    }

    return retryWithBackoff(
      async () => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);

        try {
          const audioBuffer = Buffer.from(audioBase64, 'base64');
          const formData = new FormData();
          const audioBlob = new Blob([audioBuffer], { type: mimeType });

          formData.append('file', audioBlob, 'input.wav');
          formData.append('model', model);

          const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
            method: 'POST',
            signal: controller.signal,
            headers: {
              authorization: `Bearer ${apiKey}`
            },
            body: formData
          });

          if (!response.ok) {
            const err = new Error(`Whisper transcription failed with status ${response.status}`);
            err.statusCode = response.status;
            throw err;
          }

          const payload = await response.json();
          return {
            status: 'ok',
            transcript: payload.text || ''
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
            message: 'Retrying Whisper transcription',
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
    transcribeAudio
  };
}

module.exports = {
  createWhisperAsrAdapter
};