export function assertPaymentIsAllowed(request) {
  if (!request.paymentId) throw new Error("payment_id_required");
  if (!request.idempotencyKey) throw new Error("idempotency_key_required");
  if (!request.currency) throw new Error("currency_required");
  if (Number(request.amount) <= 0) throw new Error("amount_must_be_positive");

  if (request.currency !== "INR" && request.amount > 250000) {
    throw new Error("manual_review_required");
  }
}

