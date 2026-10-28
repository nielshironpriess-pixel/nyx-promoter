// Læser screenshots fra Nyx med Claude og sender bordene tilbage som JSON.
// Kræver ANTHROPIC_API_KEY under Vercel → Settings → Environment Variables.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "../js/config.js";
import { TYPES, readScreens, scanError } from "../lib/scan-core.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Brug POST." });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: "Scanneren mangler ANTHROPIC_API_KEY på Vercel." });

  // Kun dig: tjek at kaldet kommer fra en der er logget ind i appen.
  const auth = req.headers.authorization || "";
  const who = await fetch(SUPABASE_URL + "/auth/v1/user", { headers: { apikey: SUPABASE_ANON_KEY, Authorization: auth } }).catch(() => null);
  if (!who || !who.ok) return res.status(401).json({ error: "Log ind igen for at scanne." });

  const { prompt, images } = req.body || {};
  if (typeof prompt !== "string" || !Array.isArray(images) || !images.length || images.length > 5)
    return res.status(400).json({ error: "Vælg 1 til 5 billeder." });
  if (images.some((i) => !TYPES.includes(i?.type) || typeof i?.data !== "string"))
    return res.status(400).json({ error: "Et af billederne kunne ikke læses." });

  try {
    return res.status(200).json(await readScreens(images, prompt));
  } catch (e) {
    console.error(e);
    const [code, error] = scanError(e);
    return res.status(code).json({ error });
  }
}
