// Læser screenshots fra Nyx med Claude og sender bordene tilbage som JSON.
// Kræver ANTHROPIC_API_KEY under Vercel → Settings → Environment Variables.
import Anthropic from "@anthropic-ai/sdk";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "../js/config.js";

const SCHEMA = {
  type: "object",
  properties: {
    rows: {
      type: "array",
      items: {
        type: "object",
        properties: {
          date: { type: "string", description: "YYYY-MM-DD" },
          area: { type: "string" },
          table: { type: "string" },
          name: { type: "string" },
          arrived: { type: "integer" },
          booked: { type: "integer" },
          amount: { type: "integer" },
          extra: { type: "integer" },
          note: { type: "string" },
          promoter: { type: "string" },
        },
        required: ["date", "area", "table", "name", "arrived", "booked", "amount", "extra", "note", "promoter"],
        additionalProperties: false,
      },
    },
    note: { type: "string" },
  },
  required: ["rows", "note"],
  additionalProperties: false,
};
const TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

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
    const client = new Anthropic();
    const msg = await client.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 8000,
      output_config: { format: { type: "json_schema", schema: SCHEMA } },
      messages: [{
        role: "user",
        content: [
          ...images.map((i) => ({ type: "image", source: { type: "base64", media_type: i.type, data: i.data } })),
          { type: "text", text: prompt.slice(0, 8000) },
        ],
      }],
    });
    if (msg.stop_reason === "refusal") return res.status(422).json({ error: "Billederne kunne ikke læses." });
    const text = msg.content.filter((b) => b.type === "text").map((b) => b.text).join("");
    return res.status(200).json(JSON.parse(text));
  } catch (e) {
    console.error(e);
    const busy = e?.status === 429 || e?.status === 529;
    return res.status(502).json({ error: busy ? "For mange scanninger lige nu. Prøv igen om lidt." : "Scanningen fejlede. Prøv igen." });
  }
}
