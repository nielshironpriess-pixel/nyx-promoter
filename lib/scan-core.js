// Fælles scan-kode til /api/scan (appen) og /api/genvej (iPhone-genvejen).
import Anthropic from "@anthropic-ai/sdk";

export const SCHEMA = {
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
export const TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

// images: [{ type, data (base64) }]
export async function readScreens(images, prompt) {
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
  if (msg.stop_reason === "refusal") { const e = new Error("Billederne kunne ikke læses."); e.status = 422; throw e; }
  return JSON.parse(msg.content.filter((b) => b.type === "text").map((b) => b.text).join(""));
}

export function scanError(e) {
  if (e?.status === 422) return [422, e.message];
  const busy = e?.status === 429 || e?.status === 529;
  return [502, busy ? "For mange scanninger lige nu. Prøv igen om lidt." : "Scanningen fejlede. Prøv igen."];
}
