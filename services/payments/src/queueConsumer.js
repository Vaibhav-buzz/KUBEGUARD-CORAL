import { processPayment } from "./paymentProcessor.js";
import { createLogger } from "./logger.js";

const logger = createLogger("payments-consumer");

export async function consumePaymentBatch(messages) {
  const results = [];
  for (const message of messages) {
    try {
      results.push(await processPayment(message));
    } catch (error) {
      logger.error("payment_message_failed", {
        paymentId: message.paymentId,
        reason: error.message
      });
      results.push({ paymentId: message.paymentId, status: "failed", reason: error.message });
    }
  }
  return results;
}

