import { chargeGateway } from "./paymentGateway.js";
import { getIdempotencyRecord, saveIdempotencyRecord } from "./idempotencyStore.js";
import { retryWithPolicy } from "./retryPolicy.js";
import { recordPaymentMetric } from "./metrics.js";
import { assertPaymentIsAllowed } from "./riskGuards.js";

export async function processPayment(request) {
  assertPaymentIsAllowed(request);

  const existing = await getIdempotencyRecord(request.idempotencyKey);
  if (existing) {
    recordPaymentMetric("payments.idempotency.hit", 1, request.service);
    return existing;
  }

  const response = await retryWithPolicy(() => chargeGateway(request), {
    attempts: request.retryAttempts ?? 5,
    baseDelayMs: request.baseDelayMs ?? 250,
    maxDelayMs: request.maxDelayMs ?? 5000
  });

  const result = {
    paymentId: request.paymentId,
    status: response.approved ? "approved" : "declined",
    gatewayReference: response.gatewayReference,
    amount: request.amount,
    currency: request.currency
  };

  await saveIdempotencyRecord(request.idempotencyKey, result);
  recordPaymentMetric("payments.charge.completed", 1, request.service);
  return result;
}

