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

  test('GET /api/recovery/metrics returns queue health and counters', async () => {
    const app = createApp(baseConfig);
    app.locals.pendingLeadQueue.enqueue({
      lead: {
        client_id: 'lead-metrics-1',
        session_id: 'lead-metrics-1',
        status: 'new'
      },
      reason: 'CRM unavailable',
      requestId: 'rid-metrics-1'
    });

    const res = await request(app).get('/api/recovery/metrics');

    expect(res.status).toBe(200);
    expect(res.body?.data?.queue_enabled).toBe(true);
    expect(res.body?.data?.metrics).toEqual(
      expect.objectContaining({
        queue_size: 1,
        stale_count: expect.any(Number),
        counters: expect.objectContaining({
          total_enqueued: 1
        })
      })
    );
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

  test('POST /api/recovery/pending-leads/cleanup prunes stale entries', async () => {
    const app = createApp(baseConfig);

    app.locals.pendingLeadQueue.enqueue({
      lead: {
        client_id: 'lead-clean-fresh',
        session_id: 'lead-clean-fresh',
        status: 'new'
      },
      reason: 'CRM unavailable',
      requestId: 'rid-clean-fresh'
    });

    app.locals.pendingLeadQueue.enqueue({
      lead: {
        client_id: 'lead-clean-stale',
        session_id: 'lead-clean-stale',
        status: 'new'
      },
      reason: 'CRM unavailable',
      requestId: 'rid-clean-stale'
    });

    const stale = app.locals.pendingLeadQueue.list().find((item) => item.lead.client_id === 'lead-clean-stale');
    stale.updatedAt = '2020-01-01T00:00:00.000Z';

    const res = await request(app)
      .post('/api/recovery/pending-leads/cleanup')
      .send({ max_age_hours: 1 });

    expect(res.status).toBe(200);
    expect(res.body?.data?.removed_count).toBe(1);
    expect(res.body?.data?.remaining_count).toBe(1);
  });

  test('POST /api/recovery/pending-leads/cleanup returns 400 for invalid payload', async () => {
    const app = createApp(baseConfig);

    const res = await request(app)
      .post('/api/recovery/pending-leads/cleanup')
      .send({ max_age_hours: 0 });

    expect(res.status).toBe(400);
    expect(res.body?.error?.code).toBe('VALIDATION_ERROR');
  });
});
