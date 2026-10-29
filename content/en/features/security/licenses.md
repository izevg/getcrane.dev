---
title: "License policy"
description: "How CRANE parses SPDX expressions and applies the organization's license policy: an unknown license goes to review, and the product issues no legal verdicts."
audience: [security, auditor]
genre: explanation
state: target
status: available
weight: 150
terms: [sbom]
---

CRANE determines the declared license of a version, parses it as an SPDX expression and applies the policy that the organization sets: for each license category and each usage context, a decision of `allow`, `review` or `deny`. An unknown or non-standard license never gets `allow`: it goes to `review`.

CRANE does not issue legal opinions. It shows what is declared, by which policy a decision was made, and who should look at an ambiguous case.

## Threat {#threat}

A dependency brings license obligations that nobody knew about. Strong copyleft in a library that was statically linked into a distributed product, or network copyleft (AGPL) in a SaaS service, obliges the owner to open the source code. It is usually discovered during a deal or an audit, not when the dependency is added.

## Guarantee {#guarantee}

- The license of each version is determined from sources in a fixed order of priority, and a contradiction between sources is flagged and shown in full.
- An SPDX expression is parsed completely: `AND`, `OR`, `WITH` and `LicenseRef-*`.
- An unknown license, a non-standard text and `LicenseRef-*` always give `review`, never `allow`.
- For `AND` the result is the worst of the decisions, for `OR` the best (the choice belongs to whoever uses the package).
- License categories and decisions per context are set by the organization. There is no built-in "GPL is forbidden" rule.
- The decision for a version is stored and served through the version API.

## How it works {#mechanism}

### License sources {#sources}

For a version, the source with the highest priority is used:

1. the result of a manual review;
2. the license from the version's SBOM (CycloneDX, SPDX);
3. the license from publication metadata: `license` for npm, Cargo and NuGet, `License-Expression` for PyPI, `<licenses>` in the POM for Maven;
4. a license recognized from the text of the license file with a confidence of at least 0.9.

If sources contradict each other, the version is flagged as a conflict and all sources are shown. The {{< term "sbom" >}} and the scanner report serve as the second and third source.

### SPDX expressions {#spdx}

An expression is parsed by a pure function that does not depend on the package format. The decision for an expression is built like this:

- a license identifier → the policy decision for its category and context;
- `license WITH exception` → the policy decision for the pair;
- `A AND B` → the worse of the two;
- `A OR B` → the better of the two;
- an unknown identifier or `LicenseRef-*` → `review`.

The order of decisions: `allow` is better than `review`, and `review` is better than `deny`.

### Categories and contexts {#categories}

The organization sets the categories: permissive, weak copyleft, strong copyleft, network copyleft, proprietary and source-available, unknown and custom. The decision depends on the usage context: internal, distributed, SaaS or embedded.

The **starting policy** for a new deployment: permissive is `allow`; weak copyleft for distributed is `review`; strong and network copyleft for distributed and SaaS are `deny`; unknown is `review`. The organization changes it to fit its requirements.

### Virality score {#virality}

In addition, a scoring model can estimate how strongly a license's obligations spread to derived software in a specific context: with static or dynamic linking, in a separate process, over a network. The score is useful for non-standard texts where the category table is silent. It only tightens a decision: it raises `allow` to `review` and sets the order of the review queue. It does not soften `deny`. The score is not a legal opinion.

### Effect on serving {#serving}

A `deny` decision alone does not close downloads. An organization turns on blocking by license with a separate policy rule; by default a license decision remains a signal and a reason for review. A violation of the license policy produces an event for the SIEM.

## Limits of the guarantee {#limits}

> [!LIMITS]
> - **CRANE issues no legal verdicts.** An `allow`, `review` or `deny` decision is the result of applying the organization's policy, not a legal opinion. The legal interpretation of licenses is the organization's job.
> - **A declared license may differ from the actual one.** The package author may have stated the license wrongly; CRANE compares sources but does not guarantee that the declaration is truthful.
> - **Recognition from text is probabilistic.** A license from file text is accepted at a confidence of at least 0.9; below that threshold it is not treated as a source.
> - **Non-standard licenses need a person.** `LicenseRef-*` and unknown texts go to `review`, and the organization decides it.
> - **Policy is entirely on the organization's side.** A wrongly configured category gives a wrong decision: there are no built-in bans.
> - **The virality score does not reduce strictness.** It does not turn `deny` into `review`.

## Related settings {#configure}

- {{< xref "features/security/evidence-and-scanning" >}} — an SBOM and a scanner report as license sources.
- {{< xref "configure" >}} — how CRANE reads settings.
- {{< xref "security/security-events" >}} — license policy events in the journal.
