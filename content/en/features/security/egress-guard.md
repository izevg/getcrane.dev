---
title: "Outbound request control"
description: "How CRANE defends against SSRF: all outbound traffic goes through one HTTP client that checks the host, scheme, every address after DNS and every redirect."
audience: [platform, security]
genre: explanation
state: target
status: available
weight: 70
terms: [egress, ssrf, upstream, security-journal, siem]
---

CRANE itself sends {{< term "egress" "egress requests" >}} to external networks: to an {{< term "upstream" >}}, to vulnerability feeds, to webhook receivers and to a {{< term "siem" >}}, during import and to AI models. All of this outbound traffic goes through a single HTTP client with an SSRF guard. The guard refuses a request if the host is not allowed, the scheme is insecure, the address after DNS is not public, or a redirect leads outside what is allowed.

This way {{< term "ssrf" >}} through an upstream, DNS or a redirect does not turn CRANE into a tool for reaching the internal network or the cloud metadata service. Every fetch and every guard refusal is recorded in the outbound request journal.

## Threat {#threat}

{{< threat summary="A registry that reaches external networks can be pointed at an internal address (SSRF): CRANE checks the host, scheme and every address." chips="term:ssrf, term:egress" >}}
{{< threat-what >}}
SSRF is an attack in which a server sends a request to an address chosen by the attacker ({{< cite "owasp-ssrf" >}}). A registry that reaches external networks based on data it does not control faces three variants:

- **Redirect.** An allowed host answers with `302` to `http://169.254.169.254/`, the address of the cloud metadata service. A client that blindly follows redirects sends a request to an internal address.
- **DNS.** A name from the allowlist resolves to an internal address because of DNS spoofing or split-horizon DNS inside the network. A check of the name does not see where it leads.
- **A swapped destination.** The address of a webhook or a SIEM receiver points to an internal service.
{{< /threat-what >}}
{{< threat-answer >}}
- Outbound requests to upstreams go only to hosts from an exact allowlist, with no wildcard hosts, and only over `https`; `http` is permitted by an explicit allowance in the policy.
- Every address that DNS returns is checked before a connection is made. If even one address is not public, the whole answer is refused.
- Every redirect passes the same host and scheme checks as the original request. A chain longer than 5 redirects is not followed.
- For webhooks and SIEM receivers, non-public addresses are forbidden by default.
{{< /threat-answer >}}
{{< /threat >}}

## Guarantee {#guarantee}

- Outbound requests to upstreams go only to hosts from an exact allowlist. There are no wildcard hosts: every upstream is listed explicitly.
- Only the `https` scheme is allowed. The `http` scheme is permitted only by an explicit allowance in the policy; other schemes are refused.
- Every address that DNS returns is checked before a connection is made. If even one address is not public, the whole answer is refused.
- Every redirect passes the same host and scheme checks as the original request. A chain longer than 5 redirects is not followed.
- For webhooks and SIEM receivers, non-public addresses are forbidden by default. Exceptions are set by the instance allowlist.
- Every real fetch from an upstream, including a guard refusal, is written to the journal.

## How it works {#mechanism}

### One client for everything {#single-client}

The HTTP client for outbound requests is built once. The guard is embedded at the two points where the client makes decisions itself: the DNS resolver and the redirect policy. There is no public way around them, and CRANE does not use manual address overrides that would bypass the resolver.

### Host and scheme {#host-scheme}

The host allowlist is normalized the same way as the names it checks: lowercase, no trailing dot, no brackets around IPv6. The address of a proxy repository is checked when the configuration is assembled: the scheme and the host must pass the policy, and the path prefix must not contain `..`, `?`, `#`, `\` or `:`. A request path therefore stays after the host name and cannot change it. The port does not take part in the allowlist: upstreams may use non-standard ports, while the host and the address are checked separately.

If an IP literal is written in the allowlist, the address class check is still performed: there is no resolution, and there would be nothing to check later.

### The address after DNS {#address}

The check sits between DNS and the connection. The addresses returned by the resolver are checked, and the client then connects to exactly those: there is no second resolution between the check and the connection.

One non-public address in an answer refuses the whole answer. Silent filtering would hide a poisoned or split-horizon DNS, and that is an event for a security engineer. A DNS answer with no addresses is treated as a failure, not as a policy refusal: it is unavailability, not an attack attempt.

Non-public addresses include loopback, private networks, link-local (including the cloud metadata address `169.254.169.254`), multicast and a number of reserved ranges. IPv4 addresses embedded in IPv6 (`::ffff:a.b.c.d`, NAT64, 6to4) are judged by the embedded IPv4, so the rules cannot be bypassed through them.

> [!SECURITY]-
> **The full list of non-public ranges**
>
> IPv4: loopback, private networks, link-local, multicast, broadcast, documentation, `0.0.0.0/8`, `100.64.0.0/10` (CGNAT, including `100.100.100.200`, the Alibaba Cloud metadata address), `192.0.0.0/24`, `198.18.0.0/15`, `240.0.0.0/4`.
>
> IPv6: multicast, unique local, link-local unicast, `::/96` (including `::` and `::1`), `fec0::/10` (site-local), `2001:db8::/32` (documentation), `100::/64` (discard-only), `2001::/32` (Teredo), `64:ff9b:1::/48` (local-use NAT64). Addresses in `64:ff9b::/96` (NAT64) and `2002::/16` (6to4) are public only if the embedded IPv4 is public.

### Redirects {#redirect}

Every redirect hop is checked by host and scheme in the same way as the original request: otherwise a redirect would lead outside the allowlist. Up to 5 redirects are allowed. After that a `3xx` response is returned as it is and counts as the upstream being unavailable. A redirect without a host (`data:`, `mailto:`) is refused; only the scheme is written to the refusal record, because queries may carry signatures and tokens.

### The outbound request journal {#journal}

Every real fetch from an upstream is written as a separate line to the {{< term "security-journal" >}} with the target `crane::upstream`. The security journal is not silenced by the log level. The fields of a line:

| Field | Value |
| --- | --- |
| `host` | the upstream host |
| `path` | the upstream path without the query |
| `status` | the response status, if one was received |
| `failure` | `refused` for an SSRF guard refusal, `unavailable` for a network error, `throttled` for a rate limit on the upstream side |
| `elapsed_ms` | time until the headers were received |

There are no headers, bodies or `ETag` in a line. A request served from the cache, or one that joined another request's fetch, produces no line, so the number of lines with the same `path` shows how many times CRANE actually contacted the upstream. When the guard refuses, the client receives only "upstream unavailable" (`502`); the refusal rule stays in the journal.

## Limits of the guarantee {#limits}

> [!LIMITS]
> - **Hosts in the allowlist are trusted.** The guard does not inspect the content of an allowed host's response. A compromise of the upstream itself is covered by other guarantees: digest verification and quarantine.
> - **The guard protects CRANE's outbound requests, not the network around it.** Restricting the process's network access (NetworkPolicy in Kubernetes, firewall rules) stays with the deployment and works as a second line.
> - **Exceptions for webhooks and SIEM widen access.** Every entry in the instance allowlist lets CRANE reach a non-public address. The deployment administrator maintains the list.
> - **The port is not part of the allowlist.** Any port of an allowed host is acceptable.
> - **A guard refusal and a failure are different.** A DNS answer with no addresses is a failure, not a policy refusal; it is recorded as `unavailable`.

## Related settings {#configure}

{{< cards "configure/network" "configure/repositories" "security/security-events" >}}
