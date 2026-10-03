/* Optional website analytics (Google Analytics 4).
   Disabled until analyticsConfig.measurementId is set in config.js.
   Collects page views only, plus one event when Community Connection is opened.
   No personal data and none of the Community Connection answers are sent. */
import { analyticsConfig } from "../../config.js";

const id = String(analyticsConfig?.measurementId || "").trim();
if (/^G-[A-Z0-9]{6,}$/i.test(id) && navigator.doNotTrack !== "1") {
  window.dataLayer = window.dataLayer || [];
  window.gtag = function () { window.dataLayer.push(arguments); };
  gtag("js", new Date());
  gtag("config", id, { anonymize_ip: true });
  const s = document.createElement("script");
  s.async = true; s.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(id);
  document.head.appendChild(s);
  document.addEventListener("click", e => {
    if (e.target.closest("[data-cx]")) gtag("event", "community_connection_open", { page_path: location.pathname });
  });
}
