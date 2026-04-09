const request = require('supertest');
const { createApp } = require('../src/app');

function makeApp(calendarClientOverride, configOverride = {}) {
  const app = createApp({
    nodeEnv: 'test',
    serviceName: 'calendar-service',
    port: 3003,
    googleCalendarEnabled: false, // drive via calendarClient override
    googleCalendarId: 'test-calendar@group.calendar.google.com',
    calendarTimeZone: 'UTC',
    calendarAlternativeRankingEnabled: false,
    ...configOverride
  });

  // Inject mock client directly after creation
  app.locals.calendarClient = calendarClientOverride;
  return app;
}

const FUTURE_START = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
FUTURE_START.setHours(10, 0, 0, 0);
const FUTURE_END = new Date(FUTURE_START.getTime() + 60 * 60 * 1000);

describe('GET /api/bookings/availability', () => {
  test('returns 503 when calendar client is not configured', async () => {
    const app = makeApp(null);

    const response = await request(app).get('/api/bookings/availability');

    expect(response.status).toBe(503);
    expect(response.body?.error?.code).toBe('INTERNAL_ERROR');
  });

  test('returns available slots from mocked calendar', async () => {
    const listEvents = jest.fn().mockResolvedValue([]); // no busy slots
    const app = makeApp({ listEvents, createEvent: jest.fn() });

    const response = await request(app).get('/api/bookings/availability');

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body?.data?.available_slots)).toBe(true);
    expect(response.body?.data?.available_slots.length).toBeGreaterThan(0);
    expect(listEvents).toHaveBeenCalledTimes(1);
  });

  test('excludes slots that conflict with existing events', async () => {
    const firstSlots = require('../src/services/availability').findAvailableSlots({
      existingEvents: [],
      timeZone: 'UTC',
      maxSlots: 1
    });
    const busy = firstSlots[0];
    const listEvents = jest.fn().mockResolvedValue([
      { start: { dateTime: busy.startDateTime }, end: { dateTime: busy.endDateTime } }
    ]);

    const app = makeApp({ listEvents, createEvent: jest.fn() });
    const response = await request(app).get('/api/bookings/availability');

    expect(response.status).toBe(200);
    const returnedStarts = response.body.data.available_slots.map((s) => s.startDateTime);
    expect(returnedStarts).not.toContain(busy.startDateTime);
  });

  test('returns 500 when calendar client throws', async () => {
    const listEvents = jest.fn().mockRejectedValue(new Error('Google API down'));
    const app = makeApp({ listEvents, createEvent: jest.fn() });

    const response = await request(app).get('/api/bookings/availability');

    expect(response.status).toBe(500);
    expect(response.body?.error?.code).toBe('INTERNAL_ERROR');
  });
});

describe('POST /api/bookings', () => {
  test('returns 503 when calendar client is not configured', async () => {
    const app = makeApp(null);

    const response = await request(app)
      .post('/api/bookings')
      .send({
        session_id: 'sess-1',
        start_datetime: FUTURE_START.toISOString(),
        end_datetime: FUTURE_END.toISOString()
      });

    expect(response.status).toBe(503);
  });

  test('returns 400 for missing required fields', async () => {
    const app = makeApp({ listEvents: jest.fn(), createEvent: jest.fn() });

    const response = await request(app)
      .post('/api/bookings')
      .send({ summary: 'Test' }); // missing session_id, start_datetime, end_datetime

    expect(response.status).toBe(400);
    expect(response.body?.error?.code).toBe('VALIDATION_ERROR');
  });

  test('returns 409 when requested slot has a conflict', async () => {
    const listEvents = jest.fn().mockResolvedValue([
      {
        start: { dateTime: FUTURE_START.toISOString() },
        end: { dateTime: FUTURE_END.toISOString() }
      }
    ]);
    const app = makeApp({ listEvents, createEvent: jest.fn() });

    const response = await request(app)
      .post('/api/bookings')
      .send({
        session_id: 'sess-conflict',
        start_datetime: FUTURE_START.toISOString(),
        end_datetime: FUTURE_END.toISOString()
      });

    expect(response.status).toBe(409);
    expect(response.body?.error?.code).toBe('BAD_REQUEST');
    expect(Array.isArray(response.body?.error?.details?.alternative_slots)).toBe(true);
    expect(response.body.error.details.alternative_slots.length).toBeGreaterThan(0);
    expect(response.body.error.details.alternative_slots.length).toBeLessThanOrEqual(3);
  });

  test('returns explainable ranking metadata for alternatives when ranking feature flag is enabled', async () => {
    const listEvents = jest.fn().mockResolvedValue([
      {
        start: { dateTime: FUTURE_START.toISOString() },
        end: { dateTime: FUTURE_END.toISOString() }
      }
    ]);
    const app = makeApp(
      { listEvents, createEvent: jest.fn() },
      { calendarAlternativeRankingEnabled: true }
    );

    const response = await request(app)
      .post('/api/bookings')
      .send({
        session_id: 'sess-conflict-ranked',
        start_datetime: FUTURE_START.toISOString(),
        end_datetime: FUTURE_END.toISOString(),
        time_zone: 'UTC'
      });

    expect(response.status).toBe(409);
    const alternatives = response.body?.error?.details?.alternative_slots || [];
    expect(alternatives.length).toBeGreaterThan(0);
    expect(alternatives[0].ranking).toEqual(
      expect.objectContaining({
        rank: 1,
        distance_minutes: expect.any(Number),
        rationale: 'Closest available slot to requested time'
      })
    );
  });

  test('creates booking and returns event details linked to session', async () => {
    const listEvents = jest.fn().mockResolvedValue([]);
    const createEvent = jest.fn().mockResolvedValue({
      id: 'event-abc-123',
      htmlLink: 'https://calendar.google.com/event?eid=abc',
      summary: 'Property Viewing',
      start: { dateTime: FUTURE_START.toISOString(), timeZone: 'UTC' },
      end: { dateTime: FUTURE_END.toISOString(), timeZone: 'UTC' }
    });

    const app = makeApp({ listEvents, createEvent });

    const response = await request(app)
      .post('/api/bookings')
      .send({
        session_id: 'sess-book-1',
        summary: 'Property Viewing',
        start_datetime: FUTURE_START.toISOString(),
        end_datetime: FUTURE_END.toISOString(),
        time_zone: 'UTC'
      });

    expect(response.status).toBe(200);
    expect(response.body?.data?.booking).toEqual(
      expect.objectContaining({
        event_id: 'event-abc-123',
        html_link: 'https://calendar.google.com/event?eid=abc',
        session_id: 'sess-book-1',
        summary: 'Property Viewing'
      })
    );

    expect(createEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'sess-book-1',
        startDateTime: FUTURE_START.toISOString(),
        endDateTime: FUTURE_END.toISOString(),
        timeZone: 'UTC'
      })
    );
  });

  test('returns cached booking for duplicate session/time request (idempotent replay)', async () => {
    const listEvents = jest.fn().mockResolvedValue([]);
    const createEvent = jest.fn().mockResolvedValue({
      id: 'event-idem-001',
      htmlLink: 'https://calendar.google.com/event?eid=idem',
      summary: 'Property Viewing',
      start: { dateTime: FUTURE_START.toISOString(), timeZone: 'UTC' },
      end: { dateTime: FUTURE_END.toISOString(), timeZone: 'UTC' }
    });

    const app = makeApp({ listEvents, createEvent });
    const payload = {
      session_id: 'sess-idem-1',
      summary: 'Property Viewing',
      start_datetime: FUTURE_START.toISOString(),
      end_datetime: FUTURE_END.toISOString(),
      time_zone: 'UTC'
    };

    const first = await request(app)
      .post('/api/bookings')
      .send(payload);

    const second = await request(app)
      .post('/api/bookings')
      .send(payload);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(createEvent).toHaveBeenCalledTimes(1);
    expect(second.body?.data?.idempotent_replay).toBe(true);
    expect(second.body?.data?.booking?.event_id).toBe('event-idem-001');
  });

  test('returns 500 when createEvent throws', async () => {
    const listEvents = jest.fn().mockResolvedValue([]);
    const createEvent = jest.fn().mockRejectedValue(new Error('Calendar API error'));
    const app = makeApp({ listEvents, createEvent });

    const response = await request(app)
      .post('/api/bookings')
      .send({
        session_id: 'sess-err',
        start_datetime: FUTURE_START.toISOString(),
        end_datetime: FUTURE_END.toISOString()
      });

    expect(response.status).toBe(500);
    expect(response.body?.error?.code).toBe('INTERNAL_ERROR');
  });
});
