function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function retryWithBackoff(task, options = {}) {
  const retries = options.retries ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 200;
  const maxDelayMs = options.maxDelayMs ?? 2000;
  const shouldRetry = options.shouldRetry || (() => true);
  const onRetry = options.onRetry || (() => {});

  let attempt = 0;
  // retries means additional attempts after the first one.
  const maxAttempts = retries + 1;

  while (attempt < maxAttempts) {
    try {
      return await task();
    } catch (error) {
      attempt += 1;

      if (attempt >= maxAttempts || !shouldRetry(error)) {
        throw error;
      }

      const delay = Math.min(baseDelayMs * (2 ** (attempt - 1)), maxDelayMs);
      onRetry({ attempt, delay, error });
      await wait(delay);
    }
  }

  throw new Error('retryWithBackoff reached an unreachable state');
}

module.exports = {
  retryWithBackoff
};