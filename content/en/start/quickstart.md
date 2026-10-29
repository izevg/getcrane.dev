---
title: "Quickstart"
description: "Run CRANE on a single node with Docker Compose, publish a Cargo crate to a hosted repository and install dependencies through the crates.io and npmjs proxies."
audience: [platform, developer]
genre: tutorial
state: current
status: available
weight: 20
terms: [hosted-repository, proxy-repository, upstream, namespace, sparse-registry]
---

This tutorial runs CRANE on a single node with Docker Compose and follows one path: publish a crate to the `internal` {{< term "hosted-repository" >}}, build a project that depends on it, build a project with a crates.io dependency through a {{< term "proxy-repository" >}}, and install an npm package through the npm proxy repository. All commands run on one machine.

The setup is minimal: a cache in process memory (`memory`), blobs on a local Docker volume, PostgreSQL in a container. A static token protects access to the protocols, and Caddy serves TLS for the name `localhost` with its own certificate authority. A production deployment is described in {{< xref "deploy" >}}.

## Prerequisites {#prerequisites}

- Docker Engine and Docker Compose.
- Git, curl and a POSIX shell (Linux or macOS).
- Task (go-task) and Node.js 24: they are needed only for `task secrets:init`.
- `cargo`, latest stable. The last step also needs Node.js and `npm`.
- Free ports 80 and 443 on the host (`CADDY_HTTP_PORT`, `CADDY_HTTPS_PORT`).
- Internet access: images and dependencies are built from public sources, and the CRANE proxy repositories contact crates.io and registry.npmjs.org.

## Get the sources and build the image {#build}

The CRANE image is built locally from `deploy/docker/Dockerfile` and is not published to a registry. The name and tag `crane/crane:latest` match `CRANE_IMAGE` and `CRANE_VERSION` in `.env.dist`.

```bash
git clone <repository-url> crane
cd crane
docker build -f deploy/docker/Dockerfile -t crane/crane:latest .
```

Compose pulls the other images (Caddy, PostgreSQL) on startup.

## Prepare the environment {#env}

Copy the environment template. Compose takes all values from `.env`: the compose file has no defaults, and a missing variable stops the startup.

```bash
cp .env.dist .env
```

Set three values in `.env`. The `CRANE_NAMESPACES` line already exists and is empty; add the other two lines.

```ini
CRANE_NAMESPACES=cargo:acme-*
CRANE_CARGO_PROXY_REPOS=crates-io
CRANE_NPM_PROXY_REPOS=npmjs
```

`CRANE_NAMESPACES` reserves Cargo crate names with the prefix `acme-` for the platform. Publishing a name covered by a {{< term "namespace" >}} needs no request to crates.io, and CRANE never serves such a name from an {{< term "upstream" >}}. `CRANE_CARGO_PROXY_REPOS` and `CRANE_NPM_PROXY_REPOS` create the proxy repositories `crates-io` and `npmjs`. The Cargo hosted repository `internal` exists without configuration.

Create the secret files: the access token, the PostgreSQL password and the catalog URL. The task creates only the missing files and overwrites nothing. It does not print the values.

```bash
task secrets:init
```

The files live in the `secrets/` directory, which git ignores.

## Start the stack {#start}

Run the command from the repository root. The `--project-directory .` option is required: paths in the compose file are resolved from the root, not from `deploy/compose`.

```bash
docker compose --project-directory . -f deploy/compose/docker-compose.yaml up -d --wait
```

Compose starts PostgreSQL, applies migrations in a separate `migrate` container, starts `crane` in the `all` role and starts Caddy. The command returns when the `crane healthcheck` probe passes.

## Trust the Caddy certificate and check access {#trust}

For `localhost`, Caddy issues a certificate with its own certificate authority. Copy its root certificate out of the container. If the file does not exist yet, wait a few seconds and repeat the command: Caddy creates the certificate on first start.

```bash
docker compose --project-directory . -f deploy/compose/docker-compose.yaml \
  cp caddy:/data/caddy/pki/authorities/local/root.crt secrets/caddy-root.crt
```

Set the shell variables. `cargo` and `npm` need them in the next steps, so run the remaining commands in the same shell. The token lives in `secrets/crane_token`: Compose passes it to the server as a file through `CRANE_TOKEN_FILE`, and CRANE compares the token of every protocol request with it. The same token serves the hosted and the proxy repositories.

```bash
export CRANE_CA="$PWD/secrets/caddy-root.crt"
export CARGO_HTTP_CAINFO="$CRANE_CA"
export NODE_EXTRA_CA_CERTS="$CRANE_CA"
export CARGO_REGISTRIES_CRANE_TOKEN="$(cat secrets/crane_token)"
export CARGO_REGISTRIES_CRANE_PROXY_TOKEN="$CARGO_REGISTRIES_CRANE_TOKEN"
export NPM_TOKEN="$CARGO_REGISTRIES_CRANE_TOKEN"
```

> [!WARNING]
> `CARGO_HTTP_CAINFO` replaces the set of certificates that `cargo` trusts, and the Caddy root certificate is valid only for this stand. Do not add it to the system certificate store.

Check that the registry responds. The token goes through stdin (`-K -`), so it does not appear in the process list.

```bash
printf 'header = "Authorization: %s"\n' "$CARGO_REGISTRIES_CRANE_TOKEN" \
  | curl -fsS --cacert "$CRANE_CA" -K - https://localhost/cargo/internal/index/config.json
```

CRANE returns the {{< term "sparse-registry" >}} configuration of the `internal` hosted repository:

```json
{"api":"https://localhost/cargo/internal","auth-required":true,"dl":"https://localhost/cargo/internal/api/v1/crates"}
```

A request without an `Authorization` header gets `401`, and a request with a wrong token gets `403`.

## Connect cargo to the repository {#cargo-config}

Create a working directory next to the CRANE sources. `cargo` reads `.cargo/config.toml` from the current directory and all its parents, so the setting applies to every project inside it.

```bash
mkdir -p ../crane-quickstart/.cargo
cd ../crane-quickstart
cat > .cargo/config.toml <<'EOF'
[registries.crane]
index = "sparse+https://localhost/cargo/internal/index/"
credential-provider = "cargo:token"
EOF
```

`credential-provider = "cargo:token"` makes `cargo` take the token from the `CARGO_REGISTRIES_CRANE_TOKEN` variable.

## Publish a crate {#publish}

Create the crate `acme-hello`. Its name is covered by the reservation `cargo:acme-*`.

```bash
mkdir -p acme-hello/src
cat > acme-hello/Cargo.toml <<'EOF'
[package]
name = "acme-hello"
version = "0.1.0"
edition = "2021"
description = "CRANE quickstart"
license = "MIT"
EOF
cat > acme-hello/src/lib.rs <<'EOF'
pub fn version() -> &'static str {
    "0.1.0"
}
EOF
cd acme-hello
cargo publish --registry crane
cd ..
```

The command finishes without an error when CRANE has accepted the crate. Publishing the same version again is rejected: a published release cannot be overwritten.

## Build a project with a dependency from the hosted repository {#consume}

The project `acme-app` depends on `acme-hello` from the `crane` repository.

```bash
mkdir -p acme-app/src
cat > acme-app/Cargo.toml <<'EOF'
[package]
name = "acme-app"
version = "0.1.0"
edition = "2021"

[dependencies]
acme-hello = { version = "0.1", registry = "crane" }
EOF
cat > acme-app/src/main.rs <<'EOF'
fn main() {
    println!("{}", acme_hello::version());
}
EOF
cd acme-app
cargo run -q
cd ..
```

The project prints the version from the published crate:

```text
0.1.0
```

## Build a project through the crates.io proxy {#proxy}

Add a replacement of the `crates-io` source with the `crates-io` proxy repository to the configuration. After that, `cargo` downloads all crates.io dependencies through CRANE. CRANE fetches each file from the upstream itself on the first request and stores it in the cache; repeated requests are served from the cache.

```bash
cat >> .cargo/config.toml <<'EOF'

[source.crates-io]
replace-with = "crane-proxy"

[registries.crane-proxy]
index = "sparse+https://localhost/cargo/crates-io/index/"
credential-provider = "cargo:token"
EOF
```

Build a project that depends on `form_urlencoded` version 1.2.1:

```bash
mkdir -p proxy-app/src
cat > proxy-app/Cargo.toml <<'EOF'
[package]
name = "proxy-app"
version = "0.1.0"
edition = "2021"

[dependencies]
form_urlencoded = "=1.2.1"
EOF
cat > proxy-app/src/main.rs <<'EOF'
fn main() {
    println!("{}", form_urlencoded::byte_serialize(b"a b").collect::<String>());
}
EOF
cd proxy-app
cargo run -q
cd ..
```

The result:

```text
a+b
```

## Install an npm package through the proxy {#npm}

The npm proxy repository `npmjs` is available at `https://localhost/npm/npmjs/`. The `.npmrc` file makes it the default registry and passes the token from the `NPM_TOKEN` variable, so the value never lands in the file.

```bash
mkdir npm-app
cd npm-app
cat > .npmrc <<'EOF'
registry=https://localhost/npm/npmjs/
//localhost/npm/npmjs/:_authToken=${NPM_TOKEN}
EOF
cat > package.json <<'EOF'
{ "name": "npm-app", "version": "1.0.0" }
EOF
npm install is-number@7.0.0
ls node_modules/is-number/package.json
cd ..
```

The `ls` command prints the file path when the package is installed:

```text
node_modules/is-number/package.json
```

## Stop the stand {#stop}

Return to the CRANE sources directory and stop the containers:

```bash
cd ../crane
docker compose --project-directory . -f deploy/compose/docker-compose.yaml down
```

The catalog and blob volumes are kept, and the next start continues with the same data. To remove the stand together with its data, add the `-v` flag.

> [!WARNING]
> `down -v` irreversibly deletes the PostgreSQL and blob volumes: all published packages and the proxy cache are lost.

## What's next {#next}

- {{< xref "start/concepts" >}} — the concepts behind repositories, versions and access.
- {{< xref "deploy/docker-compose" >}} — a single-node deployment with a public name and an ACME certificate.
- {{< xref "features/security/namespace-reservation" >}} — how name reservation protects internal packages from replacement.
- {{< xref "start/first-run" >}} — the first-run wizard.
