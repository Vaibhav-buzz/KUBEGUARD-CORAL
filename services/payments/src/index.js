import { processPayment } from "./paymentProcessor.js";
import { createLogger } from "./logger.js";

const logger = createLogger("payments-api");

export async function handlePaymentRequest(request) {
  const startedAt = Date.now();
  const result = await processPayment(request);
  logger.info("payment_request_completed", {
    paymentId: request.paymentId,
    status: result.status,
    durationMs: Date.now() - startedAt
  });
  return result;
}

