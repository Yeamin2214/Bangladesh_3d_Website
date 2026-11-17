// The guide: speech bubble, read-aloud voice and the chatbot (English and Arabic).
// The chatbot talks to /api/chat (OpenRouter, through server.js). If that is not
// reachable it answers from the site's own content, so the stall never goes quiet.
const $ = (s) => document.querySelector(s);
const STOP = new Set('a an the of in on at to for and or is are was were be been it its this that with as by from what who when where why how which tell me about show please can you i we do does did there more some any your my bangladesh bangladeshi country famous know'.split(' '));
// requests that ask the guide to take the visitor somewhere: the guide then goes there by itself
const ACTION = /^(please |can you |could you )?(show|open|take me|go to|play|start|let me see|i want to see|bring me|zoom)|দেখাও|নিয়ে চল|খোলো|أرني|اعرض|خذني|افتح|شغّ?ل|ابدأ/i;
const GEO = /where is|where'?s|located|location|on the map|\bmap\b|border|neighbou?r|latitude|longitude|geograph|how (big|large)|area of|size of|\bdivisions?\b|\bdistricts?\b|how many rivers|rivers? (are|in)|which (part|continent|region)/;
const AR_GEO = /أين|موقع|خريطة|حدود|أقسام|محافظات|مساحة|تقع/;
const DIV_ALIAS = { dhaka: 'dhaka|dacca', chattogram: 'chattogram|chittagong|cox|bandarban|rangamati|cumilla|comilla', rajshahi: 'rajshahi|bogura|bogra|paharpur', khulna: 'khulna|sundarbans?|bagerhat|kushtia|jessore|jashore', barishal: 'barishal|barisal|kuakata|bhola', sylhet: 'sylhet|sreemangal|srimangal|jaflong', rangpur: 'rangpur|dinajpur|panchagarh|tetulia', mymensingh: 'mymensingh|netrokona|birishiri' };
const DIV_AR = { dhaka: 'دكا', chattogram: 'شيتاغونغ|شيتاجونج', rajshahi: 'راجشاهي', khulna: 'خولنا', barishal: 'باريسال', sylhet: 'سيلهيت|سلهت', rangpur: 'رانغبور|رانجبور', mymensingh: 'ميمنسينغ' };
const words = (s) => (s || '').toLowerCase().replace(/[^a-z0-9؀-ۿঀ-৿\s']/g, ' ').split(/\s+/).filter((w) => w.length > 1 && !STOP.has(w));
const isArabic = (s) => /[؀-ۿ]/.test(s);
const isBangla = (s) => /[ঀ-৿]/.test(s);

const SECTION_HINTS = {
  nature: 'nature natural place places tourist spot spots travel visit forest river beach sea hill hills waterfall scenery scenic wildlife mangrove',
  heritage: 'heritage mosque mosques architecture building buildings palace monument terracotta old historic unesco archaeology',
  history: 'history war liberation independence 1971 1952 language movement famine freedom martyr martyrs british nawab victory',
  culture: 'culture festival festivals boishakh new year fair mela tradition traditions muslin clothes dress village rural season seasons',
  art: 'art painting paintings painter artist artists zainul abedin sketch drawing',
  food: 'food foods eat dish dishes cuisine meal rice fish sweet sweets dessert spicy hungry taste recipe cook'
};
// Arabic words that point to a section, used when the AI is offline
const AR_HINTS = {
  nature: 'طبيعة غابة غابات نهر أنهار شاطئ بحر تلال شلال سياحة أماكن زيارة', heritage: 'تراث مسجد مساجد عمارة قصر آثار', history: 'تاريخ حرب استقلال تحرير اللغة مجاعة النصر',
  culture: 'ثقافة مهرجان عيد تقاليد موسلين قرية', art: 'فن لوحة لوحات رسم فنان', food: 'طعام أكل مأكولات طبق أطباق أرز سمك حلوى حلويات'
};
const T = {
  en: {
    hello: (n) => `Hello! I am ${n}, your guide. Ask me anything about Bangladesh. Places, history, food, culture, anything.`,
    place: 'Ask about Bangladesh…', send: 'Send', thinking: 'Bagh Mama is thinking…', go: 'Take me there',
    chips: ['Tell me about the Sundarbans', 'What food should I try?', 'Why is 21 February special?', 'What happened in 1971?', 'Show me the Sixty Dome Mosque', 'What is the capital?']
  },
  ar: {
    hello: (n) => `مرحباً! أنا ${n}، مرشدكم. اسألوني أي شيء عن بنغلاديش: الأماكن، التاريخ، الطعام، الثقافة.`,
    place: 'اسأل عن بنغلاديش…', send: 'إرسال', thinking: 'باغ ماما يفكّر…', go: 'خذني إلى هناك',
    chips: ['حدّثني عن غابات سونداربان', 'ماذا آكل في بنغلاديش؟', 'لماذا ٢١ فبراير يوم مميز؟', 'ماذا حدث عام ١٩٧١؟', 'أرني مسجد الستين قبة', 'ما هي العاصمة؟']
  }
};

export class Guide {
  constructor({ onTalk, navigate }) {
    this.onTalk = onTalk; this.navigate = navigate; this.history = []; this.ai = false; this.voice = null; this.speaking = false; this.lang = null;
    this.bubble = $('#bubble'); this.log = $('#chatLog');
    $('#chatClose').onclick = () => this.closeChat();
    $('#chatForm').addEventListener('submit', (e) => { e.preventDefault(); const v = $('#chatInput').value.trim(); if (v) { $('#chatInput').value = ''; this.ask(v); } });
    this.bubble.addEventListener('click', (e) => { if (e.target.id !== 'bubbleAsk') this.bubble.classList.add('hide'); });
    if ('speechSynthesis' in window) { const pick = () => { this.voices = speechSynthesis.getVoices(); this.voice = this.voices.find((v) => /en[-_]IN/i.test(v.lang)) || this.voices.find((v) => /en[-_]GB/i.test(v.lang)) || this.voices.find((v) => /^en/i.test(v.lang)) || null; }; pick(); speechSynthesis.onvoiceschanged = pick; }
    // a small button in the chat header to switch language later
    const sw = document.createElement('button'); sw.id = 'langSwitch'; sw.textContent = 'EN / ع'; sw.title = 'Change language'; sw.onclick = () => this.pickLanguage();
    $('#chat header').insertBefore(sw, $('#chatClose')); $('#chatClose').style.marginLeft = '0'; sw.style.marginLeft = 'auto';
    fetch('api/health').then((r) => r.json()).then((j) => { this.ai = !!j.ai; const b = $('#aiBadge'); b.textContent = this.ai ? 'AI online' : 'offline guide'; b.classList.toggle('live', this.ai); }).catch(() => {});
  }

  setData(data, i18n) {
    this.data = data; this.i18n = i18n || { items: {}, sections: {} }; this.index = [];
    data.sections.forEach((sec) => sec.items.forEach((it) => {
      const bag = new Map(); const add = (txt, w) => words(txt).forEach((t) => bag.set(t, (bag.get(t) || 0) + w));
      const tr = this.i18n.items[it.id] || {};
      add(it.title, 5); add(it.place, 2); add(it.year, 2); add(it.text, 1); (it.facts || []).forEach((f) => add(f, 1)); add(it.id.replace(/_/g, ' '), 2);
      add(tr.ar, 5); add(tr.sar, 2); add(tr.bn, 5);
      this.index.push({ sec, it, bag, tr });
    }));
    this.pickLanguage();
    fetch('data/map.json').then((r) => r.json()).then((m) => { this.map = m; }).catch(() => {});
  }

  /* ---------- language ---------- */
  pickLanguage() {
    this.log.innerHTML = ''; $('#chatChips').innerHTML = ''; this.history = [];
    this.addMsg('bot', 'Choose your language  ·  اختر لغتك');
    const row = document.createElement('div'); row.className = 'langpick';
    [['en', 'English'], ['ar', 'العربية']].forEach(([l, label]) => { const b = document.createElement('button'); b.textContent = label; if (l === 'ar') b.style.fontFamily = 'var(--arabic)'; b.onclick = () => this.setLang(l, true); row.appendChild(b); });
    this.log.appendChild(row);
  }
  setLang(l, greet) {
    this.lang = l; const t = T[l]; const chat = $('#chat'); chat.classList.toggle('rtl', l === 'ar');
    $('#chatInput').placeholder = t.place; $('#chatForm button').textContent = t.send;
    $('#chatChips').innerHTML = ''; t.chips.forEach((c) => { const b = document.createElement('button'); b.textContent = c; b.onclick = () => this.ask(c); $('#chatChips').appendChild(b); });
    if (greet) { this.log.innerHTML = ''; this.addMsg('bot', t.hello(this.data.site.guideName)); }
  }

  /* ---------- bubble ---------- */
  say(text) {
    $('#bubbleText').textContent = text; this.bubble.classList.remove('hide');
    clearTimeout(this._h); this._h = setTimeout(() => this.bubble.classList.add('hide'), 3000);
  }

  /* ---------- voice ---------- */
  unlockVoice() { try { if ('speechSynthesis' in window) { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; speechSynthesis.speak(u); } } catch (e) { /* ignore */ } }
  speak(text) {
    if (!('speechSynthesis' in window)) return; speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    if (isArabic(text)) { const av = (this.voices || []).find((v) => /^ar/i.test(v.lang)); if (av) u.voice = av; u.lang = 'ar'; } else if (this.voice) u.voice = this.voice;
    u.rate = 0.96; u.pitch = 0.9;
    u.onstart = () => { this.speaking = true; this.onTalk(true); };
    u.onend = u.onerror = () => { this.speaking = false; this.onTalk(false); };
    speechSynthesis.speak(u);
  }
  stopSpeaking() { if ('speechSynthesis' in window) speechSynthesis.cancel(); this.speaking = false; this.onTalk(false); }
  isSpeaking() { return this.speaking; }

  /* ---------- chat ---------- */
  openChat(prefill) { $('#chat').classList.add('open'); document.body.classList.add('chat-open'); this.bubble.classList.add('hide'); if (prefill) this.ask(prefill); else if (this.lang && window.matchMedia('(pointer:fine)').matches) $('#chatInput').focus(); }
  closeChat() { $('#chat').classList.remove('open'); document.body.classList.remove('chat-open'); }
  addMsg(who, text, target) {
    const d = document.createElement('div'); d.className = 'msg ' + who + (isArabic(text) ? ' rtl' : ''); d.textContent = text;
    if (target) { const b = document.createElement('button'); b.className = 'go'; b.textContent = target.label || T[this.lang || 'en'].go; b.onclick = () => { this.closeChat(); this.navigate(target); }; d.appendChild(document.createElement('br')); d.appendChild(b); }
    this.log.appendChild(d); this.log.scrollTop = this.log.scrollHeight; return d;
  }

  async ask(q) {
    // the language of the message wins: Arabic text gets an Arabic answer, English text an English one
    const msgLang = isArabic(q) ? 'ar' : isBangla(q) ? 'bn' : /[a-z]/i.test(q) ? 'en' : (this.lang || 'en');
    if (!this.lang) this.setLang(msgLang === 'ar' ? 'ar' : 'en', false);
    this.log.querySelectorAll('.langpick').forEach((el) => el.remove());
    const ui = msgLang === 'ar' ? 'ar' : 'en';
    this.addMsg('me', q); this.history.push({ role: 'user', content: q });
    const typing = this.addMsg('bot typing', T[ui].thinking);
    let reply = null, target = null;
    if (this.ai) {
      try {
        const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 30000);
        const r = await fetch('api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: this.history.slice(-8), lang: msgLang }), signal: ctl.signal });
        clearTimeout(to);
        if (r.ok) { const j = await r.json(); if (j.reply) { reply = j.reply; const m = reply.match(/GO:\s*([a-z]+)(?:\/([a-z0-9_]+))?/i); if (m) { target = this.parseTarget(m[1].toLowerCase(), m[2], ui); reply = reply.replace(/\n?\s*GO:\s*[a-z]+(?:\/[a-z0-9_]+)?\s*/gi, '').trim(); } } }
      } catch (e) { /* fall through to the offline answer */ }
    }
    const local = msgLang === 'ar' ? this.localArabic(q) : this.localAnswer(q, !!reply);
    if (!reply) { reply = local.text; target = local.target; }
    else if (!target && local.strong) target = local.target;   // only a clear match adds a button, never a loose keyword guess
    // a city or place named in the question: the map is the answer, even when the AI picked something looser
    if (local.place && local.target && (!target || target.map)) target = local.target;
    if (target && ui === 'ar') target.label = T.ar.go;
    typing.remove(); this.addMsg('bot', reply, target); this.history.push({ role: 'assistant', content: reply });
    // "show me ...", "open ...", "take me to ...": go there straight away
    if (target && ACTION.test(q.trim())) setTimeout(() => { this.closeChat(); this.navigate(target); }, 1600);
    // asked about a city or a division: fly there on the map by itself, and leave the chat open so the answer can still be read
    else if (target && target.map && (target.place || target.division)) setTimeout(() => this.navigate(target), 900);
  }

  parseTarget(a, b, ui) {
    const go = ui === 'ar' ? T.ar.go : null;
    if (a === 'map') { const d = this.map && b && this.map.divisions.find((x) => x.id === b); return { map: true, division: d ? d.id : null, label: go || (d ? `Show ${d.name} on the map` : 'Open the map') }; }
    if (a === 'anthem') return { anthem: true, label: go || 'Play the national anthem' };
    if (a === 'journey') return { journey: true, label: go || 'Start the journey' };
    if (a === 'place') { const p = this.map && this.map.places && this.map.places.find((x) => x.id === b); if (p) return { map: true, division: p.div, place: p.id, label: go || `Show ${p.name} on the map` }; return { map: true, label: go || 'Open the map' }; }
    const VN = { tiger: 'the tiger', rickshaw: 'the rickshaw', mosque: 'the mosque', minar: 'the Shaheed Minar', smriti: 'the memorial', parliament: 'the Parliament' };
    if (a === 'view' && VN[b]) return { view: b, label: ui === 'ar' ? T.ar.go : `Show ${VN[b]} in 3D` };
    const sec = this.data.sections.find((s) => s.id === a); if (!sec) return null;
    const it = b && sec.items.find((i) => i.id === b);
    return { section: sec.id, item: it ? it.id : null, label: ui === 'ar' ? T.ar.go : (it ? `Show me: ${it.title}` : `Open ${sec.title}`) };
  }

  best(qs) {
    let best = null, bestS = 0;
    for (const e of this.index) { let s = 0; for (const w of qs) { s += e.bag.get(w) || 0; if (w.length > 4) for (const [k, v] of e.bag) if (k !== w && (k.startsWith(w) || w.startsWith(k)) && k.length > 4) { s += v * 0.5; break; } } if (s > bestS) { bestS = s; best = e; } }
    return { best, bestS };
  }
  full(it) { return `${it.title}. ${it.text}${it.facts && it.facts.length ? ' ' + it.facts.join('. ') + '.' : ''}`; }

  // Arabic answer when the AI is offline: short, from the translated notes
  localArabic(q) {
    if (/البرلمان|مجلس الأمة|سانغساد|لويس كان/.test(q)) return { strong: true, text: 'مبنى البرلمان الوطني (جاتيا سانغساد بهابان) في دكا من تصميم المعماري الأمريكي لويس كان. بدأ بناؤه عام 1961 واكتمل في 28 يناير 1982، وتحيط به بحيرة فيبدو كأنه يطفو على الماء.', target: { view: 'parliament', label: T.ar.go } };
    const apl = /قسم/.test(q) ? null : this.findPlace(q, true);
    if (apl) { const dv = this.map.divisions.find((d) => d.id === apl.div); return { strong: true, place: true, text: `${apl.ar.split('|')[0]} ${apl.kind === 'district' ? 'مدينة ومحافظة' : 'مكان مشهور'} في قسم ${DIV_AR[dv.id].split('|')[0]} في بنغلاديش. سآخذكم إليها على الخريطة الآن.`, target: { map: true, division: apl.div, place: apl.id, label: T.ar.go } }; }
    const div = this.findDivision(q, true);
    if (div) return { strong: true, text: `قسم ${div.name} (${DIV_AR[div.id].split('|')[0]}) هو واحد من ثمانية أقسام إدارية في بنغلاديش، ويضم ${div.districts} محافظات. اضغطوا الزر لرؤيته على الخريطة.`, target: { map: true, division: div.id, label: T.ar.go } };
    if (AR_GEO.test(q)) return { strong: true, text: 'تقع بنغلاديش في جنوب آسيا على رأس خليج البنغال. تحيط بها الهند من الغرب والشمال والشرق، وتحدها ميانمار من الجنوب الشرقي. تبلغ مساحتها نحو 148 ألف كيلومتر مربع، وتضم 8 أقسام إدارية و64 محافظة، ويجري فيها أكثر من 1400 نهر.', target: { map: true, label: T.ar.go } };
    if (/نشيد/.test(q)) return { strong: true, text: 'النشيد الوطني لبنغلاديش هو «آمار شونار بانغلا» أي «بنغالي الذهبية»، كتبه رابندراناث طاغور عام 1905.', target: { anthem: true, label: T.ar.go } };
    if (/رحلة|جولة|عرض/.test(q) && !/مسجد|نمر/.test(q)) return { strong: true, text: 'الرحلة عرض بملء الشاشة لكل الصور مع الموسيقى والتعليقات بالعربية والإنجليزية والبنغالية.', target: { journey: true, label: T.ar.go } };
    if (/مسجد الستين|الستين قبة/.test(q)) return { strong: true, text: 'مسجد الستين قبة في باغيرهات، بُني في القرن الخامس عشر على يد خان جهان علي، وهو من مواقع التراث العالمي لليونسكو. يحمل سقفه 77 قبة.', target: { view: 'mosque', label: T.ar.go } };
    if (/شهيد منار|الشهداء اللغة|منار/.test(q)) return { strong: true, text: 'شهيد منار في دكا نصب يخلّد ذكرى الطلاب الذين استشهدوا في 21 فبراير 1952 دفاعاً عن اللغة البنغالية. صممه الفنان حميد الرحمن مع النحاتة نوفيرا أحمد: الأعمدة أمٌّ وأبناؤها الشهداء، وخلفها الشمس الحمراء.', target: { view: 'minar', label: T.ar.go } };
    if (/النصب التذكاري|سمريتي|سافار/.test(q)) return { strong: true, text: 'النصب التذكاري الوطني للشهداء في سافار صممه المعماري سيد معين الحسين، ويتكون من سبعة أزواج من الجدران المثلثة ترمز إلى سبع محطات نضال من 1952 إلى 1971، ويبلغ ارتفاعه 46 متراً.', target: { view: 'smriti', label: T.ar.go } };
    const qs = words(q).map((w) => w.replace(/^ال/, '')); const strip = (w) => w.replace(/^ال/, '');
    let hit = null, hs = 0;
    for (const e of this.index) { const tw = words(`${e.tr.ar || ''} ${e.tr.sar || ''}`).map(strip); const s = qs.filter((w) => w.length > 2 && tw.includes(w)).length; if (s > hs) { hs = s; hit = e; } }
    if (hit) return { strong: hs >= 2, text: `${hit.tr.ar}. ${hit.tr.sar || ''}`, target: { section: hit.sec.id, item: hit.it.id, label: T.ar.go } };
    for (const [id, hint] of Object.entries(AR_HINTS)) { const hw = hint.split(' ').map(strip); if (qs.some((w) => hw.includes(w))) { const sec = this.data.sections.find((s) => s.id === id); const names = sec.items.slice(0, 5).map((i) => (this.i18n.items[i.id] || {}).ar).filter(Boolean).join('، '); return { text: `${(this.i18n.sections[id] || {}).ar || sec.title}: ${names}.`, target: { section: id, label: T.ar.go } }; } }
    if (/عاصمة/.test(q)) return { text: 'عاصمة بنغلاديش هي دكا.' };
    if (/نمر/.test(q)) return { text: 'النمر البنغالي الملكي هو الحيوان الوطني لبنغلاديش، ويعيش في غابات سونداربان.', target: { view: 'tiger', label: T.ar.go } };
    return { text: 'عذراً، لا أستطيع الإجابة عن هذا السؤال بدون اتصال بالإنترنت. جرّبوا السؤال عن سونداربان، كوكس بازار، مسجد الستين قبة، أو الطعام.' };
  }

  // English answer from the site's own content (used offline, and to add a "take me there" button)
  findPlace(ql, ar) {
    if (!this.map || !this.map.places) return null;
    if (!this._pre) this._pre = this.map.places.map((p) => { const names = [p.name.toLowerCase().replace(/[’']/g, ''), ...(p.alias ? p.alias.split('|') : []), p.bn].filter(Boolean).map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')); const en = new RegExp(`(^|[^a-z\u0980-\u09ff])(${names.join('|')})($|[^a-z\u0980-\u09ff])`); const arr = p.ar ? new RegExp(`(${p.ar})`) : null; return { p, en, arr, len: Math.max(...names.map((n) => n.length)) }; });
    const q = ql.toLowerCase().replace(/[’']/g, '');
    let hit = null; for (const e of this._pre) { const re = ar ? e.arr : e.en; if (re && re.test(q) && (!hit || e.len > hit.len || (e.p.kind === 'place' && hit.p.kind === 'district' && e.len >= hit.len))) hit = e; }
    return hit ? hit.p : null;
  }
  placeAnswer(p) { const dv = this.map.divisions.find((d) => d.id === p.div); return { strong: true, place: true, text: p.text ? `${p.text} It is in ${dv.name} Division. I am taking you there on the map.` : `${p.name} is a district of ${dv.name} Division. ${dv.text} I am taking you there on the map.`, target: { map: true, division: p.div, place: p.id, label: `Show ${p.name} on the map` } }; }
  findDivision(ql, ar) { if (!this.map) return null; const tbl = ar ? DIV_AR : DIV_ALIAS; const id = Object.keys(tbl).find((k) => new RegExp(ar ? `(${tbl[k]})` : `\\b(${tbl[k]})\\b`).test(ql)); return id ? this.map.divisions.find((d) => d.id === id) : null; }
  localAnswer(q, targetOnly) {
    const ql = q.toLowerCase(); const qs = words(q);
    if (/parliament|sangsad|louis kahn|national assembly/.test(ql)) return { strong: true, text: this.data.icons.parliament.text.replace(' Drag to walk around it.', '') + ' ' + this.data.icons.parliament.facts.join('. ') + '.', target: { view: 'parliament', label: 'Show the Parliament in 3D' } };
    // a city, a district or a famous place: answer it and fly there on the map, unless the rest of the question is clearly about one exhibit
    const pl = /\bdivision\b/.test(ql) ? null : this.findPlace(ql, false); let placeAns = null, strongItem = false;
    if (pl) {
      const nameW = new Set(words([pl.name, pl.alias.replace(/\|/g, ' ')].join(' ')));
      const rest = qs.filter((w) => !nameW.has(w)); const other = this.best(rest);
      const wantsMap = GEO.test(ql) || /where|visit|travel|go to|located|city|town|district|famous for|known for/.test(ql);
      const iconWord = /rickshaw|riksha|shaheed minar|shahid minar|smriti|soudho|martyrs'? memorial|sixty dome|shat gombuj|anthem|journey|1971|1952/.test(ql);
      if (!iconWord && other.bestS < 6 && (pl.kind === 'district' || wantsMap)) return this.placeAnswer(pl);
      if (!iconWord && other.bestS < 6) placeAns = this.placeAnswer(pl);
      strongItem = other.bestS >= 6;
    }
    const div = this.findDivision(ql, false);
    if (div && !pl && !strongItem && (GEO.test(ql) || /division|famous|visit|tell me about|what is in/.test(ql) || words(q).length <= 2)) return { strong: true, text: `${div.name} Division. ${div.text} ${div.facts.join('. ')}.`, target: { map: true, division: div.id, label: `Show ${div.name} on the map` } };
    if (GEO.test(ql) && this.map) { const c = this.map.country; return { strong: true, text: `${c.text.replace(' Tap a division to lift it out of the map.', '')} ${c.facts.slice(0, 6).join('. ')}.`, target: { map: true, label: 'Open the map' } }; }
    if (/anthem|amar sonar bangla|national song/.test(ql)) return { strong: true, text: 'Our national anthem is Amar Sonar Bangla, "My Golden Bengal". Rabindranath Tagore wrote it in 1905. I can play it for you with the words moving along, in Bangla, English and Arabic.', target: { anthem: true, label: 'Play the national anthem' } };
    if (/journey|tour|slide ?show/.test(ql)) return { strong: true, text: 'The journey is a full screen show of every photo here, with music and captions in English, Bangla and Arabic.', target: { journey: true, label: 'Start the journey' } };
    if (/rickshaw|riksha/.test(ql)) return { strong: true, text: this.data.icons.rickshaw.text + ' ' + this.data.icons.rickshaw.facts.join('. ') + '.', target: { view: 'rickshaw', label: 'Show the rickshaw in 3D' } };
    if (/shaheed minar|shahid minar|shohid minar/.test(ql)) return { strong: true, text: this.data.icons.minar.text.replace(' Drag to look around.', '') + ' ' + this.data.icons.minar.facts.join('. ') + '.', target: { view: 'minar', label: 'Show the Shaheed Minar in 3D' } };
    if (/smriti|sriti|shoudho|soudho|martyrs'? memorial|savar/.test(ql)) return { strong: true, text: this.data.icons.smriti.text.replace(' Drag to walk around it.', '') + ' ' + this.data.icons.smriti.facts.join('. ') + '.', target: { view: 'smriti', label: 'Show the memorial in 3D' } };
    if (/sixty dome|shat gombuj|60 dome/.test(ql)) return { strong: true, text: this.data.icons.mosque.text + ' ' + this.data.icons.mosque.facts.join('. ') + '.', target: { view: 'mosque', label: 'Show the mosque in 3D' } };
    if (!targetOnly) {
      if (/^(hi|hello|hey|salam|assalam|as-salam|good (morning|evening|afternoon))\b/.test(ql)) return { text: 'Hello, friend! Ask me about our forests, our history, our food or our festivals. Or tap a doorway and I will walk with you.' };
      if (/who are you|your name/.test(ql)) return { text: `I am ${this.data.site.guideName}. People near the Sundarbans call the tiger "Mama", which means uncle. I am the national animal of Bangladesh.`, target: { view: 'tiger', label: 'See the tiger in 3D' } };
      if (/thank/.test(ql)) return { text: 'Dhonnobad! That means thank you in Bangla. Enjoy the rest of the journey.' };
      const qf = this.data.site.quickFacts.map((f) => ({ f, s: words(f).filter((w) => qs.includes(w)).length })).sort((a, b) => b.s - a.s)[0];
      if (qf && qf.s >= 1 && /capital|anthem|flag|currency|taka|national|language|independence|victory day|flower|fruit|bird/.test(ql)) return { text: qf.f + '.' };
    }
    const item = (sid, iid) => this.data.sections.find((x) => x.id === sid).items.find((i) => i.id === iid);
    if (/1971|liberation|independence|mukti|freedom fight|victory day/.test(ql)) return { strong: true, text: item('history', 'guerrilla71').text + ' ' + item('history', 'war71').text + ' ' + item('history', 'surrender71').text, target: { section: 'history', item: 'guerrilla71', label: 'Show me 1971' } };
    if (/1952|21(st)? (of )?feb|february|language movement|mother language|ekushe/.test(ql)) return { strong: true, text: item('history', 'lang52_a').text + ' ' + item('history', 'lang52_b').text, target: { section: 'history', item: 'lang52_a', label: 'Show me 1952' } };
    const { best, bestS } = this.best(qs);
    let secBest = null, secS = 0;
    for (const [id, hint] of Object.entries(SECTION_HINTS)) { const h = hint.split(' '); const s = qs.filter((w) => h.includes(w) || h.includes(w.replace(/s$/, ''))).length; if (s > secS) { secS = s; secBest = id; } }
    if (/tiger|bagh/.test(ql) && bestS < 6) return { text: this.data.icons.tiger.facts.join('. ') + '.', target: { view: 'tiger', label: 'See the tiger in 3D' } };
    if (best && bestS >= 5 && bestS >= secS * 3) return { strong: bestS >= 8, text: this.full(best.it), target: { section: best.sec.id, item: best.it.id, label: `Show me: ${best.it.title}` } };
    if (placeAns && !(best && bestS >= 8)) return placeAns;
    if (secBest) { const sec = this.data.sections.find((s) => s.id === secBest); return { text: `${sec.blurb} Here are some highlights. ${sec.items.slice(0, 4).map((i) => `${i.title}: ${i.text.split('. ')[0]}.`).join(' ')}`, target: { section: sec.id, label: `Open ${sec.title}` } }; }
    if (best && bestS >= 4) return { text: this.full(best.it), target: { section: best.sec.id, item: best.it.id, label: `Show me: ${best.it.title}` } };
    if (placeAns) return placeAns;
    return { text: 'Hmm, I am not sure about that one. Try asking me about the Sundarbans, Cox\'s Bazar, the Language Movement, 1971, Pohela Boishakh, muslin, or what to eat.' };
  }
}
