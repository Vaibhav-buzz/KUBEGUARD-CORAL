# Payments Service Demo Change

This branch simulates a realistic payments deployment for the KubeGuard demo.

The change touches retry behavior, idempotency handling, queue processing,
Kubernetes rollout settings, Datadog monitor definitions, Sentry metadata, and
an incident runbook. It is intentionally broad enough to produce a visible PR
risk signal in the dashboard.

For the live demo, open a GitHub PR from this branch and add:

- `service:payments`
- `risk:critical`
- `deploy:payments`

Recommended companion live signals:

- Datadog monitor name or tag containing `payments`
- Linear high-priority issue labeled `service:payments`
- Sentry unresolved issue in the payments project

