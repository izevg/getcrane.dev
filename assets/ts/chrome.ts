import { ready } from "./lib/dom";
import { initLang } from "./lang";
import { initMenu } from "./menu";
import { initSearch } from "./search";
import { initTheme } from "./theme";

ready(() => {
  initTheme();
  initLang();
  initMenu();
  initSearch();
});
