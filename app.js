/* ═══════════════════════════════════════════════
   neural.cards — app.js v3
   - Study mode (Active Recall + SRS)
   - ADHD mode (Duolingo trail with minigames)
═══════════════════════════════════════════════ */

const LESSON_SIZE = 3;
const MAX_REVIEW = 3;
const SR_INTERVALS = [1, 3, 7, 21];

const S = {
  data: null, xp: 0,
  srs: {}, done: {},
  streak: 0, lastDate: null,
  mode: 'study',
  // theory
  thCards: [], thIdx: 0, activeSec: null, activeLi: null,
  // session
  queue: [], qi: 0, correct: 0, wrong: 0, hearts: 3, answered: false,
};

const A = {
  // ADHD state
  filter: new Set(),    // pinned topics; empty = all
  trail: [],            // ['ok','err','fact'] last visible items
  trailMax: 8,
  combo: 0, bestCombo: 0,
  sessionXP: 0, totalRight: 0, totalSeen: 0,
  queue: [], qi: 0,
  current: null,
  answered: false,
  matchState: null,     // for match minigame
};

// ── storage ─────────────────────────────────────
function save() {
  localStorage.setItem('nc3_xp', S.xp);
  localStorage.setItem('nc3_srs', JSON.stringify(S.srs));
  localStorage.setItem('nc3_done', JSON.stringify(S.done));
  localStorage.setItem('nc3_str', S.streak);
  localStorage.setItem('nc3_dt', S.lastDate || '');
  localStorage.setItem('nc3_adhd_best', A.bestCombo);
  localStorage.setItem('nc3_adhd_right', A.totalRight);
  localStorage.setItem('nc3_adhd_seen', A.totalSeen);
}
function load() {
  S.xp = +(localStorage.getItem('nc3_xp') || 0);
  S.streak = +(localStorage.getItem('nc3_str') || 0);
  S.lastDate = localStorage.getItem('nc3_dt') || null;
  try { S.srs = JSON.parse(localStorage.getItem('nc3_srs') || '{}'); } catch { S.srs = {}; }
  try { S.done = JSON.parse(localStorage.getItem('nc3_done') || '{}'); } catch { S.done = {}; }
  A.bestCombo = +(localStorage.getItem('nc3_adhd_best') || 0);
  A.totalRight = +(localStorage.getItem('nc3_adhd_right') || 0);
  A.totalSeen = +(localStorage.getItem('nc3_adhd_seen') || 0);
}

// ── helpers ──────────────────────────────────────
const today = () => new Date().toISOString().slice(0, 10);
const daysLater = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const getSRS = id => S.srs[id] || { streak: 0, nextDate: null, lastSeen: null };
const isNew = id => !S.srs[id]?.lastSeen;
const isDue = id => { const s = getSRS(id); return s.nextDate && s.nextDate <= today(); };

function recordAnswer(id, ok) {
  const s = getSRS(id);
  if (ok) {
    s.streak = Math.min(s.streak + 1, SR_INTERVALS.length);
    s.nextDate = daysLater(SR_INTERVALS[s.streak - 1] ?? 21);
  } else {
    s.streak = 0;
    s.nextDate = today();
  }
  s.lastSeen = today();
  S.srs[id] = s;
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = 0 | Math.random() * (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function lessonCards(secId, li) {
  const sec = S.data.sections.find(s => s.id === secId);
  return sec.cards.slice(li * LESSON_SIZE, (li + 1) * LESSON_SIZE);
}

function markToday() {
  const t = today();
  if (S.lastDate === t) return;
  const diff = S.lastDate ? Math.round((new Date(t) - new Date(S.lastDate)) / 86400000) : 999;
  S.streak = diff === 1 ? S.streak + 1 : 1;
  S.lastDate = t;
  save();
}

// ── screens ──────────────────────────────────────
function show(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}
function goHome() { renderHome(); show('homeScreen'); }

function switchMode(mode) {
  S.mode = mode;
  document.getElementById('navStudy').classList.toggle('active', mode === 'study');
  document.getElementById('navAdhd').classList.toggle('active', mode === 'adhd');
  if (mode === 'study') goHome();
  else { renderAdhdHome(); show('adhdHomeScreen'); }
}

// ═══════════════════════════════════════════════
//  STUDY MODE — HOME
// ═══════════════════════════════════════════════
function renderHome() {
  document.getElementById('xpNum').textContent = S.xp;
  renderStreak();
  const list = document.getElementById('chapterList');
  list.innerHTML = '';

  S.data.sections.forEach(sec => {
    const total = sec.cards.length;
    const seen = sec.cards.filter(c => !isNew(c.id) && getSRS(c.id).streak >= 1).length;
    const pct = total ? Math.round(seen / total * 100) : 0;
    const chunks = [];
    for (let i = 0; i < sec.cards.length; i += LESSON_SIZE)
      chunks.push(sec.cards.slice(i, i + LESSON_SIZE));

    const el = document.createElement('div');
    el.className = 'ch';
    el.innerHTML = `
      <div class="ch-head" onclick="toggleCh(this)">
        <div class="ch-stripe" style="background:${sec.color}"></div>
        <div class="ch-ic" style="color:${sec.color}">${sec.icon}</div>
        <div class="ch-info">
          <div class="ch-t">${sec.title}</div>
          <div class="ch-d">${sec.description}</div>
          <div class="ch-prog">
            <div class="ch-bar"><div class="ch-fill" style="width:${pct}%;background:${sec.color}"></div></div>
            <div class="ch-pct">${pct}%</div>
          </div>
        </div>
        <div class="ch-arrow">›</div>
      </div>
      <div class="les-wrap"><div class="les-inner" id="li_${sec.id}"></div></div>`;
    list.appendChild(el);

    const inner = document.getElementById(`li_${sec.id}`);
    let prevOk = true;
    chunks.forEach((cards, li) => {
      const key = `${sec.id}_${li}`;
      const isDone = !!S.done[key];
      const locked = !prevOk;
      const hasDue = isDone && cards.some(c => isDue(c.id));
      if (!isDone) prevOk = false;
      const concepts = cards.map(c => c.concept || '').filter(Boolean).join(' · ');
      const row = document.createElement('div');
      row.className = `les-row${isDone ? ' done' : ''}${locked ? ' locked' : ''}`;
      row.innerHTML = `
        <div class="les-ic${isDone ? ' done' : ''}">${isDone ? '✓' : li + 1}</div>
        <div class="les-info">
          <div class="les-t">Урок ${li + 1}</div>
          <div class="les-s">${(concepts || cards.length + ' карточек').slice(0, 44)}</div>
        </div>
        <div class="les-r">
          ${hasDue ? '<div class="due-dot"></div>' : ''}
          <span style="font-size:13px;color:var(--t3)">${isDone ? (hasDue ? '↺' : '') : locked ? '🔒' : '→'}</span>
        </div>`;
      if (!locked) row.addEventListener('click', () => openLesson(sec.id, li));
      inner.appendChild(row);
    });

    const allDone = chunks.every((_, li) => !!S.done[`${sec.id}_${li}`]);
    const finDone = !!S.done[`${sec.id}_final`];
    const finRow = document.createElement('div');
    finRow.className = `les-row review final${!allDone ? ' locked' : ''}`;
    finRow.innerHTML = `
      <div class="les-ic rev">★</div>
      <div class="les-info">
        <div class="les-t">Финал главы</div>
        <div class="les-s">Все ${sec.cards.length} тем вперемешку</div>
      </div>
      <div class="les-r">
        <span style="font-size:13px;color:var(--t3)">${finDone ? '✓' : allDone ? '→' : '🔒'}</span>
      </div>`;
    if (allDone) finRow.addEventListener('click', () => openFinal(sec.id));
    inner.appendChild(finRow);
  });
}

function renderStreak() {
  const lbl = document.getElementById('streakLabel');
  const sub = document.getElementById('streakSub');
  const days = document.getElementById('streakDays');
  const w = S.streak === 1 ? 'день' : S.streak < 5 ? 'дня' : 'дней';
  lbl.textContent = S.streak ? `${S.streak} ${w} подряд 🔥` : 'Начни сегодня';
  sub.textContent = S.streak ? 'Повторения работают' : 'Заходи каждый день';
  days.innerHTML = '';
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const ok = S.lastDate && S.streak >= (7 - i);
    const dv = document.createElement('div');
    dv.className = `sb-day${ok ? ' on' : ''}`;
    dv.textContent = ['В', 'П', 'В', 'С', 'Ч', 'П', 'С'][d.getDay()];
    days.appendChild(dv);
  }
}

function toggleCh(head) { head.closest('.ch').classList.toggle('open'); }

// ═══════════════════════════════════════════════
//  STUDY MODE — THEORY
// ═══════════════════════════════════════════════
function openLesson(secId, li) {
  S.activeSec = secId;
  S.activeLi = li;
  const sec = S.data.sections.find(s => s.id === secId);
  S.thCards = lessonCards(secId, li);
  S.thIdx = 0;
  document.getElementById('thChLbl').textContent = sec.title;
  document.getElementById('thLname').textContent = `Урок ${li + 1}`;
  buildTheory(S.thCards);
  show('theoryScreen');
}

function buildTheory(cards) {
  const scroll = document.getElementById('thScroll');
  const dots = document.getElementById('thDots');
  const nav = document.getElementById('thNavBottom');
  const lvlMap = { beginner: 'базовый', intermediate: 'средний', advanced: 'продвинутый' };

  dots.innerHTML = cards.map((_, i) => `<div class="th-dot${i === 0 ? ' cur' : ''}"></div>`).join('');
  scroll.innerHTML = '';

  cards.forEach((card, idx) => {
    const div = document.createElement('div');
    div.className = `th-slide${idx === 0 ? ' active' : ''}`;
    let h = `<span class="lvl lvl-${card.level}">${lvlMap[card.level]}</span>
             <div class="th-tag" style="margin-top:8px">${card.section}</div>
             <div class="th-concept">${card.concept}</div>
             <div class="th-def">${card.definition}</div>`;
    if (card.formula) h += `<div class="th-formula"><div class="th-formula-t">${card.formula}</div></div>`;
    if (card.example) h += `<div class="th-ex"><div class="th-ex-l">— пример —</div><div class="th-ex-t">${card.example}</div></div>`;
    if (card.analogy) h += `<div class="th-an"><div class="th-an-i">💡</div><div class="th-an-t">${card.analogy}</div></div>`;
    const srcKey = card.source;
    const src = S.data.sources?.[srcKey];
    if (src) {
      h += `<a class="th-src" href="${src.url}" target="_blank" rel="noopener">
        <div class="th-src-i">📄</div>
        <div class="th-src-info">
          <div class="th-src-l">источник</div>
          <div class="th-src-n">${src.name}</div>
        </div>
        <div class="th-src-arrow">↗</div>
      </a>`;
    }
    h += `<div class="th-recall">
            <div class="th-recall-l">— активное воспроизведение —</div>
            <div class="th-recall-t">Закрой глаза и объясни концепт своими словами. <strong>Это важнее чем просто прочитать.</strong></div>
          </div>`;
    div.innerHTML = h;
    scroll.appendChild(div);
  });

  renderTheoryNav();
}

function renderTheoryNav() {
  const nav = document.getElementById('thNavBottom');
  const idx = S.thIdx;
  const last = S.thCards.length - 1;
  let h = '';
  if (idx > 0) h += `<button class="th-btn" onclick="thGo(${idx - 1})">← назад</button>`;
  if (idx < last) h += `<button class="th-btn" onclick="thGo(${idx + 1})">далее →</button>`;
  else h += `<button class="th-btn go" onclick="startQuiz()">К заданиям →</button>`;
  nav.innerHTML = h;
}

function thGo(idx) {
  document.querySelectorAll('.th-slide').forEach((s, i) => s.classList.toggle('active', i === idx));
  document.querySelectorAll('.th-dot').forEach((d, i) => {
    d.className = `th-dot${i === idx ? ' cur' : i < idx ? ' past' : ''}`;
  });
  S.thIdx = idx;
  document.getElementById('thScroll').scrollTop = 0;
  renderTheoryNav();
}

// ═══════════════════════════════════════════════
//  STUDY MODE — SESSION
// ═══════════════════════════════════════════════
function buildReview() {
  const curIds = S.activeLi !== null ? lessonCards(S.activeSec, S.activeLi).map(c => c.id) : [];
  const due = [];
  S.data.sections.forEach(sec =>
    sec.cards.forEach(card => {
      if (isDue(card.id) && !curIds.includes(card.id))
        due.push({ card, isReview: true });
    })
  );
  return shuffle(due).slice(0, MAX_REVIEW);
}

function interleave(main, rev) {
  const out = []; let ri = 0;
  main.forEach((item, i) => {
    out.push(item);
    if ((i + 1) % 2 === 0 && ri < rev.length) out.push(rev[ri++]);
  });
  while (ri < rev.length) out.push(rev[ri++]);
  return out;
}

function startQuiz() {
  const cards = lessonCards(S.activeSec, S.activeLi);
  const main = shuffle(cards).map(c => ({ card: c, isReview: false }));
  const rev = buildReview();
  initSession(interleave(main, rev));
}

function openFinal(secId) {
  S.activeSec = secId;
  S.activeLi = null;
  const sec = S.data.sections.find(s => s.id === secId);
  initSession(shuffle(sec.cards).map(c => ({ card: c, isReview: false })));
}

function initSession(queue) {
  S.queue = queue;
  S.qi = 0; S.correct = 0; S.wrong = 0; S.hearts = 3; S.answered = false;
  markToday();
  renderQ();
  show('sessionScreen');
}

function renderQ() {
  const sec = S.data.sections.find(s => s.id === S.activeSec);
  const bar = document.getElementById('sessBar');
  bar.style.background = sec?.color || 'var(--t2)';
  const nextBox = document.getElementById('nextBottom');
  nextBox.classList.remove('show');

  if (S.qi >= S.queue.length || S.hearts <= 0) { renderDone(); return; }

  bar.style.width = Math.round(S.qi / S.queue.length * 100) + '%';
  renderHearts();

  const { card, isReview } = S.queue[S.qi];
  const lvlMap = { beginner: 'базовый', intermediate: 'средний', advanced: 'продвинутый' };
  const q = card.quiz;
  let html = '';

  if (isReview) {
    html += `<div class="rev-band">
      <div class="rev-band-i">↺</div>
      <div class="rev-band-t">
        <strong>Повторение из прошлых уроков</strong>
        Spaced repetition: мозг укрепляет память в момент почти-забывания
      </div>
    </div>`;
  }

  if (card.definition) {
    html += `<div class="mini-th">
      <div class="mini-th-head" onclick="toggleHint()">
        <div class="mini-th-l">подсказка — теория</div>
        <div class="mini-th-tgl" id="hintTgl">показать ▾</div>
      </div>
      <div class="mini-th-body" id="hintBody">
        <div class="mini-th-c">${card.concept}</div>
        <div class="mini-th-d">${card.definition}</div>
      </div>
    </div>`;
  }

  html += `<div class="quiz-wrap">
    <div class="quiz-q">
      <div class="quiz-q-l">
        <span class="lvl lvl-${card.level}">${lvlMap[card.level]}</span>
      </div>
      <div class="quiz-q-t">${q.q}</div>
    </div>
    <div class="quiz-opts">
      ${q.options.map((o, i) => `
        <button class="opt" id="opt_${i}" onclick="pickQuiz(${i})">
          <span class="opt-k">${String.fromCharCode(65 + i)}</span>
          <span>${o}</span>
        </button>`).join('')}
    </div>
    <div class="quiz-fb" id="qfb"></div>
  </div>
  <div class="stats-row">
    <div class="stat"><div class="stat-n g">${S.correct}</div><div class="stat-l">Верно</div></div>
    <div class="stat"><div class="stat-n r">${S.wrong}</div><div class="stat-l">Ошибок</div></div>
    <div class="stat"><div class="stat-n y">${S.queue.length - S.qi}</div><div class="stat-l">Осталось</div></div>
  </div>`;

  document.getElementById('sessContent').innerHTML = html;
  S.answered = false;
}

function toggleHint() {
  const body = document.getElementById('hintBody');
  const lbl = document.getElementById('hintTgl');
  const open = body.classList.toggle('open');
  lbl.textContent = open ? 'скрыть ▴' : 'показать ▾';
}

function pickQuiz(i) {
  if (S.answered) return;
  S.answered = true;
  const { card } = S.queue[S.qi];
  const ok = i === card.quiz.correct;
  document.querySelectorAll('.opt').forEach((b, j) => {
    b.disabled = true;
    if (j === card.quiz.correct) b.classList.add('correct');
    else if (j === i && !ok) b.classList.add('wrong');
  });
  const fb = document.getElementById('qfb');
  fb.className = `quiz-fb show ${ok ? 'ok' : 'err'}`;
  fb.textContent = (ok ? '✓ Верно. ' : '✗ Неверно. ') + card.quiz.explain;
  document.getElementById('nextBottom').classList.add('show');
  recordAnswer(card.id, ok);
  if (ok) { S.correct++; S.xp += 10; }
  else {
    S.wrong++;
    S.hearts = Math.max(0, S.hearts - 1);
    renderHearts();
    if (S.hearts > 0) S.queue.push({ card, isReview: true });
  }
  save();
}

function nextQ() { S.qi++; renderQ(); }

function renderHearts() {
  const el = document.getElementById('sessHearts');
  if (!el) return;
  el.innerHTML = '';
  for (let i = 0; i < 3; i++) {
    const h = document.createElement('span');
    h.className = `heart${i >= S.hearts ? ' lost' : ''}`;
    h.textContent = '♥';
    el.appendChild(h);
  }
}

function renderDone() {
  document.getElementById('sessBar').style.width = '100%';
  document.getElementById('nextBottom').classList.remove('show');
  renderHearts();
  const total = S.correct + S.wrong || 1;
  const acc = Math.round(S.correct / total * 100);
  const outOfH = S.hearts <= 0;
  const earned = S.correct * 10;
  if (!outOfH && acc >= 60) {
    const key = S.activeLi !== null ? `${S.activeSec}_${S.activeLi}` : `${S.activeSec}_final`;
    S.done[key] = true;
    save();
  }
  const nextDates = S.queue.slice(0, S.qi).map(({ card }) => getSRS(card.id).nextDate).filter(Boolean).sort();
  const soonest = nextDates[0];
  const soonDays = soonest ? Math.max(0, Math.round((new Date(soonest) - new Date()) / 86400000)) : null;

  document.getElementById('sessContent').innerHTML = `
    <div class="done-wrap">
      <div class="done-em">${outOfH ? '💔' : acc >= 80 ? '🔥' : acc >= 60 ? '✓' : '📖'}</div>
      <div class="done-t">${outOfH ? 'Жизни кончились' : acc >= 80 ? 'Отлично!' : 'Готово'}</div>
      <div class="done-s">${S.correct} верно · ${S.wrong} ошибок · ${acc}% точность</div>
      <div class="done-sr">
        <div class="done-sr-t">— spaced repetition —</div>
        <div class="done-sr-r"><span>Правильных:</span><span>${S.correct}</span></div>
        <div class="done-sr-r"><span>Требуют повторения:</span><span>${S.wrong}</span></div>
        ${soonDays !== null ? `<div class="done-sr-r">
          <span>Ближайшее повторение:</span>
          <span>${soonDays === 0 ? 'сегодня' : soonDays === 1 ? 'завтра' : 'через ' + soonDays + ' дн.'}</span>
        </div>` : ''}
        <div class="done-sr-n">Карточки вернутся когда мозг почти забудет — в этот момент повторение наиболее эффективно.</div>
      </div>
      <div class="done-xp">+ ${earned} XP</div>
      <div class="done-btns">
        ${!outOfH && acc < 60 ? `<button class="done-btn primary" onclick="retryWrong()">Повторить ошибки</button>` : ''}
        <button class="done-btn${acc >= 60 ? ' primary' : ''}" onclick="closeSession()">← К урокам</button>
      </div>
    </div>`;
}

function retryWrong() {
  const wrongs = S.queue.slice(0, S.qi).filter(({ card }) => getSRS(card.id).streak === 0);
  if (!wrongs.length) { closeSession(); return; }
  S.queue = shuffle(wrongs);
  S.qi = 0; S.correct = 0; S.wrong = 0; S.hearts = 3; S.answered = false;
  renderQ();
}

function closeSession() { goHome(); }

// ═══════════════════════════════════════════════
//  ADHD MODE
// ═══════════════════════════════════════════════
function renderAdhdHome() {
  document.getElementById('xpNumAdhd').textContent = S.xp;
  document.getElementById('adhdBestCombo').textContent = A.bestCombo;
  document.getElementById('adhdTotalRight').textContent = A.totalRight;
  document.getElementById('adhdTotalSeen').textContent = A.totalSeen;

  const tags = document.getElementById('adhdFilterTags');
  tags.innerHTML = '';
  const allBtn = document.createElement('button');
  allBtn.className = `adhd-tag${A.filter.size === 0 ? ' active' : ''}`;
  allBtn.textContent = 'все';
  allBtn.onclick = () => { A.filter.clear(); renderAdhdHome(); };
  tags.appendChild(allBtn);
  S.data.sections.forEach(sec => {
    const btn = document.createElement('button');
    btn.className = `adhd-tag${A.filter.has(sec.id) ? ' active' : ''}`;
    btn.textContent = `${sec.icon} ${sec.title}`;
    btn.onclick = () => {
      if (A.filter.has(sec.id)) A.filter.delete(sec.id);
      else A.filter.add(sec.id);
      renderAdhdHome();
    };
    tags.appendChild(btn);
  });
}

function getAdhdPool() {
  const all = [];
  S.data.sections.forEach(sec => {
    if (A.filter.size === 0 || A.filter.has(sec.id)) {
      sec.cards.forEach(c => all.push({ ...c, secColor: sec.color, secIcon: sec.icon, secTitle: sec.title }));
    }
  });
  return all;
}

function generateAdhdItem(pool) {
  // Pick a random card
  const card = pool[Math.floor(Math.random() * pool.length)];
  // Decide item type based on what's available
  const types = [];
  if (card.quiz) types.push('quiz');
  if (card.minigames?.truefalse) types.push('tf');
  if (card.minigames?.fill) types.push('fill');
  if (card.minigames?.odd) types.push('odd');
  if (card.minigames?.match) types.push('match');
  // Always add fact as backup
  types.push('fact');
  // Weight: prefer minigames if available, but mix in facts (every ~4th)
  const type = Math.random() < 0.22 ? 'fact' : types[Math.floor(Math.random() * (types.length - 1))];
  return { type, card };
}

function fillQueue(pool, n = 5) {
  for (let i = 0; i < n; i++) A.queue.push(generateAdhdItem(pool));
}

function startAdhd() {
  A.queue = [];
  A.qi = 0;
  A.combo = 0;
  A.sessionXP = 0;
  A.trail = [];
  A.answered = false;
  const pool = getAdhdPool();
  if (pool.length === 0) return;
  fillQueue(pool, 8);
  document.getElementById('adhdCombo').textContent = '0';
  document.getElementById('adhdSessionXP').textContent = '0';
  show('adhdTrailScreen');
  renderAdhdItem();
}

function exitAdhd() {
  S.xp += A.sessionXP;
  save();
  renderAdhdHome();
  show('adhdHomeScreen');
}

function renderTrail() {
  const el = document.getElementById('adhdTrail');
  el.innerHTML = '';
  const items = A.trail.slice(-A.trailMax);
  const need = A.trailMax - items.length - 1;

  items.forEach((status, idx) => {
    const n = document.createElement('div');
    n.className = `t-node done-${status === 'err' ? 'err' : 'ok'}`;
    n.textContent = status === 'err' ? '✗' : status === 'fact' ? '★' : '✓';
    el.appendChild(n);
    if (idx < items.length - 1 || true) {
      const c = document.createElement('div');
      c.className = 't-conn done';
      el.appendChild(c);
    }
  });

  // current
  const cur = document.createElement('div');
  cur.className = 't-node cur';
  const t = A.queue[A.qi]?.type;
  cur.textContent = t === 'fact' ? '★' : t === 'tf' ? '?' : t === 'fill' ? '__' : t === 'odd' ? '◇' : t === 'match' ? '⇌' : '?';
  el.appendChild(cur);

  // future
  for (let i = 0; i < need; i++) {
    const c = document.createElement('div');
    c.className = 't-conn';
    el.appendChild(c);
    const n = document.createElement('div');
    n.className = 't-node future';
    n.textContent = '○';
    el.appendChild(n);
  }

  // auto-scroll to current
  setTimeout(() => {
    const curEl = el.querySelector('.t-node.cur');
    if (curEl) curEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, 30);
}

function renderAdhdItem() {
  const pool = getAdhdPool();
  if (A.qi >= A.queue.length - 2) fillQueue(pool, 5);

  renderTrail();
  document.getElementById('adhdBottomBar').classList.remove('show');

  const item = A.queue[A.qi];
  if (!item) return;
  A.current = item;
  A.answered = false;
  A.matchState = null;

  const area = document.getElementById('adhdCardArea');

  switch (item.type) {
    case 'fact': renderFact(item.card, area); break;
    case 'quiz': renderQuiz(item.card, area); break;
    case 'tf':   renderTF(item.card, area); break;
    case 'fill': renderFill(item.card, area); break;
    case 'odd':  renderOdd(item.card, area); break;
    case 'match':renderMatch(item.card, area); break;
    default:     renderFact(item.card, area);
  }
  area.scrollTop = 0;
}

// ── FACT card ────────────────────────────────────
function renderFact(card, area) {
  const src = S.data.sources?.[card.source];
  let html = `<div class="adhd-fact">
    <div class="adhd-fact-tag">${card.secIcon} ${card.secTitle} · быстрый факт</div>
    <div class="adhd-fact-icon-big">${card.secIcon}</div>
    <div class="adhd-fact-title">${card.concept}</div>
    <div class="adhd-fact-body">${card.definition}</div>`;
  if (card.formula) html += `<div class="adhd-fact-formula">${card.formula}</div>`;
  if (card.example) html += `<div class="adhd-fact-body" style="margin-top:10px"><strong>Пример:</strong> ${card.example}</div>`;
  if (card.analogy) html += `<div class="adhd-fact-analogy">💡 ${card.analogy}</div>`;
  if (src) html += `<div class="adhd-fact-src">📄 <a href="${src.url}" target="_blank" rel="noopener">${src.name} ↗</a></div>`;
  html += `</div>`;
  area.innerHTML = html;
  // bottom: only "next"
  document.getElementById('adhdBottomBar').classList.add('show');
  document.querySelector('#adhdBottomBar .adhd-next-btn').textContent = 'Понял →';
  document.querySelector('#adhdBottomBar .adhd-next-btn').onclick = factDone;
}

function factDone() {
  A.trail.push('fact');
  A.totalSeen++;
  A.sessionXP += 2;
  updateAdhdUI();
  save();
  A.qi++;
  renderAdhdItem();
}

// ── QUIZ card ────────────────────────────────────
function renderQuiz(card, area) {
  const lvlMap = { beginner: 'базовый', intermediate: 'средний', advanced: 'продвинутый' };
  const q = card.quiz;
  area.innerHTML = `<div class="adhd-quiz">
    <div class="adhd-quiz-head">
      <div class="adhd-quiz-tag">
        ${card.secIcon} ${card.secTitle}
        <span class="lvl lvl-${card.level}">${lvlMap[card.level]}</span>
      </div>
      <div class="adhd-quiz-q">${q.q}</div>
    </div>
    <div class="adhd-quiz-opts">
      ${q.options.map((o, i) => `
        <button class="opt" id="aopt_${i}" onclick="adhdQuizPick(${i})">
          <span class="opt-k">${String.fromCharCode(65 + i)}</span>
          <span>${o}</span>
        </button>`).join('')}
    </div>
    <div class="adhd-fb" id="afb"></div>
  </div>`;
}

function adhdQuizPick(i) {
  if (A.answered) return;
  A.answered = true;
  const card = A.current.card;
  const ok = i === card.quiz.correct;
  document.querySelectorAll('.adhd-quiz .opt').forEach((b, j) => {
    b.disabled = true;
    if (j === card.quiz.correct) b.classList.add('correct');
    else if (j === i && !ok) b.classList.add('wrong');
  });
  finishAdhd(ok, card.quiz.explain);
}

// ── TRUE/FALSE ───────────────────────────────────
function renderTF(card, area) {
  const tf = card.minigames.truefalse;
  area.innerHTML = `<div class="tf-wrap">
    <div class="tf-head">
      <div class="tf-tag">${card.secIcon} ${card.secTitle} · правда или ложь</div>
      <div class="tf-q">${tf.q}</div>
    </div>
    <div class="tf-btns">
      <button class="tf-btn" id="tf_t" onclick="adhdTfPick(true)">✓ Правда</button>
      <button class="tf-btn" id="tf_f" onclick="adhdTfPick(false)">✗ Ложь</button>
    </div>
    <div class="adhd-fb" id="afb"></div>
  </div>`;
}

function adhdTfPick(picked) {
  if (A.answered) return;
  A.answered = true;
  const tf = A.current.card.minigames.truefalse;
  const ok = picked === tf.answer;
  document.getElementById('tf_t').disabled = true;
  document.getElementById('tf_f').disabled = true;
  const correctBtn = tf.answer ? 'tf_t' : 'tf_f';
  document.getElementById(correctBtn).classList.add('correct');
  if (!ok) document.getElementById(picked ? 'tf_t' : 'tf_f').classList.add('wrong');
  finishAdhd(ok, tf.explain);
}

// ── FILL IN BLANK ───────────────────────────────
function renderFill(card, area) {
  const f = card.minigames.fill;
  // Replace __ with placeholder
  const qHTML = f.q.replace('__', `<span class="fill-blank" id="fb">___</span>`);
  area.innerHTML = `<div class="fill-wrap">
    <div class="fill-head">
      <div class="fill-tag">${card.secIcon} ${card.secTitle} · дополни</div>
      <div class="fill-q">${qHTML}</div>
    </div>
    <div class="fill-opts">
      ${f.options.map((o, i) => `
        <button class="opt" id="fopt_${i}" onclick="adhdFillPick(${i})">
          <span class="opt-k">${String.fromCharCode(65 + i)}</span>
          <span>${o}</span>
        </button>`).join('')}
    </div>
    <div class="adhd-fb" id="afb"></div>
  </div>`;
}

function adhdFillPick(i) {
  if (A.answered) return;
  A.answered = true;
  const f = A.current.card.minigames.fill;
  const ok = i === f.correct;
  const blank = document.getElementById('fb');
  blank.textContent = f.options[i];
  blank.className = ok ? 'fill-blank filled' : 'fill-blank wrong';
  document.querySelectorAll('.fill-wrap .opt').forEach((b, j) => {
    b.disabled = true;
    if (j === f.correct) b.classList.add('correct');
    else if (j === i && !ok) b.classList.add('wrong');
  });
  finishAdhd(ok, f.explain);
}

// ── ODD ONE OUT ─────────────────────────────────
function renderOdd(card, area) {
  const o = card.minigames.odd;
  area.innerHTML = `<div class="odd-wrap">
    <div class="odd-head">
      <div class="odd-tag">${card.secIcon} ${card.secTitle} · что лишнее</div>
      <div class="odd-q">${o.q}</div>
    </div>
    <div class="odd-grid">
      ${o.items.map((it, i) => `
        <button class="odd-item" id="oi_${i}" onclick="adhdOddPick(${i})">${it}</button>`).join('')}
    </div>
    <div class="adhd-fb" id="afb"></div>
  </div>`;
}

function adhdOddPick(i) {
  if (A.answered) return;
  A.answered = true;
  const o = A.current.card.minigames.odd;
  const ok = i === o.odd_idx;
  document.querySelectorAll('.odd-item').forEach((b, j) => {
    b.disabled = true;
    if (j === o.odd_idx) b.classList.add('correct');
    else if (j === i && !ok) b.classList.add('wrong');
  });
  finishAdhd(ok, o.explain);
}

// ── MATCH PAIRS ─────────────────────────────────
function renderMatch(card, area) {
  const m = card.minigames.match;
  const lefts = m.pairs.map(p => p[0]);
  const rights = shuffle(m.pairs.map(p => p[1]));
  A.matchState = {
    pairs: m.pairs,
    selectedLeft: null,
    selectedRight: null,
    matched: [],
    matchedCount: 0,
    rightOrder: rights,
  };
  area.innerHTML = `<div class="match-wrap">
    <div class="match-head">
      <div class="match-tag">${card.secIcon} ${card.secTitle} · сопоставь</div>
      <div class="match-q">${m.q}</div>
    </div>
    <div class="match-area">
      <div class="match-col">
        ${lefts.map((l, i) => `<button class="match-item" data-side="L" data-idx="${i}" onclick="adhdMatchPick('L', ${i})">${l}</button>`).join('')}
      </div>
      <div class="match-col">
        ${rights.map((r, i) => `<button class="match-item" data-side="R" data-idx="${i}" onclick="adhdMatchPick('R', ${i})">${r}</button>`).join('')}
      </div>
    </div>
    <div class="adhd-fb" id="afb"></div>
  </div>`;
}

function adhdMatchPick(side, idx) {
  if (A.answered) return;
  const ms = A.matchState;
  if (!ms) return;
  const btn = document.querySelector(`.match-item[data-side="${side}"][data-idx="${idx}"]`);
  if (!btn || btn.classList.contains('matched')) return;

  // toggle selected
  if (side === 'L') {
    document.querySelectorAll('.match-item[data-side="L"]:not(.matched)').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    ms.selectedLeft = idx;
  } else {
    document.querySelectorAll('.match-item[data-side="R"]:not(.matched)').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    ms.selectedRight = idx;
  }

  if (ms.selectedLeft !== null && ms.selectedRight !== null) {
    // check
    const leftItem = ms.pairs[ms.selectedLeft][0];
    const rightItem = ms.rightOrder[ms.selectedRight];
    const correctPair = ms.pairs.find(p => p[0] === leftItem);
    const isCorrect = correctPair && correctPair[1] === rightItem;

    const lBtn = document.querySelector(`.match-item[data-side="L"][data-idx="${ms.selectedLeft}"]`);
    const rBtn = document.querySelector(`.match-item[data-side="R"][data-idx="${ms.selectedRight}"]`);

    if (isCorrect) {
      lBtn.classList.remove('selected');
      rBtn.classList.remove('selected');
      lBtn.classList.add('matched');
      rBtn.classList.add('matched');
      ms.matchedCount++;
      ms.selectedLeft = null;
      ms.selectedRight = null;
      if (ms.matchedCount === ms.pairs.length) {
        // all done
        A.answered = true;
        finishAdhd(true, 'Все пары верно сопоставлены ✓');
      }
    } else {
      lBtn.classList.add('mismatch');
      rBtn.classList.add('mismatch');
      setTimeout(() => {
        lBtn.classList.remove('selected', 'mismatch');
        rBtn.classList.remove('selected', 'mismatch');
        ms.selectedLeft = null;
        ms.selectedRight = null;
      }, 400);
    }
  }
}

// ── ADHD finish handler ──────────────────────────
function finishAdhd(ok, explainText) {
  const fb = document.getElementById('afb');
  if (fb) {
    fb.className = `adhd-fb show ${ok ? 'ok' : 'err'}`;
    fb.textContent = (ok ? '✓ ' : '✗ ') + (explainText || '');
  }
  A.totalSeen++;
  A.trail.push(ok ? 'ok' : 'err');
  if (ok) {
    A.combo++;
    A.totalRight++;
    A.sessionXP += 5;
    if (A.combo > A.bestCombo) A.bestCombo = A.combo;
    spawnParticles();
  } else {
    A.combo = 0;
    A.sessionXP = Math.max(0, A.sessionXP - 1);
    shakeScreen();
  }
  updateAdhdUI();
  save();
  // show next button
  const bar = document.getElementById('adhdBottomBar');
  bar.classList.add('show');
  document.querySelector('#adhdBottomBar .adhd-next-btn').textContent = 'Следующий →';
  document.querySelector('#adhdBottomBar .adhd-next-btn').onclick = adhdNext;
}

function adhdNext() {
  A.qi++;
  renderAdhdItem();
}

function updateAdhdUI() {
  const cEl = document.getElementById('adhdCombo');
  const pill = document.getElementById('adhdComboPill');
  cEl.textContent = A.combo;
  pill.classList.remove('hot', 'fire');
  if (A.combo >= 8) pill.classList.add('fire');
  else if (A.combo >= 4) pill.classList.add('hot');
  pill.classList.remove('pop');
  void pill.offsetWidth;
  if (A.combo > 0) pill.classList.add('pop');
  document.getElementById('adhdSessionXP').textContent = A.sessionXP;
}

function spawnParticles() {
  const emojis = ['✓', '⚡', '🔥', '★', '✦'];
  for (let i = 0; i < 4; i++) {
    const p = document.createElement('div');
    p.className = 'particle';
    p.textContent = emojis[Math.floor(Math.random() * emojis.length)];
    p.style.left = (35 + Math.random() * 30) + '%';
    p.style.top = (40 + Math.random() * 20) + '%';
    p.style.animationDelay = (i * 0.08) + 's';
    p.style.color = ['#4ade80', '#fbbf24', '#60a5fa'][Math.floor(Math.random() * 3)];
    document.body.appendChild(p);
    setTimeout(() => p.remove(), 1000);
  }
}

function shakeScreen() {
  const card = document.querySelector('.adhd-card-area > *');
  if (card) {
    card.classList.add('shake-it');
    setTimeout(() => card.classList.remove('shake-it'), 400);
  }
}

// ═══════════════════════════════════════════════
//  BOOT
// ═══════════════════════════════════════════════
async function boot() {
  load();
  try {
    const res = await fetch('cards.json');
    if (!res.ok) throw 0;
    S.data = await res.json();
  } catch {
    document.body.innerHTML = `<div style="padding:40px 20px;font-family:'DM Mono',monospace;color:#f87171;font-size:12px;line-height:2">
      Не удалось загрузить cards.json<br>Положи все три файла в одну папку.
    </div>`;
    return;
  }
  renderHome();
}
boot();
