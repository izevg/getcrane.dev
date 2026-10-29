{{- /* Markdown-версия страницы рядом с HTML: /<lang>/<путь>.md. */ -}}
---
title: {{ .Title | jsonify }}
description: {{ .Params.description | default "" | jsonify }}
url: {{ .Permalink }}
lang: {{ .Language.LanguageCode }}
{{ with .Params.audience }}audience: {{ . | jsonify }}
{{ end }}{{ with .Params.genre }}genre: {{ . }}
{{ end }}{{ with .Params.state }}state: {{ . }}
{{ end }}{{ with .Params.status }}status: {{ . }}
{{ end }}---

# {{ .Title }}

{{ partial "md/body.html" (dict "page" .) }}
