const request = require('supertest');
const { createApp } = require('../src/app');

const testConfig = {
  nodeEnv: 'test',
  serviceName: 'nlp-intent-service',
  port: 3005,
  nlpProvider: 'regex'
};

describe('POST /api/extract-entities', () => {
  const app = createApp(testConfig);

  test('returns 400 when text is missing', async () => {
    const res = await request(app).post('/api/extract-entities').send({});
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('returns 400 when text is empty string', async () => {
    const res = await request(app).post('/api/extract-entities').send({ text: '' });
    expect(res.status).toBe(400);
  });

  test('extracts property_type from text', async () => {
    const res = await request(app)
      .post('/api/extract-entities')
      .send({ text: 'I am looking for a studio apartment' });

    expect(res.status).toBe(200);
    expect(res.body.data.entities.property_type).toBe('studio');
  });

  test('extracts budget from text', async () => {
    const res = await request(app)
      .post('/api/extract-entities')
      .send({ text: 'my budget is around 350000' });

    expect(res.status).toBe(200);
    expect(res.body.data.entities.budget).toBeTruthy();
    expect(res.body.data.entities.budget).toContain('350000');
  });

  test('extracts phone from text', async () => {
    const res = await request(app)
      .post('/api/extract-entities')
      .send({ text: 'my number is +359 888 123 456' });

    expect(res.status).toBe(200);
    expect(res.body.data.entities.phone).toBeTruthy();
  });

  test('extracts name from text', async () => {
    const res = await request(app)
      .post('/api/extract-entities')
      .send({ text: 'my name is John Smith' });

    expect(res.status).toBe(200);
    expect(res.body.data.entities.name).toBe('John Smith');
  });

  test('extracts move_in_date from text', async () => {
    const res = await request(app)
      .post('/api/extract-entities')
      .send({ text: 'I want to move in June 2025' });

    expect(res.status).toBe(200);
    expect(res.body.data.entities.move_in_date).toMatch(/june/i);
  });

  test('extracts multiple entities from one utterance', async () => {
    const res = await request(app)
      .post('/api/extract-entities')
      .send({
        text: 'My name is Maria, budget around 200000, looking for an apartment in June'
      });

    expect(res.status).toBe(200);
    const { entities } = res.body.data;
    expect(entities.name).toBeTruthy();
    expect(entities.budget).toBeTruthy();
    expect(entities.property_type).toBe('apartment');
    expect(entities.move_in_date).toBeTruthy();
  });

  test('returns empty entities for unrecognised text', async () => {
    const res = await request(app)
      .post('/api/extract-entities')
      .send({ text: 'something completely unrelated' });

    expect(res.status).toBe(200);
    expect(res.body.data.entities).toEqual({});
  });

  test('includes provider and requestId', async () => {
    const res = await request(app)
      .post('/api/extract-entities')
      .send({ text: 'looking for a house' });

    expect(res.status).toBe(200);
    expect(res.body.data.provider).toBe('regex');
    expect(res.body.data.requestId).toBeTruthy();
  });
});
