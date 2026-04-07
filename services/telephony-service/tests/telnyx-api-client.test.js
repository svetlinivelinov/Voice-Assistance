const { createTelnyxApiClient } = require('../src/clients/telnyx-api-client');

describe('createTelnyxApiClient', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('retries on transient errors and returns success response', async () => {
    const warn = jest.fn();
    const logger = { warn };
    const config = {
      telnyxApiBaseUrl: 'https://api.telnyx.com/v2',
      telnyxApiTimeoutMs: 200,
      maxRetries: 2,
      telnyxApiKey: 'test-key'
    };

    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockRejectedValueOnce(new Error('network'))
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValue({ ok: true, status: 200 });

    const client = createTelnyxApiClient(config, logger);
    const response = await client.requestWithRetry('/calls/call-1/actions/speak', {
      method: 'POST',
      body: '{}'
    });

    expect(response.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(warn).toHaveBeenCalledTimes(2);
  });

  test('fails fast when TELNYX_API_KEY is missing', async () => {
    const client = createTelnyxApiClient(
      {
        telnyxApiBaseUrl: 'https://api.telnyx.com/v2',
        telnyxApiTimeoutMs: 200,
        maxRetries: 1,
        telnyxApiKey: ''
      },
      { warn: jest.fn() }
    );

    await expect(
      client.requestWithRetry('/calls/call-1/actions/speak', { method: 'POST', body: '{}' })
    ).rejects.toThrow('TELNYX_API_KEY is not configured');
  });
});