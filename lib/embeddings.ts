// OpenAI embeddings client for semantic recall. text-embedding-3-small returns
// 1536-dim, unit-normalized vectors (so cosine similarity == dot product).
const MODEL = "text-embedding-3-small";
const ENDPOINT = "https://api.openai.com/v1/embeddings";
const BATCH = 96; // stay well under OpenAI's per-request input limits

export async function embed(inputs: string[]): Promise<number[][]> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY missing");
  if (inputs.length === 0) return [];

  const out: number[][] = [];
  for (let i = 0; i < inputs.length; i += BATCH) {
    const batch = inputs.slice(i, i + BATCH).map((s) => (s && s.trim() ? s.slice(0, 8000) : " "));
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: MODEL, input: batch }),
    });
    if (!res.ok) throw new Error(`embeddings ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const j = (await res.json()) as { data: { index: number; embedding: number[] }[] };
    j.data.sort((a, b) => a.index - b.index).forEach((d) => out.push(d.embedding));
  }
  return out;
}

export async function embedOne(input: string): Promise<number[]> {
  return (await embed([input]))[0];
}

// cosine similarity for unit-normalized vectors == dot product.
export function dot(a: number[], b: number[]): number {
  let s = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) s += a[i] * b[i];
  return s;
}
