---
title: "TLS and the reverse proxy"
description: "How Caddy terminates TLS, what CRANE requires of a trusted reverse proxy, and what happens when the proxy is missing from CRANE_TRUSTED_PROXIES."
audience: [platform, security]
genre: how-to
state: current
status: available
weight: 60
terms: [security-journal]
---

This page explains how package clients reach CRANE over HTTPS and what a reverse proxy must do so that the client address and the request identifier in the {{< term "security-journal" >}} are genuine. The `crane` server does not terminate TLS: it listens on a plain TCP port, and the proxy accepts TLS. In the shipped setup that proxy is Caddy.

The server accepts the `X-Forwarded-For` and `X-Request-Id` headers only from proxies in the {{< env "CRANE_TRUSTED_PROXIES" >}} list. If such a proxy passes client values through unchanged, the client writes its own address and request identifier into the access log and the audit. The section [Requirements for a trusted proxy](#requirements) therefore applies to every proxy, not only to Caddy.

## Before you begin {#prerequisites}

- A working project from {{< xref "deploy/docker-compose" >}}, or another deployment of `crane` behind a reverse proxy.
- For Caddy: a public DNS name in {{< env "CRANE_HOST" >}} and free host ports {{< env "CADDY_HTTP_PORT" >}} and {{< env "CADDY_HTTPS_PORT" >}}.
- For another proxy: the address or subnet from which it connects to the API port ({{< env "CRANE_HTTP_PORT" >}}).

## What the reference Caddy does {#caddy}

The reference setup lives in `deploy/caddy/Caddyfile`. Caddy serves exactly one name, {{< env "CRANE_HOST" >}}, and forwards requests to `crane` on the {{< env "CRANE_HTTP_PORT" >}} port inside the `edge` network.

- **Certificate.** For a public name Caddy obtains a certificate itself through the ACME protocol. For `localhost` it uses the internal Caddy certificate authority: that option suits a check, not production. Issued certificates live in the `caddy-data` volume.
- **Ports.** Caddy publishes ports 80 and 443 on the host (the {{< env "CADDY_HTTP_PORT" >}} and {{< env "CADDY_HTTPS_PORT" >}} variables). The `crane` ports and the probe port are not published on the host.
- **Public address.** Compose sets {{< env "CRANE_PUBLIC_URL" >}} for the server to `https://` plus {{< env "CRANE_HOST" >}}, so links in protocol responses point to the name Caddy serves.
- **`X-Request-Id`.** The `header_up -X-Request-Id` directive removes the client header. The server receives no foreign identifier and issues its own (UUIDv7).
- **`X-Forwarded-For`.** The `Caddyfile` has no directives for it. By default the Caddy `reverse_proxy` discards the values sent by the client and sets the header itself, with the address of its peer, that is, of the client ({{< cite "caddy-reverse-proxy" >}}).
- **Trusted proxy list.** Compose passes the `edge` subnet ({{< env "CRANE_EDGE_SUBNET" >}}) to the server as {{< env "CRANE_TRUSTED_PROXIES" >}}. That network holds only `caddy` and `crane`.

```mermaid {caption="Figure 1. Headers along the request path: Caddy removes the client X-Request-Id and sets X-Forwarded-For, and the server checks the peer against the CRANE_TRUSTED_PROXIES list."}
flowchart LR
  client["Client"] -->|"HTTPS"| caddy["Caddy: TLS"]
  caddy -->|"HTTP, edge network: no X-Request-Id, X-Forwarded-For with the client address"| crane["crane: is the peer in CRANE_TRUSTED_PROXIES?"]
```

## Requirements for a trusted proxy {#requirements}

Every proxy whose address is in {{< env "CRANE_TRUSTED_PROXIES" >}} meets all of the following. The requirements follow from how the server picks the client address and the request identifier.

1. **Terminates TLS and forwards requests to the API port.** The server serves the API over HTTP. The probe port ({{< env "CRANE_ADMIN_PORT" >}}) answers without a token, so the proxy does not forward to it: {{< xref "reference/ports-and-health" >}}.
2. **Removes or overwrites the client `X-Request-Id`.** The server accepts the value from a trusted peer if it consists of 1–128 visible ASCII characters (0x21–0x7E). A proxy that passes the client value through lets the client choose the request identifier in the log. If the header is missing or the value is invalid, the server issues a UUIDv7 itself.
3. **Appends the address of its own peer to the end of `X-Forwarded-For`.** The server joins several header lines with a comma and reads the list from right to left. It skips the addresses in {{< env "CRANE_TRUSTED_PROXIES" >}} and takes the first foreign address as the client. Anyone can forge the left entries, so they do not affect the result, but the rightmost entry must come from the proxy.
4. **Writes addresses without a port and without brackets.** The server does not parse an entry such as `203.0.113.9:4000` or `[2001:db8::1]` and skips it.
5. **Follows the same rules in a chain.** If another proxy stands in front of it, both are in the list, and each meets items 2 and 3.
6. **Does not limit the request body below {{< env "CRANE_MAX_PUBLISH_BYTES" >}}.** Otherwise the proxy rejects a publish instead of the server answering `413`: {{< xref "configure/limits" >}}.

List only proxy addresses in {{< env "CRANE_TRUSTED_PROXIES" >}}. Client networks do not belong there: the server trusts the headers of every address in the list.

> [!NOTE]
> The page gives no configuration for another proxy, such as nginx. The delivery contains only the Caddy setup, and every proxy has its own default header behavior. Compare the proxy settings with the requirements above and check the result with the [Verify](#verify) section.

## Steps {#steps}

1. Configure the proxy according to [Requirements for a trusted proxy](#requirements): TLS, forwarding to the API port, `X-Request-Id`, `X-Forwarded-For`.

2. Set the public address: the `https://` scheme and the name clients use to reach the proxy. Links in protocol responses are built from it.

   ```dotenv
   CRANE_PUBLIC_URL=https://crane.example.com
   ```

3. Set the proxy addresses: IP addresses and CIDR networks, comma-separated. An address without a prefix means a single host.

   ```dotenv
   CRANE_TRUSTED_PROXIES=<proxy address or CIDR>
   ```

   In the Compose setup {{< env "CRANE_TRUSTED_PROXIES" >}} is derived from {{< env "CRANE_EDGE_SUBNET" >}}: the `edge` subnet must contain the proxy address and no extra hosts. More: {{< xref "deploy/docker-compose#edge" >}}.

4. Restart the server. Settings are read once at startup.

## If the proxy is not in the list {#untrusted}

The server does not refuse to serve such a proxy. It treats the proxy as an ordinary client and ignores both headers.

| Field | Proxy in the list | Proxy not in the list |
| --- | --- | --- |
| `client_ip` in the access log, `src_endpoint.ip` in the audit | The client address from `X-Forwarded-For` | The proxy address |
| `request_id` in the access log, `metadata.correlation_uid` in the audit | The proxy value if valid; otherwise a server UUIDv7 | Always a server UUIDv7 |

Records show only the proxy: they do not tell one client from another, and `request_id` does not match the identifier in the proxy log. The list is empty by default, so without {{< env "CRANE_TRUSTED_PROXIES" >}} every proxy falls into this column. An invalid entry in the list stops startup, and the message names the variable: {{< xref "configure/network#errors" >}}.

The reverse case is more dangerous: the proxy is in the list but does not meet the requirements. Then the client chooses its own `request_id` (if the proxy passes `X-Request-Id` through) and puts any address into the log (if the proxy does not append the peer to `X-Forwarded-For`). For example, a client sends `X-Forwarded-For: 198.51.100.7`, the proxy forwards the header without an entry on the right, and the server records `198.51.100.7` as the client address.

## Verify {#verify}

1. Send a request through the proxy with your own headers. A request without a token gets `401`, but the server returns `X-Request-Id` in that response too.

   ```bash
   curl -sS -D - -o /dev/null \
     -H 'X-Request-Id: probe-from-client' \
     -H 'X-Forwarded-For: 198.51.100.7' \
     https://crane.example.com/cargo/internal/index/config.json
   ```

   Find the `x-request-id` header in the output. The value must not be `probe-from-client`: with the reference Caddy it is a UUIDv7 issued by the server.

   ```text
   x-request-id: <uuid-v7>
   ```

2. Find the record of the request in the `crane` log by that identifier. The record is named "запрос обработан" (request handled); the fields are described in {{< xref "security/security-events#access-fields" >}}.

   ```bash
   docker compose --project-directory . \
     -f deploy/compose/docker-compose.yaml logs crane | grep '<uuid-v7>'
   ```

   The `client_ip` field must hold the address of your client. If it holds the proxy address, the proxy is not in {{< env "CRANE_TRUSTED_PROXIES" >}}. If it holds `198.51.100.7`, the proxy does not append the peer to `X-Forwarded-For`: fix its configuration before going to production.

3. Check that the probe port is not published: in the `PORTS` column of `docker compose ps`, `crane` has no host ports. More: {{< xref "reference/ports-and-health" >}}.

## What next {#next}

{{< cards "configure/network" "security/hardening" "deploy/production-checklist" >}}

- {{< xref "deploy/docker-compose#edge" >}}
