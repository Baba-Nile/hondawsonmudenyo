/* Community Connection flow. Firebase logic preserved from the original index.html:
   same collection (communityEngagement), same field names, same payload shape. */
import { connected, db, collection, addDoc, serverTimestamp, WARDS } from "../../firebase.js";

const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const store = { get(k) { try { return sessionStorage.getItem(k); } catch { return null; } }, set(k, v) { try { sessionStorage.setItem(k, v); } catch {} } };
const ic = (n, c = "") => `<svg class="i ${c}" aria-hidden="true"><use href="assets/icons.svg#${n}"/></svg>`;

document.body.insertAdjacentHTML("beforeend", `
<div class="cx" id="cx" role="dialog" aria-modal="true" aria-label="Community Connection" hidden>
  <aside class="cx__side">
    <img class="cx__photo" src="assets/img/lum-cut-1200.webp" srcset="assets/img/lum-cut-800.webp 800w, assets/img/lum-cut-1200.webp 1200w" sizes="(max-width:900px) 100vw, 45vw" alt="Dawson Mudenyo, Sauti Ya Kwanza" width="1200" height="1500" decoding="async">
    <div class="cx__brand"><img src="assets/img/icon-192.png" alt="" width="56" height="56"><span>Sauti Ya Kwanza<small>Dawson Mudenyo</small></span></div>
    <div class="cx__caption"><i aria-hidden="true"></i><div><h2>Community Connection</h2><p>Tell us what matters in your ward.</p></div></div>
  </aside>
  <div class="cx__main">
    <div class="cx__top"><button type="button" class="cx__close" data-act="close">${ic("x")}<span>Close</span></button></div>
    <div class="cx__stage"><div class="cx__step" id="st" aria-live="polite"></div></div>
  </div>
</div>`);

const ST = {
  know: { ic: "user-check", q: "Do you know <em>Dawson Mudenyo?</em>", s: "It takes about a minute.", t: "yn" },
  met: { ic: "handshake", q: "Have you <em>met Dawson?</em>", s: "Tell us if your paths have crossed.", t: "yn" },
  where: { ic: "map-pin", q: "Where did you <em>meet him?</em>", s: "Choose your ward. Add the place or event if you like.", t: "where" },
  want: { ic: "users", q: "Would you like to <em>meet Dawson?</em>", s: "We would be glad to hear from you.", t: "yn" },
  wish: { ic: "map-pin", q: "Where would you like <em>to meet?</em>", s: "Tell us what would work best.", t: "wish" },
  topic: { ic: "message", q: "What would you like <em>to discuss?</em>", s: "A topic, issue, project or question. Optional.", t: "topic" },
  contact: { ic: "user", q: "Would you like us <em>to contact you?</em>", s: "Choosing No sends your response without personal details.", t: "yn" },
  details: { ic: "mail", q: "How can we <em>reach you?</em>", s: "Share only what you are comfortable with.", t: "details" }
};
const KEY = { know: "knowsDawson", met: "hasMetDawson", want: "wantsMeeting", contact: "_c" };
const NX = { know: v => v ? "met" : "want", met: v => v ? "where" : "want", want: v => v ? "wish" : "topic", where: () => "topic", wish: () => "topic", topic: () => "contact", contact: v => v ? "details" : null, details: () => null };
const SETTINGS = [["Community meeting", "users"], ["Public forum", "mic"], ["Ward engagement", "map"], ["Other", "message"]];
let A = {}, hist = [], cur = null, busy = false, opener = null;

function walk() { const ids = []; let id = "know"; while (id && ids.length < 10) { ids.push(id); const k = KEY[id]; id = NX[id](k ? (A[k] ?? (id !== "contact")) : undefined); } return ids; }
const v = x => ($(x)?.value || "").trim();
const wardFld = (id, val) => `<div class="field"><label for="${id}">Ward</label>` + (WARDS.length
  ? `<select class="input" id="${id}"><option value="">Select your ward</option>${WARDS.map(w => `<option${w === val ? " selected" : ""}>${esc(w)}</option>`).join("")}</select>`
  : `<input class="input" id="${id}" maxlength="60" placeholder="Your ward" value="${esc(val)}">`) + `</div>`;
const inp = (id, label, ph, val, type = "text", max = 120, ac = "off") => `<div class="field"><label for="${id}">${label}</label><input class="input" id="${id}" type="${type}" maxlength="${max}" placeholder="${ph}" autocomplete="${ac}" value="${esc(val)}"></div>`;

function paint(html, pct) {
  const st = $("#st"); st.style.animation = "none"; st.offsetHeight; st.style.animation = ""; st.innerHTML = html;
  const bar = st.querySelector(".cx__progress i u"); if (bar) { bar.style.width = "0"; bar.offsetWidth; bar.style.width = pct + "%"; }
  $(".cx__main").scrollTop = 0;
  const h = st.querySelector("h2"); if (h) { h.tabIndex = -1; h.focus({ preventScroll: true }); }
}
function draw(id) {
  cur = id; busy = false;
  const d = ST[id], n = hist.length + 1, t = Math.max(walk().length, n), pct = n / t * 100;
  const two = x => String(x).padStart(2, "0");
  let h = `<div class="cx__kicker"><b>Community Connection</b><div class="cx__progress" role="progressbar" aria-label="Question ${n} of ${t}" aria-valuemin="1" aria-valuemax="${t}" aria-valuenow="${n}"><span><b>${two(n)}</b> / ${two(t)}</span><i><u></u></i></div></div>`
    + `<div class="cx__icon">${ic(d.ic)}</div><h2>${d.q}</h2><p class="sub">${d.s}</p>`;
  if (d.t === "yn") h += `<div class="cx__yn"><button type="button" class="cx__btn cx__btn--yes" data-a="1"><span>${ic("check")}Yes</span>${ic("arrow-right", "go")}</button><button type="button" class="cx__btn cx__btn--no" data-a="0"><span>No</span>${ic("arrow-right", "go")}</button></div>`;
  if (d.t === "where") h += wardFld("f1", A.metWard) + inp("f2", "Specific location or event (optional)", "e.g. school, market, event", A.metLocation);
  if (d.t === "wish") h += wardFld("f1", A.preferredWard) + inp("f2", "Preferred area or location (optional)", "e.g. town centre", A.preferredArea) + `<p class="hint" style="margin-bottom:.6rem;font-weight:700">Meeting setting</p><div class="cx__chips">${SETTINGS.map(([x, c]) => `<button type="button" class="cx__chip${A.meetingSetting === x ? " is-sel" : ""}" aria-pressed="${A.meetingSetting === x}" data-m="${x}">${ic(c)}${x}</button>`).join("")}</div>`;
  if (d.t === "topic") h += `<div class="field"><label for="f1">Your topic or question (optional)</label><textarea class="input" id="f1" rows="4" maxlength="600" placeholder="e.g. school water, roads, youth opportunities">${esc(A.discussionTopic)}</textarea><p class="hint">Up to 600 characters.</p></div>`;
  if (d.t === "details") h += inp("n", "Name", "Your name", A.name, "text", 80, "name") + inp("p", "Phone", "e.g. 0712 345 678", A.phone, "tel", 20, "tel") + inp("e", "Email", "you@example.com", A.email, "email", 120, "email")
    + `<label class="cx__check"><input type="checkbox" id="cs"${A.consentToContact ? " checked" : ""}><span>I agree to be contacted regarding my community engagement request.</span></label><p class="cx__privacy">${ic("shield")}<span>Your details are stored securely, seen only by authorised team members, and never shared or sold. <a href="privacy.html" target="_blank" rel="noopener">Privacy notice</a></span></p>`;
  h += `<div class="error" id="er" role="alert"></div><div class="cx__nav">${hist.length ? `<button type="button" class="btn btn--prev" data-act="back">${ic("arrow-left")}Previous</button>` : ""}${d.t !== "yn" ? `<button type="button" class="btn btn--next" data-act="next">${id === "details" ? "Submit" : "Continue"} ${ic("arrow-right")}</button>` : ""}</div>`;
  if (d.t === "yn" && hist.length) h = h.replace('<div class="error" id="er" role="alert"></div>', '<div class="error" id="er" role="alert"></div>');
  paint(h, pct);
}
function go(n) { if (!n) return submit(); hist.push(cur); draw(n); }
function next() {
  const d = ST[cur], er = m => { $("#er").textContent = m; };
  if (d.t === "where") { if (!v("#f1")) return er("Please select your ward."); A.metWard = v("#f1"); A.metLocation = v("#f2"); go(NX.where()); }
  else if (d.t === "wish") { if (!v("#f1")) return er("Please select your ward."); if (!A.meetingSetting) return er("Please choose a meeting setting."); A.preferredWard = v("#f1"); A.preferredArea = v("#f2"); go(NX.wish()); }
  else if (d.t === "topic") { A.discussionTopic = v("#f1"); go(NX.topic()); }
  else if (d.t === "details") {
    const n = v("#n"), p = v("#p"), e = v("#e");
    if (!n && !p && !e) return er("Please add at least one way for us to reach you.");
    if (e && !/^\S+@\S+\.\S+$/.test(e)) return er("Please enter a valid email address.");
    if (p && !/^\+?[\d\s()-]{7,20}$/.test(p)) return er("Please enter a valid phone number.");
    if (!$("#cs").checked) return er("Please tick the box to agree to be contacted.");
    Object.assign(A, { name: n, phone: p, email: e, consentToContact: true }); go(NX.details());
  }
}
function build() {
  const ids = walk(), d = { status: "new", createdAt: serverTimestamp(), knowsDawson: !!A.knowsDawson, consentToContact: ids.includes("details") && !!A.consentToContact };
  const put = (k, x) => { if (x !== undefined && x !== "") d[k] = x; };
  if (ids.includes("met")) d.hasMetDawson = !!A.hasMetDawson;
  if (ids.includes("where")) { put("metWard", A.metWard); put("metLocation", A.metLocation); }
  if (ids.includes("want")) d.wantsMeeting = !!A.wantsMeeting;
  if (ids.includes("wish")) { put("preferredWard", A.preferredWard); put("preferredArea", A.preferredArea); put("meetingSetting", A.meetingSetting); }
  put("discussionTopic", A.discussionTopic);
  if (ids.includes("details")) { put("name", A.name); put("phone", A.phone); put("email", A.email); }
  return d;
}
const screen = (icon, q, s, btns, ok = false) => paint(`<div class="cx__icon${ok ? " cx__icon--ok" : ""}">${icon === "spin" ? '<div class="spin" role="status" aria-label="Sending"></div>' : ic(icon)}</div><h2>${q}</h2><p class="sub">${s}</p><div class="cx__nav">${btns}</div>`, 100);
function unavailable() { screen("alert", "Community Connection is <em>temporarily unavailable.</em>", "Please try again later, or explore the website in the meantime.", `<button type="button" class="btn btn--navy" data-act="close">Return to website</button>`); }
async function submit() {
  busy = true; screen("spin", "Sending<em>your response...</em>", "Please wait a moment.", "");
  if (!connected) return unavailable();
  try {
    await Promise.race([addDoc(collection(db, "communityEngagement"), build()), new Promise((_, r) => setTimeout(() => r(new Error("timeout")), 15000))]);
    finished();
  } catch (e) {
    console.error("Submission failed:", e); busy = false;
    screen("alert", "We couldn't <em>submit your response.</em>", "Please check your connection and try again.", `<button type="button" class="btn btn--prev" data-act="edit">${ic("arrow-left")}Back</button><button type="button" class="btn btn--next" data-act="retry">${ic("refresh")}Try again</button>`);
  }
}
function finished() {
  busy = false;
  screen("check-circle", "Thank you for <em>connecting with us.</em>", "Your response has been received.", `<button type="button" class="btn btn--next" data-act="close">Return to website</button><a class="btn btn--prev" href="projects.html">Explore projects</a>`, true);
}
function openCx() {
  A = {}; hist = []; cur = null; busy = false; opener = document.activeElement;
  $("#cx").hidden = false; document.body.classList.add("lock");
  connected ? draw("know") : unavailable();
}
function closeCx() {
  $("#cx").hidden = true; document.body.classList.remove("lock"); store.set("cx", "1");
  if (opener && opener.focus) opener.focus();
}
function back() { if (!hist.length) return; cur = hist.pop(); draw(cur); }

$("#cx").addEventListener("click", e => {
  const b = e.target.closest("[data-a],[data-m],[data-act]"); if (!b) return;
  if (b.dataset.a !== undefined) { if (busy) return; busy = true; b.classList.add("is-sel"); A[KEY[cur]] = b.dataset.a === "1"; const n = NX[cur](A[KEY[cur]]); setTimeout(() => go(n), 240); }
  else if (b.dataset.m) { A.meetingSetting = b.dataset.m; $$("[data-m]").forEach(x => { x.classList.toggle("is-sel", x === b); x.setAttribute("aria-pressed", String(x === b)); }); }
  else { const a = b.dataset.act; if (a === "close") closeCx(); else if (a === "next") next(); else if (a === "back") back(); else if (a === "edit") draw(cur); else if (a === "retry") submit(); }
});
document.addEventListener("click", e => { if (e.target.closest("[data-cx]")) { e.preventDefault(); openCx(); } });
addEventListener("keydown", e => {
  const o = $("#cx"); if (o.hidden) return;
  if (e.key === "Escape" && !busy) return closeCx();
  if (e.key === "Tab") { // keep focus inside the dialog
    const f = [...o.querySelectorAll("button,a[href],input,select,textarea")].filter(x => !x.disabled && x.offsetParent !== null);
    if (!f.length) return; const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
});
// First-visit prompt, home page only (same behaviour as before, once per session)
if (document.body.dataset.autoconnect !== undefined && connected && !store.get("cx")) openCx();
