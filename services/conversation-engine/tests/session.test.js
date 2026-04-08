const request = require('supertest');
const { createApp } = require('../src/app');

describe('conversation-engine session routes', () => {
  const baseConfig = {
    nodeEnv: 'test',
    serviceName: 'conversation-engine',
    port: 3002,
    conversationStateMachineEnabled: true
  };

  test('POST /api/session returns 400 for invalid payload', async () => {
    const app = createApp(baseConfig);

    const response = await request(app)
      .post('/api/session')
      .send({ intent: 'collect_requirements' });

    expect(response.status).toBe(400);
    expect(response.body).toEqual(
      expect.objectContaining({
        error: expect.objectContaining({
          code: 'VALIDATION_ERROR',
          message: 'Invalid session payload'
        })
      })
    );
  });

  test('POST /api/session tracks missing fields and prompts for next slot', async () => {
    const app = createApp(baseConfig);

    const response = await request(app)
      .post('/api/session')
      .send({
        session_id: 'session-001',
        intent: 'collect_requirements',
        entities: {
          name: 'Jane Doe'
        }
      });

    expect(response.status).toBe(200);
    expect(response.body?.data?.session).toEqual(
      expect.objectContaining({
        session_id: 'session-001',
        step: 'collect_phone',
        intent: 'collect_requirements',
        missing_fields: expect.arrayContaining([
          'phone',
          'budget',
          'location',
          'property_type',
          'move_in_date',
          'viewing_date'
        ]),
        entities: expect.objectContaining({
          name: 'Jane Doe'
        })
      })
    );
    expect(response.body?.data?.reply_text).toBe('What is the best phone number to reach you?');
  });

  test('POST /api/session merges entities and reaches completed state', async () => {
    const app = createApp(baseConfig);

    await request(app)
      .post('/api/session')
      .send({
        session_id: 'session-002',
        entities: {
          name: 'John Smith',
          phone: '+15551234567'
        }
      });

    const completionResponse = await request(app)
      .post('/api/session')
      .send({
        session_id: 'session-002',
        entities: {
          budget: '1500-2000',
          location: 'Downtown',
          property_type: 'apartment',
          move_in_date: '2026-05-01',
          viewing_date: '2026-04-15'
        }
      });

    expect(completionResponse.status).toBe(200);
    expect(completionResponse.body?.data?.session).toEqual(
      expect.objectContaining({
        session_id: 'session-002',
        step: 'completed',
        intent: 'schedule_viewing',
        missing_fields: [],
        entities: expect.objectContaining({
          name: 'John Smith',
          phone: '+15551234567',
          budget: '1500-2000',
          location: 'Downtown',
          property_type: 'apartment',
          move_in_date: '2026-05-01',
          viewing_date: '2026-04-15'
        })
      })
    );
    expect(completionResponse.body?.data?.reply_text).toBe(
      'Great, I have all required details. I can proceed to scheduling options.'
    );

    const readResponse = await request(app).get('/api/session/session-002');
    expect(readResponse.status).toBe(200);
    expect(readResponse.body?.data?.session?.step).toBe('completed');
  });

  test('POST /api/session returns 403 when feature flag is disabled', async () => {
    const app = createApp({
      ...baseConfig,
      conversationStateMachineEnabled: false
    });

    const response = await request(app)
      .post('/api/session')
      .send({ session_id: 'session-disabled' });

    expect(response.status).toBe(403);
    expect(response.body?.error?.code).toBe('FORBIDDEN');
  });
});
