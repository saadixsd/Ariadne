/* Ariadne cookie consent. Non-essential cookies and analytics stay off until the visitor
   accepts them (privacy by default). The choice is kept in the ariadne_consent cookie
   (all | essential) for 6 months. Any element with [data-consent-open] reopens the panel. */
(function () {
  var NAME = "ariadne_consent";
  var MAX_AGE = 180 * 24 * 60 * 60;
  function read() {
    var m = document.cookie.match(/(?:^|;\s*)ariadne_consent=(all|essential)(?:;|$)/);
    return m ? m[1] : null;
  }
  function store(value) {
    document.cookie = NAME + "=" + value + "; Path=/; Max-Age=" + MAX_AGE + "; SameSite=Lax" + (location.protocol === "https:" ? "; Secure" : "");
    if (value !== "all") document.cookie = "ariadne_ref=; Path=/; Max-Age=0";
  }
  function loadAnalytics() {
    var token = document.documentElement.getAttribute("data-cf-beacon");
    if (!token || document.getElementById("cf-beacon")) return;
    var s = document.createElement("script");
    s.id = "cf-beacon"; s.defer = true; s.src = "https://static.cloudflareinsights.com/beacon.min.js";
    s.setAttribute("data-cf-beacon", JSON.stringify({ token: token }));
    document.head.appendChild(s);
  }
  var css =
    ".ck{position:fixed;z-index:60;left:16px;right:16px;bottom:16px;max-width:560px;margin-left:auto;background:var(--color-raised,#fbf8f2);color:var(--color-ink,#1f1b16);border:1px solid var(--color-line-strong,#cfc2ad);border-radius:14px;box-shadow:0 12px 32px -12px rgba(40,30,20,.35);padding:18px 18px 16px;font:14px/1.5 var(--font-sans,system-ui,sans-serif)}" +
    ".ck h2{margin:0 0 6px;font-size:16px;font-weight:600}.ck p{margin:0 0 12px;color:var(--color-ink-dim,#5e554a)}.ck a{color:var(--color-thread,#b3302a)}" +
    ".ck-row{display:flex;flex-wrap:wrap;gap:8px}.ck button{min-height:40px;padding:0 14px;border-radius:10px;border:1px solid var(--color-line-strong,#cfc2ad);background:transparent;color:inherit;font:inherit;font-weight:500;cursor:pointer}" +
    ".ck .ck-primary{background:var(--color-thread,#b3302a);border-color:var(--color-thread,#b3302a);color:#fbf8f2}.ck button:focus-visible,.ck input:focus-visible{outline:2px solid var(--color-thread,#b3302a);outline-offset:2px}" +
    ".ck-list{margin:0 0 12px;padding:0;list-style:none;display:grid;gap:10px}.ck-list li{border-top:1px solid var(--color-line-strong,#cfc2ad);padding-top:10px}.ck-list label{display:flex;gap:8px;align-items:flex-start;font-weight:600}.ck-list small{display:block;font-weight:400;color:var(--color-ink-dim,#5e554a)}" +
    "@media (max-width:520px){.ck{left:8px;right:8px;bottom:8px;padding:16px}.ck-row button{flex:1 1 100%}}";
  var root = null;
  function close() { if (root) { root.remove(); root = null; } }
  function decide(value) {
    var before = read();
    store(value);
    close();
    if (value === "all") {
      loadAnalytics();
      // An outreach link in the address bar is kept only now that it is allowed.
      if (before !== "all" && /[?&](ref|utm_source|utm_campaign)=/.test(location.search)) location.reload();
    }
  }
  function render(manage) {
    close();
    if (!document.getElementById("ck-style")) { var st = document.createElement("style"); st.id = "ck-style"; st.textContent = css; document.head.appendChild(st); }
    root = document.createElement("section");
    root.className = "ck"; root.setAttribute("role", "dialog"); root.setAttribute("aria-modal", "false"); root.setAttribute("aria-labelledby", "ck-title"); root.setAttribute("data-testid", "cookie-banner");
    var optional = read() === "all";
    root.innerHTML = manage
      ? '<h2 id="ck-title">Cookie settings</h2>' +
        '<ul class="ck-list">' +
        '<li><label><input type="checkbox" checked disabled> Strictly necessary <small>Sign-in session (ariadne_session), the signed-in marker for the home page (ariadne_in) and this choice (ariadne_consent). The site cannot work without them.</small></label></li>' +
        '<li><label><input type="checkbox" id="ck-opt"' + (optional ? " checked" : "") + '> Analytics and attribution <small>Which outreach link brought you here (ariadne_ref, 30 days) and cookieless page-view counts (Cloudflare Web Analytics), if enabled. Off unless you turn it on.</small></label></li>' +
        "</ul>" +
        '<div class="ck-row"><button type="button" class="ck-primary" data-ck="save">Save choices</button><button type="button" data-ck="essential">Reject non-essential</button></div>'
      : '<h2 id="ck-title">Cookies on Ariadne</h2>' +
        '<p>We use strictly necessary cookies to keep you signed in. With your permission we also keep which outreach link brought you here and count page views. Nothing optional runs until you accept. <a href="/privacy#cookies">Details</a></p>' +
        '<div class="ck-row"><button type="button" class="ck-primary" data-ck="all">Accept</button><button type="button" data-ck="essential">Reject non-essential</button><button type="button" data-ck="manage">Manage</button></div>';
    root.addEventListener("click", function (e) {
      var b = e.target.closest && e.target.closest("button[data-ck]");
      if (!b) return;
      var k = b.getAttribute("data-ck");
      if (k === "manage") return render(true);
      if (k === "save") return decide(document.getElementById("ck-opt").checked ? "all" : "essential");
      decide(k);
    });
    root.addEventListener("keydown", function (e) { if (e.key === "Escape" && manage && read()) close(); });
    document.body.appendChild(root);
    var first = root.querySelector("button"); if (first && manage) first.focus();
  }
  document.addEventListener("click", function (e) {
    var t = e.target.closest && e.target.closest("[data-consent-open]");
    if (t) { e.preventDefault(); render(true); }
  });
  function start() {
    var c = read();
    if (c === "all") loadAnalytics();
    else if (!c) render(false);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
