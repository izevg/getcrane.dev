---
title: "Package search"
description: "How CRANE search works: lexical and semantic legs, rank fusion, an access filter before ranking and ordering signals, with no decisions made by a model."
audience: [developer, platform]
genre: explanation
state: target
status: available
weight: 50
terms: [hosted-repository, proxy-repository, purl, typosquatting]
---

CRANE search finds packages by task, not only by name. It combines lexical search and search by meaning, shows only the packages the user may read, and puts an exact name match first. Results appear as you type.

Models in search are responsible only for auxiliary scores: a vector of the text and, if configured, the reordering of candidates. A model makes no access or security decisions, and without models search stays functional and works lexically. The limits of AI use in CRANE are described in {{< xref "features/security/ai-boundaries" >}}.

{{< screenshot story="S1Search" variant="DesktopLight" alt="Package search in the web console: the query field, format segments, filters and cards of the packages found" >}}

## What the user sees {#user-view}

Search covers {{< term "hosted-repository" "hosted" >}} and {{< term "proxy-repository" "proxy repositories" >}}. A result can be narrowed by format, repository and team, and deprecated packages can be included. The search field accepts plain text, a {{< term "purl" >}} and filters such as `format:npm`.

A result card shows the name, format, repository, description, the latest version and its state, downloads over 30 days, the owning team and the package lifecycle. For a deprecated package the recommended replacement is shown. If a name resembles a popular or an internal one, the card warns: "You may have meant …". The screen is described in {{< xref "features/registry/console#s-search" >}}.

A search result does not grant the right to install. A client gets a package only after access and version visibility are checked ({{< xref "features/security/access-control" >}}).

## Access filter before ranking {#acl}

CRANE first determines the repositories the user can see and only then ranks. The user sees what they cannot read neither in the list nor in the counters.

Hosted and proxy repositories are ranked in separate lists, which are then merged. For this reason a large cache of public packages does not push out internal ones.

## Two legs of search {#legs}

The **lexical leg** searches a full-text index of the name, description and keywords. The query is first built strictly (all terms), and if there are few results, it is relaxed to "any of" for at most seven terms. CRANE also scores how close the normalized name is to the query by trigrams, so typos do not stop a package from being found. The leg returns up to 100 candidates.

The **semantic leg** compares the meaning of the query with the meaning of a package. For each package (not each version) CRANE builds a vector from the name, description, keywords and the README of the latest released version and recomputes it when the text changes. The vector comes from an embedding model over an OpenAI-compatible protocol, and the index is stored in PostgreSQL. This leg also returns up to 100 candidates. A model change runs side by side: CRANE fills the vectors of the new model, builds its index, switches the model being read and only then removes the old one, without rewriting the package table.

The semantic leg applies the access filter inside the query itself, so it does not return packages the user may not read.

## Fusion and order {#fusion}

CRANE merges the legs by rank, not by raw scores: the contribution of each leg is its weight divided by the sum of the constant 60 and the candidate's rank in the leg (reciprocal rank fusion). This makes scores of different scales comparable. The leg weights and the reranker weight are starting values and are calibrated on your own query set.

If a reranker is configured (a cross-encoder over the query), it reorders up to 40 top candidates, and its normalized score is added to the rank. Without a reranker the fusion defines the order.

The order is built in two steps: first the composition, then the order. A threshold cuts off weak matches, but the first result always stays, so the result list is never empty without a reason. Then the signal multipliers apply.

## Ordering signals {#signals}

The multipliers do not change the composition of the results, only their order. The values are starting values.

| Signal | Multiplier |
| --- | --- |
| The package belongs to the user's team | ×1.15 |
| Downloads over 30 days | ×(1 + 0.05·ln(1 + n)) |
| Has a README and an owner | ×1.10 |
| The latest release is older than 2 years | ×0.85 |
| Deprecated package (deprecated, EOL) | ×0.30, with the recommended replacement shown |
| An open critical vulnerability in the latest version | ×0.80, with a badge |
| Exact name match | Always the first position |

These multipliers affect convenience, not security: ranking a package lower does not block its installation. Blocks and quarantine are described in {{< xref "features/security/vulnerability-flow" >}} and {{< xref "features/security/upstream-quarantine" >}}.

## Hints next to results {#hints}

Search data feeds two heuristics. Both give a candidate for review, not a verdict.

- **A similar name.** If a package name is one Damerau–Levenshtein edit away from a popular or an internal name and the upstream download count is low, the card shows a warning. This is how CRANE helps to notice {{< term "typosquatting" >}} ({{< xref "features/security/supply-chain-threats" >}}).
- **Duplicate libraries.** Packages whose README and description embeddings have a cosine similarity of 0.88 or more and whose key dependencies overlap by 50% or more are shown as possible duplicates.

## If models are unavailable {#degradation}

- **No embedding model.** Search works lexically. The console shows the banner "Assistants unavailable: search works without semantics".
- **No reranker.** Rank fusion and the threshold define the order.
- **No model at all.** Search works only lexically and stays functional.

Search is also available to external agents: the `search_packages` skill of the A2A protocol uses the same search and the same access filter ({{< xref "features/registry/integrations#a2a" >}}).

## Related pages {#related}

{{< cards "features/registry/console" "features/security/ai-boundaries" >}}

- {{< xref "features/registry/hosted#package-lifecycle" >}}
