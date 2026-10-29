{{- /* Markdown-версия xref: обычная ссылка с абсолютным адресом. */ -}}
{{- $r := partial "xref/resolve.html" (dict "arg" (.Get 0) "pos" .Position) -}}
{{- printf "[%s](%s)" (.Get 1 | default $r.page.Title) $r.permalink -}}