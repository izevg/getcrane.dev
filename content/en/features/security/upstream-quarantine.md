---
title: "Upstream version quarantine"
description: "CRANE does not serve proxy clients a version that was published upstream very recently, and applies blocks to documents, artifacts and the cache alike."
audience: [platform, security]
genre: explanation
state: target
status: available
weight: 60
terms: [quarantine, upstream, proxy-repository, packument, stale-if-error, advisory, step-up]
---

{{< term "quarantine" "Quarantine" >}} is a window after a version is published to an {{< term "upstream" >}} during which CRANE does not serve that version to clients of a {{< term "proxy-repository" >}}. The window is counted from the time of publication upstream, not from the first request to CRANE.

It defends against maintainer account takeover: a malicious version of a popular package usually lives in the public registry for hours, until it is taken down or lands in malicious package feeds. CRANE does not serve it in that time. Rule-based blocks work in the same way: the version disappears from documents and from downloads alike, for both fresh and stale cache.

## Threat {#threat}

{{< threat summary="A version from a hijacked account is picked up within minutes: CRANE does not serve a version published less than a window ago." chips="term:quarantine, term:upstream" flow="Attacker takes over the author account \| Auto-updates pick up the version \| CRANE withholds it until the window ends" >}}
{{< threat-what >}}
An attacker gains access to the account of a popular package's author and publishes a new version with malicious code. Automatic updates and builds with floating version ranges pick it up within the first minutes. The registry cannot yet know the version is malicious: there is no advisory, and the author has not noticed the breach.
{{< /threat-what >}}
{{< threat-answer >}}
- A version from an upstream that was published less than a window ago is not served to proxy clients: neither in the version document nor through a direct link to the file.
- The same filter is applied to the stale copy of a document that CRANE serves while the upstream is unavailable.
- A blocked version is served from neither the fresh nor the stale cache, including through a direct URL from a lockfile.
- A rule-based block takes effect on all replicas within 5 seconds.
{{< /threat-answer >}}
{{< /threat >}}

## Guarantee {#guarantee}

- A version from an upstream that was published less than a window ago is not served to proxy clients: neither in the version document nor through a direct link to the file.
- The same filter is applied to the stale copy of a document that CRANE serves while the upstream is unavailable.
- A blocked version is served from neither the fresh nor the stale cache, including through a direct URL from a lockfile.
- A rule-based block takes effect on all replicas within 5 seconds.
- A version with no known publication time is not given the time of its first serving.

## How it works {#mechanism}

### The window and the publication time {#window}

A version younger than the window is not served. The size of the window is an instance setting; the default is 24 hours. A longer window would noticeably delay security fixes.

The format adapter reads the upstream publication time:

| Format | Source of the publication time |
| --- | --- |
| npm | `time[version]` in the {{< term "packument" >}} |
| PyPI | `upload-time` ({{< cite "pep-700" >}}) |
| NuGet | `published` in the registration |
| Cargo | the optional `pubtime` field of the index line ({{< cite "cargo-registry-index" >}}); absent for old versions |
| Maven | the file's `Last-Modified` |

If there is no time, the `unknown_age` policy decides. The value `quarantine` keeps such a version in quarantine, and the value `release` serves it. By default a version without a time is served, so old versions do not vanish from the output.

### Filtering the document {#document}

CRANE shows the client a document (a packument, a crate index, a file list) after filtering. Versions in quarantine or under a block are removed from the Cargo index lines and from the `versions` and `time` fields of the packument. A dist-tag that points to a hidden version is moved to the highest served version that is not higher than the tag's version and is not a pre-release (if the tag pointed to a stable one). If there is no such version, the tag is removed.

The storage time of a filtered document does not exceed the time left until the nearest end of a window among its versions. A version therefore appears in the document when its window ends, not after the next refresh from the upstream.

### Checking the artifact {#artifact}

Serving a file is checked independently of the document. A lockfile with a ready-made link (`resolved`) bypasses the packument but not this check. CRANE writes the "name, version" pair into file URLs when it rewrites a document; parsing the file name remains a fallback for old links.

### Stale cache {#stale}

While the upstream is unavailable, CRANE may serve a stored copy of a document ({{< term "stale-if-error" >}}). The filter sits after the cache of the raw document, so a stale copy passes the same filter: a blocked version does not leak through the cache.

### Blocks {#blocks}

A block rule applies to a range of a name and its versions, not by moving rows to another state. It works on hosted and proxy repositories, including versions nobody has downloaded yet. An advisory of the `MAL-*` kind creates such a rule automatically. The rule index lives in the memory of a replica and is rebuilt on an event, while a full reload on a timer guards against a lost message. The time for a block to take effect on all replicas is at most 5 seconds, and in the worst case the reload period.

A block is not written to version rows and is evaluated on every serve. It therefore applies to versions that have no catalog row, and lifting a block requires restoring nothing.

A rule from `MAL-*` is not lifted automatically, even if the {{< term "advisory" >}} is withdrawn: a forged or mistaken feed would otherwise lift the block on a malicious package. A withdrawal gives the security engineer a review task. Only an explicit action by the on-duty security engineer, with {{< term "step-up" >}} and a justification, can lift a block.

> [!SECURITY]-
> **Break-glass**
>
> Downloading a blocked version can be temporarily allowed for a specific project: for no more than 24 hours, with two approvals (a security engineer and the package owner), and every use is written to the audit. The permission applies only to downloading the artifact (a build with a pinned version) and does not return the version to documents.

### What the client sees {#client-view}

To a client, quarantine looks like the absence of a fresh version. The `latest` tag points to the previous version. A lockfile with a version that has just been released gets a refusal with diagnostics: the reason and the end time of the window. Once the window ends, the version appears on its own.

## Limits of the guarantee {#limits}

> [!LIMITS]
> - **Proxy repositories only.** Hosted repositories use a different mechanism: checks and approval before a version is released.
> - **Versions released early.** A version released from quarantine ahead of time through promotion is served even inside the window.
> - **A version without a publication time.** If the format did not provide a time, the version is handled by `unknown_age`. With the default value `release`, it is served immediately.
> - **The window does not detect malice.** It only buys time. A version that stayed malicious past the window is served after it ends, unless it is blocked.
> - **A block works through an explicit rule.** A version with no advisory and no rule passes the window like any other.
> - **The window delays fixes too.** An urgent security fix from the upstream reaches clients no sooner than the end of the window, unless it is released early.

## Related settings {#configure}

{{< cards "configure/upstream-quarantine" "configure/repositories" >}}
