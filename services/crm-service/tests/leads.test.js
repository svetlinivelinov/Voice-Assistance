'use strict';

const request = require('supertest');
const { createApp } = require('../src/app');

function makeApp(sheetsClient = null) {
  const app = createApp({
    nodeEnv: 'test',
    serviceName: 'crm-service',
    port: 3004,
    googleSheetsEnabled: Boolean(sheetsClient)
  });

  // Inject a mock client directly so no Google API calls are made
  app.locals.sheetsClient = sheetsClient;
  return app;
}

// ─── helper: minimal fake sheetsClient ──────────────────────────────────────

function makeSheets(store = {}) {
  return {
    getLead: jest.fn(({ clientId, phone }) => {
      const hit = Object.values(store).find(
        (r) => (clientId && r.client_id === clientId) || (phone && r.phone === phone)
      );
      return Promise.resolve(hit || null);
    }),
    upsertLead: jest.fn(async (lead) => {
      const key = lead.phone || lead.client_id;
      const existing = store[key];
      if (existing) {
        Object.assign(existing, lead, { updated_at: new Date().toISOString() });
        return { action: 'updated', lead: existing };
      }

      const row = { ...lead, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
      store[key] = row;
      return { action: 'created', lead: row };
    })
  };
}

// ─── POST /api/leads ─────────────────────────────────────────────────────────

describe('POST /api/leads', () => {
  it('returns 503 when sheets client not configured', async () => {
    const app = makeApp(null);
    const res = await request(app).post('/api/leads').send({ name: 'Alice' });
    expect(res.status).toBe(503);
  });

  it('returns 400 for an empty body', async () => {
    const app = makeApp(makeSheets());
    const res = await request(app).post('/api/leads').send({});
    expect(res.status).toBe(400);
  });

  it('creates a new lead (201)', async () => {
    const app = makeApp(makeSheets());
    const res = await request(app)
      .post('/api/leads')
      .send({ name: 'Alice', phone: '+1-555-100-0001' });

    expect(res.status).toBe(201);
    expect(res.body.data.action).toBe('created');
    expect(res.body.data.lead.name).toBe('Alice');
  });

  it('auto-generates client_id when not provided', async () => {
    const app = makeApp(makeSheets());
    const res = await request(app)
      .post('/api/leads')
      .send({ name: 'Bob', phone: '+1-555-100-0002' });

    expect(res.status).toBe(201);
    expect(res.body.data.lead.client_id).toBeTruthy();
  });

  it('sets status to "qualified" when budget + location provided', async () => {
    const app = makeApp(makeSheets());
    const res = await request(app)
      .post('/api/leads')
      .send({ name: 'Carol', phone: '+1-555-100-0003', budget: 500000, location: 'Brooklyn' });

    expect(res.status).toBe(201);
    expect(res.body.data.lead.status).toBe('qualified');
  });

  it('sets status to "scheduled" when viewing_date provided', async () => {
    const app = makeApp(makeSheets());
    const res = await request(app)
      .post('/api/leads')
      .send({ name: 'Dave', phone: '+1-555-100-0004', viewing_date: '2025-08-20' });

    expect(res.status).toBe(201);
    expect(res.body.data.lead.status).toBe('scheduled');
  });

  it('updates an existing lead (200)', async () => {
    const store = {
      '+1-555-200-0001': {
        client_id: 'client-abc',
        name: 'Eve',
        phone: '+1-555-200-0001',
        status: 'new',
        created_at: new Date().toISOString()
      }
    };
    const app = makeApp(makeSheets(store));
    const res = await request(app)
      .post('/api/leads')
      .send({ phone: '+1-555-200-0001', notes: 'Prefers top floor' });

    expect(res.status).toBe(200);
    expect(res.body.data.action).toBe('updated');
    expect(res.body.data.lead.notes).toBe('Prefers top floor');
  });

  it('returns X-Request-Id header', async () => {
    const app = makeApp(makeSheets());
    const res = await request(app)
      .post('/api/leads')
      .send({ name: 'Frank', phone: '+1-555-100-0005' });

    expect(res.headers['x-request-id']).toBeTruthy();
  });
});

// ─── GET /api/leads/:clientIdOrPhone ─────────────────────────────────────────

describe('GET /api/leads/:clientIdOrPhone', () => {
  it('returns 503 when sheets client not configured', async () => {
    const app = makeApp(null);
    const res = await request(app).get('/api/leads/client-xyz');
    expect(res.status).toBe(503);
  });

  it('returns 404 for unknown client_id', async () => {
    const app = makeApp(makeSheets());
    const res = await request(app).get('/api/leads/does-not-exist');
    expect(res.status).toBe(404);
  });

  it('retrieves lead by client_id', async () => {
    const store = {
      '+1-555-300-0001': {
        client_id: 'client-def',
        name: 'Grace',
        phone: '+1-555-300-0001',
        status: 'new'
      }
    };
    const app = makeApp(makeSheets(store));
    const res = await request(app).get('/api/leads/client-def');

    expect(res.status).toBe(200);
    expect(res.body.data.lead.name).toBe('Grace');
  });

  it('retrieves lead by phone number', async () => {
    const store = {
      '+15553000002': {
        client_id: 'client-ghi',
        name: 'Henry',
        phone: '+15553000002',
        status: 'new'
      }
    };
    const app = makeApp(makeSheets(store));
    const res = await request(app).get('/api/leads/%2B15553000002');

    expect(res.status).toBe(200);
    expect(res.body.data.lead.name).toBe('Henry');
  });
});
