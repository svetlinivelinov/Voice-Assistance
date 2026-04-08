const { createWhisperAsrAdapter } = require('../src/adapters/whisper-asr-adapter');

describe('createWhisperAsrAdapter', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('returns not ready when API key is missing', () => {
    const adapter = createWhisperAsrAdapter(
      {
        asrEnabled: true,
        openaiApiKey: '',
        openaiWhisperModel: 'whisper-1',
        asrTimeoutMs: 1000,
        maxRetries: 1
      },
      { warn: jest.fn() }
    );

    expect(adapter.status()).toEqual(
      expect.objectContaining({
        enabled: true,
        ready: false,
        reason: 'missing_openai_api_key'
      })
    );
  });

  test('transcribeAudio returns skipped without audio payload', async () => {
    const adapter = createWhisperAsrAdapter(
      {
        asrEnabled: true,
        openaiApiKey: 'k',
        openaiWhisperModel: 'whisper-1',
        asrTimeoutMs: 1000,
        maxRetries: 1
      },
      { warn: jest.fn() }
    );

    const result = await adapter.transcribeAudio({});
    expect(result).toEqual({ status: 'skipped', reason: 'missing_audio_payload' });
  });

  test('transcribeAudio returns transcript on success', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ text: 'hello world' })
    });

    const adapter = createWhisperAsrAdapter(
      {
        asrEnabled: true,
        openaiApiKey: 'k',
        openaiWhisperModel: 'whisper-1',
        asrTimeoutMs: 2000,
        maxRetries: 1
      },
      { warn: jest.fn() }
    );

    const audio = Buffer.from('fake-audio').toString('base64');
    const result = await adapter.transcribeAudio({ audioBase64: audio, mimeType: 'audio/wav' });

    expect(result).toEqual(
      expect.objectContaining({
        status: 'ok',
        transcript: 'hello world'
      })
    );
  });
});