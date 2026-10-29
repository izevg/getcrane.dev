{{- /* Markdown-версия cite: ссылка на источник с короткой подписью издателя. */ -}}
{{- $s := index site.Data.sources (.Get 0) -}}
{{- printf "[%s](%s)" ($s.short | default $s.publisher) $s.url -}}