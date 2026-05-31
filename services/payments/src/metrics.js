const metrics = [];

export function recordPaymentMetric(name, value, service = "payments") {
  metrics.push({
    name,
    value,
    tags: [`service:${service}`, "team:checkout"],
    timestamp: new Date().toISOString()
  });
}

export function recentMetrics() {
  return metrics.slice(-100);
}

