{{- /* Markdown-версия cards: список ссылок с описаниями из front matter страниц-целей. */ -}}
{{- $items := slice -}}
{{- range .Params -}}
  {{- $t := site.GetPage (strings.TrimSuffix "/" (strings.TrimPrefix "/" .)) -}}
  {{- $items = $items | append (printf "- [%s](%s)%s" $t.Title $t.Permalink (cond (ne ($t.Params.description | default "") "") (printf " — %s" $t.Params.description) "")) -}}
{{- end -}}
{{- delimit $items "\n" -}}