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

describe('telephony concurrent call load', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('handles 20 concurrent call.initiated webhooks', async () => {
    const signer = await createWebhookSigner();

    const fetchMock = jest.spyOn(global, 'fetch').mockImplementation(async (url) => {
      if (String(url).startsWith('https://api.telnyx.com/v2/calls/')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({})
        };
      }

      throw new Error(`Unexpected URL called in load test: ${url}`);
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
      asrEnabled: false,
      openaiApiKey: '',
      openaiWhisperModel: 'whisper-1',
      asrTimeoutMs: 5000,
      ttsEnabled: false,
      elevenlabsApiKey: '',
      elevenlabsVoiceId: '',
      elevenlabsModel: 'eleven_multilingual_v2',
      ttsTimeoutMs: 5000,
      conversationEngineEnabled: false,
      conversationEngineBaseUrl: 'http://localhost:3002',
      conversationEngineTimeoutMs: 2500,
      crmServiceEnabled: false,
      crmServiceBaseUrl: 'http://localhost:3004',
      crmServiceTimeoutMs: 2500,
      nlpServiceEnabled: false,
      nlpServiceBaseUrl: 'http://localhost:3005',
      nlpServiceTimeoutMs: 2500
    });

    const requests = Array.from({ length: 20 }, async (_, index) => {
      const body = {
        data: {
          id: `evt-concurrent-${index}`,
          event_type: 'call.initiated',
          payload: {
            call_control_id: `call-concurrent-${index}`
          }
        }
      };

      const payload = JSON.stringify(body);
      const signed = await signer.signPayload(payload);

      return request(app)
        .post('/api/webhooks')
        .set('content-type', 'application/json')
        .set('telnyx-timestamp', signed.timestamp)
        .set('telnyx-signature-ed25519', signed.signature)
        .send(payload);
    });

    const responses = await Promise.all(requests);

    responses.forEach((response) => {
      expect(response.status).toBe(200);
      expect(response.body?.data?.action).toBe('answer_inbound_call');
    });

    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));

    expect(fetchMock).toHaveBeenCalledTimes(20);
  });
});
