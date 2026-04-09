const request = require('supertest');
const { createApp } = require('../src/app');

describe('telephony-service CRM recovery queue routes', () => {
  const baseConfig = {
    nodeEnv: 'test',
    serviceName: 'telephony-service',
    port: 3001,
    crmRecoveryQueueEnabled: true
  };

  test('GET /api/recovery/pending-leads returns queue snapshot', async () => {
    const app = createApp(baseConfig);
    app.locals.pendingLeadQueue.enqueue({
      lead: {
        client_id: 'lead-1',
        session_id: 'lead-1',
        status: 'new'
      },
      reason: 'CRM unavailable',
      requestId: 'rid-1'
    });

    const res = await request(app).get('/api/recovery/pending-leads');

    expect(res.status).toBe(200);
    expect(res.body?.data?.count).toBe(1);
    expect(Array.isArray(res.body?.data?.pending_leads)).toBe(true);
    expect(res.body?.data?.pending_leads[0]?.lead?.client_id).toBe('lead-1');
  });

  test('POST /api/recovery/pending-leads/replay replays queued leads and clears successful items', async () => {
    const app = createApp(baseConfig);
    app.locals.pendingLeadQueue.enqueue({
      lead: {
        client_id: 'lead-2',
        session_id: 'lead-2',
        status: 'new'
      },
      reason: 'CRM unavailable',
      requestId: 'rid-2'
    });

    const crmUpsertLead = jest.fn().mockResolvedValue({ action: 'updated' });
    app.locals.crmClient = { upsertLead: crmUpsertLead };

    const res = await request(app)
      .post('/api/recovery/pending-leads/replay')
      .send({ max_items: 5 });

    expect(res.status).toBe(200);
    expect(res.body?.data?.replayed_count).toBe(1);
    expect(res.body?.data?.failed_count).toBe(0);
    expect(res.body?.data?.remaining_count).toBe(0);
    expect(crmUpsertLead).toHaveBeenCalledTimes(1);
  });

  test('POST /api/recovery/pending-leads/replay returns 403 when queue feature flag disabled', async () => {
    const app = createApp({
      ...baseConfig,
      crmRecoveryQueueEnabled: false
    });

    const res = await request(app)
      .post('/api/recovery/pending-leads/replay')
      .send({ max_items: 1 });

    expect(res.status).toBe(403);
    expect(res.body?.error?.code).toBe('FORBIDDEN');
  });
});
