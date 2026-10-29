---
title: "Addresses, ports and trusted proxies"
description: "How to set the API and probe ports, the public CRANE address and the list of trusted proxies whose X-Forwarded-For and X-Request-Id headers the server trusts."
audience: [platform, security]
genre: how-to
state: current
status: available
weight: 60
terms: [security-journal]
---

This page describes the network settings of the server: the API port, the probe port, the public address and the list of proxies CRANE trusts. The public address decides the links in protocol responses. The trusted proxy list decides which client address reaches the {{< term "security-journal" >}}: the client address or the proxy address.

By default the server trusts nobody: the `X-Forwarded-For` and `X-Request-Id` headers are ignored, and the connection address counts as the client address. Trust is enabled explicitly with the {{< env "CRANE_TRUSTED_PROXIES" >}} list.

## Before you begin {#prerequisites}

- A reverse proxy with TLS in front of the server. The reference setup: {{< xref "deploy/docker-compose#edge" >}}.
- The subnet or the addresses from which the proxy connects to the server.

## Steps {#steps}

1. Set the public address. The {{< env "CRANE_PUBLIC_URL" >}} variable is required. The value starts with `http://` or `https://`, contains a host, and the server drops trailing `/`. Links in responses are built from it: for example the `api` and `dl` fields in the Cargo configuration.

   ```dotenv
   CRANE_PUBLIC_URL=https://crane.example.com
   ```

2. If needed, change the ports. The server listens on both ports on all interfaces (`0.0.0.0`). A value is an integer from 0 to 65535.

   ```dotenv
   CRANE_HTTP_PORT=8080
   CRANE_ADMIN_PORT=9464
   ```

   {{< env "CRANE_HTTP_PORT" >}} (default `8080`) is the API port with the package protocols. {{< env "CRANE_ADMIN_PORT" >}} (default `9464`) is the probe port. The probe port answers without a token, so do not publish it: {{< xref "reference/ports-and-health" >}}.

3. Name the trusted proxies: IP addresses and CIDR networks (IPv4 and IPv6), comma-separated. An address without a prefix means a single host.

   ```dotenv
   CRANE_TRUSTED_PROXIES=172.31.250.0/24,::1
   ```

   For a peer from the list the server reads `X-Forwarded-For` from right to left, skips the addresses of its own proxies and takes the first foreign address as the client. Anyone can forge the left entries of the header, so they do not affect the result. `X-Request-Id` is accepted only from a trusted peer and only if the value is valid; otherwise the server generates the identifier itself.

   > [!IMPORTANT]
   > Every proxy in the list must remove or overwrite a client-supplied `X-Request-Id` and append its peer address to the end of `X-Forwarded-For`. Otherwise a client can supply its own request identifier and address.

4. Restart the server.

## Verify {#verify}

1. Find the "сервер запущен" (server started) record in the log: the `http_port` and `admin_port` fields show the bound ports.
2. Send a request through the proxy and find it in the access log. The client address in the record must be the client's address, not the proxy's. If the record shows the proxy address, the proxy is not in {{< env "CRANE_TRUSTED_PROXIES" >}}.

## Startup errors {#errors}

The texts are printed in Russian. The examples are in this order: a port out of range, no public address, an address without a scheme, an address without a host, an invalid proxy list, a busy port.

```text
некорректное значение CRANE_HTTP_PORT: ожидалось целое число в допустимом диапазоне
не задана переменная CRANE_PUBLIC_URL
некорректное значение CRANE_PUBLIC_URL: адрес должен начинаться с http:// или https://
некорректное значение CRANE_PUBLIC_URL: в адресе нет хоста
некорректное значение CRANE_TRUSTED_PROXIES: ожидался список IP-адресов или CIDR через запятую
не удалось занять порт 8080: Address already in use (os error 98)
```

The reason text of a busy port depends on the operating system.

## What next {#next}

- {{< xref "deploy/docker-compose#edge" >}}
- {{< xref "reference/ports-and-health" >}}
- {{< xref "reference/environment-variables" >}}
