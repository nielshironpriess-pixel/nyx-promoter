// Notifikationer til chefen, når en underpromoter booker eller retter et bord.
// GET  → den offentlige nøgle, telefonen skal bruge for at slå notifikationer til.
// POST → (underpromoter logget ind) sender en besked til chefens telefoner.
import { createHmac, createECDH } from "node:crypto";
import webpush from "web-push";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "../js/config.js";

// Nøglerne udledes af ANTHROPIC_API_KEY, så der ikke skal sættes flere ting op på Vercel.
function keys() {
  const d = createHmac("sha256", process.env.ANTHROPIC_API_KEY || "").update("bordbog-vapid-v1").digest();
  const ecdh = createECDH("prime256v1"); ecdh.setPrivateKey(d);
  return { publicKey: ecdh.getPublicKey().toString("base64url"), privateKey: d.toString("base64url") };
}
const rpc = (fn, auth, body = {}) => fetch(SUPABASE_URL + "/rest/v1/rpc/" + fn, {
  method: "POST", headers: { apikey: SUPABASE_ANON_KEY, Authorization: auth, "Content-Type": "application/json" }, body: JSON.stringify(body),
});

export default async function handler(req, res) {
  if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: "Mangler ANTHROPIC_API_KEY på Vercel." });
  const k = keys();
  if (req.method === "GET") return res.status(200).json({ key: k.publicKey });
  if (req.method !== "POST") return res.status(405).json({ error: "Brug GET eller POST." });

  const auth = req.headers.authorization || "";
  const who = await fetch(SUPABASE_URL + "/auth/v1/user", { headers: { apikey: SUPABASE_ANON_KEY, Authorization: auth } }).catch(() => null);
  if (!who || !who.ok) return res.status(401).json({ error: "Log ind igen." });

  const { title, body } = req.body || {};
  if (typeof title !== "string" || typeof body !== "string") return res.status(400).json({ error: "Mangler tekst." });
  const r = await rpc("nyx_boss_push", auth).catch(() => null);
  if (!r || !r.ok) return res.status(200).json({ sent: 0 });
  const subs = await r.json();
  const origin = "https://" + (req.headers["x-forwarded-host"] || req.headers.host || "nyx-promoter.vercel.app");
  webpush.setVapidDetails(origin, k.publicKey, k.privateKey);
  const payload = JSON.stringify({ title: title.slice(0, 80), body: body.slice(0, 200), url: "/" });
  let sent = 0;
  await Promise.all(subs.map(async (s) => {
    try { await webpush.sendNotification(s, payload, { TTL: 3600, urgency: "high" }); sent++; }
    catch (e) { if (e?.statusCode === 404 || e?.statusCode === 410) await rpc("nyx_push_gone", auth, { p_endpoint: s.endpoint }).catch(() => {}); else console.error(e?.statusCode, e?.body); }
  }));
  return res.status(200).json({ sent });
}
