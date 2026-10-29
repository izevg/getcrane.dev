---
title: "Size limits"
description: "How to set the publish size limit and the size limit of a single proxied artifact in bytes: defaults, format, client responses and errors."
audience: [platform]
genre: how-to
state: current
status: available
weight: 70
terms: [proxy-repository, upstream]
---

This page describes two size limits. {{< env "CRANE_MAX_PUBLISH_BYTES" >}} bounds the body of a publish request to a hosted repository. {{< env "CRANE_PROXY_MAX_ARTIFACT_BYTES" >}} bounds the size of a single artifact that a {{< term "proxy-repository" "proxy repository" >}} downloads from the {{< term "upstream" >}}. Both limits are integer numbers of bytes.

The server has no other configurable size limits. The remaining limits of the proxy engine are fixed.

## Before you begin {#prerequisites}

- The size of the largest packages that teams publish and the largest artifacts they install.

## Steps {#steps}

1. Set the publish limit. The default is `10485760` (10 MiB). The limit applies to Cargo and npm. The publish body is buffered in memory as a whole, so a large limit raises memory use. For npm the tarball arrives as base64 inside JSON, that is about a third larger than the original file: the limit applies to the whole document, and with the default value a package of about 7.5 MiB is the most that fits.

   ```dotenv
   CRANE_MAX_PUBLISH_BYTES=20971520
   ```

2. Set the proxied artifact limit. The default is `2147483648` (2 GiB).

   ```dotenv
   CRANE_PROXY_MAX_ARTIFACT_BYTES=1073741824
   ```

3. Restart the server.

Both values are decimal integers without units (`20971520`, not `20MB`) and strictly greater than zero. In the TOML file the keys are `max_publish_bytes` and `proxy_max_artifact_bytes`; the value is an integer or a string:

```toml
max_publish_bytes = 20971520
proxy_max_artifact_bytes = 1073741824
```

## Verify {#verify}

A publish whose body exceeds the limit gets the `413` response. An artifact larger than the limit requested through a proxy gets the `502` response. The server starts without an error if the values are valid.

## Startup errors {#errors}

The texts are printed in Russian. The examples are in this order: not a number, zero.

```text
некорректное значение CRANE_MAX_PUBLISH_BYTES: ожидалось целое число в допустимом диапазоне
некорректное значение CRANE_PROXY_MAX_ARTIFACT_BYTES: предел должен быть больше нуля
```

## What next {#next}

{{< cards "configure/repositories" "configure/cache" "reference/environment-variables" >}}
