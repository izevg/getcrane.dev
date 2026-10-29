---
title: "Package formats"
description: "Which package formats CRANE serves today: Cargo and npm hosted and proxy repositories, the status of PyPI, Maven and NuGet, and the verified clients."
audience: [developer, platform]
genre: how-to
state: current
status: available
weight: 50
terms: [hosted-repository, proxy-repository, upstream, static-token]
---

This section helps you pick the page for your client and see what CRANE serves today. The server accepts Cargo and npm client requests to {{< term "hosted-repository" "hosted repositories" >}} and {{< term "proxy-repository" "proxy repositories" >}}. PyPI, Maven and NuGet have no protocol routes and no way to create a repository yet.

A client changes only the repository address and the token. All formats behave alike: a published version cannot be overwritten, a proxy never serves a name from an internal repository out of the {{< term "upstream" >}}, and nothing can be written to a proxy repository.

## What works today {#status}

| Format | Hosted | Proxy (upstream) | Verified clients |
| --- | --- | --- | --- |
| {{< xref "formats/cargo" >}} | Yes | Yes (crates.io) | cargo: the two latest stable versions |
| {{< xref "formats/npm" >}} | Yes, scoped packages only | Yes (registry.npmjs.org) | npm: the latest version |
| {{< xref "formats/pypi" >}} | In development | In development | — |
| {{< xref "formats/maven" >}} | In development | In development | — |
| {{< xref "formats/nuget" >}} | In development | In development | — |

Verification runs real clients in containers: publishing, installing, hiding and deleting versions, and installing through a proxy. Other clients of the same ecosystems, such as pnpm and yarn, have no separate check on the stand.

## What all formats share {#common}

A repository address is `<public address>/<format>/<name>/`, where {{< env "CRANE_PUBLIC_URL" >}} sets the public address. For example, the Cargo hosted repository `internal` answers at `https://crane.example.com/cargo/internal/`. The server creates repositories at startup: {{< xref "configure/repositories" >}}.

One {{< term "static-token" "static token" >}} protects access. The format decides which header and which scheme the client uses to send the token: {{< xref "configure/access-token#presenting" >}}. A request without a token gets `401`; a request with a wrong token gets `403`.

An error body has the shape the format's client understands: `{"errors":[{"detail":"…"}]}` for Cargo and `{"error":"…"}` for npm. The error text is in Russian and ends with a `request_id`: use it to find the request in the server log.

## What next {#next}

{{< cards "formats/cargo" "formats/npm" "configure/repositories" "features/security/immutable-versions" >}}
