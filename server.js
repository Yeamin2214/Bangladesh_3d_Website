// Tiny local server for the Bangladesh 3D site. No packages to install.
// It serves the site and keeps your OpenRouter key hidden from visitors.
// Run:  node server.js     then open  http://localhost:3000
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { systemPrompt, chat, hasKey } = require('./api/_lib');

const ROOT = path.join(__dirname, 'public');

// ---- read .env (KEY=value per line) ----
const env = {};
try {
  fs.readFileSync(path.join(__dirname, '.env'), 'utf8').split(/\r?\n/).forEach((line) => {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/i);
    if (m && !line.trim().startsWith('#')) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  });
} catch (e) { /* no .env file yet */ }
const PORT = Number(process.env.PORT || env.PORT || 3000);
const API_KEY = process.env.OPENROUTER_API_KEY || env.OPENROUTER_API_KEY || '';
const MODEL = process.env.OPENROUTER_MODEL || env.OPENROUTER_MODEL || 'openai/gpt-4o-mini';
const HAS_KEY = hasKey(API_KEY);

let SYSTEM = '';
try { SYSTEM = systemPrompt(ROOT); } catch (e) { console.error('Could not read content.json:', e.message); }

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.glb': 'model/gltf-binary', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4', '.wav': 'audio/wav', '.wasm': 'application/wasm', '.ico': 'image/x-icon' };

function sendJson(res, code, obj) { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(obj)); }

async function handleChat(req, res) {
  let body = '';
  for await (const chunk of req) { body += chunk; if (body.length > 200000) return sendJson(res, 413, { error: 'too large' }); }
  if (!HAS_KEY) return sendJson(res, 503, { error: 'no api key' });
  let j; try { j = JSON.parse(body); } catch (e) { return sendJson(res, 400, { error: 'bad json' }); }
  const out = await chat({ apiKey: API_KEY, model: MODEL, system: SYSTEM, messages: j.messages, lang: j.lang });
  return sendJson(res, out.status, out.body);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/api/health') return sendJson(res, 200, { ok: true, ai: !!HAS_KEY, model: HAS_KEY ? MODEL : null });
  if (url.pathname === '/api/chat' && req.method === 'POST') return handleChat(req, res);
  let rel = decodeURIComponent(url.pathname); if (rel.endsWith('/')) rel += 'index.html';
  const file = path.normalize(path.join(ROOT, rel));
  if (file !== ROOT && !file.startsWith(ROOT + path.sep)) { res.writeHead(403); return res.end('Forbidden'); }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Not found'); }
    const type = TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream';
    const range = req.headers.range && /bytes=(\d*)-(\d*)/.exec(req.headers.range);
    if (range) { // audio seeking on iPad needs range requests
      const start = range[1] ? parseInt(range[1], 10) : 0; const end = range[2] ? Math.min(parseInt(range[2], 10), st.size - 1) : st.size - 1;
      if (start > end || start >= st.size) { res.writeHead(416, { 'Content-Range': `bytes */${st.size}` }); return res.end(); }
      res.writeHead(206, { 'Content-Type': type, 'Content-Range': `bytes ${start}-${end}/${st.size}`, 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1 });
      return fs.createReadStream(file, { start, end }).pipe(res);
    }
    res.writeHead(200, { 'Content-Type': type, 'Content-Length': st.size, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-cache' });
    fs.createReadStream(file).pipe(res);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('\n  Bangladesh 3D Journey is running\n');
  console.log(`  On this laptop:   http://localhost:${PORT}`);
  Object.values(os.networkInterfaces()).flat().filter((n) => n && n.family === 'IPv4' && !n.internal).forEach((n) => console.log(`  On iPad / phone:  http://${n.address}:${PORT}   (same Wi-Fi)`));
  console.log(`\n  Chatbot: ${HAS_KEY ? 'AI online, model ' + MODEL : 'offline answers only (add OPENROUTER_API_KEY to .env for AI)'}`);
  console.log('  Press Ctrl+C to stop.\n');
});
