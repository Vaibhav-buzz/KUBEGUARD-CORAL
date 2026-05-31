import { retryWithPolicy } from "../src/retryPolicy.js";

let attempts = 0;

const result = await retryWithPolicy(async () => {
  attempts += 1;
  if (attempts < 3) {
    const error = new Error("gateway_timeout");
    error.retryable = true;
    throw error;
  }
  return { ok: true };
}, {
  attempts: 3,
  baseDelayMs: 1,
  maxDelayMs: 2
});

if (!result.ok || attempts !== 3) {
  throw new Error("retry policy did not retry retryable gateway errors");
}

console.log("retryPolicy.test.js passed");

