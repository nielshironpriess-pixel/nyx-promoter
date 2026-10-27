import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

"use strict";
const DEFAULTS = { name: "", perGuest: 20, ticketPct: 10, tablePct: 10, goal: 15000 };
const S = { settings: { ...DEFAULTS }, nights: [], tables: [], ready: false };
const ui = { tab: "overblik", month: ymNow(), tableSeg: "kommende" };

/* ---------- helpers ---------- */
function ymNow() { return todayISO().slice(0, 7); }
function todayISO() { return new Date().toLocaleDateString("sv-SE"); }
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const kr = (n) => Math.round(n || 0).toLocaleString("da-DK") + " kr.";
const krShort = (n) => n >= 10000 ? (n / 1000).toLocaleString("da-DK", { maximumFractionDigits: 1 }) + "k" : Math.round(n).toLocaleString("da-DK");
const num = (v) => { const x = parseFloat(String(v).replace(",", ".")); return isFinite(x) ? x : 0; };
const d = (iso) => new Date(iso + "T12:00:00");
const WD = ["søn", "man", "tir", "ons", "tor", "fre", "lør"];
const monthName = (ym) => d(ym + "-01").toLocaleDateString("da-DK", { month: "long", year: "numeric" });
function shiftMonth(ym, k) { const [y, m] = ym.split("-").map(Number); const t = new Date(y, m - 1 + k, 1); return t.getFullYear() + "-" + String(t.getMonth() + 1).padStart(2, "0"); }
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) => (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16)));

/* ---------- earnings ---------- */
function tableValue(t) { return t.status === "kom" ? (num(t.spend) || num(t.minSpend)) : 0; }
function dayCalc(date) {
  const s = S.settings;
  const n = S.nights.find((x) => x.date === date);
  const tabs = S.tables.filter((t) => t.date === date);
  const guests = n ? num(n.guests) : 0;
  const ticketRev = n ? num(n.ticketRevenue) : 0;
  const tableRev = tabs.reduce((a, t) => a + tableValue(t), 0);
  const p = {
    guest: guests * num(s.perGuest),
    ticket: ticketRev * num(s.ticketPct) / 100,
    table: tableRev * num(s.tablePct) / 100,
    bonus: n ? num(n.bonus) : 0,
  };
  return { date, night: n, tabs, guests, tickets: n ? num(n.tickets) : 0, ticketRev, tableRev, tablesCame: tabs.filter((t) => t.status === "kom").length, ...p,
    total: p.guest + p.ticket + p.table + p.bonus, paid: !!(n && n.paid) };
}
function monthCalc(ym) {
  const dates = [...new Set([...S.nights.map((n) => n.date), ...S.tables.filter((t) => t.status === "kom").map((t) => t.date)])].filter((x) => x && x.startsWith(ym)).sort();
  const days = dates.map(dayCalc);
  const sum = (k) => days.reduce((a, x) => a + x[k], 0);
  return { days, total: sum("total"), guest: sum("guest"), ticket: sum("ticket"), table: sum("table"), bonus: sum("bonus"),
    guests: sum("guests"), tickets: sum("tickets"), tableRev: sum("tableRev"), tablesCame: sum("tablesCame"),
    owed: days.filter((x) => !x.paid).reduce((a, x) => a + x.total, 0), nights: days.filter((x) => x.night).length };
}

/* ---------- storage: Supabase (login), else demo in this browser ---------- */
const MAP = {
  nights: { ticketRevenue: "ticket_revenue" },
  tables: { table: "table_name", minSpend: "min_spend" },
  settings: { perGuest: "per_guest", ticketPct: "ticket_pct", tablePct: "table_pct" },
};
const toDb = (kind, o) => { const r = {}; for (const [k, v] of Object.entries(o)) if (k !== "example") r[MAP[kind][k] || k] = v; return r; };
const fromDb = (kind, o) => { const inv = Object.fromEntries(Object.entries(MAP[kind]).map(([a, b]) => [b, a])); const r = {}; for (const [k, v] of Object.entries(o)) if (k !== "owner" && k !== "created_at" && k !== "updated_at") r[inv[k] || k] = typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v) && k !== "phone" ? Number(v) : v; return r; };
const DK_ERR = { "Invalid login credentials": "Forkert email eller adgangskode", "Email not confirmed": "Din email er ikke bekræftet endnu" };

function demoSeed() {
  const ex = (o) => ({ ...o, example: true, notes: o.notes || "" });
  const m = ymNow(), p = shiftMonth(m, -1);
  return {
    settings: { ...DEFAULTS },
    nights: [
      ex({ id: "ex-n1", date: p + "-18", event: "Fredagsklub", guests: 34, tickets: 12, ticketRevenue: 1800, bonus: 0, paid: true }),
      ex({ id: "ex-n2", date: p + "-26", event: "Lørdag", guests: 51, tickets: 20, ticketRevenue: 3000, bonus: 500, paid: true }),
      ex({ id: "ex-n3", date: m + "-09", event: "Fredagsklub", guests: 42, tickets: 15, ticketRevenue: 2250, bonus: 0, paid: true }),
      ex({ id: "ex-n4", date: m + "-17", event: "Lørdag", guests: 63, tickets: 28, ticketRevenue: 4200, bonus: 500, paid: false }),
    ],
    tables: [
      ex({ id: "ex-t1", date: p + "-26", name: "Mikkel J.", phone: "", table: "VIP 1", people: 6, minSpend: 5000, spend: 7400, status: "kom" }),
      ex({ id: "ex-t2", date: m + "-09", name: "Sara K.", phone: "", table: "Bord 4", people: 5, minSpend: 3000, spend: 3800, status: "kom" }),
      ex({ id: "ex-t3", date: m + "-17", name: "Mikkel J.", phone: "", table: "VIP 2", people: 8, minSpend: 6000, spend: 9200, status: "kom" }),
      ex({ id: "ex-t4", date: m + "-17", name: "Ahmed B.", phone: "", table: "Bord 2", people: 4, minSpend: 3000, spend: 0, status: "noshow" }),
    ],
  };
}

const store = {
  sb: null, mode: "venter", uid: null,
  async start() {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return this.startDemo();
    try {
      const { createClient } = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3/+esm");
      this.sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: true, detectSessionInUrl: true } });
    } catch { setStatus("Kunne ikke forbinde. Tjek din internetforbindelse og genindlæs."); return; }
    this.mode = "sky";
    const { data } = await this.sb.auth.getSession();
    this.uid = data.session?.user?.id || null;
    if (!this.uid) return showLogin();
    await this.afterLogin();
  },
  async signIn(email, password) {
    const { data, error } = await this.sb.auth.signInWithPassword({ email, password });
    if (error) throw new Error(DK_ERR[error.message] || error.message);
    this.uid = data.user.id;
    await this.afterLogin();
  },
  async signOut() { if (this.sb) await this.sb.auth.signOut(); location.reload(); },
  async afterLogin() {
    hideLogin();
    await this.loadAll();
    let t = null;
    const later = () => { clearTimeout(t); t = setTimeout(() => this.loadAll(), 300); };
    const ch = this.sb.channel("nyx-" + this.uid);
    ["nyx_nights", "nyx_tables", "nyx_settings"].forEach((table) => ch.on("postgres_changes", { event: "*", schema: "public", table, filter: "owner=eq." + this.uid }, later));
    ch.subscribe();
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") this.loadAll(); });
    setStatus("Gemt i din konto og opdateres live på alle dine enheder.");
  },
  async loadAll() {
    const sb = this.sb;
    const [n, t, s] = await Promise.all([
      sb.from("nyx_nights").select("*").order("date"),
      sb.from("nyx_tables").select("*").order("date"),
      sb.from("nyx_settings").select("*").maybeSingle(),
    ]);
    const err = n.error || t.error || s.error;
    if (err) { setStatus(/relation|does not exist|schema cache/i.test(err.message) ? "Tabellerne findes ikke endnu. Kør supabase/nyx.sql i Supabase." : "Kunne ikke hente dine tal: " + err.message); S.ready = true; render(); return; }
    S.nights = n.data.map((x) => fromDb("nights", x));
    S.tables = t.data.map((x) => fromDb("tables", x));
    S.settings = { ...DEFAULTS, ...(s.data ? fromDb("settings", s.data) : {}) };
    S.ready = true; render();
  },
  startDemo() {
    this.mode = "demo";
    let raw = null;
    try { raw = JSON.parse(localStorage.getItem("nyx-promoter-demo") || "null"); } catch {}
    Object.assign(S, raw || demoSeed());
    S.ready = true;
    setStatus("Demo: tallene gemmes kun i denne browser.");
    render();
  },
  saveLocal() { try { localStorage.setItem("nyx-promoter-demo", JSON.stringify({ settings: S.settings, nights: S.nights, tables: S.tables })); } catch {} },
  local(col, obj, del) {
    const arr = S[col]; const i = arr.findIndex((x) => x.id === (del ? obj : obj.id));
    if (del) { if (i >= 0) arr.splice(i, 1); } else i >= 0 ? (arr[i] = obj) : arr.push(obj);
    if (this.mode === "demo") this.saveLocal();
    render();
  },
  async put(col, obj) {
    if (this.mode !== "sky") return this.local(col, obj);
    const { error } = await this.sb.from("nyx_" + col).upsert(toDb(col, obj));
    if (error) throw error;
    this.local(col, obj);
  },
  async del(col, id) {
    if (this.mode !== "sky") return this.local(col, id, true);
    const { error } = await this.sb.from("nyx_" + col).delete().eq("id", id);
    if (error) throw error;
    this.local(col, id, true);
  },
  async saveSettings(s) {
    if (this.mode === "sky") { const { error } = await this.sb.from("nyx_settings").upsert(toDb("settings", s)); if (error) throw error; }
    S.settings = s; if (this.mode === "demo") this.saveLocal(); render();
  },
};

/* ---------- login ---------- */
function showLogin() {
  document.querySelector("header").hidden = true; document.querySelector("nav.tabs").hidden = true; document.getElementById("fab").hidden = true;
  view.innerHTML = `<form class="login" id="loginForm">
    <div class="logo">NYX</div><p>Log ind med den samme email og adgangskode som på Goon.</p>
    <label class="f">Email<input id="l-email" type="email" autocomplete="email" required></label>
    <label class="f">Adgangskode<input id="l-pass" type="password" autocomplete="current-password" required></label>
    <div class="err" id="l-err"></div>
    <button class="btn gold" type="submit">Log ind</button></form>`;
  view.querySelector("#loginForm").addEventListener("submit", async (e) => {
    e.preventDefault(); const b = e.target.querySelector("button"); b.disabled = true; b.textContent = "Logger ind…";
    try { await store.signIn(val(e.target, "l-email"), e.target.querySelector("#l-pass").value); }
    catch (err) { e.target.querySelector("#l-err").textContent = err.message; b.disabled = false; b.textContent = "Log ind"; }
  });
}
function hideLogin() { document.querySelector("header").hidden = false; document.querySelector("nav.tabs").hidden = false; view.innerHTML = '<div class="empty">Henter dine tal…</div>'; }

function setStatus(t) { document.getElementById("status").textContent = t; }
async function safe(p, ok) {
  try { await p; if (ok) toast(ok); }
  catch (e) { toast(e && e.code === "quota_exceeded" ? "Databasen er fuld. Slet gamle poster." : "Kunne ikke gemme. Prøv igen."); }
}
function toast(t) {
  const el = document.createElement("div"); el.className = "toast"; el.textContent = t; document.body.appendChild(el);
  setTimeout(() => el.remove(), 2200);
}

/* ---------- views ---------- */
const view = document.getElementById("view");
function render() {
  document.getElementById("mLabel").textContent = monthName(ui.month);
  document.querySelectorAll("nav.tabs button").forEach((b) => b.setAttribute("aria-current", b.dataset.tab === ui.tab ? "page" : "false"));
  document.querySelector(".month").style.visibility = ui.tab === "borde" || ui.tab === "indstillinger" ? "hidden" : "visible";
  const fab = document.getElementById("fab");
  fab.hidden = !(ui.tab === "naetter" || ui.tab === "borde" || ui.tab === "overblik");
  fab.innerHTML = ui.tab === "borde" ? "+ Ny bordbooking" : "+ Log en nat";
  if (!S.ready) return;
  view.innerHTML = { overblik: vOverblik, naetter: vNaetter, borde: vBorde, indstillinger: vSettings }[ui.tab]();
}

function exampleBanner() {
  const n = S.nights.filter((x) => x.example).length + S.tables.filter((x) => x.example).length;
  return n ? `<div class="banner"><span>Du ser eksempeldata. Slet dem, når du lægger dine egne nætter ind.</span><button class="btn" data-act="delex">Slet eksempler</button></div>` : "";
}

function vOverblik() {
  const m = monthCalc(ui.month);
  const goal = num(S.settings.goal);
  const pct = goal ? Math.min(100, m.total / goal * 100) : 0;
  const parts = [["Gæsteliste", m.guest, "var(--violet)"], ["Billetter", m.ticket, "var(--rose)"], ["Borde", m.table, "var(--gold)"], ["Bonus", m.bonus, "var(--ok)"]];
  const split = m.total ? parts.filter((p) => p[1] > 0).map((p) => `<i style="width:${p[1] / m.total * 100}%;background:${p[2]}"></i>`).join("") : "";
  const today = todayISO();
  const upcoming = S.tables.filter((t) => t.status === "booket" && t.date >= today).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 4);
  return `${exampleBanner()}
  <section class="hero" aria-label="Indtjening">
    <div><div class="lbl">Din provision i ${esc(monthName(ui.month))}</div>
    <div class="big num">${krShort(m.total)}<small>kr.</small></div></div>
    ${goal ? `<div class="goal"><div class="bar"><i style="width:${pct}%"></i></div><div class="t num"><span>${Math.round(pct)} % af målet</span><span>Mål ${kr(goal)}</span></div></div>` : ""}
    ${m.total ? `<div class="split">${split}</div><div class="legend num">${parts.map((p) => `<span style="--c:${p[2]}">${p[0]} <b>${kr(p[1])}</b></span>`).join("")}</div>` : `<p class="note">Ingen nætter logget i denne måned endnu.</p>`}
  </section>
  <section class="tiles num" aria-label="Nøgletal">
    <div class="tile"><span class="v">${m.guests}</span><span class="k">gæster på din liste</span></div>
    <div class="tile"><span class="v">${m.tablesCame}</span><span class="k">borde solgt</span></div>
    <div class="tile"><span class="v">${krShort(m.tableRev)}</span><span class="k">kr. i bordomsætning</span></div>
    <div class="tile owed"><span class="v">${krShort(m.owed)}</span><span class="k">kr. ikke udbetalt endnu</span></div>
  </section>
  <section class="sec"><h2>Seneste 6 måneder</h2>${chart()}</section>
  <section class="sec"><h2>Kommende borde</h2>${upcoming.length ? `<div class="list">${upcoming.map(tableRow).join("")}</div>` : `<div class="empty">Ingen kommende bordbookinger.</div>`}</section>
  <section class="sec"><h2>Stamkunder</h2>${regulars()}</section>
  <section class="sec"><div class="btns"><button class="btn" data-act="copy">Kopiér månedsopgørelse</button></div>
  <p class="note">Kopierer en kort tekst med nætter, gæster, borde og provision, som du kan sende til Nyx.</p></section>`;
}

function chart() {
  const months = Array.from({ length: 6 }, (_, i) => shiftMonth(ui.month, i - 5));
  const vals = months.map((ym) => monthCalc(ym).total);
  const max = Math.max(...vals, 1);
  const W = 340, H = 150, top = 22, bottom = 22, bw = 34, gap = (W - 6 * bw) / 6;
  const bars = months.map((ym, i) => {
    const h = (H - top - bottom) * vals[i] / max, x = gap / 2 + i * (bw + gap), y = H - bottom - h, cur = ym === ui.month;
    return `<rect x="${x}" y="${y}" width="${bw}" height="${Math.max(h, 1)}" rx="5" fill="${cur ? "var(--gold)" : "var(--raise)"}" stroke="${cur ? "none" : "var(--line)"}"/>
      ${vals[i] ? `<text class="val" x="${x + bw / 2}" y="${y - 6}" text-anchor="middle">${krShort(vals[i])}</text>` : ""}
      <text x="${x + bw / 2}" y="${H - 6}" text-anchor="middle">${d(ym + "-01").toLocaleDateString("da-DK", { month: "short" }).replace(".", "")}</text>`;
  }).join("");
  return `<div class="chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Provision pr. måned"><line x1="0" x2="${W}" y1="${H - bottom}" y2="${H - bottom}" stroke="var(--line)"/>${bars}</svg></div>`;
}

function regulars() {
  const g = {};
  S.tables.filter((t) => t.status === "kom" && t.name).forEach((t) => {
    const k = t.name.trim().toLowerCase();
    (g[k] ||= { name: t.name.trim(), phone: "", visits: 0, spend: 0, last: "" });
    g[k].visits++; g[k].spend += tableValue(t); if (t.phone) g[k].phone = t.phone; if (t.date > g[k].last) g[k].last = t.date;
  });
  const top = Object.values(g).sort((a, b) => b.spend - a.spend).slice(0, 5);
  if (!top.length) return `<div class="empty">Når dine bordkunder kommer, samles de her efter hvor meget de har brugt.</div>`;
  return `<div class="list">${top.map((c) => `<div class="row"><div class="date"><b>${c.visits}</b><span>besøg</span></div>
    <div class="mid"><span class="t">${esc(c.name)}</span><span class="s">${c.phone ? esc(c.phone) + " · " : ""}sidst ${d(c.last).toLocaleDateString("da-DK", { day: "numeric", month: "short" })}</span></div>
    <div class="right"><span class="amt num">${kr(c.spend)}</span></div></div>`).join("")}</div>`;
}

function dateBox(iso) { const x = d(iso); return `<div class="date"><b class="num">${x.getDate()}</b><span>${WD[x.getDay()]}</span></div>`; }

function vNaetter() {
  const m = monthCalc(ui.month);
  if (!m.days.length) return `${exampleBanner()}<div class="empty">Ingen nætter i ${esc(monthName(ui.month))}. Tryk på <b>Log en nat</b> efter din vagt.</div>`;
  return `${exampleBanner()}<section class="sec"><h2>${m.nights} nætter · ${kr(m.total)}</h2><div class="list">${m.days.slice().reverse().map((x) => {
    const n = x.night;
    const sub = [x.guests ? x.guests + " gæster" : "", x.tickets ? x.tickets + " billetter" : "", x.tablesCame ? x.tablesCame + " borde" : ""].filter(Boolean).join(" · ") || "Ingen tal endnu";
    return `<button class="row" data-act="night" data-date="${x.date}">${dateBox(x.date)}
      <div class="mid"><span class="t">${esc(n && n.event || "Nat på Nyx")}${n && n.example ? ' <span class="chip ex">eksempel</span>' : ""}</span><span class="s">${sub}</span></div>
      <div class="right"><span class="amt num">${kr(x.total)}</span>${n ? `<span class="chip ${x.paid ? "paid" : "unpaid"}">${x.paid ? "Udbetalt" : "Mangler"}</span>` : ""}</div></button>`;
  }).join("")}</div></section>
  <p class="note">Tryk på en nat for at rette tal eller markere den som udbetalt.</p>`;
}

const STATUS = { booket: "Booket", kom: "Kom", noshow: "Udeblev", aflyst: "Aflyst" };
function tableRow(t) {
  const x = d(t.date);
  const sub = [t.table ? "Bord " + t.table : "", t.people ? t.people + " pers." : "", x.toLocaleDateString("da-DK", { month: "short" })].filter(Boolean).join(" · ");
  const val = t.status === "kom" ? (num(t.spend) || num(t.minSpend)) : num(t.minSpend);
  return `<button class="row" data-act="table" data-id="${esc(t.id)}">${dateBox(t.date)}
    <div class="mid"><span class="t">${esc(t.name || "Uden navn")}${t.example ? ' <span class="chip ex">eksempel</span>' : ""}</span><span class="s">${esc(sub)}</span></div>
    <div class="right"><span class="amt num">${val ? kr(val) : ""}</span><span class="chip ${t.status}">${STATUS[t.status] || t.status}</span></div></button>`;
}
function vBorde() {
  const today = todayISO();
  const up = ui.tableSeg === "kommende";
  const rows = S.tables.filter((t) => up ? t.date >= today && t.status === "booket" : !(t.date >= today && t.status === "booket"))
    .sort((a, b) => up ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date));
  const sold = S.tables.filter((t) => t.status === "kom");
  const avg = sold.length ? sold.reduce((a, t) => a + tableValue(t), 0) / sold.length : 0;
  const decided = S.tables.filter((t) => t.status !== "booket" && t.status !== "aflyst");
  const showRate = decided.length ? Math.round(sold.length / decided.length * 100) : null;
  return `${exampleBanner()}
  <section class="tiles num">
    <div class="tile"><span class="v">${S.tables.filter((t) => t.status === "booket" && t.date >= today).length}</span><span class="k">kommende</span></div>
    <div class="tile"><span class="v">${sold.length}</span><span class="k">borde solgt i alt</span></div>
    <div class="tile"><span class="v">${krShort(avg)}</span><span class="k">kr. i snit pr. bord</span></div>
    <div class="tile"><span class="v">${showRate === null ? "–" : showRate + "%"}</span><span class="k">mødte op</span></div>
  </section>
  <section class="sec"><div class="seg" role="group" aria-label="Vis"><button data-seg="kommende" aria-pressed="${up}">Kommende</button><button data-seg="tidligere" aria-pressed="${!up}">Tidligere</button></div>
  ${rows.length ? `<div class="list">${rows.map(tableRow).join("")}</div>` : `<div class="empty">${up ? "Ingen kommende bookinger. Tryk på <b>Ny bordbooking</b>." : "Ingen tidligere borde endnu."}</div>`}
  ${up && rows.length ? `<p class="note">Efter natten: tryk på bordet og sæt det til <b>Kom</b> med det beløb, de brugte.</p>` : ""}</section>`;
}

function vSettings() {
  const s = S.settings;
  return `<section class="sec"><h2>Din provision</h2>
  <form class="form" id="setForm">
    <label class="f">Pr. gæst på liste (kr.)<input id="s-perGuest" inputmode="decimal" value="${esc(s.perGuest)}"></label>
    <label class="f">Af billetsalg (%)<input id="s-ticketPct" inputmode="decimal" value="${esc(s.ticketPct)}"></label>
    <label class="f">Af bordsalg (%)<input id="s-tablePct" inputmode="decimal" value="${esc(s.tablePct)}"></label>
    <label class="f">Månedligt mål (kr.)<input id="s-goal" inputmode="decimal" value="${esc(s.goal)}"></label>
    <div class="full btns"><button class="btn gold" type="submit">Gem satser</button></div>
  </form>
  <p class="note">Satserne bruges på alle nætter, også tidligere. Bordsalg tæller med, når bordet står som <b>Kom</b>: det brugte beløb, ellers minimumsforbruget.</p></section>
  <section class="sec"><h2>Data</h2>
  <p class="note">${store.mode === "sky" ? "Dine tal gemmes i din konto og opdateres live på telefon og computer. Kun du kan se dem." : "Demo: tallene gemmes kun i denne browser."}</p>
  <div class="btns">${S.nights.some((x) => x.example) || S.tables.some((x) => x.example) ? `<button class="btn danger" data-act="delex">Slet eksempeldata</button>` : ""}${store.mode === "sky" ? `<button class="btn" data-act="logout">Log ud</button>` : ""}</div></section>
  <section class="sec"><h2>Læg appen på hjemmeskærmen</h2>
  <p class="note">iPhone: åbn siden i Safari, tryk på Del-knappen og vælg <b>Føj til hjemmeskærm</b>. Android: tryk på menuen ⋮ og vælg <b>Installer app</b>.</p></section>`;
}

/* ---------- sheets ---------- */
const root = document.getElementById("sheetRoot");
function openSheet(html, onSubmit, onDelete) {
  root.innerHTML = `<div class="scrim" id="scrim"><div class="sheet" role="dialog" aria-modal="true">${html}</div></div>`;
  const form = root.querySelector("form");
  root.querySelector("#scrim").addEventListener("click", (e) => { if (e.target.id === "scrim" || e.target.dataset.close != null) closeSheet(); });
  form.addEventListener("submit", (e) => { e.preventDefault(); onSubmit(form); closeSheet(); });
  form.addEventListener("input", () => form.dispatchEvent(new Event("calc")));
  const del = root.querySelector("[data-del]");
  if (del) del.addEventListener("click", () => {
    if (del.dataset.armed) { onDelete(); closeSheet(); } else { del.dataset.armed = "1"; del.textContent = "Tryk igen for at slette"; }
  });
  const first = form.querySelector("input:not([type=checkbox])"); if (first) first.focus({ preventScroll: true });
}
function closeSheet() { root.innerHTML = ""; }
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeSheet(); });
const val = (f, id) => f.querySelector("#" + id).value.trim();

function nightSheet(date) {
  const n = S.nights.find((x) => x.date === date) || { id: uid("n"), date: date || todayISO(), event: "", guests: "", tickets: "", ticketRevenue: "", bonus: "", paid: false, notes: "" };
  const exists = S.nights.some((x) => x.id === n.id);
  openSheet(`<h3>${exists ? "Ret nat" : "Log en nat"}</h3><form class="form">
    <label class="f">Dato<input id="n-date" type="date" value="${esc(n.date)}" required></label>
    <label class="f">Event<input id="n-event" value="${esc(n.event)}" placeholder="Fx Fredagsklub"></label>
    <label class="f">Gæster på din liste<input id="n-guests" inputmode="numeric" value="${esc(n.guests)}"></label>
    <label class="f">Billetter solgt<input id="n-tickets" inputmode="numeric" value="${esc(n.tickets)}"></label>
    <label class="f">Billetomsætning (kr.)<input id="n-ticketRevenue" inputmode="decimal" value="${esc(n.ticketRevenue)}"></label>
    <label class="f">Bonus / fast løn (kr.)<input id="n-bonus" inputmode="decimal" value="${esc(n.bonus)}"></label>
    <label class="f full">Noter<textarea id="n-notes" placeholder="Fx hvem der var der, hvad der virkede">${esc(n.notes)}</textarea></label>
    <label class="check full"><input type="checkbox" id="n-paid" ${n.paid ? "checked" : ""}> Udbetalt fra Nyx</label>
    <div class="preview num" id="n-prev"></div>
    <div class="full btns">${exists ? `<button type="button" class="btn danger" data-del>Slet nat</button>` : `<button type="button" class="btn" data-close>Annullér</button>`}<button class="btn gold" type="submit">Gem nat</button></div>
  </form>`, (f) => {
    const obj = { ...n, date: val(f, "n-date"), event: val(f, "n-event"), guests: num(val(f, "n-guests")), tickets: num(val(f, "n-tickets")),
      ticketRevenue: num(val(f, "n-ticketRevenue")), bonus: num(val(f, "n-bonus")), notes: val(f, "n-notes"), paid: f.querySelector("#n-paid").checked };
    delete obj.example;
    const clash = S.nights.find((x) => x.date === obj.date && x.id !== obj.id);
    if (clash) obj.id = clash.id;
    if (obj.date) { ui.month = obj.date.slice(0, 7); safe(store.put("nights", obj), "Natten er gemt"); }
  }, () => safe(store.del("nights", n.id), "Natten er slettet"));
  const f = root.querySelector("form");
  const upd = () => {
    const s = S.settings, dt = val(f, "n-date");
    const tabRev = S.tables.filter((t) => t.date === dt).reduce((a, t) => a + tableValue(t), 0);
    const g = num(val(f, "n-guests")) * num(s.perGuest), t = num(val(f, "n-ticketRevenue")) * num(s.ticketPct) / 100, b = tabRev * num(s.tablePct) / 100, bo = num(val(f, "n-bonus"));
    f.querySelector("#n-prev").innerHTML = `Du tjener <b>${kr(g + t + b + bo)}</b> denne nat` + (tabRev ? `, heraf ${kr(b)} fra borde` : "") + ".";
  };
  f.addEventListener("calc", upd); upd();
}

function tableSheet(id) {
  const t = S.tables.find((x) => x.id === id) || { id: uid("t"), date: todayISO(), name: "", phone: "", table: "", people: "", minSpend: "", spend: "", status: "booket", notes: "" };
  const exists = S.tables.some((x) => x.id === t.id);
  openSheet(`<h3>${exists ? "Bordbooking" : "Ny bordbooking"}</h3><form class="form">
    <label class="f full">Kunde<input id="t-name" value="${esc(t.name)}" placeholder="Navn på den der booker" required></label>
    <label class="f">Telefon<input id="t-phone" type="tel" value="${esc(t.phone)}"></label>
    <label class="f">Dato<input id="t-date" type="date" value="${esc(t.date)}" required></label>
    <label class="f">Bord<input id="t-table" value="${esc(t.table)}" placeholder="Fx VIP 2"></label>
    <label class="f">Personer<input id="t-people" inputmode="numeric" value="${esc(t.people)}"></label>
    <label class="f">Minimumsforbrug (kr.)<input id="t-minSpend" inputmode="decimal" value="${esc(t.minSpend)}"></label>
    <label class="f">Brugt i alt (kr.)<input id="t-spend" inputmode="decimal" value="${esc(t.spend)}" placeholder="Udfyld efter natten"></label>
    <label class="f full">Status<select id="t-status">${Object.entries(STATUS).map(([k, v]) => `<option value="${k}" ${t.status === k ? "selected" : ""}>${v}</option>`).join("")}</select></label>
    <label class="f full">Noter<textarea id="t-notes" placeholder="Fx flaskevalg, fødselsdag">${esc(t.notes)}</textarea></label>
    <div class="preview num" id="t-prev"></div>
    <div class="full btns">${exists ? `<button type="button" class="btn danger" data-del>Slet booking</button>` : `<button type="button" class="btn" data-close>Annullér</button>`}<button class="btn gold" type="submit">Gem</button></div>
  </form>`, (f) => {
    const obj = { ...t, name: val(f, "t-name"), phone: val(f, "t-phone"), date: val(f, "t-date"), table: val(f, "t-table"), people: num(val(f, "t-people")),
      minSpend: num(val(f, "t-minSpend")), spend: num(val(f, "t-spend")), status: val(f, "t-status"), notes: val(f, "t-notes") };
    delete obj.example;
    if (obj.date) safe(store.put("tables", obj), "Bordet er gemt");
  }, () => safe(store.del("tables", t.id), "Bookingen er slettet"));
  const f = root.querySelector("form");
  const upd = () => {
    const v = num(val(f, "t-spend")) || num(val(f, "t-minSpend")), st = val(f, "t-status");
    f.querySelector("#t-prev").innerHTML = st === "kom" ? `Din provision: <b>${kr(v * num(S.settings.tablePct) / 100)}</b> (${num(S.settings.tablePct)} % af ${kr(v)}).`
      : st === "booket" ? `Giver ca. <b>${kr(v * num(S.settings.tablePct) / 100)}</b>, hvis de kommer.` : "Tæller ikke med i din provision.";
  };
  f.addEventListener("calc", upd); upd();
}

/* ---------- events ---------- */
document.querySelector("nav.tabs").addEventListener("click", (e) => { const b = e.target.closest("[data-tab]"); if (b) { ui.tab = b.dataset.tab; render(); window.scrollTo(0, 0); } });
document.getElementById("mPrev").onclick = () => { ui.month = shiftMonth(ui.month, -1); render(); };
document.getElementById("mNext").onclick = () => { ui.month = shiftMonth(ui.month, 1); render(); };
document.getElementById("fab").onclick = () => ui.tab === "borde" ? tableSheet() : nightSheet();
view.addEventListener("submit", (e) => {
  if (e.target.id !== "setForm") return; e.preventDefault();
  const f = e.target, s = {};
  ["perGuest", "ticketPct", "tablePct", "goal"].forEach((k) => (s[k] = num(f.querySelector("#s-" + k).value)));
  safe(store.saveSettings({ ...S.settings, ...s }), "Satserne er gemt");
});
view.addEventListener("click", async (e) => {
  const seg = e.target.closest("[data-seg]"); if (seg) { ui.tableSeg = seg.dataset.seg; render(); return; }
  const a = e.target.closest("[data-act]"); if (!a) return;
  const act = a.dataset.act;
  if (act === "logout") return store.signOut();
  if (act === "night") nightSheet(a.dataset.date);
  if (act === "table") tableSheet(a.dataset.id);
  if (act === "delex") {
    if (!a.dataset.armed) { a.dataset.armed = "1"; a.textContent = "Tryk igen for at slette"; return; }
    const ex = [...S.nights.filter((x) => x.example).map((x) => ["nights", x.id]), ...S.tables.filter((x) => x.example).map((x) => ["tables", x.id])];
    for (const [c, id] of ex) { try { await store.del(c, id); } catch {} }
    toast("Eksemplerne er slettet");
  }
  if (act === "copy") {
    const m = monthCalc(ui.month);
    const lines = [`Opgørelse ${monthName(ui.month)}${S.settings.name ? " – " + S.settings.name : ""}`, "",
      ...m.days.map((x) => `${d(x.date).toLocaleDateString("da-DK", { weekday: "short", day: "numeric", month: "short" })}: ${x.guests} gæster, ${x.tickets} billetter, ${x.tablesCame} borde (${kr(x.tableRev)}) = ${kr(x.total)}${x.paid ? " (udbetalt)" : ""}`),
      "", `I alt: ${kr(m.total)}`, `Mangler udbetaling: ${kr(m.owed)}`];
    const text = lines.join("\n");
    try { await navigator.clipboard.writeText(text); toast("Opgørelsen er kopieret"); }
    catch { openSheet(`<h3>Månedsopgørelse</h3><form class="form"><label class="f full">Markér og kopiér<textarea id="cp" style="min-height:220px">${esc(text)}</textarea></label><div class="full btns"><span></span><button class="btn gold">Luk</button></div></form>`, () => {}); root.querySelector("#cp").select(); }
  }
});

render();
store.start();
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
