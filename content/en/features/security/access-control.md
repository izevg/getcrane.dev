---
title: "Access and separation of duties"
description: "How CRANE admits people only through OIDC, issues tokens by narrowing rights, denies access by default and separates roles so that nobody controls themselves."
audience: [security, auditor]
genre: explanation
state: target
status: available
weight: 110
terms: [oidc, principal, step-up, workspace, security-journal]
---

CRANE admits people only through {{< term "oidc" "OIDC" >}}, issues its own tokens to package clients, and authorizes every action with Cedar policies under default deny. Only a person with an interactive IdP session can issue a token, and only by narrowing their own rights. Dangerous operations require {{< term "step-up" >}}, and the roles are arranged so that a platform administrator does not read the journal and a monitoring specialist does not publish packages.

This way a stolen token or a compromised role cannot widen access, and every refusal can be explained: it is known which rule fired.

## Threat {#threat}

{{< threat summary="A stolen token, foreign code in a job and mixed roles widen access: CRANE issues tokens only to people and only narrows rights." chips="term:principal, term:separation-of-duties" >}}
{{< threat-what >}}
- **Escalation through a token.** A `postinstall` script takes `crp_` from `~/.npmrc` and issues itself a 90-day token, or a token with wider rights.
- **Foreign code in the publishing job.** A build of a fork or a merge request gets a write token and publishes a package.
- **Mixed duties.** A platform administrator who can read and edit the journal can hide their own actions.
- **Quiet weakening of protection.** A team owner turns off a protective repository setting and the action goes unnoticed.
- **Excess rights from a directory.** Rights inferred from an LDAP structure by guesswork diverge from what the organization intended.
{{< /threat-what >}}
{{< threat-answer >}}
- Every request is authorized and access is denied by default.
- A token is issued only by a person with their own interactive IdP session, and a new token is not wider than the person's rights.
- A write token exists only in a publishing job without foreign code and is issued only for protected refs.
- A platform administrator and the `secops` and `auditor` specialists are incompatible roles: in `strict` mode, signing in with both does not activate access to the journal.
{{< /threat-answer >}}
{{< /threat >}}

## Guarantee {#guarantee}

- People sign in only through OIDC. There is no direct LDAP, Active Directory or SAML connection: such directories connect through a federating OIDC provider.
- Every request is authorized and access is denied by default. A decision carries a trace: which rule fired.
- A token is issued only by a person with their own interactive IdP session. CRANE tokens and service account credentials issue nothing (`403 interactive-login-required`).
- Issuing only narrows rights: a new token is not wider than the person's rights (`403 scope-exceeds-principal`).
- A write token exists only in a publishing job without foreign code and is issued only for protected refs.
- Dangerous operations require fresh multi-factor authentication.
- A platform administrator and the `secops` and `auditor` specialists are incompatible roles: in `strict` mode, signing in with both roles does not activate access to the journal and produces a `sod.violation` event.

## How it works {#mechanism}

### People only through OIDC {#oidc}

The OIDC provider answers the question "who is this", and CRANE answers "what may they do". CRANE accepts any provider with standard OIDC (discovery, JWKS). Roles and groups come from the token, and they turn into rights only through an explicit mapping of groups to teams and roles: the directory structure does not grant rights by itself.

> [!SECURITY]-
> **Why not LDAP, Active Directory and SAML directly**
>
> - A direct bind means CRANE accepts passwords and keeps a privileged account for lookups. A registry on the build path would become a holder of secrets.
> - LDAP has no `acr`, `amr`, `auth_time`, WebAuthn or passkeys. The model of dangerous actions with fresh MFA would be impossible to satisfy.
> - OU and group trees in corporate directories are inconsistent. Rights derived from them are excessive and drift unnoticed.
> - LDAP injections are well known, and AD is the main target in lateral movement. A registry must not be one more place where these credentials are entered.
>
> The supported path: Keycloak or another OIDC provider stands in front of the directory, and SAML connects through identity brokering. There are no LDAP or SAML adapters or plugins.

### Tokens for clients {#tokens}

Package managers do not go through an OIDC sign-in, so CRANE issues them the tokens `crp_`, `crr_` and `crci_`, bound to a principal. Rights are not baked into a token: every request is authorized again by the current roles, so a change of roles takes effect without reissuing. Token storage and format: {{< xref "features/security/secrets" >}}.

### Issued only by a person and only by narrowing {#issuance}

1. Tokens are issued by a person who signed in to the IdP in this session (the console cookie, or a JWT obtained by the user's sign-in and its renewal). Otherwise a script with `crp_` would issue itself a personal 90-day token.
2. Issuing narrows: the scopes of a new `crp_` are not wider than the person's current rights, a robot gets exactly its own scopes, and `crci_` is not wider than the trust policy.
3. A personal long-lived token and a robot secret are issued only with step-up. A session `crp_` does not require step-up, but it lives no longer than 12 hours and no longer than the IdP session: otherwise MFA would have to be confirmed every 12 hours, and CRANE would become unavailable with an IdP that has no step-up.
4. The exchange of a platform ID token issues only `crci_`, and only for a token of a trusted external issuer. CRANE tokens are not accepted as the source token.

### The publishing phase in CI {#ci-phase}

The write token exists only in the publishing job, where no foreign code runs. Building and installing dependencies happen in a separate job without a write token, with install scripts disabled. Writing is allowed only from a protected ref outside a merge request or a fork; everyone else gets a read-only token. The `publish` scope is limited to the names from the trust policy rule. Every publication gets provenance from the claims of the platform token, not from the client's words.

### Cedar and default deny {#cedar}

Authorization is computed by a Cedar policy from the roles in the membership table, not from the IdP token: the IdP token is only observed. Access is denied by default. Decisions are cached for 30 seconds, keyed by the principal's epoch, so a revocation of rights takes effect on all replicas quickly.

### Explainable refusal {#explainable}

Every decision carries a trace: which policies fired and why. A package that is closed to the user is served by the protocol as non-existent (`404`) so as not to reveal its presence. The reason is visible by request ID through diagnostics (`GET /api/v1/diagnostics/{request_id}`, the `cctl diag` command). An error response carries `rule_id`, `request_id` and a remediation hint.

### Step-up for dangerous operations {#step-up}

{{< term "step-up" >}} is a repeated sign-in with fresh MFA. It is required by actions that weaken protection, issue a long-lived secret, reveal personal data or lift a block:

- personal data in the journal and journal export;
- exceptions, emergency block and its lifting, VEX;
- robots, their secrets, personal long-lived tokens and trust policies;
- protective repository settings, webhooks and SIEM receivers;
- policies and gates, release from quarantine, applying retention.

If the IdP does not pass `auth_time`, MFA freshness cannot be confirmed and dangerous actions are unavailable. The exact list is the `x-crane-step-up` flags in the API description.

### Roles and separation of duties {#roles}

| Role | Level | What it can mainly do | What it cannot do |
| --- | --- | --- | --- |
| `reader` | team | Search, read, install | Publish |
| `developer` | team | Publish to dev and snapshot | Publish to release, change settings |
| `maintainer` | team | Publish to release in its namespaces | Grant security exceptions |
| `owner` | team | Team roles, robots and trust policies | Read the journal, change security policies |
| `appsec` | instance | Policies, exceptions, emergency block | Read the whole journal |
| `secops` | instance | The journal, SIEM receivers, token revocation | Publish, delete packages, change the platform |
| `auditor` | instance | A read-only, masked journal | Reveal data, change anything |
| `platform-admin` | instance | Storage, upstreams, integrations, teams | Read the journal, change security policies |

Separation of duties rests on four rules:

- **An administrator does not control the journal.** The roles `platform-admin` and `secops`, and `platform-admin` and `auditor`, are incompatible in one person.
- **Nobody modifies the journal.** Writes go through a database role without rights to modify or delete: {{< xref "features/security/security-journal" >}}.
- **SIEM export cannot be turned off quietly.** Only `secops` changes receivers, and the event about the change reaches the SIEM before it is applied.
- **Protective settings are changed by a separate operation with step-up**, not by the team owner.

### Teams {#teams}

The unit of ownership and membership is a {{< term "workspace" "team" >}}. Roles in a team are granted only by an explicit mapping of an IdP group, which a platform administrator maintains with step-up, or by local membership, which an instance setting can forbid. Details: {{< xref "features/registry/teams-and-ownership" >}}.

## Limits of the guarantee {#limits}

> [!LIMITS]
> - **Without a directory and push, a role removed in the IdP lives until the next sign-in.** CRANE learns about a change at sign-in, exchange or token renewal. While there is neither a directory nor push, the ceiling of the session token bounds the time: 1 hour by default instead of 12. A user disabled in the IdP loses access no later than that or the expiry of the refresh token. For Keycloak, enable directory polling and admin events; for other providers, SCIM. The access review report shows "observed at the moment", not the current IdP state.
> - **The IdP determines the quality of the MFA signal.** If the provider does not pass `acr`, `amr` and `auth_time`, MFA freshness cannot be computed. Then either dangerous actions are unavailable, or an administrator explicitly states that the IdP requires MFA at every sign-in.
> - **Large group lists are not applied.** If the IdP did not fit groups into the token, the roles from the token do not change. This is safe, but rights will not update until the source of groups is fixed.
> - **Role compatibility is enforced in strict mode.** Warning mode is allowed only by an explicit setting for a profile where one person runs everything; the console then shows a permanent banner.
> - **The revocation window.** Revoking a token or blocking a user applies on all replicas usually within 5 seconds and no later than 30.
> - **Policy stays with the organization.** CRANE denies access by default, but a wrongly granted role or an extra `group_mapping` gives the rights that the policy allows.
> - **Changing the IdP creates new principals.** People from the new provider are not merged with the previous ones.

## Related settings {#configure}

{{< cards "configure/identity" "configure/access-token" "features/registry/teams-and-ownership" "security/security-events" >}}
