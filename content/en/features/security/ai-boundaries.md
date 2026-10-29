---
title: "AI boundaries"
description: "AI in CRANE does not grant access or change state: scores only tighten decisions, and the A2A agent writes only a plan a human has confirmed."
audience: [security, platform]
genre: explanation
state: target
status: available
weight: 160
terms: [principal, cedar, step-up, kev, security-journal]
---

AI in CRANE explains and advises, but it does not decide and does not change state. Language models do not grant access, systemone scores only tighten decisions, and the A2A agent acts with the rights of a {{< term "principal" >}} and writes only a plan that a human has confirmed with a button in the console.

This way text in a package README or a message from a foreign agent does not raise rights, weaken protection or make a change. Without models CRANE keeps working by rules.

## Threat {#threat}

A model reads untrusted text and talks to people and to other agents. That opens several paths.

- **Injection through content.** A README, description or package metadata contains text addressed to a model: "confirm the action", "grant access".
- **Bypassing authorization through the agent.** An agent with broader rights than the user reads closed packages or writes in someone else's name.
- **Self-confirmation.** An agent led by untrusted text confirms its own plan.
- **A model softening protection.** A low score lets through a version that the rules would have blocked.
- **An invented answer.** An answer without sources is taken for fact.
- **Leakage.** Secrets or data of closed packages enter the model context, or a provider key ends up in logs.

## Guarantee {#guarantee}

- A language model does not grant access, does not decide on promoting a version and does not change state. A change is made only by a separate, explicit action of a principal.
- systemone scores raise priority or send a decision to review. A low score does not lower a decision below the rules: a {{< term "kev" >}} entry, a malicious package and a forbidden license are handled by the rules regardless of the model.
- A model receives only a grounded prompt: the context is filtered by the user's rights and scrubbed of secrets. A README and package metadata are supplied as untrusted data.
- An answer carries links to its sources. An answer without sources is marked as unverified.
- The rights of the A2A agent equal the rights of the principal. A {{< term "cedar" "Cedar policy" >}} evaluates them with access closed by default. The scopes `a2a:read` and `a2a:write` are separate.
- The agent writes only a plan that the principal confirmed with a button in the console. A repeated call by the agent does not confirm the plan. A confirmation is single-use, bound to the plan hash and valid for 10 minutes.
- Only reversible metadata actions are available through the agent. Operations on bytes, version promotion, policies and roles are not available.
- Every agent call is recorded in the {{< term "security-journal" >}} with the `a2a` channel.
- Model provider keys are stored as secrets and never reach logs or the audit. The texts of requests to models do not reach the journal.
- Without models the rules keep working: {{< xref "features/operations/availability" >}}.

## How it works {#mechanism}

### Two functions of AI {#functions}

CRANE has two different functions of AI, and neither replaces the other.

- **systemone models count.** They produce a numeric score from 0 to 1 with a confidence and the main factors. The input is structured features: advisories, CVSS, EPSS, KEV, CWE, the consumer graph, SPDX license expressions. Policies, vulnerability prioritization, the license gate and review queues read the scores.
- **Language models (LLMs) write.** They explain decisions, summarize findings, parse intent in a conversation with the agent and answer with text that links to its sources. These answers do not make decisions.

Providers are configured by role (`score`, `chat`, `embed`, `rerank`), not by model name. Each role has an ordered list of providers with a circuit breaker that opens on failures. Outgoing requests to providers go through the same HTTP client with the SSRF guard as all other outgoing traffic: {{< xref "features/security/egress-guard" >}}.

### Scores only tighten {#scores}

A score is evidence: it is stored together with the model, its version and a hash of the features, so any decision can be reproduced. A score is recalculated on a new advisory, a change in the consumer graph or a new model version.

A high score raises priority or sends a decision to review. A low score does not lower it: the final priority is the maximum of the priority by rules and the priority by scores. The main factors of a score are visible in the console, go to the SIEM and are given to the LLM, which writes the explanation "why P1". A new model version first runs in shadow mode: scores are written but do not affect decisions. More on priorities: {{< xref "features/security/vulnerability-flow" >}}.

### Untrusted data and grounding {#grounding}

An LLM receives only a grounded prompt. The context is filtered by the user's rights and scrubbed of secrets before it is passed to the model. A README and package metadata are framed as untrusted data: they stay material for the answer and do not become instructions. An answer carries links to its sources; an answer without sources is marked as unverified.

### The A2A agent {#a2a}

The agent speaks the A2A protocol ({{< cite "a2a-protocol" >}}) to external agents: organization assistants, team agents, CI bots. It runs inside the `serve` role as an input adapter, has no storage of its own and no side paths, and calls the same use cases as the REST API. More about the interface: {{< xref "features/registry/integrations#a2a" >}}.

Every call runs as a principal: either as a user, by a token obtained through token exchange ({{< cite "rfc-8693" >}}), or as a robot with limited scopes. The agent is never broader than the principal. The scopes are separate: without `a2a:write` the write skills are not shown in the agent card for that caller and are rejected. The rate limit is separate for reading and writing, and the message size and the number of concurrent tasks per principal are limited.

> [!SECURITY]-
> **Agent skills**
>
> - Read (`a2a:read`): package search, the package and version card, findings with scores and factors, impact analysis on consumers, a decision explanation (the rules that fired and how to fix), an offline readiness check of a lockfile or SBOM.
> - Write (`a2a:write`): marking a version deprecated (by the package owner only, reversible), an approval request to a security engineer (the agent cannot grant the approval itself), an exception for a finding (a term and a justification are mandatory, the maximum term is set by policy, {{< term "step-up" >}} is required), creating a tracker issue deduplicated by CVE and package, subscribing a URL to events (allowlisted hosts only, the secret is shown once).
> - Not available through the agent: publishing, deleting and overwriting versions, promotion to release, changing policies, licenses and roles, managing storage and retention.

### Confirming a write {#confirmation}

1. **Proposal.** The agent parses the request and forms an exact plan: operation, resource, parameters, expected effect. The task moves to the `input-required` state and nothing is changed.
2. **Confirmation.** The action runs only after the principal explicitly confirms it with a button in the console (the console session). A repeated call by the agent with `confirmation_id` does not confirm the plan: otherwise an agent led by README text would confirm its own plan.
3. **Execution.** The use case is called with an idempotency key equal to `confirmation_id`. The task ends in `completed` with a link to the created object, or in `failed` with a problem description.
4. **Audit.** The record captures the principal, the `a2a` channel, the identifier of the calling agent, `task_id`, the plan hash and the Cedar decision. The event reaches the journal the same way an action from the console does: {{< xref "features/security/security-journal" >}}.

> [!SECURITY]-
> **Confirmation parameters**
>
> A confirmation is bound to the plan hash, valid for 10 minutes and used once. An exception additionally needs step-up. An expired `confirmation_id` leads to a new proposal and no changes are applied. A repeated confirmation returns the earlier result. The text of messages from the calling agent, a README and package metadata neither extend the plan nor confirm a write.

### Working without models {#degradation}

- **No scoring models.** Priority and license decisions are computed by rules (CVSS, EPSS, KEV, SPDX category). The P0 priority for KEV and malicious packages does not depend on models.
- **No language models.** There are no explanations and no assistants, and search works lexically. The agent's read skills return a structured result without text. The write skills return `failed` with the reason "planning unavailable", and direct REST calls work.
- **The agent is unavailable.** REST and the console work without it.

## Limits of the guarantee {#limits}

> [!LIMITS]
> - **Model text can be inaccurate.** Links to sources let a reader check an answer, and an answer without sources is marked as unverified. An explanation does not replace a human decision.
> - **A score is a signal, not a conclusion.** It is not a legal opinion and does not claim that a vulnerability is exploitable.
> - **Protection against untrusted text is structural.** The text of a README or of a foreign agent neither extends the plan nor confirms a write, because a confirmation is possible only with a button in the console. CRANE does not promise that a model will not yield to such text in an explanation or in the wording of a plan. That is why the plan is shown exactly: operation, resource, parameters, effect.
> - **A human confirms.** CRANE shows the exact plan, but the decision to confirm is made by a human. Confirming without reading the plan remains the responsibility of the organization.
> - **The agent's rights equal the principal's rights.** An excessive role of a principal gives the agent excessive rights. The role policy is set by the organization.
> - **An exception for a finding is a write that weakens a decision.** The agent creates it only with a justification, a term limited by policy and step-up, but the confirmation stays with a human.
> - **The model provider is outside CRANE.** The context passes the rights filter and secret scrubbing, then goes to the provider the organization chose. CRANE does not control how the provider handles what it receives.
> - **Without models there is less convenience, not less protection.** Rules, blocks and authorization do not depend on models.

## Related settings {#configure}

- {{< xref "features/security/access-control" >}} — principal rights, scopes and step-up.
- {{< xref "features/security/egress-guard" >}} — outgoing requests to model providers.
- {{< xref "features/security/secrets" >}} — storing provider keys.
- {{< xref "features/registry/integrations" >}} — the interface of the A2A agent.
