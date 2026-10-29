---
title: "Cache"
description: "How to choose the proxy repository cache: memory for one instance or Valkey for several replicas, the address format, the secret file and a check."
audience: [platform, security]
genre: how-to
state: current
status: available
weight: 50
terms: [proxy-repository, upstream]
---

This page describes how to choose the cache of {{< term "proxy-repository" "proxy repositories" >}}. The cache holds {{< term "upstream" >}} documents and coordinates fetches: replicas do not request the same file from the upstream at the same time. {{< env "CRANE_CACHE" >}} sets the choice: `memory` for a single instance, or a Valkey address when replicas must share the cache.

The cache is not a source of truth, and losing it loses no data. Unlike the catalog and the blob storage it is therefore optional: without {{< env "CRANE_CACHE" >}} and without {{< env "CRANE_CACHE_FILE" >}} the server uses `memory`.

## Before you begin {#prerequisites}

- For Valkey: a Valkey server with authentication in a network reachable only by CRANE. A ready setup for Compose: {{< xref "deploy/valkey-cache" >}}.
- At least one proxy repository: {{< xref "configure/repositories" >}}. Without one the cache is not created.

## Steps {#steps}

1. Choose a mode.

   - `memory`: an in-process cache bounded by bytes (256 MiB); replicas share nothing. It fits a single instance and needs no settings.
   - Valkey: a cache shared by replicas. The in-process cache (L1, 256 MiB) stays in front of it.

2. For Valkey, save the address in a file. The address contains a password, so pass it in a file.

   ```text
   valkey://crane:<password>@valkey:6379
   ```

   Address form: `valkey[s][-cluster|-sentinel]://[user:password@]host[:port][/db]`. The `valkeys` scheme enables TLS; `redis://` and `rediss://` are not accepted. The scheme table: {{< xref "deploy/valkey-cache#schemes" >}}.

3. Give the server the path to the file.

   ```dotenv
   CRANE_CACHE_FILE=/run/secrets/cache_url
   ```

   An explicit `memory` choice is also valid:

   ```dotenv
   CRANE_CACHE=memory
   ```

   The variable together with its `_FILE` form is a startup error, and so is an empty value.

4. Restart the server.

> [!NOTE]
> Cache content is served to clients. Valkey must be isolated and require authentication: {{< xref "deploy/valkey-cache" >}}.

## Verify {#verify}

Find the "кэш proxy выбран" (proxy cache selected) record in the log with the `cache` field (`memory` or `valkey`). The record appears at startup when at least one proxy repository is set; the server validates the value on every start. The `valkey` value confirms the choice but not that Valkey is reachable: the server does not wait for the connection, and the readiness probe does not check the cache.

## Startup errors {#errors}

Messages name the variable and the scheme but not the rest of the address. The texts are printed in Russian. The examples are in this order: a foreign scheme, an unparsable address, an empty value, a value together with its file.

```text
CRANE_CACHE: значение со схемой `redis` пока не поддерживается
некорректное значение CRANE_CACHE: ожидалось memory или valkey[s][-cluster|-sentinel]://…
некорректное значение CRANE_CACHE: значение пусто
переменные CRANE_CACHE и CRANE_CACHE_FILE взаимоисключающие
```

## What next {#next}

- {{< xref "deploy/valkey-cache" >}}
- {{< xref "configure/limits" >}}
- {{< xref "reference/environment-variables" >}}
