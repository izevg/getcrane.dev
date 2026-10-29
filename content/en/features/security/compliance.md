---
title: "Compliance"
description: "How the CRANE security journal and roles relate to the measures of FSTEC Order No. 21, why the product is not certified and what stays with the organization."
audience: [auditor, security]
genre: explanation
state: target
status: available
weight: 170
terms: [security-journal, separation-of-duties, hash-chain, worm]
---

CRANE provides technical measures that relate to the groups of measures in FSTEC of Russia Order No. 21: identification and authentication, access control and security event registration. The product is not certified, and compliance is ensured by the organization that runs CRANE.

CRANE is non-commercial free software without an SLA and without manufacturer obligations. The security of the {{< term "security-journal" >}} takes priority over privacy: there is no erasure by subject, and data leaves the journal only in whole periods. This page is not legal advice.

## Threat {#threat}

A compliance assessment goes wrong in three places, and each mistaken expectation creates a risk.

- **Measures are taken for a certificate.** The mapping of mechanisms to measures is read as a conclusion that a system complies, while that conclusion stays with the organization.
- **The journal is useless as evidence.** Records that can be quietly changed or partly erased do not prove who did what.
- **Erasure conflicts with integrity.** A demand to erase records by subject breaks a tamper-protected journal and erases the attacker's traces together with an employee's data.
- **Manufacturer obligations are expected from the project.** A free project without commercial activity has no SLA, no support period and no manufacturer liability.

## Guarantee {#guarantee}

- Every measure in the table below is implemented by a CRANE mechanism; the table names that mechanism.
- An audit record is written in the same transaction as the action: if it is not written to the journal, the action does not happen.
- An audit event joins a {{< term "hash-chain" >}}, and once an hour the last hash is fixed in immutable storage ({{< term "worm" >}}). Editing or removing a record is detected on verification.
- Only `secops` and `auditor` read the journal; every reveal, search and export is recorded. The platform administrator does not see the journal.
- Data leaves the journal only at the end of the retention period and only in whole periods.
- The auditor receives a machine-readable responsibility matrix in the OSCAL format: it shows which measures the product takes and which the organization takes.
- The product does not claim certification or compliance on behalf of the organization.

## How it works {#mechanism}

### Measures of FSTEC Order No. 21 {#fstec}

FSTEC of Russia Order No. 21 ({{< cite "fstec-order-21" >}}) sets the composition of organizational and technical measures for protecting personal data in information systems. The table maps the technical measures to CRANE mechanisms.

| Measure | What it requires | How it is implemented |
| --- | --- | --- |
| ИАФ.1 (IAF.1) | Identification and authentication of users | People sign in through the organization's OIDC provider, with MFA and step-up by `acr`, `amr` and the freshness of `auth_time` |
| УПД.2 (UPD.2) | The method and rules of access control | Roles and Cedar policies, access closed by default |
| УПД.4 (UPD.4) | Separation of the powers of users and administrators | The platform administrator does not read the journal; incompatible roles are not combined in one person |
| УПД.5 (UPD.5) | Minimum necessary rights | Roles per team, scopes and token lifetimes, masking of personal data for `auditor` |
| РСБ.1, РСБ.2 (RSB.1, RSB.2) | The list of events, the composition of information, retention periods | An event catalog with common fields; a download stream with its own set of fields; a configurable retention period |
| РСБ.3 (RSB.3) | Collection, recording and storage | Writing through a database role without rights to modify or delete, WORM anchors, export to a SIEM; a download stream in partitions with an hourly digest in the chain |
| РСБ.4 (RSB.4) | Responding to registration failures | Audit in the same transaction as the action; alerts on the lag of the outgoing event queue and of the export |
| РСБ.5 (RSB.5) | Viewing, analysis and response | The "Action journal" screen for `secops`, Sigma detection rules, a SOAR platform |
| РСБ.6 (RSB.6) | Timestamps and time synchronization | Time in UTC; time synchronization on the nodes, an alert on clock drift between replicas |
| РСБ.7 (RSB.7) | Protection of event information | A hash chain, a database role without modify and delete rights, WORM, access only for `secops` and `auditor`, an audit of access to the journal |

The mechanisms are described on the pages {{< xref "features/security/access-control" >}} (IAF and UPD) and {{< xref "features/security/security-journal" >}} (RSB). Separation of duties ({{< term "separation-of-duties" >}}) rests on the incompatibility of the platform administrator role with the `secops` and `auditor` roles.

> [!AUDITOR]-
> **Where the requirements come from**
>
> - Article 19 of Federal Law No. 152-FZ "On Personal Data" ({{< cite "fz-152" >}}) obliges an organization that processes personal data to take measures to protect it. The composition of the measures is set by Government of the Russian Federation Resolution No. 1119 (protection levels) and FSTEC of Russia Order No. 21: registration of security events (the RSB group), identification and authentication (IAF), access management (UPD).
> - For a state information system, FSTEC of Russia Order No. 17 applies, with the same groups of measures. For a significant critical information infrastructure (CII) object (Law 187-FZ), Order No. 239 applies, with the "Security audit" group of measures. For financial organizations, GOST R 57580.1-2017 applies, the process of registering information protection events.
> - Article 14 of 152-FZ gives an employee the right to obtain information about the processing of their personal data. That is why every user has a "My actions" view.

### Privacy and erasure {#privacy}

The journal contains personal data of employees and contractors: logins, names, IP addresses and the time of actions. It is therefore both a means of protection and an object of protection.

Security takes priority over privacy. The journal keeps real identifiers inside the hash chain on purpose. There is no erasure by subject and no pseudonymization "for deletion": the integrity and attribution of actions in the face of an attacker matter more than the right to erasure. Data leaves only at the end of the retention period, in whole periods. The same applies to the download stream. Masking in the console remains an access control measure: the data itself in storage does not change. The mechanism in detail: {{< xref "features/security/security-journal#privacy" >}}.

Erasure under Article 17 of the GDPR ({{< cite "gdpr" >}}) is not supported. Deployments subject to the GDPR assess this themselves.

### Certification {#certification}

The product is not certified by FSTEC of Russia. For systems that require certified tools (state information systems, significant CII objects), the organization decides separately: adopt compensating measures or certify the build.

### Project status and obligations {#project-status}

CRANE is distributed as free software under the Apache License 2.0 and stays that way: the project is not for sale. The project has no SLA, no guaranteed support period and no dedicated security team. Security fixes ship in the latest release, and backports are made when possible. Verifiability of releases is provided on a best-effort basis: SLSA provenance, cosign signatures, an SBOM, advisories in CSAF and VEX. The current state: {{< xref "security/release-verification" >}}.

CRANE is not placed on the market in the course of a commercial activity (recital 18 of Regulation (EU) 2024/2847, {{< cite "eu-cra" >}}). The project therefore does not take on the obligations of a manufacturer. Whoever ships CRANE inside a commercial product assesses their own obligations. This is not legal advice. How to report vulnerabilities: {{< xref "security/vulnerability-disclosure" >}}.

### Who is responsible for what {#responsibility}

CRANE provides the technical measures listed above. The organization that runs CRANE sets the protection level, the list of registered events and the retention periods in its own documents. It also configures the OIDC provider and the MFA requirement, roles and group mapping, trusted proxies, SIEM receivers, storage encryption and time synchronization on the nodes. The OSCAL matrix from the auditor bundle records this split: {{< xref "features/security/security-journal#auditor-bundle" >}}.

## Limits of the guarantee {#limits}

> [!LIMITS]
> - **The product is not certified.** The table maps mechanisms to measures. It is not a conclusion that an information system complies and does not replace the organization's own assessment.
> - **The organization ensures compliance.** The protection level, the list of events and the retention periods are set by its documents. Organizational measures of the order are outside the product.
> - **There is no erasure by subject.** Erasure under Article 17 of the GDPR is not supported; data leaves only at the end of the retention period, in whole periods.
> - **The chain detects tampering; it does not prevent it.** The protection rests on a database role without modify rights, WORM anchors and an independent copy in a SIEM: {{< xref "features/security/security-journal#limits" >}}.
> - **Some measures depend on the environment.** The MFA signal quality is decided by the OIDC provider, the accuracy of timestamps by the clock synchronization of the nodes, storage encryption by the platform.
> - **Systems that require certified tools settle the question separately.** Compensating measures or certification of the build rest with the organization.
> - **The project gives no SLA and no manufacturer obligations.** This is not legal advice.

## Related settings {#configure}

- {{< xref "features/security/security-journal" >}} — the security journal, retention and the auditor bundle.
- {{< xref "features/security/access-control" >}} — roles, step-up and separation of duties.
- {{< xref "security/security-events" >}} — the events the server writes to the security journal today.
- {{< xref "security/hardening" >}} — hardening a deployment.
