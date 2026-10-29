---
title: "References"
description: "Exact facts about the current CRANE version: environment variables, roles and exit codes of the crane binary, ports and probes; cctl is in development."
audience: [platform, developer]
genre: reference
state: current
status: available
weight: 70
terms: []
---

The references collect exact facts about what CRANE does today: variable names and their defaults, the roles of the `crane` binary and exit codes, ports and probes. Every value is checked against the server code. Step-by-step instructions and explanations live in other sections.

To learn how to set a setting, see {{< xref "configure" >}}; for running the server, see {{< xref "deploy" >}}.

## Pages {#pages}

| Page | What it covers |
| --- | --- |
| {{< xref "reference/environment-variables" >}} | All server environment variables: purpose, default, whether required, the `_FILE` form, the TOML key, the order of sources |
| {{< xref "reference/server-cli" >}} | The roles `serve`, `all`, `migrate`, `healthcheck`, their configuration, startup order and exit codes |
| {{< xref "reference/ports-and-health" >}} | API and probe ports, the `/healthz/live` and `/healthz/ready` probes, the `crane healthcheck` command |
| {{< xref "reference/cctl" >}} | The `cctl` command line (in development) |
