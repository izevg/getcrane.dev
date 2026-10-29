---
title: "Serving untrusted content"
description: "How CRANE keeps a package file or README from running code in the console: a separate packages origin, safe headers, a strict CSP, no README images."
audience: [security, platform]
genre: explanation
state: target
status: available
weight: 90
terms: [evidence]
---

The bytes of packages, their metadata, {{< term "evidence" >}} and READMEs are untrusted: they were written by the package author, not by the owner of the registry. CRANE serves them so that a browser cannot execute such content on behalf of the console: protocols and file links come from a separate packages origin, responses carry protective headers, the console runs under a strict CSP, and a README is shown without loading external images.

This way a `-docs.html` or `.svg` file inside a package does not get access to a security engineer's session, and a README does not tell the package author who opened the card and when.

## Threat {#threat}

A Maven package contains a `-docs.html` or `.svg` file with a script. A security engineer opens the link to that file from the console. If the file is served from the same origin as the console, the browser runs the script as part of the console. The script reads `csrf_token` from `GET /api/v1/session` and acts on behalf of the user: for example, it lifts a block or issues a token.

`SameSite=Strict` does not help here. `SameSite` forbids sending a cookie from a foreign site, but the script from the file runs on the console origin itself: its requests count as same-site, and it reads the CSRF token on its own.

The second threat is weaker but real. A Markdown README contains an image from the package author's address. If the console loads it when the card is opened, it sends the author a request with an IP address and the time of viewing: a tracking pixel shows an attacker when AppSec and SecOps study the package.

## Guarantee {#guarantee}

- Package manager protocols and file download links are served from a separate packages origin. The packages origin does not serve the console or `/api`, and the console does not serve the protocols.
- Every such response carries `X-Content-Type-Options: nosniff`, `Content-Security-Policy: sandbox; default-src 'none'` and `Content-Disposition: attachment`. The exception is the JSON documents of the protocols, which do not need `Content-Disposition`.
- The console runs under a strict CSP: only resources of its own origin, no inline scripts and no `unsafe-eval`.
- Raw HTML from a README is not executed. External images are not loaded; they are shown as links.

## How it works {#mechanism}

### A separate packages origin {#origin}

A browser isolates pages by origin. If a package file is opened on an origin that has neither the console nor the API, a script inside the file sees neither the session cookie nor the console's CSRF token. That is why protocol addresses and presigned file links point to the packages origin, and the addresses in client configuration prepared by the CLI are taken from it too.

A separate registrable domain is better. A subdomain is acceptable: the session cookie is bound to the host (`__Host-`), and mutations require a CSRF token and an `Origin` check. Address settings are described on {{< xref "configure/network" >}}.

### Response headers {#headers}

Three headers work together, and each closes its own bypass:

- `X-Content-Type-Options: nosniff` forbids the browser from guessing the content type and running a file as HTML or a script when the server named it differently.
- `Content-Security-Policy: sandbox; default-src 'none'` puts the document in a sandbox without privileges and forbids loading any resources. Even an opened `.svg` or `.html` will not run a script.
- `Content-Disposition: attachment` tells the browser to save the file rather than display it.

### The strict console CSP {#console}

The console inserts nothing untrusted into the page without a sanitizer, and it restricts itself with a policy that forbids external resources.

> [!SECURITY]-
> **Console headers**
>
> `Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'`
>
> Also: `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`, `Cross-Origin-Opener-Policy: same-origin`. There are no inline scripts and no `unsafe-eval`; an exception to this rule requires a separate decision.

### README and metadata {#readme}

A README is rendered by a Markdown renderer with an HTML sanitizer. Raw HTML in the source text is skipped, and the result also passes through the sanitizer: there are several layers on purpose, because the text is untrusted.

- An external image (an `http` or `https` address) is not loaded. The console shows a link with the image caption or its address instead. An image inside a link (a badge) is shown as its caption.
- An image with another kind of address (`data:` or relative) does not become a link: only the caption remains.
- External links open in a new tab with `rel="noopener noreferrer nofollow"`.
- `iframe` elements and forms are stripped.

## Limits of the guarantee {#limits}

> [!LIMITS]
> - **Origin separation is a condition of the guarantee.** If the packages origin address is not set, or its host equals the console host, the guarantee does not fully apply. The secure-configuration check reports this with a warning and an event, and in strict mode CRANE refuses to start.
> - **The guarantee protects the browser and the console, not the build.** A package that a client installed runs where it was installed. Assessing package content is the job of {{< xref "features/security/evidence-and-scanning" >}}.
> - **The protection relies on the browser.** The headers work as long as the browser honours them.
> - **A README remains untrusted text.** A link in a README can lead to any address. The console marks external links but does not check where they lead.
> - **JSON protocol documents are served without `Content-Disposition`.** Package manager clients need them as data, and they are not displayed as a page.

## Related settings {#configure}

- {{< xref "configure/network" >}} — addresses, ports and trusted proxies.
- {{< xref "deploy/tls-reverse-proxy" >}} — TLS and a reverse proxy in front of the two origins.
- {{< xref "deploy/production-checklist" >}} — the secure-configuration check before going live.
- {{< xref "security/hardening" >}} — hardening a deployment.
