// Vercel serverless function: GET /api/health. Tells the page whether the AI chatbot is switched on.
const { hasKey } = require('./_lib');
module.exports = (req, res) => {
  const key = process.env.OPENROUTER_API_KEY || '';
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({ ok: true, ai: hasKey(key), model: hasKey(key) ? (process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini') : null });
};
