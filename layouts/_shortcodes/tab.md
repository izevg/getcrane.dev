{{- /* Markdown-версия tab: жирная подпись клиента и содержимое. */ -}}
{{- printf "**%s**\n\n%s\n\n" (.Get 0) (trim .Inner "\n") -}}