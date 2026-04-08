const { webcrypto } = require('crypto');
const request = require('supertest');
const { createApp } = require('../src/app');

async function createWebhookSigner() {
  const keyPair = await webcrypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
  const publicKeyRaw = await webcrypto.subtle.exportKey('raw', keyPair.publicKey);
  const encoder = new TextEncoder();

  async function signPayload(payload) {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signedPayload = encoder.encode(`${timestamp}|${payload}`);
    const signature = await webcrypto.subtle.sign('Ed25519', keyPair.privateKey, signedPayload);

    return {
      timestamp,
      signature: Buffer.from(signature).toString('base64')
    };
  }

  return {
    publicKey: Buffer.from(publicKeyRaw).toString('base64'),
    signPayload
  };
}

function buildEvent({ id, eventType, callControlId, payload = {} }) {
  return {
    data: {
      id,
      event_type: eventType,
      payload: {
        call_control_id: callControlId,
        ...payload
      }
    }
  };
}

describe('telephony full call journey regression', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('processes initiated -> answered -> speak ended -> gather ended -> hangup', async () => {
    const signer = await createWebhookSigner();

    const fetchMock = jest.spyOn(global, 'fetch').mockImplementation(async (url) => {
      if (url === 'https://api.openai.com/v1/audio/transcriptions') {
        return {
          ok: true,
          json: async () => ({ text: 'I am looking for an apartment in downtown with budget 1800' })
        };
      }

      if (String(url).startsWith('http://localhost:3002/api/session')) {
        return {
          ok: true,
          json: async () => ({
            data: {
              reply_text: 'Got it. What is your move-in date?',
              session: { step: 'collect_move_in_date' }
            }
          })
        };
      }

      if (String(url).startsWith('https://api.elevenlabs.io/v1/text-to-speech/')) {
        return {
          ok: true,
          arrayBuffer: async () => Buffer.from('tts-audio')
        };
      }

      if (String(url).startsWith('https://api.telnyx.com/v2/calls/')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({})
        };
      }

      if (String(url).startsWith('http://localhost:3004/api/leads')) {
        return {
          ok: true,
          status: 201,
          json: async () => ({ data: { action: 'created' } })
        };
      }

      throw new Error(`Unexpected URL called in regression test: ${url}`);
    });

    const app = createApp({
      nodeEnv: 'test',
      serviceName: 'telephony-service',
      port: 3001,
      telnyxPublicKey: signer.publicKey,
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
      conversationEngineTimeoutMs: 2500,
      crmServiceEnabled: true,
      crmServiceBaseUrl: 'http://localhost:3004',
      crmServiceTimeoutMs: 2500,
      nlpServiceEnabled: false,
      nlpServiceBaseUrl: 'http://localhost:3005',
      nlpServiceTimeoutMs: 2500
    });

    const callControlId = 'call-regression-1';

    const events = [
      buildEvent({ id: 'evt-1', eventType: 'call.initiated', callControlId }),
      buildEvent({
        id: 'evt-2',
        eventType: 'call.answered',
        callControlId,
        payload: {
          audio_base64: Buffer.from('fake-audio').toString('base64'),
          audio_mime_type: 'audio/wav'
        }
      }),
      buildEvent({ id: 'evt-3', eventType: 'call.speak.ended', callControlId }),
      buildEvent({
        id: 'evt-4',
        eventType: 'call.gather.ended',
        callControlId,
        payload: { transcription_text: 'my move in date is next month' }
      }),
      buildEvent({
        id: 'evt-5',
        eventType: 'call.hangup',
        callControlId,
        payload: { from: '+15551234567' }
      })
    ];

    for (const body of events) {
      const payload = JSON.stringify(body);
      const signed = await signer.signPayload(payload);

      const response = await request(app)
        .post('/api/webhooks')
        .set('content-type', 'application/json')
        .set('telnyx-timestamp', signed.timestamp)
        .set('telnyx-signature-ed25519', signed.signature)
        .send(payload);

      expect(response.status).toBe(200);
    }

    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));

    const calledUrls = fetchMock.mock.calls.map((call) => call[0]);

    expect(calledUrls).toContain('https://api.telnyx.com/v2/calls/call-regression-1/actions/answer');
    expect(calledUrls).toContain('https://api.openai.com/v1/audio/transcriptions');
    expect(calledUrls).toContain('https://api.telnyx.com/v2/calls/call-regression-1/actions/gather_using_speak');
    expect(calledUrls).toContain('https://api.telnyx.com/v2/calls/call-regression-1/actions/speak');

    const ceCalls = calledUrls.filter((url) => String(url).startsWith('http://localhost:3002/api/session'));
    expect(ceCalls.length).toBeGreaterThanOrEqual(1);

    const crmCalls = calledUrls.filter((url) => String(url).startsWith('http://localhost:3004/api/leads'));
    expect(crmCalls.length).toBe(1);
  });
});
