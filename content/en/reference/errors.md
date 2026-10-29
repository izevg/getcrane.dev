---
title: "Errors and response codes"
description: "Reference of CRANE error responses: body shapes for Cargo, npm and problem+json, fields, problem types, headers and the meaning of each code and text."
audience: [developer, platform]
genre: reference
state: current
status: available
weight: 70
terms: [fail-closed]
---

CRANE answers an error with an HTTP code and a short body that holds a text in Russian and a request identifier. The body shape depends on the route: Cargo and npm clients get a body in the format of their protocol, while the other routes and the probe port use `application/problem+json` ({{< cite "rfc-9457" >}}). Storage addresses, passwords and internal causes never reach the body; they stay in the log ({{< xref "operations/logs" >}}).

The reference lists the body shapes, the `problem+json` fields, the problem types, the headers and the meaning of each code with the text from the server. What to do about a specific error is described in {{< xref "operations/troubleshooting" >}}.

## Body shapes {#body-forms}

| Route | `Content-Type` | Body |
| --- | --- | --- |
| Cargo, `/cargo/<repo>/…` | `application/json` | `{"errors":[{"detail":"<text> (request_id <id>)"}]}` |
| npm, `/npm/<repo>/…` | `application/json` | `{"error":"<text> (request_id <id>)"}` |
| Other paths of the API port, the probe port | `application/problem+json` | A `problem+json` object |

Cargo and npm clients show the user only the error text, so the request identifier is appended to the text as the suffix `(request_id <id>)`.

## problem+json fields {#problem-fields}

| Field | Value |
| --- | --- |
| `type` | The problem type: `about:blank` or `urn:crane:problem:storage-unreachable` |
| `title` | The standard HTTP status phrase in English: `Not Found`, `Service Unavailable` |
| `status` | The response code |
| `detail` | The text in Russian |
| `request_id` | The request identifier |

The body has no other fields.

## Problem types {#problem-types}

| `type` | When |
| --- | --- |
| `urn:crane:problem:storage-unreachable` | The catalog or the blob storage did not answer: retrying later makes sense. Always `503` |
| `about:blank` | All other cases, including the `503` "хранилище не готово" (storage not ready): the response code sets the meaning |

For Cargo and npm clients the type is not sent: their body shapes have no `type` field.

## Response codes {#statuses}

The `detail` column shows a fixed text, and `<…>` marks a substituted value.

### Package client requests {#statuses-client}

| Code | `detail` | When |
| --- | --- | --- |
| `400` | the reason text | An invalid name or version, an unparsable publish document, a refusal by a format rule (for example, a dependency from a foreign registry in Cargo) |
| `400` | `ошибка чтения тела запроса` (error reading the request body) | The request body was cut off |
| `400` | ``крейт уже опубликован под именем `<имя>` `` (the crate is already published under the name) | Cargo: publishing with a different spelling of the name |
| `400` | `операция не поддерживается` (operation not supported) | npm: a `PUT` of a document that is neither a publish nor a deprecate |
| `401` | `требуется токен` (token required) | The request has no token header; the response carries the format's `WWW-Authenticate` |
| `403` | `токен отвергнут` (token rejected) | The token is wrong or presented in a wrong scheme; a failed authentication goes to the audit |
| `403` | `версия недоступна: Quarantined` or `Blocked` (version unavailable) | The version is in a state in which its file is not served |
| `403` | `окно удаления закрыто: версия опубликована слишком давно` (deletion window closed: the version was published too long ago) | Deleting a version after the window |
| `403` | `имя принадлежит namespace другого workspace` (the name belongs to another workspace's namespace) | Publishing a name reserved for another team |
| `403` | `имя занято в публичном реестре: для публикации нужна резервация платформы (CRANE_NAMESPACES)` (the name is taken in the public registry: publishing needs a platform reservation) | The new name already exists in the public registry |
| `404` | `репозиторий не найден` (repository not found) | The repository is not created: check {{< env "CRANE_CARGO_REPOS" >}} and {{< env "CRANE_NPM_REPOS" >}} |
| `404` | `версия не найдена`, `файл версии не найден`, `тег не найден` (version, version file or tag not found) | No version, file or tag |
| `404` | `не найдено` (not found) | No package or file. A proxy request for a name that CRANE treats as internal gets the same answer, so the reason is not revealed |
| `404` | `маршрут не найден` (route not found) | A path outside the mounted routes; the body is `problem+json` |
| `405` | `репозиторий не hosted: публикация запрещена` (the repository is not hosted: publishing is forbidden) | A write to a proxy repository |
| `409` | `версия уже существует`, `файл версии уже существует` (the version or its file already exists) | A repeated publish. A version number is taken forever, including after deletion |
| `410` | `версия недоступна: Deleted` (version unavailable) | The version was deleted |
| `413` | the server text | The publish body is larger than {{< env "CRANE_MAX_PUBLISH_BYTES" >}} |
| `422` | `контрольная сумма не совпала: заявлена <…>, получена <…>` (checksum mismatch: declared, received) | The digest declared by the client differs from the computed one |
| `422` | `формат требует scope в имени пакета` (the format requires a scope in the package name) | Publishing an npm package without a scope to a hosted repository |
| `501` | `аудит уязвимостей через реестр не поддерживается` (vulnerability audit through the registry is not supported) | npm: an `npm audit` request |
| `501` | a message that owner management is unavailable | Cargo: `PUT` or `DELETE` on `owners` |

### Dependency failures {#statuses-dependency}

| Code | `detail` | When |
| --- | --- | --- |
| `500` | `внутренняя ошибка сервера` (internal server error) | A storage failure that is not unavailability, or a broken invariant. The cause is in the log: the record "внутренняя ошибка запроса" (internal request error) |
| `502` | `upstream недоступен` (upstream unavailable) | Proxy: the upstream did not answer, refused, sent a document that cannot be parsed, an archive with a wrong checksum, or an archive larger than {{< env "CRANE_PROXY_MAX_ARTIFACT_BYTES" >}}; npm: the version has no sha512 |
| `503` | `хранилище временно недоступно` (storage temporarily unavailable) | The catalog or the blob storage did not answer: {{< term "fail-closed" >}}. The type is `urn:crane:problem:storage-unreachable` |
| `503` | `не удалось проверить имя в публичном upstream: повторите позже` (could not check the name in the public upstream: retry later) | Publishing a new name while the public registry is unavailable |

### Probe port {#statuses-probes}

| Code | `detail` | When |
| --- | --- | --- |
| `503` | `хранилище временно недоступно` (storage temporarily unavailable) | Readiness probe: the storage did not answer or exceeded 1.5 s. The type is `urn:crane:problem:storage-unreachable` |
| `503` | `хранилище не готово` (storage not ready) | Readiness probe: the storage answered with an error. The type is `about:blank` |
| `404` | `маршрут не найден` (route not found) | Any path except `/healthz/live` and `/healthz/ready`, including `/metrics` |

## Response headers {#headers}

| Header | When |
| --- | --- |
| `X-Request-Id` | In every response of both ports. It is the identifier from the error body and the log; the server accepts a foreign value only from trusted proxies ({{< env "CRANE_TRUSTED_PROXIES" >}}) |
| `Retry-After: 10` | In every `503` response, regardless of the format |
| `WWW-Authenticate` | In a `401` response: `Cargo` for Cargo and `Bearer realm="crane"` for npm |
| `Age`, `Warning` | In proxy responses served from the cache. `Warning: 110 - "Response is Stale"` is a stale copy, `Warning: 111 - "Revalidation Failed"` is a copy served because the upstream failed |

## What next {#next}

- {{< xref "operations/troubleshooting" >}}
- {{< xref "features/security/fail-closed#client-response" >}}
- {{< xref "reference/protocol-endpoints" >}}
- {{< xref "reference/ports-and-health#failure" >}}
