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

    // Allow the setImmediate async processing block to complete
    await new Promise((resolve) => setImmediate(resolve));

    expect(response.status).toBe(200);
    expect(response.body?.data?.action).toBe('start_voice_loop');
    expect(response.body?.data?.conversationId).toEqual(expect.any(String));
    expect(response.body?.data?.sessionId).toEqual(expect.any(String));
    expect(response.body?.data?.session?.conversationId).toBe(response.body?.data?.conversationId);
    expect(response.body?.data?.session?.sessionId).toBe(response.body?.data?.sessionId);
    expect(response.body?.data?.session?.state).toBe('in_progress');
    expect(response.body?.data?.session?.lastEventType).toBe('call.answered');
    // execution is processed async — assert via fetch mock calls instead
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.openai.com/v1/audio/transcriptions');
    expect(fetchMock.mock.calls[1][0]).toBe('https://api.elevenlabs.io/v1/text-to-speech/voice-test-1');
    expect(fetchMock.mock.calls[2][0]).toBe('https://api.telnyx.com/v2/calls/call-abc-123/actions/speak');

    const telnyxSpeakPayload = JSON.parse(fetchMock.mock.calls[2][1].body);
    expect(telnyxSpeakPayload.payload).toContain('I need a two-bedroom apartment');
  });

  test('uses conversation-engine planned reply when enabled', async () => {
    const webhookBody = {
      data: {
        event_type: 'call.answered',
        payload: {
          call_control_id: 'call-ce-456',
          audio_base64: Buffer.from('fake-audio').toString('base64'),
          audio_mime_type: 'audio/wav'
        }
      }
    };

    const payload = JSON.stringify(webhookBody);
    const signed = await buildSignedWebhook(payload);

    const fetchMock = jest
      .spyOn(global, 'fetch')
      // 1. Whisper ASR
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ text: 'I want an apartment with a budget of 1500' })
      })
      // 2. Conversation-engine /api/session
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            session: { step: 'collect_location', missing_fields: ['location', 'move_in_date', 'viewing_date'] },
            reply_text: 'Which area are you interested in?'
          }
        })
      })
      // 3. ElevenLabs TTS
      .mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => Buffer.from('tts-audio')
      })
      // 4. Telnyx speak
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
      ttsTimeoutMs: 5000,
      conversationEngineEnabled: true,
      conversationEngineBaseUrl: 'http://localhost:3002',
      conversationEngineTimeoutMs: 2500
    });

    const response = await request(app)
      .post('/api/webhooks')
      .set('content-type', 'application/json')
      .set('telnyx-timestamp', signed.timestamp)
      .set('telnyx-signature-ed25519', signed.signature)
      .send(payload);

    // Allow the setImmediate async processing block to complete
    await new Promise((resolve) => setImmediate(resolve));

    expect(response.status).toBe(200);
    expect(response.body?.data?.execution?.status).toBeUndefined(); // execution is async now

    // CE call must include entities extracted from transcript
    expect(fetchMock).toHaveBeenCalledTimes(4);
    const ceCallBody = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(ceCallBody.entities).toEqual(
      expect.objectContaining({ property_type: 'apartment', budget: '1500' })
    );

    // Telnyx speak must use the CE-planned reply, not the raw ASR echo
    const telnyxBody = JSON.parse(fetchMock.mock.calls[3][1].body);
    expect(telnyxBody.payload).toBe('Which area are you interested in?');
  });
});