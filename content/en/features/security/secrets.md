---
title: "Secret encryption and tokens"
description: "How CRANE stores settings secrets encrypted, never keeps access tokens in plain form, and issues short-lived CI tokens instead of long-lived ones."
audience: [platform, security]
genre: explanation
state: target
status: available
weight: 100
terms: [principal, bootstrap-token, oidc]
---

CRANE stores settings secrets in the database only in encrypted form (AES-256-GCM, with a key taken from the environment or a file), and access tokens only as an HMAC. The value of a secret is never printed: not in logs, not in the security journal, not in a URL. A robot secret is shown once.

This way a leaked database dump, CI log or URL does not give an attacker working secrets. For builds, CRANE prefers short-lived tokens issued for the duration of a single job over long-lived secrets in CI variables.

## Threat {#threat}

A secret leaks where it is not expected:

- **A database dump or backup.** The settings table holds secrets, for example a scanner token. Plain text in a dump is ready-made access.
- **Logs and URLs.** A token in a query string ends up in proxy and browser logs. A token in a CI log is available to everyone who reads the log.
- **A long-lived token on a developer machine.** A `postinstall` script of a foreign package takes the token from `~/.npmrc`. If the script can issue itself a new 90-day token, theft turns into permanent access.
- **A secret in CI variables.** It lives for months and is visible to all jobs of the project, including a build of foreign code.

## Guarantee {#guarantee}

- Settings secrets are stored in the database under AES-256-GCM. The ciphertext is bound to the setting name, the row version and the key fingerprint: it cannot be moved to the row of another setting, and a ciphertext of an old version will not open.
- Without an encryption key, a settings secret cannot be written. A secret that is already stored and cannot be decrypted is read as unreadable, not as empty or in clear.
- Secrets from the environment are not copied to the database.
- In CRANE code a secret is a dedicated type without `Debug` and `Display`: the value is read only by an explicit call. The buffer holding plain text is zeroed when released.
- Secret values do not reach security journal events. The event about a secret change carries the setting name and a replacement flag, but not the value. The event about a refused write carries no values from the request.
- CRANE tokens are stored as HMAC-SHA256 with a pepper. A robot secret and tokens are shown once at issue time.
- Tokens are not passed in URLs.
- A CI workload token lives no longer than the job and no longer than an hour.

## How it works {#mechanism}

### Settings secrets {#settings-secrets}

Secret settings (for example, a scanner token) are stored in the settings row as an envelope: `nonce (12 bytes) || ciphertext || tag (16 bytes)`. The encryption library generates the nonce at every write. The additional authenticated data includes the setting name, the row version and the key fingerprint. That is why putting a ciphertext into another row, or rolling a single record back to an old version, causes a decryption error.

If the key fingerprint in the row does not match the current one, CRANE detects this without trying to decrypt and shows the reason: a foreign key. If the envelope is damaged, the value is marked as corrupted. An unreadable value cannot be written back as a new one: to replace it, enter the secret again.

### The encryption key {#key}

The key is 32 random bytes in base64. It is set by {{< env "CRANE_SETTINGS_KEY" >}}, or by a file through its `_FILE` form with permissions 0400. The key lives outside the database. An instance has a single active key. Setup details: {{< xref "configure/settings-encryption" >}}.

If there is no key, the first-run wizard shows secret fields as inactive and explains what to set: the secret through an environment variable, or the encryption key.

### CRANE tokens {#tokens}

Package managers cannot go through an {{< term "oidc" "OIDC" >}} sign-in, so CRANE issues them its own tokens bound to a {{< term "principal" >}} from the IdP. Rights are not baked into a token: every request is authorized again by the current roles.

| Prefix | Purpose | Lifetime | Where the secret is stored |
| --- | --- | --- | --- |
| `crp_` | A person's personal token for package managers | Session: 12 hours; personal long-lived: up to 90 days by policy | HMAC in the database; the token itself in client configuration or a keychain |
| `crr_` | A robot token for systems without OIDC | A mandatory expiry, up to 90 days; on rotation the old and new secrets work together for 24 hours | HMAC in the database; the secret is shown once |
| `crci_` | A workload token (GitLab CI, Kubernetes) | 15 minutes by default, at most an hour and no longer than the job | Nowhere: issued for each job |
| `crb_` | The first-run {{< term "bootstrap-token" "bootstrap token" >}} | 24 hours or until the wizard completes | SHA-256 in the database |

> [!SECURITY]-
> **Token format and verification**
>
> A CRANE token has the format `<prefix><8 characters of ID><32 bytes of base62><crc32>`. The ID lets CRANE find the record without enumeration. The CRC32 checksum helps secret scanners (for example, GitLab) tell real tokens from random strings. Different prefixes tell you, from a found leak, whose token it is and what to do with it.
>
> The database stores HMAC-SHA256 with a pepper. The secret has high entropy, so a slow password hash is not needed: HMAC is safe and hundreds of times faster on the hot path. The pepper and encryption keys come from orchestrator secrets (Kubernetes Secret, External Secrets) or from a file with permissions 0400.
>
> For the bootstrap token, SHA-256 is stored and the comparison runs in constant time.

### Shown once {#show-once}

A robot secret and tokens are returned only in the response to issuing. Responses that carry a secret are not stored for replay: repeating the request with the same idempotency key gives `409` without the secret and with a link to the created resource. A lost secret is not recovered; it is replaced with a new one.

### Tokens never in URLs {#not-in-url}

A token travels in the `Authorization` header or in client configuration (`~/.npmrc`, `~/.netrc`, `settings.xml`, a keychain), but never in the request address. The CRANE access log records the request path without the query. The journal does not contain the value of the `Authorization` header.

### Short-lived CI tokens {#ci-tokens}

A CI job presents the platform's ID token, and CRANE checks its signature and claims against a trust policy and issues a `crci_` token for the duration of the job. There is no secret in CI variables. Writing is allowed only to a job on a protected tag or branch outside a merge request or a fork; everyone else gets a read-only token. A token with the write scope lives 5 minutes. The write token exists only in the publishing job, where no foreign code runs. The issuing rules are on {{< xref "features/security/access-control" >}}.

### Revocation {#revocation}

Revoking a token, blocking a user or changing their groups raises the principal's epoch. All replicas stop accepting its tokens, usually within 5 seconds; if the invalidation message is lost, the time is bounded by the lifetime of the decision cache, 30 seconds.

## Limits of the guarantee {#limits}

> [!LIMITS]
> - **Rolling back a whole row is not caught by the cipher.** An attacker with write access to the database can restore an old ciphertext together with the old row version. This is a threat at the level of database access.
> - **The encryption key protects the deployment.** Whoever has both database access and the key reads the secrets. Keeping the key outside the database and permissions 0400 on the file are the deployment administrator's job.
> - **CRANE does not encrypt secrets from the environment.** They never reach the database. Protecting them is the orchestrator's job.
> - **Without a key, secrets are not written.** Writing a secret is refused with `422 secrets-unavailable`, and secrets written earlier are read as unreadable.
> - **One key.** An instance has a single settings encryption key. After the key is changed, previously written secrets are unreadable and must be entered again.
> - **A token on the client side stays with the client.** CRANE does not prevent theft of a token from a developer machine. It limits the consequences: narrow scopes, lifetime, mandatory step-up for long-lived tokens and fast revocation.
> - **The revocation window is not zero.** Revocation applies on all replicas usually within 5 seconds and no later than 30.
> - **The bootstrap token is the one deliberate exception.** The process prints it once to a separate log target that is not part of the security journal or the SIEM export. The token opens only the first-run wizard, lives 24 hours and stops working after the wizard completes.
> - **Storage encryption is on the platform side.** CRANE neither performs nor checks encryption of PostgreSQL volumes, S3 buckets and backups.

## Related settings {#configure}

- {{< xref "configure/settings-encryption" >}} — the settings encryption key.
- {{< xref "configure/access-token" >}} — the access token for protocols.
- {{< xref "configure/identity" >}} — sign-in through OIDC.
- {{< xref "deploy/production-checklist" >}} — the checklist before going live.
