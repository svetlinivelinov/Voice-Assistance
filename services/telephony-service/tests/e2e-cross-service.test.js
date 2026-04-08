/**
 * Cross-Service E2E Integration Test
 *
 * Validates the complete real estate voice assistant call workflow by wiring
 * all five service apps together IN-PROCESS — no network ports needed.
 *
 * Services under test (real in-process instances):
 *   • telephony-service  — webhook entry-point, orchestrator
 *   • nlp-intent-service — keyword-based intent + entity extraction (regex provider)
 *   • conversation-engine — in-memory slot-filling state machine
 *   • crm-service        — lead upsert with mocked sheetsClient
 *   • calendar-service   — booking with mocked calendarClient
 *
 * Only TRUE external APIs are mocked via jest.spyOn(global, 'fetch'):
 *   • Telnyx REST API  (https://api.telnyx.com)
 *   • OpenAI Whisper   (https://api.openai.com)
 *
 * All service-to-service calls (localhost:30xx) are routed to the real
 * in-process Express apps via direct supertest handler invocation (routeToApp).
 *
 * Design notes:
 * - buildEvent() includes call_session_id = callControlId so that
 *   handle-webhook-event uses callControlId as the CE session_id too,
 *   making CE state queryable directly by callControlId.
 * - drainAsync() fires many setImmediate ticks THEN waits 200 ms of real
 *   time so that TCP I/O from supertest-based routeToApp has time to
 *   complete before test assertions run.
 * - afterEach always drains BEFORE restoring mocks, preventing pending async
 *   callbacks from one test from firing with another test's fetch stub.
 */

'use strict';

const { webcrypto } = require('crypto');
const request = require('supertest');

// ── Service factories ──────────────────────────────────────────────────────
const { createApp: createTelephonyApp } = require('../src/app');
const { createApp: createCeApp } = require('../../conversation-engine/src/app');
const { createApp: createCrmApp } = require('../../crm-service/src/app');
const { createApp: createCalendarApp } = require('../../calendar-service/src/app');
const { createApp: createNlpApp } = require('../../nlp-intent-service/src/app');

// ── Webhook signing helper ─────────────────────────────────────────────────
async function createWebhookSigner() {
  const keyPair = await webcrypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
  const publicKeyRaw = await webcrypto.subtle.exportKey('raw', keyPair.publicKey);
  const encoder = new TextEncoder();

  async function signPayload(payload) {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signed = encoder.encode(`${timestamp}|${payload}`);
    const sig = await webcrypto.subtle.sign('Ed25519', keyPair.privateKey, signed);
    return { timestamp, signature: Buffer.from(sig).toString('base64') };
  }

  return { publicKey: Buffer.from(publicKeyRaw).toString('base64'), signPayload };
}

// ── Telnyx event builder ───────────────────────────────────────────────────
/**
 * Builds a signed Telnyx webhook payload.
 * Injects call_session_id = callControlId so handle-webhook-event assigns
 * session.sessionId = callControlId, making CE state queryable by callControlId.
 */
function buildEvent({ id, eventType, callControlId, payload = {} }) {
  return {
    data: {
      id,
      event_type: eventType,
      payload: {
        call_control_id: callControlId,
        call_session_id: callControlId,
        ...payload
      }
    }
  };
}

// ── Fetch-to-supertest adapter ─────────────────────────────────────────────
/**
 * Routes a fetch() call to an in-process Express app via supertest (loopback TCP).
 * Returns a fetch-compatible response object (ok, status, json, text).
 */
async function routeToApp(app, urlStr, options = {}) {
  const parsed = new URL(urlStr);
  const method = (options.method || 'GET').toLowerCase();
  const path = parsed.pathname + (parsed.search || '');

  let req = request(app)[method](path);

  const headers = options.headers || {};
  Object.entries(headers).forEach(([k, v]) => req = req.set(k, String(v)));

  if (options.body) {
    req = req.send(options.body);
    if (!headers['content-type'] && !headers['Content-Type']) {
      req = req.set('content-type', 'application/json');
    }
  }

  const res = await req;
  const body = res.body;

  return {
    ok: res.status >= 200 && res.status < 300,
    status: res.status,
    json: async () => body,
    text: async () => JSON.stringify(body)
  };
}

// ── Fire a signed webhook event ────────────────────────────────────────────
async function fireEvent(app, signer, body) {
  const payload = JSON.stringify(body);
  const { timestamp, signature } = await signer.signPayload(payload);

  return request(app)
    .post('/api/webhooks')
    .set('content-type', 'application/json')
    .set('telnyx-timestamp', timestamp)
    .set('telnyx-signature-ed25519', signature)
    .send(payload);
}

// ── Drain the event loop ───────────────────────────────────────────────────
/**
 * Fires many setImmediate ticks (kicks off pending callbacks), then waits a
 * real-time window so that TCP-based supertest responses (loopback sockets
 * used by routeToApp) have time to resolve before assertions run.
 * Also fires additional setImmediates after the timeout to drain any
 * microtasks that queued up during the TCP I/O.
 */
async function drainAsync() {
  for (let i = 0; i < 8; i++) {
    await new Promise((r) => setImmediate(r));
  }
  await new Promise((r) => setTimeout(r, 200));
  for (let i = 0; i < 5; i++) {
    await new Promise((r) => setImmediate(r));
  }
}

// =============================================================================
// Suite 1 — Complete call lifecycle with real NLP + CE + CRM in-process
// =============================================================================
describe('E2E: complete call lifecycle (telephony → NLP → CE → CRM)', () => {
  let telApp, ceApp, crmApp, nlpApp;
  let mockSheetsClient;
  let signer;

  beforeAll(async () => {
    signer = await createWebhookSigner();

    nlpApp = createNlpApp({ nodeEnv: 'test', serviceName: 'nlp-intent-service', port: 3005, nlpProvider: 'regex' });
    ceApp = createCeApp({ nodeEnv: 'test', serviceName: 'conversation-engine', port: 3002, conversationStateMachineEnabled: true });

    mockSheetsClient = {
      getLead: jest.fn(async () => null),
      upsertLead: jest.fn(async (lead) => ({ action: 'created', lead }))
    };
    crmApp = createCrmApp({ nodeEnv: 'test', serviceName: 'crm-service', port: 3004, googleSheetsEnabled: false });
    crmApp.locals.sheetsClient = mockSheetsClient;

    telApp = createTelephonyApp({
      nodeEnv: 'test',
      serviceName: 'telephony-service',
      port: 3001,
      telnyxPublicKey: signer.publicKey,
      telnyxApiKey: 'tel-e2e-key',
      telnyxApiBaseUrl: 'https://api.telnyx.com/v2',
      telnyxApiTimeoutMs: 5000,
      maxRetries: 0,
      voiceLoopGreeting: 'Hello! How can I help with your property search?',
      asrEnabled: true,
      openaiApiKey: 'openai-e2e-key',
      openaiWhisperModel: 'whisper-1',
      asrTimeoutMs: 5000,
      asrMinConfidence: 0.0,
      ttsEnabled: false,
      elevenlabsApiKey: '',
      elevenlabsVoiceId: '',
      elevenlabsModel: 'eleven_multilingual_v2',
      ttsTimeoutMs: 5000,
      conversationEngineEnabled: true,
      conversationEngineBaseUrl: 'http://localhost:3002',
      conversationEngineTimeoutMs: 5000,
      crmServiceEnabled: true,
      crmServiceBaseUrl: 'http://localhost:3004',
      crmServiceTimeoutMs: 5000,
      nlpServiceEnabled: true,
      nlpServiceBaseUrl: 'http://localhost:3005',
      nlpServiceTimeoutMs: 5000
    });
  });

  // Drain BEFORE restoring mocks so pending async ops don't fire on next test's stub
  afterEach(async () => {
    await drainAsync();
    jest.restoreAllMocks();
    mockSheetsClient.getLead.mockClear();
    mockSheetsClient.upsertLead.mockClear();
  });

  test('call.initiated triggers automatic answer via Telnyx', async () => {
    jest.spyOn(global, 'fetch').mockImplementation(async (url) => {
      if (String(url).startsWith('https://api.telnyx.com/')) {
        return { ok: true, status: 200, json: async () => ({}) };
      }
      throw new Error(`Unexpected URL: ${url}`);
    });

    const res = await fireEvent(telApp, signer, buildEvent({
      id: 'e2e-init-1',
      eventType: 'call.initiated',
      callControlId: 'e2e-cid-init'
    }));

    expect(res.status).toBe(200);
    await drainAsync();

    const calledUrls = global.fetch.mock.calls.map((c) => String(c[0]));
    expect(calledUrls).toContain('https://api.telnyx.com/v2/calls/e2e-cid-init/actions/answer');
  });

  test('call.answered: ASR → NLP → CE slot-filling → Telnyx speak', async () => {
    const callControlId = 'e2e-cid-answered';

    jest.spyOn(global, 'fetch').mockImplementation(async (url, opts) => {
      const urlStr = String(url);
      if (urlStr.startsWith('http://localhost:3002/')) return routeToApp(ceApp, urlStr, opts);
      if (urlStr.startsWith('http://localhost:3005/')) return routeToApp(nlpApp, urlStr, opts);
      if (urlStr === 'https://api.openai.com/v1/audio/transcriptions') {
        return { ok: true, json: async () => ({ text: 'I want a 2 bedroom apartment in Austin budget 2000' }) };
      }
      if (urlStr.startsWith('https://api.telnyx.com/')) return { ok: true, status: 200, json: async () => ({}) };
      throw new Error(`Unexpected URL: ${url}`);
    });

    await fireEvent(telApp, signer, buildEvent({ id: 'e2e-ans-init', eventType: 'call.initiated', callControlId }));

    const res = await fireEvent(telApp, signer, buildEvent({
      id: 'e2e-ans-1',
      eventType: 'call.answered',
      callControlId,
      payload: { audio_base64: Buffer.from('fake-audio-data').toString('base64'), audio_mime_type: 'audio/wav' }
    }));

    expect(res.status).toBe(200);
    await drainAsync();

    const calledUrls = global.fetch.mock.calls.map((c) => String(c[0]));
    expect(calledUrls).toContain('https://api.openai.com/v1/audio/transcriptions');
    expect(calledUrls.filter((u) => u.startsWith('http://localhost:3002/api/session')).length).toBeGreaterThanOrEqual(1);
    expect(calledUrls).toContain(`https://api.telnyx.com/v2/calls/${callControlId}/actions/speak`);

    // Real CE session — session_id === callControlId (via call_session_id injection in buildEvent)
    const sessionRes = await request(ceApp).get(`/api/session/${callControlId}`);
    expect(sessionRes.status).toBe(200);
    const { entities } = sessionRes.body.data.session;
    expect(entities.location).toMatch(/austin/i);
  });

  test('call.speak.ended triggers gather_using_speak (start listening)', async () => {
    const callControlId = 'e2e-cid-speak-ended';

    jest.spyOn(global, 'fetch').mockImplementation(async (url) => {
      if (String(url).startsWith('https://api.telnyx.com/')) {
        return { ok: true, status: 200, json: async () => ({}) };
      }
      throw new Error(`Unexpected URL: ${url}`);
    });

    await fireEvent(telApp, signer, buildEvent({ id: 'e2e-se-init', eventType: 'call.initiated', callControlId }));
    await drainAsync();

    const res = await fireEvent(telApp, signer, buildEvent({ id: 'e2e-se-1', eventType: 'call.speak.ended', callControlId }));

    expect(res.status).toBe(200);
    await drainAsync();

    const calledUrls = global.fetch.mock.calls.map((c) => String(c[0]));
    expect(calledUrls).toContain(`https://api.telnyx.com/v2/calls/${callControlId}/actions/gather_using_speak`);
  });

  test('call.gather.ended: NLP extracts entities, CE advances state, Telnyx speak fired', async () => {
    const callControlId = 'e2e-cid-gather';

    jest.spyOn(global, 'fetch').mockImplementation(async (url, opts) => {
      const urlStr = String(url);
      if (urlStr.startsWith('http://localhost:3002/')) return routeToApp(ceApp, urlStr, opts);
      if (urlStr.startsWith('http://localhost:3005/')) return routeToApp(nlpApp, urlStr, opts);
      if (urlStr.startsWith('https://api.telnyx.com/')) return { ok: true, status: 200, json: async () => ({}) };
      throw new Error(`Unexpected URL: ${url}`);
    });

    await fireEvent(telApp, signer, buildEvent({ id: 'e2e-ge-init', eventType: 'call.initiated', callControlId }));
    await drainAsync();

    const res = await fireEvent(telApp, signer, buildEvent({
      id: 'e2e-ge-1',
      eventType: 'call.gather.ended',
      callControlId,
      payload: { transcription_text: 'I am looking for a studio apartment in New York budget 3000 dollars' }
    }));

    expect(res.status).toBe(200);
    await drainAsync();

    const calledUrls = global.fetch.mock.calls.map((c) => String(c[0]));
    expect(calledUrls.filter((u) => u.includes('/api/extract-entities')).length).toBeGreaterThanOrEqual(1);
    expect(calledUrls.filter((u) => u.startsWith('http://localhost:3002/api/session')).length).toBeGreaterThanOrEqual(1);
    expect(calledUrls).toContain(`https://api.telnyx.com/v2/calls/${callControlId}/actions/speak`);

    const sessionRes = await request(ceApp).get(`/api/session/${callControlId}`);
    expect(sessionRes.status).toBe(200);
    const { entities } = sessionRes.body.data.session;
    expect(entities.location).toMatch(/new york/i);
    expect(entities.budget).toBeDefined();
  });

  test('call.hangup persists lead to CRM (real CRM route → mock sheetsClient)', async () => {
    const callControlId = 'e2e-cid-hangup';

    jest.spyOn(global, 'fetch').mockImplementation(async (url, opts) => {
      const urlStr = String(url);
      if (urlStr.startsWith('http://localhost:3004/')) return routeToApp(crmApp, urlStr, opts);
      if (urlStr.startsWith('https://api.telnyx.com/')) return { ok: true, status: 200, json: async () => ({}) };
      throw new Error(`Unexpected URL: ${url}`);
    });

    await fireEvent(telApp, signer, buildEvent({ id: 'e2e-hang-init', eventType: 'call.initiated', callControlId }));
    await drainAsync();

    const resHangup = await fireEvent(telApp, signer, buildEvent({
      id: 'e2e-hang-1',
      eventType: 'call.hangup',
      callControlId,
      payload: { from: '+15559876543' }
    }));

    expect(resHangup.status).toBe(200);
    await drainAsync();

    const crmCalls = global.fetch.mock.calls.filter((c) => String(c[0]).startsWith('http://localhost:3004/api/leads'));
    expect(crmCalls.length).toBe(1);

    // Mock sheetsClient.upsertLead was invoked inside the real CRM route
    expect(mockSheetsClient.upsertLead).toHaveBeenCalledTimes(1);
    const upsertArg = mockSheetsClient.upsertLead.mock.calls[0][0];
    // client_id === callControlId because call_session_id is injected in buildEvent
    expect(upsertArg.client_id).toBe(callControlId);
    expect(['new', 'qualified', 'scheduled', 'closed']).toContain(upsertArg.status);
  });
});

// =============================================================================
// Suite 2 — Full multi-turn call (5 events) with real CE + NLP + CRM
// =============================================================================
describe('E2E: multi-turn call journey — all events in sequence', () => {
  let telApp, ceApp, crmApp, nlpApp;
  let mockSheetsClient;
  let signer;

  beforeAll(async () => {
    signer = await createWebhookSigner();

    nlpApp = createNlpApp({ nodeEnv: 'test', serviceName: 'nlp-intent-service', port: 3005, nlpProvider: 'regex' });
    ceApp = createCeApp({ nodeEnv: 'test', serviceName: 'conversation-engine', port: 3002, conversationStateMachineEnabled: true });

    mockSheetsClient = {
      getLead: jest.fn(async () => null),
      upsertLead: jest.fn(async (lead) => ({ action: 'created', lead }))
    };
    crmApp = createCrmApp({ nodeEnv: 'test', serviceName: 'crm-service', port: 3004, googleSheetsEnabled: false });
    crmApp.locals.sheetsClient = mockSheetsClient;

    telApp = createTelephonyApp({
      nodeEnv: 'test',
      serviceName: 'telephony-service',
      port: 3001,
      telnyxPublicKey: signer.publicKey,
      telnyxApiKey: 'tel-mt-key',
      telnyxApiBaseUrl: 'https://api.telnyx.com/v2',
      telnyxApiTimeoutMs: 5000,
      maxRetries: 0,
      voiceLoopGreeting: 'Hello! How can I help with your property search?',
      asrEnabled: true,
      openaiApiKey: 'openai-mt-key',
      openaiWhisperModel: 'whisper-1',
      asrTimeoutMs: 5000,
      asrMinConfidence: 0.0,
      ttsEnabled: false,
      elevenlabsApiKey: '',
      elevenlabsVoiceId: '',
      elevenlabsModel: 'eleven_multilingual_v2',
      ttsTimeoutMs: 5000,
      conversationEngineEnabled: true,
      conversationEngineBaseUrl: 'http://localhost:3002',
      conversationEngineTimeoutMs: 5000,
      crmServiceEnabled: true,
      crmServiceBaseUrl: 'http://localhost:3004',
      crmServiceTimeoutMs: 5000,
      nlpServiceEnabled: true,
      nlpServiceBaseUrl: 'http://localhost:3005',
      nlpServiceTimeoutMs: 5000
    });
  });

  afterEach(async () => {
    await drainAsync();
    jest.restoreAllMocks();
  });

  test('5-event journey: CE advances per turn, CRM saved on hangup', async () => {
    const callControlId = 'e2e-journey-001';

    jest.spyOn(global, 'fetch').mockImplementation(async (url, opts) => {
      const urlStr = String(url);
      if (urlStr.startsWith('http://localhost:3002/')) return routeToApp(ceApp, urlStr, opts);
      if (urlStr.startsWith('http://localhost:3004/')) return routeToApp(crmApp, urlStr, opts);
      if (urlStr.startsWith('http://localhost:3005/')) return routeToApp(nlpApp, urlStr, opts);
      if (urlStr === 'https://api.openai.com/v1/audio/transcriptions') {
        return { ok: true, json: async () => ({ text: 'I want a 2 bedroom apartment in Austin with a budget of 2000 a month' }) };
      }
      if (urlStr.startsWith('https://api.telnyx.com/')) return { ok: true, status: 200, json: async () => ({}) };
      throw new Error(`Unexpected URL in multi-turn E2E: ${urlStr}`);
    });

    const events = [
      buildEvent({ id: 'mt-1', eventType: 'call.initiated', callControlId }),
      buildEvent({
        id: 'mt-2',
        eventType: 'call.answered',
        callControlId,
        payload: { audio_base64: Buffer.from('fake-audio').toString('base64'), audio_mime_type: 'audio/wav' }
      }),
      buildEvent({ id: 'mt-3', eventType: 'call.speak.ended', callControlId }),
      buildEvent({
        id: 'mt-4',
        eventType: 'call.gather.ended',
        callControlId,
        payload: { transcription_text: 'I want to move in next month' }
      }),
      buildEvent({ id: 'mt-5', eventType: 'call.hangup', callControlId, payload: { from: '+15551112222' } })
    ];

    for (const evt of events) {
      const res = await fireEvent(telApp, signer, evt);
      expect(res.status).toBe(200);
    }

    await drainAsync();

    const calledUrls = global.fetch.mock.calls.map((c) => String(c[0]));

    // Telephony orchestration
    expect(calledUrls).toContain(`https://api.telnyx.com/v2/calls/${callControlId}/actions/answer`);
    expect(calledUrls).toContain('https://api.openai.com/v1/audio/transcriptions');
    expect(calledUrls).toContain(`https://api.telnyx.com/v2/calls/${callControlId}/actions/gather_using_speak`);
    expect(calledUrls).toContain(`https://api.telnyx.com/v2/calls/${callControlId}/actions/speak`);

    // NLP invoked
    expect(calledUrls.filter((u) => u.startsWith('http://localhost:3005/')).length).toBeGreaterThanOrEqual(1);

    // CE called at least twice (answered-turn + gather-turn)
    expect(calledUrls.filter((u) => u.startsWith('http://localhost:3002/api/session')).length).toBeGreaterThanOrEqual(2);

    // Real CE session state
    const sessionRes = await request(ceApp).get(`/api/session/${callControlId}`);
    expect(sessionRes.status).toBe(200);
    const finalSession = sessionRes.body.data.session;
    expect(finalSession.session_id).toBe(callControlId);
    expect(finalSession.entities).toBeDefined();
    expect(['collect_name', 'collect_phone', 'collect_location', 'collect_budget',
            'collect_property_type', 'collect_move_in_date', 'collect_viewing_date',
            'completed'].includes(finalSession.step)).toBe(true);

    // CRM lead persisted via real CRM route → mock sheetsClient
    expect(calledUrls.filter((u) => u.startsWith('http://localhost:3004/api/leads')).length).toBe(1);
    expect(mockSheetsClient.upsertLead).toHaveBeenCalledTimes(1);
    const persistedLead = mockSheetsClient.upsertLead.mock.calls[0][0];
    expect(persistedLead.client_id).toBe(callControlId);
    expect(['new', 'qualified', 'scheduled', 'closed']).toContain(persistedLead.status);
  });
});

// =============================================================================
// Suite 3 — Individual service health checks (all in-process)
// =============================================================================
describe('E2E: in-process service health gates', () => {
  let apps;

  beforeAll(() => {
    apps = {
      'telephony-service': createTelephonyApp({
        nodeEnv: 'test', serviceName: 'telephony-service', port: 3001,
        telnyxPublicKey: '', telnyxApiKey: '',
        telnyxApiBaseUrl: 'https://api.telnyx.com/v2', telnyxApiTimeoutMs: 2000,
        maxRetries: 0, voiceLoopGreeting: 'Hi',
        asrEnabled: false, openaiApiKey: '', openaiWhisperModel: 'whisper-1', asrTimeoutMs: 2000, asrMinConfidence: 0,
        ttsEnabled: false, elevenlabsApiKey: '', elevenlabsVoiceId: '',
        elevenlabsModel: 'eleven_multilingual_v2', ttsTimeoutMs: 2000,
        conversationEngineEnabled: false, conversationEngineBaseUrl: 'http://localhost:3002', conversationEngineTimeoutMs: 2000,
        crmServiceEnabled: false, crmServiceBaseUrl: 'http://localhost:3004', crmServiceTimeoutMs: 2000,
        nlpServiceEnabled: false, nlpServiceBaseUrl: 'http://localhost:3005', nlpServiceTimeoutMs: 2000
      }),
      'conversation-engine': createCeApp({ nodeEnv: 'test', serviceName: 'conversation-engine', port: 3002, conversationStateMachineEnabled: true }),
      'crm-service': createCrmApp({ nodeEnv: 'test', serviceName: 'crm-service', port: 3004, googleSheetsEnabled: false }),
      'calendar-service': createCalendarApp({ nodeEnv: 'test', serviceName: 'calendar-service', port: 3003, googleCalendarEnabled: false, googleCalendarId: 'primary', calendarTimeZone: 'UTC' }),
      'nlp-intent-service': createNlpApp({ nodeEnv: 'test', serviceName: 'nlp-intent-service', port: 3005, nlpProvider: 'regex' })
    };
  });

  test.each([
    ['telephony-service'],
    ['conversation-engine'],
    ['crm-service'],
    ['calendar-service'],
    ['nlp-intent-service']
  ])('%s /health returns 200 with status:ok', async (name) => {
    const app = apps[name];
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    // ok() wraps response in { data: { ... } } — status field lives inside data
    expect(res.body.data.status).toMatch(/^(ok|healthy)$/i);
  });
});

// =============================================================================
// Suite 4 — CE session isolation (concurrent calls do not share state)
// =============================================================================
describe('E2E: conversation-engine session isolation', () => {
  test('parallel calls get independent CE sessions without cross-contamination', async () => {
    const ceApp = createCeApp({
      nodeEnv: 'test',
      serviceName: 'conversation-engine',
      port: 3002,
      conversationStateMachineEnabled: true
    });

    const callIds = ['iso-A', 'iso-B', 'iso-C'];
    const locations = ['Austin', 'Denver', 'Seattle'];

    await Promise.all(
      callIds.map((id, i) =>
        request(ceApp)
          .post('/api/session')
          .set('content-type', 'application/json')
          .send({ session_id: id, intent: 'collect_requirements', entities: { location: locations[i] } })
      )
    );

    const results = await Promise.all(callIds.map((id) => request(ceApp).get(`/api/session/${id}`)));

    results.forEach((res, i) => {
      expect(res.status).toBe(200);
      expect(res.body.data.session.entities.location).toBe(locations[i]);
    });

    expect(results[0].body.data.session.entities.location).not.toBe(locations[1]);
    expect(results[1].body.data.session.entities.location).not.toBe(locations[2]);
  });
});

// =============================================================================
// Suite 5 — NLP service standalone (real in-process classify + extract)
// =============================================================================
describe('E2E: NLP service standalone validation', () => {
  let nlpApp;

  beforeAll(() => {
    nlpApp = createNlpApp({ nodeEnv: 'test', serviceName: 'nlp-intent-service', port: 3005, nlpProvider: 'regex' });
  });

  test('classifies intent from natural language text', async () => {
    const res = await request(nlpApp)
      .post('/api/classify-intent')
      .set('content-type', 'application/json')
      .send({ text: 'I want to schedule a property viewing next week' });

    expect(res.status).toBe(200);
    expect(res.body.data.intent).toBeDefined();
    expect(typeof res.body.data.confidence).toBe('number');
  });

  test('extracts real-estate entities from a rich caller utterance', async () => {
    const res = await request(nlpApp)
      .post('/api/extract-entities')
      .set('content-type', 'application/json')
      .send({ text: 'Looking for a studio apartment in Austin budget 2000 a month' });

    expect(res.status).toBe(200);
    const { entities } = res.body.data;
    expect(entities).toBeDefined();
    // At least location and budget should be extracted
    expect(entities.location).toMatch(/austin/i);
    expect(entities.budget).toBeDefined();
  });

  test('rejects empty text with 400 validation error', async () => {
    const res = await request(nlpApp)
      .post('/api/classify-intent')
      .set('content-type', 'application/json')
      .send({ text: '' });

    expect(res.status).toBe(400);
  });
});

// =============================================================================
// Suite 6 — Calendar service with injected mock client
// =============================================================================
describe('E2E: calendar service with mock calendar client', () => {
  let calApp;
  let mockCalendarClient;

  beforeAll(() => {
    mockCalendarClient = {
      listEvents: jest.fn(async () => []),
      createEvent: jest.fn(async (details) => ({
        id: 'cal-evt-001',
        htmlLink: 'https://calendar.google.com/event?id=cal-evt-001',
        summary: details.summary,
        start: { dateTime: details.startDateTime },
        end: { dateTime: details.endDateTime }
      }))
    };

    calApp = createCalendarApp({
      nodeEnv: 'test',
      serviceName: 'calendar-service',
      port: 3003,
      googleCalendarEnabled: false,
      googleCalendarId: 'primary',
      calendarTimeZone: 'UTC'
    });
    calApp.locals.calendarClient = mockCalendarClient;
  });

  afterEach(() => {
    mockCalendarClient.listEvents.mockClear();
    mockCalendarClient.createEvent.mockClear();
  });

  test('GET /api/bookings/availability returns free slots (empty calendar)', async () => {
    const res = await request(calApp).get('/api/bookings/availability');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data.available_slots)).toBe(true);
    expect(res.body.data.available_slots.length).toBeGreaterThanOrEqual(1);
    expect(mockCalendarClient.listEvents).toHaveBeenCalledTimes(1);
  });

  test('POST /api/bookings creates an event via mock calendar client', async () => {
    const start = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
    const end = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000 + 60 * 60 * 1000).toISOString();

    const res = await request(calApp)
      .post('/api/bookings')
      .set('content-type', 'application/json')
      .send({
        session_id: 'cal-test-session',
        summary: 'Property Viewing — Austin Apartment',
        start_datetime: start,
        end_datetime: end,
        time_zone: 'UTC'
      });

    // ok() uses status 200 by default (route doesn't pass a custom status)
    expect(res.status).toBe(200);
    expect(mockCalendarClient.createEvent).toHaveBeenCalledTimes(1);
    expect(res.body.data.booking.event_id).toBe('cal-evt-001');
  });
});
