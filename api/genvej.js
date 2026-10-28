// iPhone-genvej: del screenshots fra Nyx direkte til Bordbog.
// GET  (logget ind i appen)  → giver en personlig genvejs-adresse.
// POST ?k=<nøgle> + billeder → læser bordene og svarer med en adresse, der åbner appen med bordene klar.
import { createHmac, timingSafeEqual } from "node:crypto";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "../js/config.js";
import { TYPES, readScreens, scanError } from "../lib/scan-core.js";

const b64u = (s) => Buffer.from(s).toString("base64url");
const secret = () => createHmac("sha256", process.env.ANTHROPIC_API_KEY || "").update("bordbog-genvej-v1").digest();
const sign = (p) => createHmac("sha256", secret()).update(p).digest("base64url");
function makeKey(uid, name) { const p = b64u(JSON.stringify({ u: uid, n: name })); return p + "." + sign(p); }
function readKey(k) {
  const [p, sig] = String(k || "").split(".");
  if (!p || !sig) return null;
  const a = Buffer.from(sig), b = Buffer.from(sign(p));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try { return JSON.parse(Buffer.from(p, "base64url").toString()); } catch { return null; }
}
const text = (t, status = 200) => new Response(t, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });

export async function GET(request) {
  if (!process.env.ANTHROPIC_API_KEY) return Response.json({ error: "Mangler ANTHROPIC_API_KEY på Vercel." }, { status: 500 });
  const who = await fetch(SUPABASE_URL + "/auth/v1/user", { headers: { apikey: SUPABASE_ANON_KEY, Authorization: request.headers.get("authorization") || "" } }).catch(() => null);
  if (!who || !who.ok) return Response.json({ error: "Log ind igen." }, { status: 401 });
  const user = await who.json();
  const name = (new URL(request.url).searchParams.get("n") || "Niels Priess").slice(0, 60);
  const origin = new URL(request.url).origin;
  return Response.json({ url: origin + "/api/genvej?k=" + makeKey(user.id, name) });
}

export async function POST(request) {
  const url = new URL(request.url), key = readKey(url.searchParams.get("k"));
  if (!key) return text("Genvejen virker ikke. Hent en ny adresse under din profil i Bordbog.", 401);
  let form;
  try { form = await request.formData(); } catch { return text("Ingen billeder modtaget. Del et screenshot til genvejen.", 400); }
  const files = [...form.values()].filter((v) => typeof v === "object" && v && "arrayBuffer" in v).slice(0, 5);
  if (!files.length) return text("Ingen billeder modtaget. Del et screenshot til genvejen.", 400);
  const images = [];
  for (const f of files) {
    const type = TYPES.includes(f.type) ? f.type : /\.png$/i.test(f.name || "") ? "image/png" : /\.jpe?g$/i.test(f.name || "") ? "image/jpeg" : "";
    if (!type) return text("Billedet skal være JPEG eller PNG. Tilføj \"Konverter billede\" til JPEG i genvejen.", 400);
    images.push({ type, data: Buffer.from(await f.arrayBuffer()).toString("base64") });
  }
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Copenhagen" }).format(new Date());
  try {
    const out = await readScreens(images, prompt(images.length, key.n, today));
    const rows = (out.rows || []).map((r) => [r.date, r.area, r.table, r.name, r.arrived, r.booked, r.amount, r.extra, r.note, r.promoter]);
    return text(url.origin + "/#scan=" + b64u(JSON.stringify({ r: rows, n: out.note || "" })));
  } catch (e) {
    console.error(e);
    const [code, error] = scanError(e);
    return text(error, code);
  }
}

// Samme opskrift som scanneren i appen.
function prompt(n, me, today) {
  return `Du får ${n} screenshot(s) fra Nyx, natklubben Søpavillonens personale-app (fanen Tables, visningen List). I dag er ${today}.
Øverst på hvert billede står aftenens dato (fx "Thu, Oct 22, 2026") og eventets navn. Listen er delt i områder med en overskrift (fx "SØ Main", "SØ Main Back", "Buffer").
Hver booking ser sådan ud:
- venstre: bordnummer (fx 1, 41, 129) og kundens navn ved siden af. Under navnet står bordets type (fx "Maks 25 pax" eller "Betalings Bord") og derunder en note (fx "Pakke 4 + 6k spend").
- højre, øverst: gæster som "ankommet / booket" (fx "30 / 6" betyder 30 ankommet og 6 booket). Står der kun ét tal, er det booket, og ankommet er 0.
- højre, midt: beløbet i kroner (fx "21,000" = 21000; komma er tusindtalsseparator). "No min." betyder 0.
- højre, nederst: promoterens navn.
Tag KUN bookinger, hvor promoteren er ${me}. Spring bookinger fra andre promotere, ledige borde ("Available") og rækker med "Linked to table" over. Samme booking kan stå på flere billeder: tag den kun med én gang.
For hver booking: date (YYYY-MM-DD), area, table (tekst), name, arrived (0 hvis intet), booked (0 hvis intet), amount (heltal, 0 ved "No min."), extra (merspend aftalt i noten, fx "+ 6k spend" = 6000, ellers 0), note, promoter.
Gæt ikke tal du ikke kan se. note: kort note på dansk hvis noget var uklart, ellers tom.`;
}
