---
title: "How to read the documentation"
description: "How pages marked Design differ from pages marked Current, what “This functionality is in development” means, and how the sections are organized."
audience: [developer, platform, security, auditor]
genre: explanation
state: current
status: available
weight: 50
terms: []
---

The CRANE documentation keeps two questions apart: how CRANE is built, and what can be done with it today. The badge under each page title says which of the two the page answers.

## Design {#target}

Pages marked “Design” describe how CRANE is built: its security guarantees, architecture, principles and registry features. These are the {{< xref "features" >}} section and the {{< xref "start/concepts" >}} page. They answer “how does this work and why”, not “which command turns it on”.

Every guarantee on these pages is stated together with its limits: where it applies and where it stops. A guarantee means a verifiable property of a mechanism, not a legal commitment: {{< xref "features/security#meaning" >}}.

## Current {#current}

Pages marked “Current” describe what exists in the code today: deployment, settings, environment variables, commands, package formats, references and operations. Names, defaults, response codes and error messages on these pages match the code.

## In development {#in-development}

When a capability is described in Features but is not in the current release yet, its settings or reference page still exists. It carries an “In development” badge and one line about what will appear. The documentation gives no dates or version numbers.

## Sections {#sections}

| Section | What it covers | State |
| --- | --- | --- |
| {{< xref "start" >}} | What CRANE is, the quickstart, core concepts | mixed |
| {{< xref "features" >}} | Security first, registry management, deployment and maintenance | design |
| {{< xref "deploy" >}} | Deployment options and requirements | current |
| {{< xref "configure" >}} | Settings by task | current |
| {{< xref "formats" >}} | Connecting the clients of each format | current |
| {{< xref "security" >}} | Deployment security, the security journal, reporting a vulnerability | current |
| {{< xref "reference" >}} | Variables, server roles, ports, errors, protocols | current |
| {{< xref "operations" >}} | Probes, logs, upgrades, outages | current |
| {{< xref "glossary" >}} | Term definitions | — |

## Audiences {#audiences}

The chips under the title name who benefits most from the page: a developer, a platform engineer, a security engineer or an auditor. The first screen of a page is written for the first audience named; details for the others are folded into blocks labelled with that audience.
