---
title: "Угрозы цепочки поставки"
description: "Каталог атак на цепочку поставки и на сам реестр CRANE: как каждая проявляется и какая гарантия CRANE на неё отвечает."
audience: [security]
genre: explanation
state: target
status: available
weight: 20
terms: [typosquatting, slopsquatting, dependency-confusion, upstream, proxy-repository, namespace, quarantine, attestation, digest, advisory, ssrf, security-journal]
---

Цепочка поставки — это путь пакета от автора до сборки. Атакующий может вмешаться в любой её отрезок: в выбор имени, в аккаунт автора, в канал доставки. Страница перечисляет угрозы, которые учитывает модель угроз CRANE, и для каждой называет гарантию, которая на неё отвечает. Отдельный список посвящён угрозам самому реестру.

Каталог не заменяет страницы гарантий. Условия, при которых защита не действует, описаны на каждой из них в блоке «Границы гарантии».

## Атаки через зависимости {#supply-chain}

### Typosquatting {#typosquatting}

{{< threat summary="Имя пакета отличается от популярного на одну букву — CRANE предупреждает о нём и может заблокировать." more="features/security/security-journal" chips="term:typosquatting, term:proxy-repository, label:Событие обнаружения" flow="Атакующий публикует похожее имя \| Разработчик ошибается в букве \| CRANE предупреждает о таком имени" >}}
{{< threat-what >}}
Атакующий публикует пакет с именем, похожим на популярное: `reqeusts` вместо `requests`. Разработчик ошибается в одной букве и устанавливает чужой код. Так выглядит {{< term "typosquatting" >}}.
{{< /threat-what >}}
{{< threat-answer >}}
- Для proxy-репозиториев CRANE сравнивает имя с популярными пакетами и с внутренними именами.
- Имя на расстоянии Дамерау–Левенштейна 1 от известного при малом числе скачиваний из upstream получает предупреждение в карточке пакета.
- Политика может заблокировать такое имя в {{< term "proxy-repository" "proxy-репозитории" >}}.
- Кандидат на typosquatting попадает в {{< term "security-journal" >}} как событие обнаружения.
{{< /threat-answer >}}
{{< /threat >}}

### Slopsquatting {#slopsquatting}

{{< threat summary="Модель советует несуществующий пакет, атакующий регистрирует имя — CRANE держит такой пакет в карантине." more="features/security/upstream-quarantine" chips="term:quarantine, term:upstream, xref:features/security/security-journal, label:Событие обнаружения" flow="Атакующий регистрирует имя \| Разработчик ставит по совету модели \| CRANE держит его в карантине" >}}
{{< threat-what >}}
Языковая модель советует установить пакет, которого не существует. Атакующий регистрирует это имя в публичном реестре и ждёт, пока совет выполнят. Так выглядит {{< term "slopsquatting" >}}.
{{< /threat-what >}}
{{< threat-answer >}}
- Пакет без истории (возраст, скачивания, maintainer) из публичного {{< term "upstream" >}} попадает в {{< term "quarantine" "карантин" >}}.
- До конца окна карантина версия не отдаётся.
- Правило SIEM срабатывает на первое обращение к такому имени.
- Кандидат на slopsquatting регистрируется как событие обнаружения.
{{< /threat-answer >}}
{{< /threat >}}

### Dependency confusion {#dependency-confusion}

{{< threat summary="Публичный пакет с внутренним именем и версией выше подменяет внутренний — CRANE отвечает на такое имя `404`." more="features/security/namespace-reservation" chips="term:dependency-confusion, term:namespace" flow="Атакующий публикует то же имя \| Менеджер берёт пакет с версией выше \| CRANE отвечает на имя 404" >}}
{{< threat-what >}}
В публичном реестре появляется пакет с именем внутреннего пакета и более высокой версией. Менеджер пакетов выбирает его вместо внутреннего. Об атаке рассказал {{< cite "birsan-dependency-confusion" >}}. Её название — {{< term "dependency-confusion" >}}.
{{< /threat-what >}}
{{< threat-answer >}}
- Внутреннее имя никогда не отдаётся из upstream.
- Если имя покрыто {{< term "namespace" >}}, proxy любого формата отвечает на него `404`.
- Так же proxy отвечает, если имя уже есть в hosted-репозитории того же формата.
{{< /threat-answer >}}
{{< /threat >}}

### Захват аккаунта maintainer {#maintainer-takeover}

{{< threat summary="Вредоносную версию успевают установить до снятия — CRANE удерживает новые версии и проверяет attestations." more="features/security/upstream-quarantine" chips="term:quarantine, term:attestation, term:advisory" flow="Атакующий берёт аккаунт автора \| Публикует вредоносную версию \| CRANE не отдаёт новую версию" >}}
{{< threat-what >}}
Атакующий получает доступ к аккаунту автора популярного пакета и публикует вредоносную новую версию. Обычно такую версию снимают через несколько часов, но за это время её успевают установить.
{{< /threat-what >}}
{{< threat-answer >}}
- Новая версия из upstream не отдаётся в течение настраиваемого окна после публикации.
- CRANE помечает подозрительную публикацию: резкий рост размера версии (в 5 раз), новые install-скрипты npm, бинарные файлы в sdist.
- CRANE проверяет {{< term "attestation" "attestations" >}} upstream. Если у прошлых версий была валидная attestation, а у новой она пропала, стала невалидной или сменился издатель, версия получает удержание, а в SIEM уходит событие ({{< xref "features/security/digest-verification#attestations" >}}).
- Advisory из фида вредоносных пакетов ведёт к экстренной блокировке ({{< xref "features/security/vulnerability-flow" >}}).
{{< /threat-answer >}}
{{< /threat >}}

### Подмена на пути от upstream {#path-tampering}

{{< threat summary="Файл или metadata изменены по дороге — CRANE сверяет дайджест SHA-256 с тем, что указал upstream." more="features/security/digest-verification" chips="term:digest, term:attestation, term:upstream" >}}
{{< threat-what >}}
Файл или metadata изменены по дороге: в зеркале, на промежуточном узле, в кэше.
{{< /threat-what >}}
{{< threat-answer >}}
- Файлы хранятся по {{< term "digest" "дайджесту" >}} SHA-256.
- Дайджест скачанного файла сверяется с тем, что указал upstream в документе версии.
- Для attestations сверяются subject digest и подпись (Sigstore или PGP).
- Соединения с upstream защищены TLS.
{{< /threat-answer >}}
{{< /threat >}}

### Вредоносный пакет {#malware}

{{< threat summary="Известный вредоносный пакет уже опубликован — advisory `MAL-*` создаёт экстренную блокировку на всех репликах." more="features/security/vulnerability-flow" chips="term:advisory" >}}
{{< threat-what >}}
В публичном реестре уже опубликован известный вредоносный пакет, и в чьей-то сборке на него есть зависимость.
{{< /threat-what >}}
{{< threat-answer >}}
- {{< term "advisory" >}} вида `MAL-*` из фида ставит наивысший приоритет и создаёт экстренную блокировку.
- Блокировка действует на hosted и proxy.
- Она действует и на версии, которые ещё никто не скачивал.
- Блокировка доходит до всех реплик не позже чем за 5 секунд.
{{< /threat-answer >}}
{{< /threat >}}

### Брошенный пакет {#abandoned}

{{< threat summary="Пакет без релизов хранит уязвимости без исправлений — CRANE понижает его в поиске и рекомендует замену." more="features/registry/search" >}}
{{< threat-what >}}
Пакет годами не выпускает релизы, а в нём остаются известные уязвимости без исправлений.
{{< /threat-what >}}
{{< threat-answer >}}
- Такой пакет понижается в поиске.
- Он получает бейдж EOL.
- Ему назначается рекомендация замены.
{{< /threat-answer >}}
{{< /threat >}}

## Угрозы самому реестру {#registry-threats}

Реестр — тоже цель. Таблица следует классификации STRIDE.

| Угроза | Пример | Контроль | Гарантия |
| --- | --- | --- | --- |
| Spoofing | Публикация под чужим CI-проектом | Проверка подписи и claims ID token, trust policy по конкретным проектам и ref, provenance из claims, проверка подписи и издателя у attestations из CI | {{< xref "features/security/access-control" >}} |
| Tampering | Подмена файла релиза | CAS по SHA-256, запрет перезаписи, выборочная проверка целостности, цепочка хэшей в аудите | {{< xref "features/security/immutable-versions" >}}, {{< xref "features/security/digest-verification" >}} |
| Repudiation | Действие отрицают задним числом | Аудит всех действий с actor, request id, решением и правилом; якоря WORM; экспорт в SIEM | {{< xref "features/security/security-journal" >}} |
| Information disclosure | Утечка токена в логах CI или в контексте языковой модели | Префиксы токенов для secret scanning, редактирование логов, проверка прав до передачи данных в модель, токены никогда не передаются в URL | {{< xref "features/security/secrets" >}} |
| Denial of service | Zip-бомба, огромная загрузка, флуд | Лимиты размера, коэффициента распаковки, числа файлов и времени; ограничение частоты (GCRA); изоляция пулов (bulkheads) | — |
| Elevation of privilege | Dependency confusion, {{< term "ssrf" >}} через upstream | Резервирование namespace, запрет fallback на upstream; allowlist хостов, запрет приватных адресов и redirect на них | {{< xref "features/security/namespace-reservation" >}}, {{< xref "features/security/egress-guard" >}} |

## Границы каталога {#scope}

Каталог перечисляет угрозы, для которых в CRANE есть механизм. Он не утверждает, что других угроз нет. Отсутствие advisory для версии не означает, что версия безопасна: это только отсутствие известных сведений. Границы каждой защиты — на странице соответствующей гарантии.
