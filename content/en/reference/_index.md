---
title: "References"
description: "Exact facts about the current CRANE release: environment variables, server roles, ports and probes, protocol paths and error responses."
audience: [platform, developer]
genre: reference
state: current
status: available
weight: 70
terms: []
---

The references collect exact facts about what CRANE does today: variable names and their defaults, the roles of the `crane` binary and exit codes, ports and probes, protocol paths and error responses. Every value is checked against the server code. Step-by-step instructions and explanations live in other sections.

To learn how to set a setting, see {{< xref "configure" >}}; for running the server, see {{< xref "deploy" >}}.

## Pages {#pages}

| Page | What it covers |
| --- | --- |
| {{< xref "reference/environment-variables" >}} | All server environment variables: purpose, default, whether required, the `_FILE` form, the TOML key, the order of sources |
| {{< xref "reference/server-cli" >}} | The roles `serve`, `all`, `migrate`, `healthcheck`, their configuration, startup order and exit codes |
| {{< xref "reference/ports-and-health" >}} | API and probe ports, the `/healthz/live` and `/healthz/ready` probes, the `crane healthcheck` command |
| {{< xref "reference/protocol-endpoints" >}} | Package protocol paths by format, methods and authentication |
| {{< xref "reference/errors" >}} | Error responses: status codes, bodies and the `Retry-After` header |
| {{< xref "reference/http-api" >}} | The platform REST API (in development) |
| {{< xref "reference/metrics" >}} | Server metrics (in development) |
| {{< xref "reference/cctl" >}} | The `cctl` command line (in development) |
