/* Signed in? proxy.ts keeps a non-secret "ariadne_in=1" marker cookie. Swap the account links. */
(function () {
  if (!/(?:^|;\s*)ariadne_in=1(?:;|$)/.test(document.cookie)) return;
  document.querySelectorAll('[data-when="out"]').forEach(function (el) { el.hidden = true; });
  document.querySelectorAll('[data-when="in"]').forEach(function (el) { el.hidden = false; });
})();
