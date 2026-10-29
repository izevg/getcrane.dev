---
title: "Access token"
description: "How to set the static access token for the package protocols: the secret file, the principal name, how clients present the token and what happens on refusal."
audience: [platform, security]
genre: how-to
state: current
status: available
weight: 30
terms: [principal, security-journal]
---

This page describes how to set the token that protects access to all CRANE repositories. The token is static: a deployment administrator creates it and gives it to the server in {{< env "CRANE_TOKEN" >}} or in the file named by {{< env "CRANE_TOKEN_FILE" >}}. The server keeps only the SHA-256 of the token in memory and compares digests, so the check time does not depend on the length of the presented value.

There is one token per instance: it opens all repositories of all formats, for reading and writing. The protocols have no anonymous access. The token has no distinct roles or permissions.

## Before you begin {#prerequisites}

- A way to hand a secret file to the process: a Docker volume or a Kubernetes secret. For Compose: {{< xref "deploy/docker-compose#secrets" >}}.
- The `openssl` command for the example below; any random value generator works.

## Steps {#steps}

1. Create a random value and save it to a file. The value is any non-empty string; the server strips a trailing newline from the file and keeps whitespace inside. The server process must be allowed to read the file.

   ```bash
   umask 077
   openssl rand -hex 32 > ./secrets/crane_token
   ```

2. Give the server the path to the file. The token is set in exactly one way: {{< env "CRANE_TOKEN" >}} together with {{< env "CRANE_TOKEN_FILE" >}} is a startup error.

   ```dotenv
   CRANE_TOKEN_FILE=/run/secrets/crane_token
   ```

3. If needed, set the name of the {{< term "principal" >}} on whose behalf the server performs requests that carry this token. The default is `crane`. The name goes to the {{< term "security-journal" >}} (the audit and the access log) and to the `owners` response for Cargo. It cannot be empty or contain control characters; surrounding whitespace is dropped.

   ```dotenv
   CRANE_TOKEN_PRINCIPAL=ci-platform
   ```

4. Restart the server. The token is read once at startup, so a changed value takes effect after a restart.

## Verify {#verify}

A request without an authorization header gets `401` with a description of the sign-in scheme. A request with a wrong token gets `403`. A request with the right token passes:

```bash
curl -sS -o /dev/null -w '%{http_code}\n' https://crane.example.com/cargo/internal/index/config.json
```

```text
401
```

```bash
printf 'header = "Authorization: %s"\n' "$(cat ./secrets/crane_token)" \
  | curl -sS -o /dev/null -w '%{http_code}\n' -K - https://crane.example.com/cargo/internal/index/config.json
```

```text
200
```

The token goes through stdin (`-K -`), so it does not appear in the process list.

## How clients present the token {#presenting}

The format decides which header and scheme a client uses to send the token. Today the server serves Cargo and npm.

| Format | Header and scheme |
| --- | --- |
| Cargo | `Authorization: <token>` without a scheme |
| npm | `Authorization: Bearer <token>` |

A foreign scheme is not accepted "as is": a header with another scheme counts as a wrong token. A refusal caused by a wrong token is written to the audit with the result "токен отвергнут" (token rejected). A request without a header is part of the protocol handshake and is not audited. A successful sign-in is not recorded as a separate audit event; the principal name is visible in the access log.

> [!SECURITY]-
> The token protects the package protocols. The probe port (admin) answers without a token, so do not publish it: {{< xref "reference/ports-and-health" >}}. The TOML file stores values in plain text, so pass the token with the `token_file` key rather than `token`.

## What next {#next}

- {{< xref "configure/settings-encryption" >}}
- {{< xref "configure/network" >}}
- {{< xref "reference/environment-variables" >}}
