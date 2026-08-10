/**
 * Swap docs nav CTA based on shared session marker cookie set by the app
 * (ec_authed on .evaluchat.org). Logged-in → "Dashboard"; else "Sign in".
 * Both link to https://evaluchat.org/ which middleware routes by role.
 */
(function () {
  var APP_HOME = "https://evaluchat.org/";

  function hasSessionMarker() {
    return document.cookie.split(";").some(function (part) {
      return part.trim().indexOf("ec_authed=1") === 0;
    });
  }

  function updateNavCta() {
    var authed = hasSessionMarker();
    var label = authed ? "Dashboard" : "Sign in";
    document.querySelectorAll("a.nav-cta").forEach(function (link) {
      link.textContent = label;
      link.setAttribute("href", APP_HOME);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", updateNavCta);
  } else {
    updateNavCta();
  }
})();
