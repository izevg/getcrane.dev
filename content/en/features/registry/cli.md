---
title: "The cctl CLI"
description: "The cctl command-line client signs in to CRANE through OIDC, configures package managers with a short-lived token and explains a denial by request ID."
audience: [developer, platform]
genre: explanation
state: target
status: available
weight: 70
terms: [oidc, step-up]
---

`cctl` is the CRANE command-line client. It signs in through an {{< term "oidc" >}} provider, issues a token for package managers and writes it into their configuration, and it also performs administration and diagnostic operations. Two commands are enough for a developer: `cctl login` and `cctl setup`.

Package managers cannot go through an OIDC sign-in, so CRANE issues them its own tokens bound to an identity from the IdP. `cctl` automates this path: a person signs in once, and the client does the rest. The name `cctl` distinguishes the command-line client from the `crane` utility of the same name in the container registry ecosystem.

## Signing in {#login}

The `cctl login` command obtains access and refresh tokens from the provider. The sign-in method depends on what the IdP supports.

```mermaid {caption="Figure 1. Choosing the sign-in method. Pasting a code from the browser of another device is not supported."}
flowchart TB
  start["cctl login"]
  device{"Does the IdP support<br>device flow?"}
  dev["Device flow:<br>code and link in the terminal"]
  loop["Loopback Authorization Code + PKCE<br>on 127.0.0.1, random port"]
  browser{"Is there a browser<br>on the machine?"}
  token["Personal token from the console:<br>cctl login --token"]
  start --> device
  device -- "yes" --> dev
  device -- "no" --> browser
  browser -- "yes" --> loop
  browser -- "no" --> token
```

- **Device flow.** If the IdP has device flow ({{< cite "rfc-8628" >}}), the CLI shows a code and a link, and the person signs in to the IdP with MFA under the provider's policy. This suits a server without a browser and an IDE.
- **Loopback and PKCE.** Otherwise the CLI opens a browser and receives the response on `127.0.0.1` with a random port ({{< cite "rfc-8252" >}}, {{< cite "rfc-7636" >}}).
- **No browser.** If there is no browser and device flow is unavailable, a personal token is issued in the web console, and `cctl login --token` accepts it.

The CLI keeps the refresh token in the system secret store: Keychain, Secret Service or Credential Manager. The `cctl login --refresh` command issues a new token without entering the password again while the IdP session is alive. When the session has ended, a new sign-in is needed.

## Configuring package managers {#setup}

`cctl setup <clients>` issues a session token `crp_` and writes it into the configuration of each client. The token lives for 12 hours, is limited to the requested permissions, for example read-only or specific teams, and is shown once. The secret does not end up in the shell history or in project files.

```bash
cctl setup npm pip maven gradle nuget cargo
```

`cctl setup` configures two sources: hosted and proxy. The order of the sources does not matter: the security comes from the name invariant ({{< xref "features/security/namespace-reservation#no-groups" >}}).

| Client | Where `cctl` writes the token | How the client sends it |
| --- | --- | --- |
| npm, pnpm, yarn | `~/.npmrc` | The `Authorization: Bearer` header |
| pip, uv, poetry | `~/.netrc` or keyring for the CRANE host | Basic: user `__token__`, password is the token |
| Maven | `~/.m2/settings.xml`, the `<server>` element | Basic: user `token`, password is the token |
| Gradle | `~/.gradle/gradle.properties` | Basic or a header through `credentials(HttpHeaderCredentials)` |
| dotnet, NuGet | the `crane` credential provider, which supplies the token on request and renews it through the CLI | Basic |
| cargo | `~/.cargo/config.toml` and a credential provider; the token sits in the system store | The `Authorization` header with the token and no scheme prefix |

In CI the token is passed to the client in the client's own standard way, but exchanging a platform token, which needs no stored secret, is preferable ({{< xref "features/registry/integrations#oidc-exchange" >}}).

## Commands {#commands}

| Command | What it does |
| --- | --- |
| `cctl login` | Signs in to CRANE; `--token` accepts a personal token, `--refresh` renews the token, `--team <slug>` selects the attribution team |
| `cctl setup <clients>` | Issues a session token and configures the clients |
| `cctl tokens` | Lists the user's tokens and revokes them |
| `cctl robots` | Team robots: create, issue and rotate a secret, disable |
| `cctl publish` | Publishes a version |
| `cctl promote` | Promotes a version to release |
| `cctl diag <request-id>` | Explains a denial or an error by request ID |
| `cctl readiness` | A report on the offline readiness of a lockfile or an SBOM |
| `cctl warm` | Cache warm-up from a lockfile or an SBOM |
| `cctl export` | Exports the journal and reports |
| `cctl audit downloads` | A "who downloaded this version" query for a period (the SecOps role) |

CRANE tokens and a service account token issue nothing: only a person in an interactive IdP session issues tokens ({{< xref "features/security/access-control" >}}). Dangerous operations, such as creating a robot and issuing its secret, require {{< term "step-up" >}}: the CLI starts a repeated sign-in with MFA when it gets a refusal that demands stronger authentication.

## Diagnosing a denial {#diag}

The package manager protocol does not distinguish "no permission" from "no such package": the client gets a neutral `404`. The cause is visible by the request ID, which every response carries in the `X-Request-Id` header.

```bash
cctl diag <request-id>
```

The command requests the diagnostics and the system status. The response shows the cause of the denial, the rule that fired and a contact to ask. The policy trace is visible only to someone who may see that event; a foreign or hidden ID gets a neutral `404`. The same answer is available in the console ({{< xref "features/registry/console#s-states" >}}).

## Attribution team {#team}

A person who belongs to several teams chooses the team that downloads with the token are attributed to: `cctl login --team <slug>`. `cctl setup` chooses the team the same way. Different teams need different tokens ({{< xref "features/registry/teams-and-ownership#attribution" >}}).

## Related pages {#related}

{{< cards "features/registry/formats" "features/registry/integrations" "features/registry/teams-and-ownership" "reference/cctl" >}}
