{{- /*
  Markdown-версия term: слово в нужной форме (определение живёт в глоссарии). Имя term.all.md, а не term.md: Hugo читает «term» в начале имени
  файла как вид страницы, и term.md (а также term.<язык>.md для ru) шорткодом не становится; с «.all» шаблон находится для обоих языков.
*/ -}}
{{- $e := index site.Data.glossary (.Get 0) -}}
{{- .Get 1 | default (index (index $e .Page.Language.Lang) "term") -}}
