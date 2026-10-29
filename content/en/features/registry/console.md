---
title: "Web console and role desks"
description: "The CRANE web console is built into the binary and gives each role its own desk: search, versions, tokens, platform overview, journal and system states."
audience: [developer, security]
genre: explanation
state: target
status: available
weight: 60
terms: [step-up, upstream]
---

The CRANE web console is a single-page application built into the binary: no separate web server is needed. Each role starts at its own desk, where its tasks are gathered: a developer searches for a package and copies the install command, a platform administrator looks at the state of storage and queues, a security engineer works with the action journal.

The console works through the same API as scripts do, and it draws an action only when the API returned a link for it: no link, no button. A button is shown disabled with an explanation only where the API states the reason for the denial. More about the API: {{< xref "features/registry/integrations#api" >}}.

## Role desks {#desks}

| Role | Main screen | One-click actions |
| --- | --- | --- |
| Developer | Search, favorites, recent; a package card with the install command for the selected client | Copy the command, see the replacement for a deprecated package |
| Library owner | My packages: versions, health, consumers, open risks | Deprecate, assign a replacement, request approval |
| CI/CD engineer | Robots, trust policies, recent publications from CI, errors | Create a trust policy, get a CI template |
| Platform administrator | Storage and storage classes, volume by team, cache hits, upstreams, queues | Retention dry run, cache warm-up, integrity check |
| AppSec | A queue of findings with priorities and scores, SLA, emergency blocks, feed state, licenses for review | Confirm an emergency block, accept a VEX, grant an exception with a TTL, create tasks |
| SecOps | The action journal: search, masked data, disclosure with a justification, export, integrity check; SIEM events, separation-of-duties violations | Disclose event data, export a range, revoke a token |
| Auditor | The action journal, read-only with masked data, compliance reports | Generate a report |
| Any user | "My tokens" and "My actions" | Revoke a token, view your own history |
| Manager | Ownership, team access, risks, resource consumption | — |

The permissions of the roles and the separation of duties are described in {{< xref "features/security/access-control" >}}.

## Screens {#screens}

### Search {#s-search}

{{< screenshot story="S1Search" variant="DesktopLight" alt="The search screen: a query field, format segments with counters, repository and team filters and a list of package cards" >}}

The search screen is the developer's main screen. Results appear as you type, with counters by format and team beside them. If assistants are unavailable, the screen says that search works without semantics. How ranking works is described in {{< xref "features/registry/search" >}}.

### Package card {#s-package}

{{< screenshot story="S2Package" variant="DesktopLight" alt="A package card: a header with the status and format, key figures, tabs and an install block with the command for the selected client" >}}

The card gathers everything about a package: the description, the install command for the selected client, the latest versions, the provenance of the latest version (from CI claims) and open risks. For a proxy repository the card shows a warning if the {{< term "upstream" >}} is unavailable and the data come from a stale copy ({{< xref "features/registry/proxy-cache#stale" >}}).

### Package versions {#s-versions}

{{< screenshot story="S3Versions" variant="Desktop1440Sheet" alt="A table of package versions with the state and reason, and an open side panel of the selected version with a summary, files and history" >}}

The table shows the state of each version and the reason for a block. The side panel of the selected version holds the summary (PURL, SHA-256, size), the files with checksums, the history and the metadata. The yank and unyank buttons appear only if the API returned the matching links, and the hint explains what yank means in the package format ({{< xref "features/security/immutable-versions#formats" >}}).

### My tokens {#s-tokens}

{{< screenshot story="S5Tokens" variant="DesktopLight" alt="A list of the user's tokens: type, prefix, permissions, expiry, last use and a revoke button" >}}

Each user sees their own tokens and can revoke any of them. The secret of a new token is shown once in a separate dialog and is not kept on the page. The table warns about tokens that expire soon or have not been used for a long time. Tokens are described in {{< xref "features/security/secrets" >}}.

### Platform overview {#s-platform}

{{< screenshot story="S6Platform" variant="Desktop1440" alt="The platform overview: tiles with storage volume, cache hit rate, upstream availability and the job queue, latency charts and component state" >}}

The platform administrator's screen shows storage volume, cache hit rate, upstream availability, the length of the job queue, component state and latencies against the target SLO. Quick actions start a retention dry run, cache warm-up from a lockfile and an integrity check. Dead jobs can be retried one at a time. Component state matches the data described in {{< xref "features/operations/observability" >}}.

### Action journal {#s-journal}

{{< screenshot story="S9Journal" variant="Desktop1440" alt="The action journal: tiles with the event count and chain state, filters, an event table and a panel of the selected event" >}}

SecOps sees the whole action journal screen, the auditor sees it read-only with masked data, and AppSec sees only their own decisions. SecOps verifies the integrity of the chain and discloses event data with a justification and {{< term "step-up" >}}; export also requires step-up. Every view of the journal is recorded in the journal itself. Details: {{< xref "features/security/security-journal" >}}.

### System states {#s-states}

{{< screenshot story="S10States" variant="Forbidden" alt="The access denied page: the rule that fired, the request ID, a hint on how to fix it and a contact" >}}

The console shows loading, empty states and errors in a uniform way. An API error is rendered by a single component, with the request ID and a hint on how to fix it. A denial shows the rule that fired and a contact, but only for a visible resource. A hidden and a nonexistent resource get the same neutral answer, "Not found or no access". Dangerous actions raise step-up as a modal window and keep the entered data. For degradation CRANE shows banners (read-only mode, upstream unavailable), and for the results of actions it shows notifications with the request ID ready to copy.

## Other screens {#more}

- **Sign-in and session:** SSO sign-in, step-up, the first-run wizard.
- **Catalog:** favorites and recent, the full version page with tabs for findings, license, evidence and promotion.
- **Library owner:** my packages, marking as deprecated with a replacement, requesting approval, namespaces.
- **Access, tokens and CI:** my actions, robots, trust policies, publications from CI, team access, the "Why was this denied" diagnostics.
- **Platform:** storage, repositories, upstreams, quotas, retention and garbage collection, integrity check, readiness and warm-up, queues, webhooks, integrations and AI, teams, system status, platform settings.
- **Teams and ownership:** group mappings, cross-team access, ownership transfer, the team trace, the team switcher ({{< xref "features/registry/teams-and-ownership" >}}).
- **AppSec:** findings, advisories, feeds, emergency mode, exceptions, VEX, license review, policies and gates, approvals, quarantine, metrics.
- **SecOps:** the desk, the journal, export and integrity, SIEM receivers, Sigma rules, separation-of-duties violations, token revocation, SOAR, downloads.
- **Common:** the dependency graph (with a mandatory table alternative), the assistant, A2A action confirmation, the command palette (Ctrl K) and the notification center.

## Accessibility and language {#accessibility}

The interface meets WCAG 2.2 AA, has light and dark themes and works from the keyboard. The language switches inside the interface: Russian and English are supported, and there are no hardcoded visible strings. Lists of any size are virtualized, the first load of the application fits in 250 KB compressed, and the rest loads by route. The target search latency on the server is under 150 ms (p95).

## Delivery security {#delivery}

Package READMEs, metadata and evidence are untrusted, so the console runs under a strict policy. The content security policy allows scripts, styles, fonts and connections only from the console's own origin, forbids embedding in other pages and permits no inline scripts and no `unsafe-eval`. A README is displayed through a markup sanitizer: raw HTML is not let through, links get `rel="noopener noreferrer nofollow"`, and external images are not loaded but shown as links, so that a tracking pixel cannot watch security engineers. The guarantee and its limits: {{< xref "features/security/untrusted-content" >}}.

## Related pages {#related}

- {{< xref "features/registry/search" >}}
- {{< xref "features/registry/cli" >}}
- {{< xref "features/security/access-control" >}}
- {{< xref "features/security/security-journal" >}}
