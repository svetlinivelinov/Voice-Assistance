jest.mock('node-fetch', () => jest.fn());

const { createNlpServiceClient } = require('../src/clients/nlp-service-client');

const makeConfig = (overrides = {}) => ({
  nlpServiceEnabled: true,
  nlpServiceBaseUrl: 'http://localhost:3005',
  nlpServiceTimeoutMs: 3000,
  maxRetries: 0,
  ...overrides
});

const makeLogger = () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn()
});

function mockFetch(responseJson, status = 200) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => responseJson
  });
}

afterEach(() => {
  jest.resetAllMocks();
});

describe('createNlpServiceClient', () => {
  test('returns null when nlpServiceEnabled is false', () => {
    const client = createNlpServiceClient(makeConfig({ nlpServiceEnabled: false }), makeLogger());
    expect(client).toBeNull();
  });

  test('returns null when nlpServiceBaseUrl is empty', () => {
    const client = createNlpServiceClient(makeConfig({ nlpServiceBaseUrl: '' }), makeLogger());
    expect(client).toBeNull();
  });

  test('returns client object with classifyIntent and extractEntities', () => {
    const client = createNlpServiceClient(makeConfig(), makeLogger());
    expect(client).not.toBeNull();
    expect(typeof client.classifyIntent).toBe('function');
    expect(typeof client.extractEntities).toBe('function');
  });
});

describe('nlpClient.classifyIntent', () => {
  test('POST to /api/classify-intent and returns data', async () => {
    const serviceResponse = {
      data: { intent: 'book_viewing', confidence: 0.8, alternatives: [] }
    };
    mockFetch(serviceResponse);

    const client = createNlpServiceClient(makeConfig(), makeLogger());
    const result = await client.classifyIntent('I want to book a viewing');

    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:3005/api/classify-intent',
      expect.objectContaining({ method: 'POST' })
    );
    expect(result.intent).toBe('book_viewing');
    expect(result.confidence).toBe(0.8);
  });

  test('returns fallback on missing data field', async () => {
    mockFetch({ ok: true });

    const client = createNlpServiceClient(makeConfig(), makeLogger());
    const result = await client.classifyIntent('hello');

    expect(result).toEqual({ intent: 'unknown', confidence: 0, alternatives: [] });
  });

  test('throws when NLP service returns non-2xx', async () => {
    mockFetch({}, 500);

    const client = createNlpServiceClient(makeConfig(), makeLogger());
    await expect(client.classifyIntent('test')).rejects.toThrow(/500/);
  });
});

describe('nlpClient.extractEntities', () => {
  test('POST to /api/extract-entities and returns entities', async () => {
    const serviceResponse = {
      data: { entities: { property_type: 'apartment', budget: '200000' }, provider: 'regex' }
    };
    mockFetch(serviceResponse);

    const client = createNlpServiceClient(makeConfig(), makeLogger());
    const result = await client.extractEntities('I need a 2-bedroom apartment budget 200000');

    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:3005/api/extract-entities',
      expect.objectContaining({ method: 'POST' })
    );
    expect(result.property_type).toBe('apartment');
    expect(result.budget).toBe('200000');
  });

  test('returns empty object on missing entities field', async () => {
    mockFetch({ data: {} });

    const client = createNlpServiceClient(makeConfig(), makeLogger());
    const result = await client.extractEntities('hello');

    expect(result).toEqual({});
  });

  test('throws when NLP service returns non-2xx', async () => {
    mockFetch({}, 503);

    const client = createNlpServiceClient(makeConfig(), makeLogger());
    await expect(client.extractEntities('test')).rejects.toThrow(/503/);
  });
});
