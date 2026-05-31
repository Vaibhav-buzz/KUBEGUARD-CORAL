# Payments Incident Runbook

Use this during the KubeGuard hackathon demo when the payments PR is selected.

## Symptoms

- Datadog monitor tagged `service:payments` is in Alert or Warn.
- Sentry has unresolved issues for the payments flow.
- Linear has open high-priority bugs labeled `service:payments`.
- GitHub PR changes retry, idempotency, or deployment behavior.

## First Checks

1. Confirm whether the PR touches payment retry limits.
2. Check if gateway timeout errors increased after the branch was tested.
3. Inspect idempotency hit rate before approving rollout.
4. Confirm the deployment gate result in KubeGuard.

## Recommended Gate Decision

Block the deployment if the score is CRITICAL. Require payment owner review,
incident resolution, and a rollback plan before merging.

