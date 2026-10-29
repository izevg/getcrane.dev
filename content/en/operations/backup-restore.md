---
title: "Backup and restore"
description: "Backing up PostgreSQL and the blob storage and verifying a restore with the crane restore verify command; the functionality is in development."
audience: [platform]
genre: how-to
state: current
status: in-development
weight: 50
terms: []
---

{{< in-development >}}Restore verification with the `crane restore verify` command: it compares the restored PostgreSQL catalog with the blob storage and reports files without a blob or with a wrong SHA-256.{{< /in-development >}}
