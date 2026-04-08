const request = require('supertest');
const { createApp } = require('../src/app');

const testConfig = {
  nodeEnv: 'test',
  serviceName: 'nlp-intent-service',
  port: 3005,
  nlpProvider: 'regex'
};

describe('POST /api/classify-intent', () => {
  const app = createApp(testConfig);

  test('returns 400 when text is missing', async () => {
    const res = await request(app).post('/api/classify-intent').send({});
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('returns 400 when text is empty string', async () => {
    const res = await request(app).post('/api/classify-intent').send({ text: '   ' });
    expect(res.status).toBe(400);
  });

  test('classifies book_viewing intent', async () => {
    const res = await request(app)
      .post('/api/classify-intent')
      .send({ text: 'I would like to schedule a viewing for the apartment' });

    expect(res.status).toBe(200);
    expect(res.body.data.intent).toBe('book_viewing');
    expect(res.body.data.confidence).toBeGreaterThan(0.1);
    expect(res.body.data.alternatives).toBeInstanceOf(Array);
    expect(res.body.data.provider).toBe('regex');
  });

  test('classifies confirm intent', async () => {
    const res = await request(app)
      .post('/api/classify-intent')
      .send({ text: 'yes, that is correct' });

    expect(res.status).toBe(200);
    expect(res.body.data.intent).toBe('confirm');
    expect(res.body.data.confidence).toBeGreaterThan(0.1);
  });

  test('classifies deny intent', async () => {
    const res = await request(app)
      .post('/api/classify-intent')
      .send({ text: 'no, cancel that please' });

    expect(res.status).toBe(200);
    expect(res.body.data.intent).toBe('deny');
  });

  test('classifies goodbye intent', async () => {
    const res = await request(app)
      .post('/api/classify-intent')
      .send({ text: 'goodbye, thank you very much' });

    expect(res.status).toBe(200);
    expect(res.body.data.intent).toBe('goodbye');
  });

  test('classifies provide_budget intent', async () => {
    const res = await request(app)
      .post('/api/classify-intent')
      .send({ text: 'my budget is around 500000' });

    expect(res.status).toBe(200);
    expect(res.body.data.intent).toBe('provide_budget');
  });

  test('classifies provide_property_type intent', async () => {
    const res = await request(app)
      .post('/api/classify-intent')
      .send({ text: 'I am looking for a two-bedroom apartment' });

    expect(res.status).toBe(200);
    expect(res.body.data.intent).toBe('provide_property_type');
  });

  test('returns unknown for unrecognised text', async () => {
    const res = await request(app)
      .post('/api/classify-intent')
      .send({ text: 'xyzzy frobnicate wibble' });

    expect(res.status).toBe(200);
    expect(res.body.data.intent).toBe('unknown');
    expect(res.body.data.confidence).toBe(0);
  });

  test('includes requestId in response', async () => {
    const res = await request(app)
      .post('/api/classify-intent')
      .send({ text: 'book a viewing' });

    expect(res.status).toBe(200);
    expect(res.body.data.requestId).toBeTruthy();
    expect(res.headers['x-request-id']).toBeTruthy();
  });
});
