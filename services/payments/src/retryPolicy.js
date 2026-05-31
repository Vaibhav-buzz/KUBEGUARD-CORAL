export async function retryWithPolicy(operation, options = {}) {
  const attempts = Math.max(1, Number(options.attempts || 3));
  const baseDelayMs = Math.max(50, Number(options.baseDelayMs || 100));
  const maxDelayMs = Math.max(baseDelayMs, Number(options.maxDelayMs || 2000));
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!isRetryable(error) || attempt === attempts) break;
      await sleep(Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1)));
    }
  }

  throw lastError;
}

function isRetryable(error) {
  return Boolean(error?.retryable || ["gateway_timeout", "rate_limited"].includes(error?.message));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

