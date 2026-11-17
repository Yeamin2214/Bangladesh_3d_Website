// Shared by the local server (server.js) and the Vercel functions (api/chat.js, api/health.js).
// Files in /api that start with "_" are not turned into web routes by Vercel.
const fs = require('fs');
const path = require('path');

function siteRoot() {
  const a = path.join(process.cwd(), 'public'); if (fs.existsSync(path.join(a, 'data', 'content.json'))) return a;
  return path.join(__dirname, '..', 'public');
}

// ---- build the tiger's knowledge from the site's own content ----
function systemPrompt(ROOT = siteRoot()) {
  const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'content.json'), 'utf8'));
  const lines = [];
  data.sections.forEach((s) => {
    lines.push(`\n## ${s.title} (section id: ${s.id})`);
    s.items.forEach((i) => lines.push(`- [${s.id}/${i.id}] ${i.title}${i.place ? ' (' + i.place + ')' : ''}${i.year ? ', ' + i.year : ''}: ${i.text} ${(i.facts || []).join('. ')}`));
  });
  lines.push('\n## 3D models');
  Object.entries(data.icons).forEach(([k, v]) => lines.push(`- [view/${k}] ${v.title}: ${v.text} ${v.facts.join('. ')}`));
  try {
    const map = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'map.json'), 'utf8'));
    lines.push('\n## Geography');
    lines.push(`- ${map.country.text} ${map.country.facts.slice(0, 8).join('. ')}`);
    map.divisions.forEach((d) => lines.push(`- ${d.name} Division (${d.districts} districts): ${d.text} ${d.facts.join('. ')}`));
    if (map.places) { lines.push('\n## Cities, districts and places on the map (use GO:place/<id>)'); map.places.forEach((p) => lines.push(`- [place/${p.id}] ${p.name} (${p.kind}, ${p.div} division)${p.text ? ': ' + p.text : ''}`)); }
  } catch (e) { /* map data is optional */ }
  return PROMPT_HEAD(data) + `\n\nQuick facts: ${data.site.quickFacts.join('; ')}.\n\nExhibition notes:${lines.join('\n')}`;
}

const PROMPT_HEAD = (data) => `You are ${data.site.guideName}, a friendly Royal Bengal Tiger who guides visitors through an interactive exhibition about Bangladesh at a cultural festival stall.
Speak in warm, simple words, in the first person as the tiger. Give a full, detailed answer: five to nine sentences. Say what the thing is, where it is, why it is famous, one or two interesting facts, and a small tip for a visitor when it fits. Plain text only. No markdown, no bullet lists, no headings.
Visitors may be of any age and from any country. Be respectful about history, religion and politics. Stay neutral on current politics and do not take sides.
Answer questions about Bangladesh: places, history, culture, food, language, people, travel. Use the exhibition notes below first. You may add well known facts that you are sure about. If you are not sure, say so instead of guessing.
If a question has nothing to do with Bangladesh, answer in one friendly line and bring the talk back to Bangladesh.
Languages: you speak English and Arabic fluently (and Bangla if asked). Always answer in the language of the visitor's latest message. If it is written in Arabic, answer fully in clear Modern Standard Arabic. If it is in English, answer in English. If the visitor switches language in the middle of the chat, switch with them straight away. Keep place names recognisable (for example: Sundarbans سونداربان).
You are also the visitor's guide around the screen. End with one line in exactly this form so the screen can take them to the right place: GO:section/item (example: GO:nature/ratargul), GO:section (example: GO:food), GO:view/tiger, GO:view/rickshaw, GO:view/mosque, GO:view/minar (Shaheed Minar), GO:view/smriti (National Martyrs' Memorial), GO:view/parliament (the National Parliament House by Louis Kahn), GO:place/<id> (flies the map to one of the 64 districts or a famous place listed under Cities; ALWAYS use it when the visitor asks about a city, a town, a district or a place to visit such as Sylhet, Cox's Bazar, Sreemangal or Saint Martin's Island, unless one exhibit photo or 3D model is clearly the main topic), GO:map (the interactive map; always use it for questions about where Bangladesh is, its borders, neighbours, size, divisions, districts or rivers), GO:map/<division> with one of dhaka, chattogram, rajshahi, khulna, barishal, sylhet, rangpur, mymensingh (use it when a whole division is the main topic), GO:anthem (the national anthem with moving lyrics) or GO:journey (the full screen photo show). Choose the screen that matches the MAIN topic of the question. Never pick an exhibit just because it shares a word with the question. If the visitor asks you to show, open, play or take them somewhere, always add the GO line. Use only the ids listed here or in the notes, add at most one GO line, and leave it out if nothing truly fits.`;

const LANG = { en: 'English', ar: 'Arabic', bn: 'Bangla' };
// one chat turn through OpenRouter. Returns { status, body } so both servers can send it as JSON.
async function chat({ apiKey, model, system, messages, lang }) {
  if (!Array.isArray(messages)) return { status: 400, body: { error: 'messages missing' } };
  if (!['en', 'ar', 'bn'].includes(lang)) lang = 'en';
  messages = messages.slice(-10).filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string').map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }));
  try {
    const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'X-Title': 'Bangladesh 3D Journey' },
      body: JSON.stringify({ model, max_tokens: 900, temperature: 0.6, messages: [{ role: 'system', content: system + `\n\nThe visitor's latest message is in ${LANG[lang]}. Reply in ${LANG[lang]}. The GO line, if you add one, always stays in English letters.` }, ...messages] }),
      signal: AbortSignal.timeout(28000)
    });
    const j = await r.json();
    if (!r.ok) { console.error('OpenRouter error:', r.status, JSON.stringify(j).slice(0, 300)); return { status: 502, body: { error: 'upstream error' } }; }
    const reply = j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
    return { status: 200, body: { reply: (reply || '').trim() } };
  } catch (e) { console.error('Chat failed:', e.message); return { status: 502, body: { error: 'chat failed' } }; }
}
const hasKey = (k) => !!k && !/your[-_ ]?key|xxxx|paste/i.test(k);

module.exports = { systemPrompt, chat, hasKey, siteRoot };
