// Vercel serverless function: POST /api/chat. Set OPENROUTER_API_KEY (and optionally OPENROUTER_MODEL) in Vercel.
const { systemPrompt, chat, hasKey } = require('./_lib');
let SYSTEM = null;
module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const key = process.env.OPENROUTER_API_KEY || '';
  if (!hasKey(key)) return res.status(503).json({ error: 'no api key' });
  let body = req.body; if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { return res.status(400).json({ error: 'bad json' }); } }
  if (!body) return res.status(400).json({ error: 'bad json' });
  if (!SYSTEM) SYSTEM = systemPrompt();
  const out = await chat({ apiKey: key, model: process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini', system: SYSTEM, messages: body.messages, lang: body.lang });
  res.status(out.status).json(out.body);
};
