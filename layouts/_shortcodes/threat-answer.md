{{- /* Markdown-версия threat-answer: «Ответ CRANE.» и список фактов. */ -}}
{{- printf "**%s.**\n\n%s" (i18n "threat.answer") (trim .Inner " \n") -}}