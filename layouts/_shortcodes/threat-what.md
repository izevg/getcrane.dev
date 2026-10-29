{{- /* Markdown-версия threat-what: «Угроза.» и текст. */ -}}
{{- printf "**%s.** %s\n" (i18n "threat.what") (trim .Inner " \n") -}}