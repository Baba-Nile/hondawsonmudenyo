/* Admin portal.
   PRESERVED from the previous version: Firebase Auth email/password sign-in, the /admins/{uid} role check
   (admin | editor), the live query on communityEngagement, and status-only updates (security rules).
   NEW: scalable data layer. The portal never downloads the whole collection:
     - headline figures use server-side count queries (getCountFromServer),
     - the Responses list is cursor-paginated (50 per page),
     - search / multi-filters run over the 1,000 most recent responses (no extra indexes, no rule changes),
     - one small live listener (latest 100) powers "LIVE", recent activity and new-response alerts. */
import { connected as ready, auth, db, WARDS, doc, getDoc, updateDoc, collection, query, orderBy, where, limit, startAfter,
  getDocs, getCountFromServer, Timestamp, onSnapshot, signInWithEmailAndPassword, signOut, onAuthStateChanged,
  sendPasswordResetEmail, setPersistence, browserLocalPersistence, browserSessionPersistence } from "../../firebase.js";

const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const ic = (n, c = "") => `<svg class="i ${c}" aria-hidden="true"><use href="assets/icons.svg#${n}"/></svg>`;

const COLL = "communityEngagement";
const STATUSES = ["new", "reviewed", "contacted", "scheduled", "completed"];
const LABEL = { new: "New", reviewed: "Reviewed", contacted: "Contacted", scheduled: "Scheduled", completed: "Completed" };
const ICON = { new: "inbox", reviewed: "eye", contacted: "phone", scheduled: "calendar", completed: "check-circle" };
const PAGE = 50, WINDOW = 1000, LIVE = 100;
const TZ = "Africa/Nairobi"; // East Africa Time (UTC+3, no daylight saving)
const nf = new Intl.NumberFormat("en-KE");

/* ---------------- time (always East Africa Time) ---------------- */
const F_DATE = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, day: "numeric", month: "short", year: "numeric" });
const F_TIME = new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit", hour12: true });
const F_DAY = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, day: "numeric", month: "short" });
const F_LONGDAY = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, weekday: "long", day: "numeric", month: "long", year: "numeric" });
const F_PARTS = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
const RTF = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
const when = r => r?.createdAt?.toDate ? r.createdAt.toDate() : null;
const ymd = d => { const p = Object.fromEntries(F_PARTS.formatToParts(d).map(x => [x.type, x.value])); return [+p.year, +p.month, +p.day]; };
const dayStart = (y, m, d) => new Date(Date.UTC(y, m - 1, d) - 3 * 3600e3);
const startOfToday = () => dayStart(...ymd(new Date()));
const addDays = (d, n) => new Date(d.getTime() + n * 86400e3);
const fmtDate = d => d ? F_DATE.format(d) : "Time unavailable";
const fmtTime = d => d ? F_TIME.format(d) : "";
const fmtFull = d => d ? `${F_DATE.format(d)} · ${F_TIME.format(d)} EAT` : "Time unavailable";
function rel(d) {
  if (!d) return "";
  const s = Math.round((d.getTime() - Date.now()) / 1000), a = Math.abs(s);
  if (a < 45) return "just now";
  if (a < 3600) return RTF.format(Math.round(s / 60), "minute");
  if (a < 86400) return RTF.format(Math.round(s / 3600), "hour");
  if (a < 86400 * 30) return RTF.format(Math.round(s / 86400), "day");
  return RTF.format(Math.round(s / (86400 * 30)), "month");
}

/* ---------------- helpers ---------------- */
const ward = r => r.metWard || r.preferredWard || "";
const area = r => r.preferredArea || r.metLocation || "";
const kind = r => r.wantsMeeting ? "Wants to meet" : r.hasMetDawson ? "Has met Dawson" : "General response";
const yn = v => v === undefined || v === null ? "Not asked" : v ? "Yes" : "No";
const badge = s => { const k = STATUSES.includes(s) ? s : "new"; return `<span class="badge badge--${k}">${ic(ICON[k])}${LABEL[k]}</span>`; };
const pct = (a, b) => b ? Math.round(a / b * 100) + "%" : "0%";
function toast(title, msg, type = "ok") {
  const t = document.createElement("div"); t.className = "toast toast--" + type;
  t.innerHTML = ic(type === "ok" ? "check-circle" : "alert") + `<div><b>${esc(title)}</b>${msg ? `<span>${esc(msg)}</span>` : ""}</div>`;
  $("#toasts").append(t); setTimeout(() => t.classList.add("is-out"), 4000); setTimeout(() => t.remove(), 4400);
}
const say = (t, show = true) => { const m = $("#lm"); m.textContent = t; m.classList.toggle("show", show); if (!show) m.textContent = ""; };
const skelRows = n => Array.from({ length: n }, () => `<div class="skel-row"><i class="sk w30"></i><i class="sk w15"></i><i class="sk w25"></i><i class="sk w10"></i><i class="sk w10"></i></div>`).join("");
const errorBox = (retryId, title = "Unable to load responses", body = "We couldn’t retrieve the latest community engagement data.") =>
  `<div class="state state--err">${ic("alert")}<b>${title}</b><p>${body}</p><button type="button" class="btn btn--dark btn--sm" id="${retryId}">${ic("refresh")}Try again</button></div>`;

/* ---------------- login (unchanged behaviour) ---------------- */
if (!ready) say("The administrator portal is temporarily unavailable.");
$("#ey").onclick = () => {
  const p = $("#pw"), show = p.type === "password"; p.type = show ? "text" : "password";
  $("#ey").setAttribute("aria-pressed", String(show)); $("#ey").setAttribute("aria-label", show ? "Hide password" : "Show password");
  $("#ey").innerHTML = ic(show ? "eye-off" : "eye");
};
$("#fp").onclick = async () => {
  const e = $("#em").value.trim();
  if (!/^\S+@\S+\.\S+$/.test(e)) return say("Enter your email above first.");
  if (!ready) return say("The administrator portal is temporarily unavailable.");
  try { await sendPasswordResetEmail(auth, e); } catch (x) { console.error(x); if ((x.code || "").includes("network")) return say("Connection error. Please check your internet and try again."); }
  const m = $("#lm"); m.className = "alert alert--ok msg show"; m.textContent = "If that account exists, a password reset link is on its way.";
};
const busyBtn = on => { const b = $("#lb"); b.disabled = on; b.innerHTML = on ? '<span class="spin" style="width:18px;height:18px;border-width:2px"></span><span>Signing in...</span>' : "<span>Sign in</span>"; };
$("#lf").onsubmit = async ev => {
  ev.preventDefault(); $("#lm").className = "alert alert--error msg";
  const e = $("#em").value.trim(), p = $("#pw").value;
  if (!ready) return say("The administrator portal is temporarily unavailable.");
  if (!/^\S+@\S+\.\S+$/.test(e)) { $("#em").setAttribute("aria-invalid", "true"); $("#em").focus(); return say("Please enter a valid email address."); }
  $("#em").removeAttribute("aria-invalid");
  if (!p) { $("#pw").focus(); return say("Please enter your password."); }
  busyBtn(true); say("", false);
  try { await setPersistence(auth, $("#rm").checked ? browserLocalPersistence : browserSessionPersistence); await signInWithEmailAndPassword(auth, e, p); }
  catch (x) { console.error(x); const c = x.code || ""; say(c.includes("network") ? "Connection error. Please check your internet and try again." : c.includes("too-many") ? "Too many attempts. Please try again later." : c.includes("user-disabled") ? "This account has been disabled." : "Incorrect email or password."); }
  busyBtn(false);
};

/* ---------------- state ---------------- */
const S = { live: [], liveLoaded: false, liveErr: false, counts: null, countsErr: false, countsAt: 0, countsBusy: false, trend: {}, win: null, role: "", email: "", name: "", topId: null, unsub: null, drawerId: null, saving: false };
const col = () => collection(db, COLL);
const cnt = async (...ops) => (await getCountFromServer(query(col(), ...ops))).data().count;
const tsw = (op, d) => where("createdAt", op, Timestamp.fromDate(d));
const mk = d => ({ id: d.id, ...d.data() });

/* ---------------- server-side counts (no document downloads) ---------------- */
async function loadCounts(force = false) {
  if (S.countsBusy) return; if (!force && S.counts && Date.now() - S.countsAt < 4000) return;
  S.countsBusy = true;
  try {
    const t0 = startOfToday(), [y, m, d] = ymd(new Date()), dow = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
    const wardQ = WARDS.flatMap(w => [cnt(where("metWard", "==", w)), cnt(where("preferredWard", "==", w))]);
    const r = await Promise.all([cnt(), cnt(where("wantsMeeting", "==", true)), cnt(where("hasMetDawson", "==", true)), cnt(where("consentToContact", "==", true)),
      ...STATUSES.map(s => cnt(where("status", "==", s))), cnt(tsw(">=", t0)), cnt(tsw(">=", addDays(t0, -dow))), cnt(tsw(">=", dayStart(y, m, 1))), ...wardQ]);
    const status = {}; STATUSES.forEach((s, i) => status[s] = r[4 + i]);
    const wards = WARDS.map((w, i) => [w, r[12 + i * 2] + r[13 + i * 2]]);
    const sumW = wards.reduce((a, x) => a + x[1], 0);
    S.counts = { total: r[0], want: r[1], met: r[2], consent: r[3], status, today: r[9], week: r[10], month: r[11], wards, noWard: Math.max(0, r[0] - sumW) };
    S.countsAt = Date.now(); S.countsErr = false;
  } catch (x) { console.error("COUNT QUERIES FAILED:", x?.code, x?.message); S.countsErr = true; }
  S.countsBusy = false; paintAll();
}
let countTimer = null;
const scheduleCounts = () => { clearTimeout(countTimer); countTimer = setTimeout(() => loadCounts(true), 2500); };
async function loadTrend(days) {
  const c = S.trend[days]; if (c && Date.now() - c.at < 60000) return c;
  const t0 = startOfToday(), list = Array.from({ length: days }, (_, i) => addDays(t0, i - (days - 1)));
  try {
    const counts = await Promise.all(list.map(s => cnt(tsw(">=", s), tsw("<", addDays(s, 1)))));
    return S.trend[days] = { at: Date.now(), days: list.map((s, i) => ({ d: s, n: counts[i] })), err: false };
  } catch (x) { console.error("TREND QUERIES FAILED:", x?.code, x?.message); return { days: [], err: true, at: 0 }; }
}

/* ---------------- auth + live listener (authorization logic preserved) ---------------- */
if (ready) onAuthStateChanged(auth, async u => {
  if (S.unsub) { S.unsub(); S.unsub = null; }
  if (!u) { $("#app").classList.add("hide"); $("#login").classList.remove("hide"); closeDrawer(); Object.assign(S, { live: [], liveLoaded: false, counts: null, trend: {}, win: null, topId: null }); return; }
  let role = "";
  try {
    const a = await getDoc(doc(db, "admins", u.uid));
    if (!a.exists()) throw new Error("Admin document does not exist.");
    role = String(a.data().role || "").trim().toLowerCase();
    if (role !== "admin" && role !== "editor") throw new Error("Invalid admin role.");
    S.name = String(a.data().name || ""); S.email = String(u.email || "");
  } catch (x) {
    console.error("ADMIN AUTHORIZATION ERROR:", x.message);
    await signOut(auth); say("This account is not authorized to access the administrator portal."); return;
  }
  S.role = role;
  const who = S.email || S.name || "Signed in";
  $("#who").textContent = who; $("#who2").textContent = who; $("#av").textContent = (who[0] || "A").toUpperCase(); $("#role").textContent = role;
  $("#login").classList.add("hide"); $("#app").classList.remove("hide");
  S.liveLoaded = false; S.liveErr = false; S.counts = null; S.countsErr = false; paintAll(); loadCounts(true);
  startLive(); route();
});
function startLive() {
  S.unsub = onSnapshot(query(col(), orderBy("createdAt", "desc"), limit(LIVE)),
    s => {
      const rows = s.docs.map(mk), top = rows[0]?.id || null, first = !S.liveLoaded;
      const newTop = !first && top && top !== S.topId;
      S.live = rows; S.liveLoaded = true; S.liveErr = false; S.topId = top;
      rows.forEach(r => patchLists(r.id, { status: r.status }));
      if (newTop) { S.win = null; scheduleCounts(); lists.forEach(l => l.onNew()); toast("New response received", "The dashboard has been updated."); }
      paintAll(); if (S.drawerId) refreshDrawer();
    },
    x => { console.error("LIVE LISTENER FAILED:", x?.code, x?.message); S.liveErr = true; paintAll(); });
}

/* ---------------- navigation ---------------- */
const VIEWS = ["overview", "responses", "meetings", "analytics", "activity", "settings"];
let view = "overview";
function setSide(open) {
  $("#side").classList.toggle("is-open", open); $("#scrim").hidden = !open;
  $("#sbt").setAttribute("aria-expanded", String(open)); $("#sbt").setAttribute("aria-label", open ? "Close menu" : "Open menu");
  document.body.classList.toggle("lock", open || !$("#drawer").hidden);
}
$("#sbt").onclick = () => setSide(!$("#side").classList.contains("is-open"));
$("#scrim").onclick = () => setSide(false);
function route() {
  const h = location.hash.slice(1); view = VIEWS.includes(h) ? h : "overview";
  $$("[data-view]").forEach(s => s.hidden = s.dataset.view !== view);
  $$("[data-v]").forEach(a => a.dataset.v === view ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current"));
  setSide(false); closeDrawer(); window.scrollTo(0, 0);
  if (view === "responses") lists[0].show(); if (view === "meetings") lists[1].show(); if (view === "analytics") paintAnalytics();
}
addEventListener("hashchange", route);
const acb = $("#acb"), acm = $("#acm");
const menu = open => { acm.hidden = !open; acb.setAttribute("aria-expanded", String(open)); };
acb.onclick = e => { e.stopPropagation(); menu(acm.hidden); };
document.addEventListener("click", e => { if (!acm.hidden && !acm.contains(e.target)) menu(false); });
$("#lo").onclick = async () => { menu(false); try { await signOut(auth); } catch (x) { console.error(x); toast("Could not log out", "Please try again.", "err"); } };

/* ---------------- generic paint ---------------- */
function paintAll() {
  const c = S.counts, all = $("#cnt-all"), nw = $("#cnt-want");
  all.textContent = c ? nf.format(c.status.new) : "0"; all.hidden = !(c && c.status.new); all.title = "New responses";
  nw.textContent = c ? nf.format(c.want) : "0"; nw.hidden = !(c && c.want);
  paintOverview(); paintActivity(); paintSettings(); if (view === "analytics") paintAnalytics();
}
setInterval(() => { if ($("#app").classList.contains("hide")) return; const el = $("#ov-last"); if (el) el.textContent = lastLine(); }, 30000);

/* ---------------- overview ---------------- */
const head = (id, title, sub, extra = "") => `<header class="ph"><div><p class="eyebrow">Admin portal</p><h1 id="${id}" tabindex="-1">${title}</h1><p>${sub}</p></div><div class="ph__meta">${extra}</div></header>`;
const liveDot = () => `<span class="live${S.liveErr ? " live--off" : ""}" title="${S.liveErr ? "Live updates paused" : "Receiving live updates from Firestore"}">${S.liveErr ? "Paused" : "Live"}</span>`;
function lastLine() {
  const r = S.live[0], d = r && when(r);
  return !S.liveLoaded ? "Checking for responses…" : r ? `Last response ${rel(d) || "received"}${d ? ` · ${fmtFull(d)}` : ""}` : "No responses received yet";
}
function paintOverview() {
  const el = $("#v-overview"), c = S.counts;
  const top = head("h-overview", "Community Engagement", "Live engagement overview", `${liveDot()}<small id="ov-last">${esc(lastLine())}</small>`);
  if (!c && S.countsErr) { el.innerHTML = top + errorBox("ov-retry"); $("#ov-retry").onclick = () => { S.countsErr = false; paintAll(); loadCounts(true); }; return; }
  if (!c) { el.innerHTML = top + `<div class="kpis">${Array(4).fill('<div class="kpi"><i class="sk w40"></i><i class="sk w25 h28"></i><i class="sk w50"></i></div>').join("")}</div><div class="grid2"><div class="card"><i class="sk w30"></i><div class="sk-chart"></div></div><div class="card"><i class="sk w30"></i><div class="sk-chart"></div></div></div>`; return; }
  const kp = (l, n, sub, tone = "") => `<div class="kpi ${tone}"><span>${l}</span><b>${nf.format(n)}</b><small>${sub}</small></div>`;
  const maxW = Math.max(1, ...c.wards.map(w => w[1]), c.noWard);
  const wardRows = [...c.wards, ...(c.noWard ? [["Not given", c.noWard]] : [])].map(([w, n]) => `<div class="hbar"><span>${esc(w)}</span><i><u style="width:${n / maxW * 100}%"></u></i><b>${nf.format(n)}</b></div>`).join("");
  const maxS = Math.max(1, ...STATUSES.map(s => c.status[s]));
  const pipe = STATUSES.map(s => `<div class="hbar hbar--s"><span>${badge(s)}</span><i><u class="u-${s}" style="width:${c.status[s] / maxS * 100}%"></u></i><b>${nf.format(c.status[s])}</b></div>`).join("");
  el.innerHTML = top + (c.total === 0 ? `<div class="state">${ic("inbox")}<b>No responses yet</b><p>Community responses will appear here when residents connect through the website.</p></div>` : `
  <div class="kpis" aria-label="Key figures">${kp("Total responses", c.total, "All time")}${kp("Want to meet", c.want, pct(c.want, c.total) + " of responses")}${kp("Met Dawson", c.met, pct(c.met, c.total) + " of responses")}${kp("New", c.status.new, c.status.new ? "Awaiting review" : "Nothing waiting", c.status.new ? "kpi--flag" : "")}</div>
  <div class="period" aria-label="Responses by period"><div><span>Today</span><b>${nf.format(c.today)}</b></div><div><span>This week</span><b>${nf.format(c.week)}</b></div><div><span>This month</span><b>${nf.format(c.month)}</b></div><p>Calendar periods in East Africa Time. Weeks start on Monday.</p></div>
  <div class="grid2">
   <section class="card" aria-labelledby="t-trend"><div class="card__h"><h2 id="t-trend">Response trend</h2><small>Responses per day · last 14 days</small></div><div id="ov-trend"><div class="sk-chart"></div></div></section>
   <section class="card" aria-labelledby="t-pipe"><div class="card__h"><h2 id="t-pipe">Status pipeline</h2><small>All responses · ${nf.format(c.total)}</small></div>${pipe}</section>
   <section class="card" aria-labelledby="t-ward"><div class="card__h"><h2 id="t-ward">Ward breakdown</h2><small>All responses · ${nf.format(c.total)}</small></div>${wardRows}</section>
   <section class="card" aria-labelledby="t-act"><div class="card__h"><h2 id="t-act">Recent activity</h2><a class="more" href="#activity">View all</a></div>${activityList(8)}</section>
  </div>`);
  if (c.total) loadTrend(14).then(t => { const h = $("#ov-trend"); if (h) h.innerHTML = trendChart(t, 14); });
}
function trendChart(t, days) {
  if (t.err) return `<div class="state state--sm">${ic("alert")}<b>Unable to load the trend</b><p>Please try again shortly.</p></div>`;
  const max = Math.max(1, ...t.days.map(x => x.n)), total = t.days.reduce((a, x) => a + x.n, 0), step = days > 14 ? 5 : 2;
  const nice = max <= 4 ? max : Math.ceil(max / 4) * 4;
  return `<div class="trend" role="img" aria-label="Responses per day over the last ${days} days: ${total} in total"><div class="trend__y"><span>${nice}</span><span>${Math.round(nice / 2)}</span><span>0</span></div><div class="trend__bars">${t.days.map(x => `<div class="bar" title="${F_DAY.format(x.d)}: ${x.n} response${x.n === 1 ? "" : "s"}"><u style="height:${x.n / nice * 100}%"></u></div>`).join("")}</div></div>
  <div class="trend__x" aria-hidden="true">${t.days.map((x, i) => `<span>${(t.days.length - 1 - i) % step === 0 ? F_DAY.format(x.d) : ""}</span>`).join("")}</div>
  <p class="chartnote"><b>${nf.format(total)}</b> response${total === 1 ? "" : "s"} · ${F_DAY.format(t.days[0].d)} – ${F_DAY.format(t.days.at(-1).d)}</p>`;
}

/* ---------------- activity (derived from real submissions only) ---------------- */
const evt = r => r.wantsMeeting ? ["Meeting request received", "users"] : r.hasMetDawson ? ["Response from someone who has met Dawson", "handshake"] : ["New response received", "inbox"];
function activityList(n) {
  if (S.liveErr && !S.liveLoaded) return `<p class="muted pad">Activity is unavailable right now.</p>`;
  if (!S.liveLoaded) return Array(Math.min(n, 5)).fill('<div class="act"><i class="sk w60"></i></div>').join("");
  if (!S.live.length) return `<p class="muted pad">Activity will appear here as responses arrive.</p>`;
  return `<ul class="acts">${S.live.slice(0, n).map(r => { const [t, i] = evt(r), d = when(r); return `<li><button type="button" class="act" data-open="${r.id}"><span class="act__i">${ic(i)}</span><span class="act__t"><b>${t}</b><small>${esc(ward(r) || "Ward not given")}${area(r) ? " · " + esc(area(r)) : ""} · ${d ? rel(d) : "Time unavailable"}</small></span></button></li>`; }).join("")}</ul>`;
}
function paintActivity() {
  const el = $("#v-activity"), h = head("h-activity", "Activity", "Recent community engagement activity", liveDot());
  if (S.liveErr && !S.liveLoaded) { el.innerHTML = h + errorBox("ac-retry", "Unable to load activity"); $("#ac-retry").onclick = () => { S.liveErr = false; if (S.unsub) S.unsub(); startLive(); paintAll(); }; return; }
  if (!S.liveLoaded) { el.innerHTML = h + `<div class="card">${skelRows(6)}</div>`; return; }
  if (!S.live.length) { el.innerHTML = h + `<div class="state">${ic("inbox")}<b>No activity yet</b><p>Community responses will appear here when residents connect through the website.</p></div>`; return; }
  let day = "", out = "";
  S.live.forEach(r => {
    const d = when(r), k = d ? F_LONGDAY.format(d) : "Time unavailable";
    if (k !== day) { if (day) out += "</ul>"; out += `<h2 class="dayh">${k}</h2><ul class="acts acts--full">`; day = k; }
    const [t, i] = evt(r);
    out += `<li><button type="button" class="act" data-open="${r.id}"><span class="act__i">${ic(i)}</span><span class="act__t"><b>${t}</b><small>${esc(ward(r) || "Ward not given")}${area(r) ? " · " + esc(area(r)) : ""}</small></span><span class="act__w"><b>${d ? fmtTime(d) : "—"}</b><small>${d ? rel(d) : ""}</small></span>${badge(r.status)}</button></li>`;
  });
  el.innerHTML = h + `<p class="note">Showing the ${S.live.length} most recent submissions. Activity is built from submissions only; status changes are not logged yet.</p><div class="card card--flush">${out}</ul></div>`;
}

/* ---------------- analytics (real Firestore data) ---------------- */
let aRange = 30;
async function paintAnalytics() {
  const el = $("#v-analytics"), c = S.counts, top = head("h-analytics", "Analytics", "Community engagement trends from live responses");
  if (!c) { el.innerHTML = top + (S.countsErr ? errorBox("an-retry") : `<div class="grid2"><div class="card"><div class="sk-chart"></div></div><div class="card"><div class="sk-chart"></div></div></div>`); $("#an-retry")?.addEventListener("click", () => { S.countsErr = false; loadCounts(true); }); return; }
  const meta = (m, r, n) => `<p class="chartmeta"><span>Measures: ${m}</span><span>Range: ${r}</span><span>Responses: ${nf.format(n)}</span></p>`;
  const maxW = Math.max(1, ...c.wards.map(w => w[1]), c.noWard);
  const wardRows = [...c.wards, ...(c.noWard ? [["Not given", c.noWard]] : [])].map(([w, n]) => `<div class="hbar"><span>${esc(w)}</span><i><u style="width:${n / maxW * 100}%"></u></i><b>${nf.format(n)}</b></div>`).join("");
  const seg = STATUSES.map(s => c.status[s] ? `<i class="seg seg-${s}" style="flex:${c.status[s]}" title="${LABEL[s]}: ${c.status[s]}"></i>` : "").join("");
  const eng = (l, n) => `<div class="eng"><span>${l}</span><b>${nf.format(n)}</b><small>${pct(n, c.total)}</small></div>`;
  el.innerHTML = top + `<div class="seg-ctl" role="group" aria-label="Date range">${[7, 14, 30].map(n => `<button type="button" data-range="${n}" aria-pressed="${n === aRange}">${n} days</button>`).join("")}</div>
  <div class="grid2">
   <section class="card card--wide" aria-labelledby="a-t"><div class="card__h"><h2 id="a-t">Responses over time</h2><small>Last ${aRange} days</small></div><div id="an-trend"><div class="sk-chart"></div></div></section>
   <section class="card" aria-labelledby="a-w"><div class="card__h"><h2 id="a-w">Responses by ward</h2></div>${wardRows}${meta("responses per ward", "All time", c.total)}</section>
   <section class="card" aria-labelledby="a-e"><div class="card__h"><h2 id="a-e">Engagement</h2></div><div class="engs">${eng("Want to meet Dawson", c.want)}${eng("Have met Dawson", c.met)}${eng("Agreed to be contacted", c.consent)}</div>${meta("share of all responses", "All time", c.total)}</section>
   <section class="card card--wide" aria-labelledby="a-s"><div class="card__h"><h2 id="a-s">Response status</h2></div><div class="segbar">${seg || '<i class="seg seg-empty" style="flex:1"></i>'}</div><div class="legend">${STATUSES.map(s => `<span><i class="seg-${s}"></i>${LABEL[s]} <b>${nf.format(c.status[s])}</b></span>`).join("")}</div>${meta("how far responses have progressed", "All time", c.total)}</section>
   <section class="card card--wide card--web" aria-labelledby="a-web"><div class="card__h"><h2 id="a-web">Website analytics</h2><span class="pill">Not connected</span></div>
    <p>Website visits, unique visitors and page views are not shown because no analytics source is connected yet. No figures are estimated or invented.</p>
    <p class="muted">The public pages include an optional Google Analytics layer that stays off until a Measurement ID is added to <code>config.js</code>. Those reports are read in Google’s own dashboard.</p></section>
  </div>`;
  const t = await loadTrend(aRange), h = $("#an-trend"); if (h) h.innerHTML = trendChart(t, aRange);
}
$("#v-analytics").addEventListener("click", e => { const b = e.target.closest("[data-range]"); if (b) { aRange = +b.dataset.range; paintAnalytics(); } });

/* ---------------- settings ---------------- */
function paintSettings() {
  const row = (k, v) => `<div class="kv"><dt>${k}</dt><dd>${v}</dd></div>`;
  $("#v-settings").innerHTML = head("h-settings", "Settings", "Account and portal information") + `<div class="grid2">
  <section class="card"><div class="card__h"><h2>Account</h2></div><dl class="kvs">${row("Email", esc(S.email || "—"))}${row("Role", `<span class="pill pill--navy">${esc(S.role.toUpperCase())}</span>`)}${row("Access", S.role === "admin" ? "Read responses, update status, delete" : "Read responses, update status")}</dl></section>
  <section class="card"><div class="card__h"><h2>Portal</h2></div><dl class="kvs">${row("Times shown in", "East Africa Time (EAT, UTC+3)")}${row("Live updates", S.liveErr ? "Paused" : S.liveLoaded ? "Receiving" : "Connecting…")}${row("Responses list", `${PAGE} per page`)}${row("Search and filters", `Cover the ${nf.format(WINDOW)} most recent responses`)}</dl></section>
  <section class="card card--wide"><div class="card__h"><h2>Data protection</h2></div><p>Responses contain personal information that residents chose to share. Only signed-in, authorised staff can see it, and only the status of a response can be edited here. Exports are for authorised follow-up only.</p></section></div>`;
}

/* ---------------- responses / meeting-requests list ---------------- */
const lists = [];
function makeList(root, key, preset) {
  const F0 = { q: "", ward: "", status: "", date: "all", from: "", to: "", met: "", want: "", consent: "" };
  const L = { key, F: { ...F0 }, sort: "new", page: 1, rows: [], total: 0, loading: true, err: false, last: [], note: "", stale: true, filtersOpen: innerWidth >= 1024, tm: null, token: 0 };
  const titles = key === "meetings" ? ["Meeting requests", "Residents who asked to meet Dawson"] : ["Responses", "Every community response"];
  const wardOpts = WARDS.map(w => `<option>${esc(w)}</option>`).join("");
  root.innerHTML = head("h-" + key, titles[0], titles[1], `<button type="button" class="btn btn--ghost btn--sm" data-x="export">${ic("download")}Export CSV</button>`) + `
  <div class="toolbar" role="search">
   <div class="search">${ic("search")}<input class="input" type="search" data-f="q" placeholder="Search name, phone, email, topic, area or ward" aria-label="Search responses" autocomplete="off"><button type="button" class="search__x" data-x="clearq" aria-label="Clear search" hidden>${ic("x")}</button></div>
   <button type="button" class="btn btn--ghost btn--sm tb-filters" data-x="filters" aria-expanded="${L.filtersOpen}">${ic("filter")}Filters<span class="dot" data-x="fc" hidden>0</span></button>
   <select class="input tb-sort" data-f="sort" aria-label="Sort order"><option value="new">Newest first</option><option value="old">Oldest first</option></select>
  </div>
  <div class="filters" ${L.filtersOpen ? "" : "hidden"}>
   <label>Ward<select class="input" data-f="ward"><option value="">All wards</option>${wardOpts}</select></label>
   <label>Status<select class="input" data-f="status"><option value="">All statuses</option>${STATUSES.map(s => `<option value="${s}">${LABEL[s]}</option>`).join("")}</select></label>
   <label>Date<select class="input" data-f="date"><option value="all">All time</option><option value="today">Today</option><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="custom">Custom range</option></select></label>
   <label>Has met Dawson<select class="input" data-f="met"><option value="">Any</option><option value="yes">Yes</option><option value="no">No</option></select></label>
   ${key === "meetings" ? "" : `<label>Wants a meeting<select class="input" data-f="want"><option value="">Any</option><option value="yes">Yes</option><option value="no">No</option></select></label>`}
   <label>Contact details<select class="input" data-f="consent"><option value="">Any</option><option value="yes">Agreed to be contacted</option><option value="no">No consent</option></select></label>
   <div class="range" data-x="range" hidden><label>From<input class="input" type="date" data-f="from"></label><label>To<input class="input" type="date" data-f="to"></label></div>
   <button type="button" class="btn btn--ghost btn--sm reset" data-x="reset" hidden>Reset filters</button>
  </div>
  <div class="meta"><span data-x="count" aria-live="polite"></span><span class="meta__n" data-x="note"></span></div>
  <div class="tw" data-x="tw"><table><caption class="sr-only">${titles[0]}</caption><thead><tr><th scope="col">Person</th><th scope="col">Ward</th><th scope="col">Request</th><th scope="col">Date</th><th scope="col">Status</th><th scope="col" class="th-a"><span class="sr-only">Actions</span></th></tr></thead><tbody data-x="tb"></tbody></table></div>
  <div class="cards" data-x="cards"></div>
  <div data-x="state"></div>
  <div class="pager" data-x="pager" hidden><span data-x="pgi"></span><div><button type="button" class="btn btn--ghost btn--sm" data-x="prev">${ic("chevron-left")}Previous</button><button type="button" class="btn btn--ghost btn--sm" data-x="next">Next${ic("chevron-right")}</button></div></div>`;
  const q = s => root.querySelector(`[data-x="${s}"]`), f = s => root.querySelector(`[data-f="${s}"]`);
  const active = () => Object.entries(L.F).filter(([k, v]) => k !== "from" && k !== "to" && v && v !== "all").length;
  const needsWindow = () => !!(preset || L.F.q || L.F.ward || L.F.status || L.F.met || L.F.want || L.F.consent);
  const range = () => {
    const t0 = startOfToday(), d = L.F.date;
    if (d === "today") return [t0, addDays(t0, 1)]; if (d === "7") return [addDays(t0, -6), addDays(t0, 1)]; if (d === "30") return [addDays(t0, -29), addDays(t0, 1)];
    if (d === "custom") { const p = s => s ? dayStart(...s.split("-").map(Number)) : null, a = p(L.F.from), b = p(L.F.to); return [a, b ? addDays(b, 1) : null]; }
    return [null, null];
  };
  const match = r => {
    const F = L.F, [a, b] = range(), d = when(r);
    if (preset && !r.wantsMeeting) return false;
    if (F.ward && ward(r) !== F.ward) return false; if (F.status && r.status !== F.status) return false;
    if (F.met && (F.met === "yes") !== !!r.hasMetDawson) return false; if (F.want && (F.want === "yes") !== !!r.wantsMeeting) return false;
    if (F.consent && (F.consent === "yes") !== !!r.consentToContact) return false;
    if ((a || b) && (!d || (a && d < a) || (b && d >= b))) return false;
    if (F.q) { const hay = [r.name, r.phone, r.email, r.discussionTopic, r.preferredArea, r.metLocation, r.metWard, r.preferredWard, r.meetingSetting].join(" ").toLowerCase(); if (!F.q.toLowerCase().split(/\s+/).every(w => hay.includes(w))) return false; }
    return true;
  };
  async function getWindow() {
    if (S.win && Date.now() - S.win.at < 60000) return S.win;
    const s = await getDocs(query(col(), orderBy("createdAt", "desc"), limit(WINDOW)));
    return S.win = { at: Date.now(), rows: s.docs.map(mk) };
  }
  async function load(silent) {
    const my = ++L.token;
    if (!silent) { L.loading = true; L.err = false; draw(); }
    try {
      if (needsWindow()) {
        const w = await getWindow(); if (my !== L.token) return;
        const out = w.rows.filter(match); if (L.sort === "old") out.reverse();
        L.total = out.length; const pages = Math.max(1, Math.ceil(out.length / PAGE)); if (L.page > pages) L.page = pages;
        L.rows = out.slice((L.page - 1) * PAGE, L.page * PAGE);
        L.note = S.counts && S.counts.total > WINDOW ? `Search and filters cover the ${nf.format(WINDOW)} most recent of ${nf.format(S.counts.total)} responses.` : "";
      } else {
        const [a, b] = range(), ops = [];
        if (a) ops.push(tsw(">=", a)); if (b) ops.push(tsw("<", b));
        const base = [...ops, orderBy("createdAt", L.sort === "old" ? "asc" : "desc")];
        const extra = L.page > 1 && L.last[L.page - 1] ? [startAfter(L.last[L.page - 1])] : [];
        const [s, total] = await Promise.all([getDocs(query(col(), ...base, ...extra, limit(PAGE))), ops.length ? cnt(...ops) : (S.counts?.total ?? cnt())]);
        if (my !== L.token) return;
        L.last[L.page] = s.docs.at(-1) || null; L.rows = s.docs.map(mk); L.total = total; L.note = "";
      }
      L.loading = false; L.err = false; L.stale = false;
    } catch (x) { if (my !== L.token) return; console.error("RESPONSES LOAD FAILED:", x?.code, x?.message); L.err = true; L.loading = false; }
    draw();
  }
  const personCell = r => `<b>${r.name ? esc(r.name) : '<span class="anon">Anonymous</span>'}</b><small>${esc([r.phone, r.email].filter(Boolean).join(" · ")) || "No contact details"}</small>`;
  const reqCell = r => `<span class="req">${kind(r)}${r.wantsMeeting && r.meetingSetting ? ` · ${esc(r.meetingSetting)}` : ""}</span><small class="clip">${esc(r.discussionTopic || "")}</small>`;
  function draw() {
    const tb = q("tb"), cards = q("cards"), st = q("state"), pg = q("pager");
    q("clearq").hidden = !L.F.q; const n = active(), fc = q("fc"); fc.hidden = !n; fc.textContent = n;
    q("reset").hidden = !(n || L.F.date !== "all"); q("range").hidden = L.F.date !== "custom"; q("note").textContent = L.note;
    if (L.loading) { tb.innerHTML = ""; cards.innerHTML = ""; pg.hidden = true; q("count").textContent = "Loading…"; st.innerHTML = `<div class="skel">${skelRows(8)}</div>`; q("tw").hidden = true; return; }
    q("tw").hidden = false; st.innerHTML = "";
    if (L.err) { tb.innerHTML = ""; cards.innerHTML = ""; pg.hidden = true; q("count").textContent = ""; q("tw").hidden = true; st.innerHTML = errorBox(key + "-retry"); root.querySelector("#" + key + "-retry").onclick = () => { S.win = null; load(); }; return; }
    const filt = active() || L.F.date !== "all";
    if (!L.rows.length) {
      tb.innerHTML = ""; cards.innerHTML = ""; pg.hidden = true; q("tw").hidden = true; q("count").textContent = "0 results";
      st.innerHTML = filt ? `<div class="state">${ic("search")}<b>No responses match</b><p>Try changing or resetting the filters.</p><button type="button" class="btn btn--ghost btn--sm" data-x="reset">Reset filters</button></div>`
        : `<div class="state">${ic("inbox")}<b>${key === "meetings" ? "No meeting requests yet" : "No responses yet"}</b><p>Community responses will appear here when residents connect through the website.</p></div>`; return;
    }
    const from = (L.page - 1) * PAGE + 1, to = from + L.rows.length - 1, pages = Math.max(1, Math.ceil(L.total / PAGE));
    q("count").textContent = `Showing ${nf.format(from)}–${nf.format(to)} of ${nf.format(L.total)}`;
    tb.innerHTML = L.rows.map(r => { const d = when(r); return `<tr data-open="${r.id}" tabindex="0" aria-label="Open response from ${esc(r.name || "anonymous resident")}"><td class="c-p">${personCell(r)}</td><td>${esc(ward(r) || "Not given")}<small>${esc(area(r))}</small></td><td>${reqCell(r)}</td><td class="c-d">${d ? `${fmtDate(d)}<small>${fmtTime(d)} EAT</small>` : '<span class="muted">Time unavailable</span>'}</td><td>${badge(r.status)}</td><td class="c-a"><button type="button" class="rowbtn" data-open="${r.id}" aria-label="View details">${ic("chevron-right")}</button></td></tr>`; }).join("");
    cards.innerHTML = L.rows.map(r => { const d = when(r); return `<button type="button" class="rc" data-open="${r.id}"><div class="rc__top"><div class="rc__p">${personCell(r)}</div>${badge(r.status)}</div><p>${kind(r)}${r.discussionTopic ? " — " + esc(r.discussionTopic) : ""}</p><small>${esc(ward(r) || "Ward not given")} · ${d ? fmtDate(d) + " · " + fmtTime(d) + " EAT" : "Time unavailable"}</small></button>`; }).join("");
    pg.hidden = L.total <= PAGE; q("pgi").textContent = `Page ${L.page} of ${nf.format(pages)}`; q("prev").disabled = L.page <= 1; q("next").disabled = L.page >= pages;
  }
  async function exportCsv() {
    const btn = q("export"); btn.disabled = true;
    try {
      let rows;
      if (needsWindow()) { rows = (await getWindow()).rows.filter(match); if (L.sort === "old") rows.reverse(); }
      else {
        rows = []; const [a, b] = range(), ops = []; if (a) ops.push(tsw(">=", a)); if (b) ops.push(tsw("<", b)); let cur = null;
        toast("Preparing export", "Collecting responses…");
        for (;;) { const s = await getDocs(query(col(), ...ops, orderBy("createdAt", L.sort === "old" ? "asc" : "desc"), ...(cur ? [startAfter(cur)] : []), limit(1000))); rows.push(...s.docs.map(mk)); if (s.docs.length < 1000) break; cur = s.docs.at(-1); }
      }
      const safe = v => { let t = String(v ?? ""); if (/^[=+\-@\t\r]/.test(t)) t = "'" + t; return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
      const H = ["Submitted (EAT)", "Name", "Phone", "Email", "Ward", "Area or location", "Knows Dawson", "Has met Dawson", "Wants meeting", "Preferred ward", "Preferred area", "Meeting setting", "Discussion topic", "Consent to contact", "Status"];
      const lines = [H.map(safe).join(",")].concat(rows.map(r => [fmtFull(when(r)), r.name, r.phone, r.email, ward(r), area(r), yn(r.knowsDawson), yn(r.hasMetDawson), yn(r.wantsMeeting), r.preferredWard, r.preferredArea, r.meetingSetting, r.discussionTopic, yn(r.consentToContact), LABEL[r.status] || r.status].map(safe).join(",")));
      const blob = new Blob(["\ufeff" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" }), a2 = document.createElement("a");
      a2.href = URL.createObjectURL(blob); a2.download = `sauti-ya-kwanza-${key}-${ymd(new Date()).join("-")}.csv`; document.body.append(a2); a2.click(); a2.remove(); setTimeout(() => URL.revokeObjectURL(a2.href), 4000);
      toast("Export ready", `${nf.format(rows.length)} row${rows.length === 1 ? "" : "s"} saved to CSV.`);
    } catch (x) { console.error("EXPORT FAILED:", x?.code, x?.message); toast("Export failed", "Please try again.", "err"); }
    btn.disabled = false;
  }
  const reset = () => { L.F = { ...F0 }; root.querySelectorAll("[data-f]").forEach(el => { if (el.dataset.f !== "sort") el.value = F0[el.dataset.f] ?? ""; }); L.page = 1; L.last = []; load(); };
  const change = el => {
    const k = el.dataset.f; if (k === "sort") L.sort = el.value; else L.F[k] = (k === "q" ? el.value.trim() : el.value);
    L.page = 1; L.last = []; clearTimeout(L.tm); L.tm = setTimeout(load, k === "q" ? 250 : 0); q("clearq").hidden = !L.F.q;
  };
  root.addEventListener("input", e => { if (e.target.dataset.f === "q") change(e.target); });
  root.addEventListener("change", e => { if (e.target.dataset.f && e.target.dataset.f !== "q") change(e.target); });
  root.addEventListener("click", e => {
    const xe = e.target.closest("[data-x]"), x = xe?.dataset.x;
    if (x === "export") exportCsv(); else if (x === "reset") reset();
    else if (x === "clearq") { L.F.q = ""; f("q").value = ""; L.page = 1; load(); f("q").focus(); }
    else if (x === "filters") { L.filtersOpen = !L.filtersOpen; root.querySelector(".filters").hidden = !L.filtersOpen; xe.setAttribute("aria-expanded", String(L.filtersOpen)); }
    else if (x === "prev" && L.page > 1) { L.page--; load(); q("tw").scrollIntoView({ block: "start" }); }
    else if (x === "next") { L.page++; load(); }
    const o = e.target.closest("[data-open]"); if (o) openDrawer(o.dataset.open);
  });
  root.addEventListener("keydown", e => { if ((e.key === "Enter" || e.key === " ") && e.target.matches("tr[data-open]")) { e.preventDefault(); openDrawer(e.target.dataset.open); } });
  draw();
  return {
    L, rows: () => L.rows, draw,
    show() { if (L.stale) load(); },
    onNew() { L.stale = true; if (!root.closest("[data-view]").hidden && !L.err && L.page === 1) load(true); },
    patch(id, p) { const r = L.rows.find(x => x.id === id); if (r) Object.assign(r, p); }
  };
}
const patchLists = (id, p) => { lists.forEach(l => l.patch && l.patch(id, p)); if (S.win) { const r = S.win.rows.find(x => x.id === id); if (r) Object.assign(r, p); } };
lists.push(makeList($("#v-responses"), "responses", false), makeList($("#v-meetings"), "meetings", true));
document.addEventListener("keydown", e => { if (e.key === "/" && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) && (view === "responses" || view === "meetings")) { e.preventDefault(); $(`#v-${view} [data-f="q"]`)?.focus(); } });
document.addEventListener("click", e => { const o = e.target.closest(".act[data-open]"); if (o) openDrawer(o.dataset.open); });

/* ---------------- detail drawer ---------------- */
const findRow = id => S.live.find(r => r.id === id) || lists.flatMap(l => l.rows()).find(r => r.id === id) || S.win?.rows.find(r => r.id === id);
let lastFocus = null;
function openDrawer(id) { S.drawerId = id; lastFocus = document.activeElement; $("#drawer").hidden = false; document.body.classList.add("lock"); refreshDrawer(); requestAnimationFrame(() => $("#drawer").classList.add("is-open")); $("#dp").querySelector("h2")?.focus(); }
function closeDrawer() { if ($("#drawer").hidden) return; $("#drawer").classList.remove("is-open"); $("#drawer").hidden = true; document.body.classList.toggle("lock", $("#side").classList.contains("is-open")); S.drawerId = null; lastFocus?.focus?.(); }
function refreshDrawer() {
  const r = findRow(S.drawerId); if (!r) { closeDrawer(); return; }
  const d = when(r), dd = (k, v) => `<div class="kv"><dt>${k}</dt><dd>${v}</dd></div>`, none = '<span class="muted">Not given</span>';
  const tel = r.phone ? `<a href="tel:${esc(String(r.phone).replace(/[^\d+]/g, ""))}">${esc(r.phone)}</a>` : none, mail = r.email ? `<a href="mailto:${esc(r.email)}">${esc(r.email)}</a>` : none;
  const keep = document.activeElement?.dataset?.st;
  $("#dp").innerHTML = `<div class="drawer__head"><div><p class="eyebrow">Response</p><h2 id="dh" tabindex="-1">${r.name ? esc(r.name) : "Anonymous resident"}</h2><p class="drawer__sub">${d ? `Submitted ${rel(d)} · ${fmtFull(d)}` : "Time unavailable"}</p></div><button type="button" class="iconbtn" data-close aria-label="Close details">${ic("x")}</button></div>
<div class="drawer__body">
 <section class="sect"><h3>Status</h3><div class="stctl" role="radiogroup" aria-label="Response status">${STATUSES.map(s => `<button type="button" role="radio" aria-checked="${s === r.status}" data-st="${s}" class="stbtn stbtn--${s}${s === r.status ? " is-on" : ""}">${ic(ICON[s])}${LABEL[s]}</button>`).join("")}</div><p class="hint">Changing the status saves immediately. Only the status can be edited.</p></section>
 <section class="sect"><h3>Contact</h3><dl class="dl">${dd("Name", r.name ? esc(r.name) : none)}${dd("Phone", tel)}${dd("Email", mail)}</dl></section>
 <section class="sect"><h3>Community information</h3><dl class="dl">${dd("Ward", esc(ward(r)) || none)}${dd("Area or location", esc(area(r)) || none)}${r.hasMetDawson ? dd("Met Dawson in", esc([r.metWard, r.metLocation].filter(Boolean).join(", ")) || none) : ""}</dl></section>
 <section class="sect"><h3>Meeting</h3><dl class="dl">${dd("Wants to meet", yn(r.wantsMeeting))}${r.wantsMeeting || r.preferredWard || r.preferredArea || r.meetingSetting ? dd("Preferred ward", esc(r.preferredWard) || none) + dd("Preferred area", esc(r.preferredArea) || none) + dd("Meeting setting", esc(r.meetingSetting) || none) : ""}</dl></section>
 <section class="sect"><h3>Discussion topic</h3>${r.discussionTopic ? `<div class="topic">${esc(r.discussionTopic)}</div>` : '<p class="muted">No topic was shared.</p>'}</section>
 <section class="sect"><h3>Engagement</h3><dl class="dl">${dd("Knows Dawson", yn(r.knowsDawson))}${dd("Has met Dawson", yn(r.hasMetDawson))}${dd("Consent to contact", r.consentToContact ? '<span class="yes">Yes, agreed to be contacted</span>' : "No")}</dl></section>
 <section class="sect"><h3>Submission</h3><dl class="dl">${dd("Date", d ? fmtDate(d) : "Time unavailable")}${dd("Time", d ? fmtTime(d) + " EAT" : "Time unavailable")}${dd("Received", d ? rel(d) : "—")}${dd("Reference", `<code>${esc(r.id)}</code>`)}</dl></section>
</div>`;
  if (keep) $(`#dp [data-st="${keep}"]`)?.focus();
}
$("#drawer").addEventListener("click", e => { if (e.target.closest("[data-close]")) closeDrawer(); const b = e.target.closest("[data-st]"); if (b) setStatus(S.drawerId, b.dataset.st); });
addEventListener("keydown", e => {
  if (e.key === "Escape") { if (!acm.hidden) { menu(false); acb.focus(); } else if (!$("#drawer").hidden) closeDrawer(); else setSide(false); }
  if (e.key === "Tab" && !$("#drawer").hidden) { const f = $$("#dp button,#dp a[href]"); if (!f.length) return; if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f.at(-1).focus(); } else if (!e.shiftKey && document.activeElement === f.at(-1)) { e.preventDefault(); f[0].focus(); } }
});

/* ---------------- status update (status field only, as the security rules require) ---------------- */
async function setStatus(id, status) {
  const r = findRow(id); if (!r || r.status === status || S.saving) return;
  const prev = r.status; S.saving = true; $$("#dp [data-st]").forEach(b => b.disabled = true);
  try {
    await updateDoc(doc(db, COLL, id), { status });
    patchLists(id, { status }); const lv = S.live.find(x => x.id === id); if (lv) lv.status = status;
    if (S.counts) { if (S.counts.status[prev] > 0) S.counts.status[prev]--; S.counts.status[status]++; }
    toast("Status updated", `Response marked as ${LABEL[status]}.`); scheduleCounts();
  } catch (x) { console.error("STATUS UPDATE FAILED:", x?.code, x?.message); toast("Status not updated", "We couldn’t save the change. Please try again.", "err"); }
  S.saving = false; paintAll(); if (S.drawerId) refreshDrawer(); lists.forEach(l => l.draw());
}

route();
