const { createElevenLabsTtsAdapter } = require('../src/adapters/elevenlabs-tts-adapter');

describe('createElevenLabsTtsAdapter', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('returns not ready when API key is missing', () => {
    const adapter = createElevenLabsTtsAdapter(
      {
        ttsEnabled: true,
        elevenlabsApiKey: '',
        elevenlabsVoiceId: 'voice-1',
        elevenlabsModel: 'eleven_multilingual_v2',
        ttsTimeoutMs: 1000,
        maxRetries: 1
      },
      { warn: jest.fn() }
    );

    expect(adapter.status()).toEqual(
      expect.objectContaining({
        enabled: true,
        ready: false,
        reason: 'missing_elevenlabs_api_key'
      })
    );
  });

  test('returns skipped for missing text', async () => {
    const adapter = createElevenLabsTtsAdapter(
      {
        ttsEnabled: true,
        elevenlabsApiKey: 'k',
        elevenlabsVoiceId: 'voice-1',
        elevenlabsModel: 'eleven_multilingual_v2',
        ttsTimeoutMs: 1000,
        maxRetries: 1
      },
      { warn: jest.fn() }
    );

    const result = await adapter.synthesizeText({ text: '' });
    expect(result).toEqual({ status: 'skipped', reason: 'missing_tts_text' });
  });

  test('returns audio payload on success', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      arrayBuffer: async () => Buffer.from('audio-bytes')
    });

    const adapter = createElevenLabsTtsAdapter(
      {
        ttsEnabled: true,
        elevenlabsApiKey: 'k',
        elevenlabsVoiceId: 'voice-1',
        elevenlabsModel: 'eleven_multilingual_v2',
        ttsTimeoutMs: 2000,
        maxRetries: 1
      },
      { warn: jest.fn() }
    );

    const result = await adapter.synthesizeText({ text: 'hello' });

    expect(result).toEqual(
      expect.objectContaining({
        status: 'ok',
        mimeType: 'audio/mpeg',
        audioBase64: expect.any(String)
      })
    );
  });
});