export async function chargeGateway(request) {
  if (!request.gatewayUrl) {
    throw new Error("gateway_url_missing");
  }

  if (request.forceGatewayTimeout) {
    const error = new Error("gateway_timeout");
    error.retryable = true;
    throw error;
  }

  return {
    approved: request.amount < 500000,
    gatewayReference: `gw_${request.paymentId}_${Date.now()}`
  };
}

