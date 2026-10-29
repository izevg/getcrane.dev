{{- /* Markdown-версия threat: резюме жирным, блоки «Угроза» и «Ответ CRANE» (threat-what.md, threat-answer.md) и ссылка «Подробнее». */ -}}
{{- $out := printf "**%s**\n\n%s" (.Get "summary") (trim .Inner " \n") -}}
{{- with .Get "more" -}}
  {{- $r := partial "xref/resolve.html" (dict "arg" . "pos" $.Position) -}}
  {{- $out = printf "%s\n\n%s" $out (partial "ui/t.html" (dict "k" "threat.more" "v" (dict "title" (printf "[%s](%s)" $r.page.Title $r.permalink)))) -}}
{{- end -}}
{{- $out -}}