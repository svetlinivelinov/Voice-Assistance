const { webcrypto } = require('crypto');
const request = require('supertest');
const { createApp } = require('../src/app');

async function buildSignedWebhook(payload) {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const encoder = new TextEncoder();

  const keyPair = await webcrypto.subtle.generateKey({ name: 'Ed25519' }, true, [
    'sign',
    'verify'
  ]);

  const publicKeyRaw = await webcrypto.subtle.exportKey('raw', keyPair.publicKey);
  const signedPayload = encoder.encode(`${timestamp}|${payload}`);
  const signature = await webcrypto.subtle.sign('Ed25519', keyPair.privateKey, signedPayload);

  return {
    publicKey: Buffer.from(publicKeyRaw).toString('base64'),
    signature: Buffer.from(signature).toString('base64'),
    timestamp
  };
}

describe('telephony-service call.answered integration flow', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('processes call.answered through ASR, TTS, and Telnyx speak action', async () => {
    const webhookBody = {
      data: {
        event_type: 'call.answered',
        payload: {
          call_control_id: 'call-abc-123',
          audio_base64: Buffer.from('fake-audio').toString('base64'),
          audio_mime_type: 'audio/wav'
        }
      }
    };

    const payload = JSON.stringify(webhookBody);
    const signed = await buildSignedWebhook(payload);

    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ text: 'I need a two-bedroom apartment' })
      })
      .mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => Buffer.from('tts-audio')
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200
      });

    const app = createApp({
      nodeEnv: 'test',
      serviceName: 'telephony-service',
      port: 3001,
      telnyxPublicKey: signed.publicKey,
      telnyxApiKey: 'telnyx-test-key',
      telnyxApiBaseUrl: 'https://api.telnyx.com/v2',
      telnyxApiTimeoutMs: 5000,
      maxRetries: 1,
      voiceLoopGreeting: 'Hello from assistant',
      asrEnabled: true,
      openaiApiKey: 'openai-test-key',
      openaiWhisperModel: 'whisper-1',
      asrTimeoutMs: 5000,
      ttsEnabled: true,
      elevenlabsApiKey: 'elevenlabs-test-key',
      elevenlabsVoiceId: 'voice-test-1',
      elevenlabsModel: 'eleven_multilingual_v2',
      ttsTimeoutMs: 5000
    });

    const response = await request(app)
      .post('/api/webhooks')
      .set('content-type', 'application/json')
      .set('telnyx-timestamp', signed.timestamp)
      .set('telnyx-signature-ed25519', signed.signature)
      .send(payload);

    expect(response.status).toBe(200);
    expect(response.body?.data?.action).toBe('start_voice_loop');
    expect(response.body?.data?.conversationId).toEqual(expect.any(String));
    expect(response.body?.data?.sessionId).toEqual(expect.any(String));
    expect(response.body?.data?.session?.conversationId).toBe(response.body?.data?.conversationId);
    expect(response.body?.data?.session?.sessionId).toBe(response.body?.data?.sessionId);
    expect(response.body?.data?.execution).toEqual(
      expect.objectContaining({
        status: 'invoked',
        providerAction: 'speak',
        asr: expect.objectContaining({
          status: 'ok',
          transcript: 'I need a two-bedroom apartment'
        }),
        tts: expect.objectContaining({
          status: 'ok',
          mimeType: 'audio/mpeg'
        }),
        metrics: expect.objectContaining({
          voiceTurnLatencyMs: expect.any(Number)
        })
      })
    );
    expect(response.body?.data?.execution?.metrics?.voiceTurnLatencyMs).toBeGreaterThanOrEqual(0);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.openai.com/v1/audio/transcriptions');
    expect(fetchMock.mock.calls[1][0]).toBe('https://api.elevenlabs.io/v1/text-to-speech/voice-test-1');
    expect(fetchMock.mock.calls[2][0]).toBe('https://api.telnyx.com/v2/calls/call-abc-123/actions/speak');

    const telnyxSpeakPayload = JSON.parse(fetchMock.mock.calls[2][1].body);
    expect(telnyxSpeakPayload.payload).toContain('I need a two-bedroom apartment');
  });
});