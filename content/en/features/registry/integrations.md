---
title: "API, webhooks and CI"
description: "How to connect CRANE to automation: a REST API, signed webhooks, exchanging a CI token for a short-lived one, GitLab CI templates and an A2A agent."
audience: [platform, developer]
genre: explanation
state: target
status: available
weight: 80
terms: [principal, ocsf, siem, provenance, sbom, step-up]
---

CRANE is open to automation by four paths: a REST API described by OpenAPI, signed webhooks, the exchange of a CI token for a short-lived credential, and the A2A protocol for external agents. All of them act on behalf of a {{< term "principal" >}} and go through the same authorization as the console.

The main principle of the integrations: a secret that does not exist cannot be stolen. For this reason CRANE prefers exchanging a platform token over a long-lived password for CI. This page describes each path and how the token exchange works. Identity setup in the current deployment is described in {{< xref "configure/identity" >}}.

## REST API {#api}

The API is served under the `/api/v1` prefix and described by an OpenAPI 3.1 specification. The console, the CLI and external scripts call this API.

- **Versioning.** The major version is part of the path. Deprecation is announced with the `Sunset` header at least 6 months ahead.
- **Errors.** Errors use the `application/problem+json` format ({{< cite "rfc-9457" >}}) with the fields `rule_id`, `request_id` and `remediation`. Every response carries the `X-Request-Id` header, which gives access to diagnostics ({{< xref "features/registry/cli#diag" >}}).
- **Idempotency.** All mutating requests accept the `Idempotency-Key` header. The key is stored for 24 hours together with the request hash and applies within a principal. Responses that contain a secret are not stored: a repeat returns `409` without the secret and with a link to the resource, because a secret is shown once.
- **Lists.** Cursor pagination, filters in query parameters, partial responses through `fields`.
- **Resources.** Responses contain links to the allowed actions. A client builds its interface from them, not from its own rules ({{< xref "features/registry/console" >}}).
- **Authentication.** The console uses a cookie session. The CLI and scripts send `Authorization: Bearer` with a provider JWT or a CRANE token.

## Tokens for automation {#tokens}

Permissions are not baked into a token: every request is authorized against the current roles. The token type is visible from the prefix, so secret scanners and a SIEM can tell them apart.

| Token | Issued by | Lifetime | Presented by |
| --- | --- | --- | --- |
| `crp_` personal | CRANE, from a person's interactive IdP session | Session: 12 hours; personal long-lived: up to 90 days by policy | A developer's package managers |
| `crr_` robot | CRANE, at the decision of the team owner | A mandatory lifetime, up to 90 days; rotation with a 24-hour overlap | Services and builds without workload identity |
| `crci_` job | CRANE, in exchange for a platform token | 15 minutes by default, 5 minutes with a write scope, at most an hour and not longer than the job | GitLab CI, Kubernetes, service accounts |

`crp_` and `crr_` tokens are issued only by a person in their own interactive IdP session; a `crci_` token is issued only by exchange. A CRANE token and a service account JWT issue nothing. A new token cannot be wider than the permissions of its issuer. More about the issuance rules, encryption and storage: {{< xref "features/security/secrets" >}} and {{< xref "features/security/access-control" >}}.

For systems without OIDC, a team owner creates a robot in the console: a name, a team, permissions (repositories, namespaces, actions) and a mandatory lifetime. The `crr_` token is shown once. For rotation CRANE issues a second secret in advance, both are valid for 24 hours, and then the old one is revoked. Unused robots are highlighted after 30 days and offered for revocation after 90. Creating a robot and rotating a secret require an interactive IdP session and {{< term "step-up" >}}.

## Exchanging a CI token for a short-lived token {#oidc-exchange}

A CI job presents CRANE with the token of its platform, and CRANE issues a `crci_` token for the duration of the job. No secret is stored in CI.

```mermaid {caption="Figure 1. Exchanging a platform token for a short-lived token. The trust policy defines the permissions, not the request."}
sequenceDiagram
  autonumber
  participant J as CI job
  participant C as CRANE
  participant I as Token issuer<br>(GitLab, Kubernetes, others)
  J->>C: Platform ID token (aud: crane)
  C->>I: Issuer keys (JWKS)
  C->>C: Check signature, iss, aud, exp and trust policy
  C-->>J: crci_ token with permissions from the trust policy
  J->>C: Package publication with the crci_ token
```

CRANE checks the token signature against the issuer's keys and the `iss`, `aud`, `exp` and `nbf` values, then matches the claims against a trust policy. A trust policy lists the issuer, the allowed claims (project, namespace, branch, service account name) and the permissions; projects in it are named explicitly, not by a wildcard. For GitLab, write access is available only from a protected branch or tag: merge request pipelines and forks get read-only access, and the right to publish is limited to the names in the trust policy.

The request follows {{< cite "rfc-8693" >}}: `POST /api/v1/tokens/exchange` accepts a platform token as the `subject_token` and issues only `crci_`. CRANE tokens are not accepted as a `subject_token`. The same exchange serves any trusted issuer: a Kubernetes projected ServiceAccount token, GitHub Actions, a Keycloak service account.

Every publication from CI gets {{< term "provenance" >}} from the token claims, not from what the client reported: project, commit, pipeline, job, branch and whether the branch is protected. This provenance is issued by CRANE and not signed by the build platform, so by itself it does not mean SLSA Build L2 ({{< cite "slsa" >}}); attestations from CI give that level. More: {{< xref "features/security/evidence-and-scanning" >}}.

## GitLab CI templates {#ci-templates}

For GitLab, CRANE ships ready-made CI templates. Build and publish are split into two jobs.

```yaml
# .gitlab-ci.yml
include: { project: <group>/crane-ci, file: npm.yml }

build:
  extends: .crane-npm-build        # npm ci --ignore-scripts, build; no id_tokens and no write token
publish:
  extends: .crane-npm-publish      # installs no dependencies: takes the build artifact
  needs: [build]
  id_tokens:
    CRANE_ID_TOKEN: { aud: crane }
  rules: [{ if: $CI_COMMIT_TAG }]  # protected tags only
```

The publish job exchanges the ID token for a `crci_`, writes the client configuration without the secret appearing in logs, publishes the package and attaches an {{< term "sbom" >}} in CycloneDX and the provenance.

The split is deliberate. In GitLab `id_tokens` are set per job, so the write token exists only in the publish job, where no third-party code runs. Dependencies are installed with `--ignore-scripts` (for pip, with `--only-binary :all:` where possible; cargo build scripts run in the build job without a token), and the publish job installs none. The write conditions and the contents of the provenance are described above.

## Webhooks {#webhooks}

CRANE sends events in signed webhooks. Delivery is reliable because an event is written to the outbox table in the same transaction as the change: the event appears if and only if the transaction completed.

- **Delivery.** A worker takes events in batches, creates deliveries per subscription and marks the event as processed.
- **Signature.** The header `Crane-Signature: t=<unix>,v1=HMAC-SHA256(secret, t + "." + body)` lets the receiver verify the sender. The `Crane-Event-Id` header lets the receiver discard a repeated delivery.
- **Retries.** On an error CRANE retries delivery with an exponential delay and random jitter from 10 seconds to 1 hour for 24 hours. Then the event goes to the dead-letter queue (DLQ), from where it can be retried manually in the console.
- **Secret and addresses.** The signing secret is shown once. Receiver addresses go through the check of outbound requests ({{< xref "features/security/egress-guard" >}}).

The outbox serves only external delivery (webhooks and the {{< term "siem" >}}); internal tasks go through the job queue.

### Event catalog {#events}

| Event | When |
| --- | --- |
| `version.published`, `version.promoted`, `version.blocked`, `version.deleted` | The version lifecycle |
| `security.finding.created`, `security.finding.resolved`, `security.finding.priority_changed` | New, resolved and reprioritized vulnerabilities |
| `security.advisory.emergency`, `security.emergency_block.applied`, `security.emergency_block.lifted` | Emergency mode |
| `security.vex.created`, `security.sla.breached` | A VEX statement; a breached remediation deadline |
| `feed.lagging`, `feed.recovered` | A vulnerability feed falls behind and recovers |
| `license.violation`, `license.review_required` | License policy decisions |
| `exception.expiring`, `exception.expired` | Exceptions with a TTL |
| `credential.expiring`, `credential.revoked` | Robots and tokens |
| `quota.threshold`, `upstream.unavailable` | Operations |

## SIEM and SOAR {#siem}

Security events go to a {{< term "siem" >}} in the {{< term "ocsf" >}} schema over syslog on TLS, HTTP or OTLP. Delivery follows the "at least once" principle, with a cursor per receiver and an event ID, so when the SIEM is unavailable events accumulate and are not lost. A SOAR platform receives events through webhooks and performs response actions through REST on behalf of the `soar` robot with limited permissions; all actions are idempotent and are recorded in the journal. More: {{< xref "features/security/security-journal" >}}.

## The A2A agent {#a2a}

CRANE gives external agents (organization assistants, team agents, CI bots) a conversational interface over the A2A protocol instead of a set of REST calls. The agent runs inside the `serve` role and has no storage of its own and no bypass paths: it calls the same use cases as REST.

- **Identity.** Every call is executed on behalf of a principal, and the agent's permissions are no wider than the principal's.
- **Reading.** Skills for package search, package and version cards, findings, impact analysis, decision explanation and offline readiness checks.
- **Writing.** Only reversible metadata actions: marking a version deprecated, requesting an approval, an exception with a TTL, creating a task and subscribing to a webhook. Publishing, deletion, promotion and changes to policies and roles are not performed through the agent.
- **Confirmation.** The agent prepares a plan and changes nothing until a human confirms it with a button in the console. A repeated call by the agent does not confirm the plan.

If the language models are unavailable, reading skills return structured data, and REST and the console work without the agent. The limits of AI use are described in {{< xref "features/security/ai-boundaries" >}}.

## Related pages {#related}

{{< cards "features/registry/cli" "features/security/access-control" "features/security/security-journal" "configure/identity" >}}
