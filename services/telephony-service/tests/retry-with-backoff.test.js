const { retryWithBackoff } = require('../src/utils/retry-with-backoff');

describe('retryWithBackoff', () => {
  test('retries and eventually succeeds', async () => {
    let attempts = 0;

    const result = await retryWithBackoff(
      async () => {
        attempts += 1;
        if (attempts < 3) {
          throw new Error('temporary');
        }
        return 'ok';
      },
      {
        retries: 3,
        baseDelayMs: 1,
        maxDelayMs: 2
      }
    );

    expect(result).toBe('ok');
    expect(attempts).toBe(3);
  });

  test('throws after retries are exhausted', async () => {
    await expect(
      retryWithBackoff(
        async () => {
          throw new Error('permanent');
        },
        {
          retries: 1,
          baseDelayMs: 1,
          maxDelayMs: 2
        }
      )
    ).rejects.toThrow('permanent');
  });
});