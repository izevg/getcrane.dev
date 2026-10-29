---
title: "Security journal and SIEM"
description: "How CRANE keeps a security journal protected from tampering by a hash chain and WORM anchors, exports it to a SIEM and restricts access to it."
audience: [security, auditor]
genre: explanation
state: target
status: available
weight: 120
terms: [security-journal, siem, ocsf, egress, principal]
---

The CRANE {{< term "security-journal" >}} consists of three streams: the action audit, the access log and the egress log. It is not silenced by the ordinary log level. Every audit record joins a hash chain, once an hour the last hash is fixed in immutable storage (WORM), and events go to a {{< term "siem" >}} in the {{< term "ocsf" >}} schema.

This way repudiation and quiet modification of the journal become detectable, and access to the journal itself is limited to the roles `secops` and `auditor` and is also recorded. Security takes priority over privacy: the journal keeps real identifiers, and there is no erasure by subject.

## Threat {#threat}

- **Repudiation.** A dispute over who performed an action: without reliable attribution it cannot be settled.
- **Journal tampering.** An attacker or an administrator edits or deletes records of their own actions.
- **Quietly turning off export.** Events stop reaching the SIEM and nobody notices.
- **An administrator reads and edits the journal.** Whoever runs the platform also controls the evidence.
- **Leakage through the journal itself.** The journal holds logins, IP addresses and times of employees' actions; reading it exposes them.

## Guarantee {#guarantee}

- The three journal streams (audit, access, egress) are written regardless of the log level: lowering noise through the {{< env "RUST_LOG" >}} variable does not turn them off.
- Every audit event carries `hash = SHA-256(prev_hash ‖ canonical_json(event))`. A break in the chain is detected during verification.
- Writes go through a database role without rights to modify or delete. Once an hour, the last hash is written to an S3 object with Object Lock (WORM) and sent to the SIEM.
- The audit record is written in the same transaction as the action: if the journal write fails, the action is not performed.
- Events are delivered to the SIEM at least once (at-least-once) with an ID for deduplication. An unavailable SIEM does not lose audit data.
- Only `secops` and `auditor` read the journal. The `platform-admin` role does not see it. Every journal search, data reveal and export is a journal event.
- Secrets, package content and prompt text do not enter the journal.
- Every successful file download is written to a separate download stream.

## How it works {#mechanism}

### Three journal streams {#targets}

The security journal is written by three log targets of the process:

- `crane::audit` — audit events: authentication, publishing, changes of settings and policies, access decisions. The fields follow OCSF paths.
- `crane::access` — one line per HTTP request: method, path without query, status, duration, request ID, client address, user agent, principal.
- `crane::upstream` — every real fetch from an upstream, including SSRF guard refusals: {{< xref "features/security/egress-guard" >}}.

These targets are pinned at the `info` level and override {{< env "RUST_LOG" >}}. An administrator who lowered log noise does not silently lose the security journal.

The client address and `X-Request-Id` are taken from headers only when they come from trusted proxies. The server issues the request ID itself and returns it in a header and in the error body, so an event is tied to its request and trace.

### The hash chain and WORM anchors {#chain}

Every audit event stores `hash` and `prev_hash`. Replacing or deleting a record breaks the chain. Once an hour CRANE writes an `audit.anchor` event with a link to an object in WORM storage and sends it to the SIEM. Verification recalculates the chain from the last anchor and produces a report; it runs on a button in the console, on a schedule, and with the `cctl audit verify` command against an export from the SIEM. A break in the chain is a Critical event.

> [!SECURITY]-
> **Common event fields**
>
> `event_id` (UUIDv7), time, actor (the principal and its type: human, robot, agent; `on_behalf_of` for agent actions), IP and user agent, `request_id`, `trace_id`, resource (PURL, repository), decision and rule IDs, severity, `hash` and `prev_hash`, CRANE version. Secrets and tokens are not part of an event; the user identification fields are configurable to the organization's requirements.

### Export to a SIEM and SOAR {#siem}

Events are written to the outbound event queue in the same transaction as the action. Each receiver has its own cursor, so export resumes from where it stopped once the SIEM recovers. Transports: syslog RFC 5424 over TLS, HTTP JSON and OTLP logs; several receivers can be connected, each with its own filter. The default event schema is {{< cite "ocsf" >}}; CEF is available for older SIEMs. Export lag above 5 minutes raises an alert.

The product ships detection rules in the Sigma format: dependency confusion reconnaissance, token brute force, policy weakening, an audit chain break, a separation-of-duties violation. A SOAR platform receives events through webhooks and performs response actions through REST as the `soar` robot with limited scopes; bulk actions are capped by a threshold, and revoking the credentials of the `secops` and `appsec` roles is done only by a person.

### Access to the journal {#access}

- **Who reads.** `secops` and `auditor`. `platform-admin` and `appsec` do not see the whole journal (`appsec` sees the events of its own decisions). The roles `platform-admin` and `secops`, and `platform-admin` and `auditor`, are incompatible in one person: {{< xref "features/security/access-control" >}}.
- **Masking by default.** A login is replaced by a stable pseudonym, and an IP is truncated to a /24 subnet. Revealing is available to `secops` with a justification and MFA; every reveal is an `audit.pii_revealed` event.
- **Export.** Only `secops`, with a justification, a limited range and MFA. A hash and a link to the chain anchor are attached to the file; the event is `audit.exported`.
- **Audit of access.** Every journal search is an `audit.viewed` event with the query parameters but not the results: it is visible who searched for what.
- **SIEM export cannot be turned off quietly.** Only `secops` changes receivers, and the event about the change reaches the SIEM before it is applied.

### Security over privacy {#privacy}

The journal keeps real identifiers (login, IP and other fields) inside the hash chain on purpose. There is no erasure by subject and no pseudonymization "for deletion": integrity and attribution of actions in the face of an attacker take priority over the right to erasure. Data leaves the journal only by retention period and only as whole periods. Masking in the console remains as an access control measure: the data in storage does not change.

Retention: 12 months online by default, then an archive in WORM objects. The deployment administrator sets the period; a legal hold suspends deletion for the duration of an investigation. Deletion by retention runs automatically and is itself written to the journal.

### Download audit {#downloads}

Every successful download of an artifact file (not a metadata or index request) produces one row in a separate stream: time, repository, PURL and SHA-256 of the file, principal, token ID (neither the secret nor its hash), attribution team, number of authorized bytes, source (`hosted`, `hit`, `stale`, `miss`, `coalesced`), client IP and `request_id`. There are no anonymous downloads. The stream goes into daily partitions through a database role that can only add rows. Once an hour, the SHA-256 over the rows of the closed hour is written as an `audit.download_digest` event into the chain right before the anchor, so it lands in WORM. The query "who downloaded version X between T1 and T2" is available to `secops`; every such query is recorded as an `audit.viewed` event.

### The auditor package {#auditor-bundle}

The package gives an auditor a verifiable set of materials without the right to reveal personal data:

- an access review report: roles, robots, tokens, trust policies, last use, separation-of-duties conflicts;
- masked extracts from the journal and the download stream for a period;
- a configuration snapshot: policies, gates, SIEM receivers;
- a hash and a link to the chain anchor; generating it requires MFA and produces an `audit.exported` event;
- a machine-readable responsibility matrix in the OSCAL format that shows which measures the product takes on and which the organization takes on.

## Limits of the guarantee {#limits}

> [!LIMITS]
> - **There is no erasure by subject.** Deletion under Article 17 of the GDPR is not supported. Data leaves only by retention period, as whole periods. Deployments subject to the GDPR assess this themselves.
> - **The chain detects tampering; it does not prevent it.** The protection relies on a database role without modify rights, WORM anchors and an independent copy in the SIEM. Verification runs from the last anchor, and an anchor is fixed once an hour.
> - **The download stream has no per-row hashes.** Its integrity is provided by hourly digests in the chain. When writing is unavailable, the default policy is `drop`: lost rows are counted, and coverage is shown in responses and exports (`coverage`). The `reject` policy stops downloads while the stream cannot be written and trades availability for completeness.
> - **A download records authorization, not completion.** The journal knows how many bytes were allowed to be served, but not whether the client read the file to the end.
> - **Metadata and index requests are not part of the download stream.** They are visible only in the access log and are counted as per-team metrics.
> - **Delivery to the SIEM is at least once.** The SIEM must deduplicate events by `event_id`.
> - **Masking is an access measure.** The records themselves hold real data, and the `secops` role can reveal it.
> - **Time.** Timestamps are in UTC; accuracy depends on node clock synchronization, and a clock drift between replicas raises an alert.
> - **Compliance is the organization's job.** CRANE provides technical measures; the list of events, retention periods and the protection level are defined by the deployment.

## Related settings {#configure}

- {{< xref "security/security-events" >}} — security journal events and their fields.
- {{< xref "features/operations/observability" >}} — metrics, logs and tracing.
- {{< xref "configure/network" >}} — trusted proxies for the client address.
- {{< xref "security/hardening" >}} — hardening a deployment.
