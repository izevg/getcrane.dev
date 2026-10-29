---
title: "Settings encryption key"
description: "How to create and give the server an AES-256-GCM key for secrets that CRANE keeps in PostgreSQL: the format, startup checks and behavior when the key is lost."
audience: [platform, security]
genre: how-to
state: current
status: available
weight: 80
terms: [fail-closed]
---

This page describes the key with which CRANE encrypts secret settings in the PostgreSQL `setting` table. {{< env "CRANE_SETTINGS_KEY" >}} or the file named by {{< env "CRANE_SETTINGS_KEY_FILE" >}} sets the key: base64 of 32 bytes, an AES-256-GCM key. Without the key, secrets are neither written to nor read from PostgreSQL.

Today the server reads the PostgreSQL settings layer at startup but has no interface that writes settings to it (see {{< xref "configure#stored" "Settings in PostgreSQL" >}}). The key is therefore needed today only to open encrypted rows that the table already holds. The variable is optional.

## Before you begin {#prerequisites}

- A persistent `postgres://` catalog. With the `memory` catalog the key is a startup error.
- The `openssl` command for the example below; any generator of 32 random bytes works.

## Steps {#steps}

1. Create the key and save it to a file. The server strips a trailing newline from the file; whitespace inside the key is not allowed.

   ```bash
   umask 077
   openssl rand -base64 32 > ./secrets/settings_key
   ```

2. Give the server the path to the file. The key is set in exactly one way.

   ```ini
   CRANE_SETTINGS_KEY_FILE=/run/secrets/settings_key
   ```

   The TOML file accepts the `settings_key_file` key. The encryption key is read only from the environment and the file: the PostgreSQL layer does not set it.

3. Restart the server.

> [!IMPORTANT]
> A lost key cannot be recovered: secrets sealed with it cannot be decrypted. Keep the key apart from PostgreSQL backups, otherwise a backup and the key together expose the secrets.

## Verify {#verify}

The server checks the key at startup and names the problem without quoting the content: the message contains only the length. The texts are printed in Russian. The examples are in this order: not base64, wrong length, a key with the `memory` catalog, a key together with its file.

```text
CRANE_SETTINGS_KEY: ключ шифрования не является base64 (standard, с выравниванием, без пробелов)
CRANE_SETTINGS_KEY: ключ шифрования после base64 занимает 31 байт, нужно ровно 32
CRANE_SETTINGS_KEY: ключ шифрования не нужен при memory
переменные CRANE_SETTINGS_KEY и CRANE_SETTINGS_KEY_FILE взаимоисключающие
```

A successful start without these messages confirms that the key is accepted.

## How it works {#mechanism}

A secret is stored as `nonce (12 bytes) ‖ ciphertext ‖ tag (16 bytes)`. The ciphertext is bound to the setting name, the row version number and the key fingerprint, so ciphertext moved to another row or left over from an old version does not open. The fingerprint is the first 8 bytes of the SHA-256 of the key in hexadecimal (16 characters); the key cannot be recovered from it. A row stores the fingerprint of the key that sealed it.

## Unreadable rows {#unreadable}

If a secret row in PostgreSQL does not open, the server does not start and does not substitute a default: this is {{< term "fail-closed" "fail closed" >}} behavior. The exception is a setting already set by the environment or the file: its PostgreSQL row is not used and not decrypted. The message names the setting and the reason, never the value. The reasons:

```text
настройка `token` в БД не читается: задайте CRANE_SETTINGS_KEY: строка запечатана, а ключа нет
настройка `token` в БД не читается: строка запечатана ключом <отпечаток записи>, текущий ключ <отпечаток ключа>
настройка `token` в БД не читается: шифртекст повреждён или принадлежит другой строке
```

The first message means no key is set, the second that another key is set (both fingerprints are named), the third that the ciphertext is damaged.

## What next {#next}

- {{< xref "configure" >}}
- {{< xref "configure/storage" >}}
- {{< xref "reference/environment-variables" >}}
