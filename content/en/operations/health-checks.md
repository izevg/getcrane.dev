---
title: "Health checks"
description: "How to check that CRANE is alive and ready to serve: the crane healthcheck command, a Compose check and external monitoring without publishing the probe port."
audience: [platform]
genre: how-to
state: current
status: available
weight: 10
terms: [readiness-probe, catalog]
---

This page shows how to check the liveness and readiness of CRANE and how to connect those checks to Docker Compose and to external monitoring. The result is a check that tells "the process is alive" from "the server can serve requests", and a clear order of actions on failure.

CRANE serves two probes on a separate port without a token. The `/healthz/live` probe answers while the process is alive. The `/healthz/ready` probe (the {{< term "readiness-probe" >}}) answers `200` when the {{< term "catalog" >}} in PostgreSQL and the blob storage are reachable. The `crane healthcheck` command queries `/healthz/ready` from inside the container. Exact paths, codes and timeouts: {{< xref "reference/ports-and-health" >}}.

> [!WARNING]
> The probe port needs no token. Do not publish {{< env "CRANE_ADMIN_PORT" >}} on the host and do not route it through the reverse proxy: {{< xref "deploy/docker-compose#edge" >}}.

## Before you begin {#prerequisites}

- A running Docker Compose deployment: {{< xref "deploy/docker-compose" >}}.
- Access to the host with Docker and to the `deploy/compose/docker-compose.yaml` file. Run the commands from the repository root.

## Steps {#steps}

1. Run the readiness probe inside the `crane` container. The image is based on `distroless` and has no `curl`, so the probe is built into the binary.

   ```bash
   docker compose --project-directory . \
     -f deploy/compose/docker-compose.yaml exec -T crane crane healthcheck
   echo $?
   ```

   ```text
   0
   ```

   Code `0` means `/healthz/ready` answered `200`. Code `1` means the probe failed or timed out (2 s). On success the command prints nothing.

2. Check the state Compose sees. The project already defines a check: the `crane` service runs `crane healthcheck` every 10 s, waits 3 s for an answer and treats the container as unhealthy after six failures in a row.

   ```bash
   docker compose --project-directory . \
     -f deploy/compose/docker-compose.yaml ps crane
   ```

   The state column must show `healthy`. A monitoring script reads the same state with `docker inspect`:

   ```bash
   docker inspect --format '{{.State.Health.Status}}' \
     "$(docker compose --project-directory . \
       -f deploy/compose/docker-compose.yaml ps -q crane)"
   ```

   ```text
   healthy
   ```

3. Add an external check along the client path. A request without a token to any repository gets `401` if Caddy, TLS and the API work. The check needs no token.

   ```bash
   curl -sS -o /dev/null -w '%{http_code}\n' \
     https://crane.example.com/cargo/internal/index/config.json
   ```

   ```text
   401
   ```

   Substitute the name of your Cargo hosted repository: the default is `internal`. The check confirms the path from the client to the API but does not check PostgreSQL or the blob storage. The readiness probe from step 1 covers them.

4. Connect step 1 to the monitoring system as a command on the CRANE host. The exit code of the command is the result of the check: `0` is ready, `1` is not ready.

## Which probe to use for what {#which}

| Question | Check | What to do on failure |
| --- | --- | --- |
| Is the process alive | The `crane` container runs, `/healthz/live` answers `200` | Restart. The liveness probe does not depend on the storages: an unreachable database is no reason to restart the process |
| Can the server serve requests | `crane healthcheck` or `/healthz/ready` | Do not route traffic; look for the cause in the log: {{< xref "operations/outages" >}} |
| Do clients reach the API | A request without a token returns `401` | Check Caddy, DNS and TLS |

The readiness probe does not check Valkey, the upstreams or the token. A failure of the cache or of an upstream does not make the server unready; it shows in the log: {{< xref "operations/outages" >}}.

In Kubernetes the same probes are connected to the admin port. The differences are described in {{< xref "reference/ports-and-health#orchestrators" >}}.

## Verify {#verify}

A check works if it notices a failure. Stop PostgreSQL on a test stand and make sure readiness is gone while liveness is not.

```bash
docker compose --project-directory . \
  -f deploy/compose/docker-compose.yaml stop postgres
docker compose --project-directory . \
  -f deploy/compose/docker-compose.yaml exec -T crane crane healthcheck
echo $?
```

```text
{"timestamp":"…","level":"ERROR","message":"роль завершилась с ошибкой","error":"порт 9464 ответил нездоровым статусом: HTTP/1.1 503 Service Unavailable"}
1
```

The message "роль завершилась с ошибкой" means "the role finished with an error". Bring the database back and wait for code `0`:

```bash
docker compose --project-directory . \
  -f deploy/compose/docker-compose.yaml start postgres
```

After PostgreSQL returns, `crane` needs no restart: the server recovers by itself.

## If the probe fails {#failed}

The cause is written to the `crane` log at the `warn` level. The record names the event, and the `error` field holds the chain of causes.

| Log record | What happened |
| --- | --- |
| `хранилище не готово` (storage not ready) | The catalog or the blob storage answered with an error or did not answer; the cause is in the `error` field |
| `проба хранилищ не уложилась в 1.5s` (storage probe did not finish in 1.5s) | The storages did not answer within the probe budget |

If the storage did not answer (connection, timeout), the probe answers `503` with the type `urn:crane:problem:storage-unreachable`. If the storage answered with an error, for example a missing table or bucket, the type is `about:blank`: repeating the request is pointless, the configuration or the schema must be fixed. Response format: {{< xref "reference/errors#problem-types" >}}. What the administrator does for each component: {{< xref "operations/outages" >}}. Typical startup errors: {{< xref "operations/troubleshooting" >}}.

## What next {#next}

- {{< xref "reference/ports-and-health" >}}
- {{< xref "operations/outages" >}}
- {{< xref "operations/logs" >}}
- {{< xref "operations/troubleshooting" >}}
