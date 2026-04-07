const request = require('supertest');
const { createApp } = require('../src/app');

describe('nlp-intent-service health endpoints', () => {
  const app = createApp({
    nodeEnv: 'test',
    serviceName: 'nlp-intent-service',
    port: 3005
  });

  test('GET /health returns status 200 and expected shape', async () => {
    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'ok',
          service: 'nlp-intent-service',
          requestId: expect.any(String)
        })
      })
    );
    expect(response.headers['x-request-id']).toBeTruthy();
  });

  test('GET /ready returns status 200 and expected shape', async () => {
    const response = await request(app).get('/ready');

    expect(response.status).toBe(200);
    expect(response.body).toEqual(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'ready',
          service: 'nlp-intent-service',
          requestId: expect.any(String)
        })
      })
    );
    expect(response.headers['x-request-id']).toBeTruthy();
  });
});
