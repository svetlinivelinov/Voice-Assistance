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

describe('telephony-service webhook signature verification', () => {
  test('POST /api/webhooks returns 401 for invalid signature', async () => {
    const payload = JSON.stringify({
      data: {
        event_type: 'call.initiated'
      }
    });

    const app = createApp({
      nodeEnv: 'test',
      serviceName: 'telephony-service',
      port: 3001,
      telnyxPublicKey: Buffer.alloc(32, 1).toString('base64')
    });

    const response = await request(app)
      .post('/api/webhooks')
      .set('content-type', 'application/json')
      .set('telnyx-timestamp', Math.floor(Date.now() / 1000).toString())
      .set('telnyx-signature-ed25519', Buffer.alloc(64, 2).toString('base64'))
      .send(payload);

    expect(response.status).toBe(401);
    expect(response.body).toEqual(
      expect.objectContaining({
        error: expect.objectContaining({
          code: 'UNAUTHORIZED',
          message: 'Invalid Telnyx webhook signature'
        })
      })
    );
  });

  test('POST /api/webhooks returns 200 for valid signature', async () => {
    const payload = JSON.stringify({
      data: {
        event_type: 'call.initiated'
      }
    });

    const signed = await buildSignedWebhook(payload);

    const app = createApp({
      nodeEnv: 'test',
      serviceName: 'telephony-service',
      port: 3001,
      telnyxPublicKey: signed.publicKey
    });

    const response = await request(app)
      .post('/api/webhooks')
      .set('content-type', 'application/json')
      .set('telnyx-timestamp', signed.timestamp)
      .set('telnyx-signature-ed25519', signed.signature)
      .send(payload);

    expect(response.status).toBe(200);
    expect(response.body).toEqual(
      expect.objectContaining({
        data: expect.objectContaining({
          received: true,
          provider: 'telnyx',
          eventType: 'call.initiated',
          action: 'queue_inbound_call',
          execution: expect.objectContaining({
            status: 'queued'
          }),
          session: expect.objectContaining({
            callControlId: 'unknown',
            state: 'ringing',
            eventsCount: 1
          }),
          service: 'telephony-service',
          requestId: expect.any(String)
        })
      })
    );
    expect(response.headers['x-request-id']).toBeTruthy();
  });

  test('POST /api/webhooks maps call.answered to start_voice_loop', async () => {
    const payload = JSON.stringify({
      data: {
        event_type: 'call.answered'
      }
    });

    const signed = await buildSignedWebhook(payload);

    const app = createApp({
      nodeEnv: 'test',
      serviceName: 'telephony-service',
      port: 3001,
      telnyxPublicKey: signed.publicKey
    });

    const response = await request(app)
      .post('/api/webhooks')
      .set('content-type', 'application/json')
      .set('telnyx-timestamp', signed.timestamp)
      .set('telnyx-signature-ed25519', signed.signature)
      .send(payload);

    expect(response.status).toBe(200);
    expect(response.body?.data?.action).toBe('start_voice_loop');
    expect(response.body?.data?.execution?.status).toBe('skipped');
    expect(response.body?.data?.execution?.reason).toBe('missing_call_control_id');
  });

  test('POST /api/webhooks maps unknown events to ignore_unknown_event', async () => {
    const payload = JSON.stringify({
      data: {
        event_type: 'call.experimental'
      }
    });

    const signed = await buildSignedWebhook(payload);

    const app = createApp({
      nodeEnv: 'test',
      serviceName: 'telephony-service',
      port: 3001,
      telnyxPublicKey: signed.publicKey
    });

    const response = await request(app)
      .post('/api/webhooks')
      .set('content-type', 'application/json')
      .set('telnyx-timestamp', signed.timestamp)
      .set('telnyx-signature-ed25519', signed.signature)
      .send(payload);

    expect(response.status).toBe(200);
    expect(response.body?.data?.action).toBe('ignore_unknown_event');
  });
});