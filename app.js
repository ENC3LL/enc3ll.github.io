/* ══════════════════════════════════════════════
   neural.cards — app.js
   Loads data from cards.json, handles:
   - Home screen with sections
   - Lesson picker (flip / quiz mode)
   - Session (cards + quiz with hearts, XP, progress)
   ══════════════════════════════════════════════ */

// ── State ──────────────────────────────────────
const S = {
  data: null,           // parsed cards.json
  xp: 0,
  progress: {},         // { cardId: 'seen' | 'correct' | 'wrong' }

  // Lesson
  activeSectionId: null,
  sessionMode: 'flip',  // 'flip' | 'quiz'

  // Session
  deck: [],
  idx: 0,
  correct: 0,
  wrong: 0,
  hearts: 3,
  isFlipped: false,
  quizAnswered: false,
};

// ── Boot ───────────────────────────────────────
async function boot() {
  loadLocal();
  try {
    const res = await fetch('cards.json');
    if (!res.ok) throw new Error('fetch failed');
    S.data = await res.json();
  } catch (e) {
    showError('Не удалось загрузить cards.json. Убедись что файл лежит рядом с index.html.');
    return;
  }
  renderHome();
}

// ── Persistence ────────────────────────────────
function saveLocal() {
  localStorage.setItem('nc_xp', S.xp);
  localStorage.setItem('nc_progress', JSON.stringify(S.progress));
}
function loadLocal() {
  S.xp = parseInt(localStorage.getItem('nc_xp') || '0');
  try { S.progress = JSON.parse(localStorage.getItem('nc_progress') || '{}'); } catch { S.progress = {}; }
}

// ── Screens ────────────────────────────────────
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  window.scrollTo(0, 0);
}

// ── HOME ───────────────────────────────────────
function renderHome() {
  document.getElementById('xpNum').textContent = S.xp;
  const list = document.getElementById('sectionList');
  list.innerHTML = '';
  S.data.sections.forEach(sec => {
    const total = sec.cards.length;
    const done = sec.cards.filter(c => S.progress[c.id] === 'correct').length;
    const pct = total ? Math.round((done / total) * 100) : 0;

    const el = document.createElement('div');
    el.className = 'section-card';
    el.innerHTML = `
      <div class="section-glow" style="background:${sec.color}"></div>
      <div class="section-inner">
        <div class="section-icon" style="color:${sec.color}">${sec.icon}</div>
        <div class="section-info">
          <div class="section-title">${sec.title}</div>
          <div class="section-desc">${sec.description}</div>
          <div class="section-meta">
            <span class="section-count">${total} карточек</span>
            <div class="section-progress-bar">
              <div class="section-progress-fill" style="width:${pct}%;background:${sec.color}"></div>
            </div>
            <span class="section-pct">${pct}%</span>
          </div>
        </div>
        <div class="section-arrow">›</div>
      </div>
    `;
    el.addEventListener('click', () => openLesson(sec.id));
    list.appendChild(el);
  });
  showScreen('homeScreen');
}

function goHome() {
  renderHome();
}

// ── LESSON ─────────────────────────────────────
function openLesson(sectionId) {
  S.activeSectionId = sectionId;
  const sec = S.data.sections.find(s => s.id === sectionId);

  document.getElementById('lessonTitle').textContent = sec.title;
  document.getElementById('lessonSub').textContent = sec.description;

  // color the start button
  const btn = document.getElementById('startBtn');
  btn.style.color = sec.color;
  btn.style.borderColor = sec.color + '60';

  renderLessonCards(sec);
  setSessionMode(S.sessionMode, false);
  showScreen('lessonScreen');
}

function renderLessonCards(sec) {
  const grid = document.getElementById('lessonCardsList');
  grid.innerHTML = '';
  sec.cards.forEach((card, i) => {
    const status = S.progress[card.id];
    const text = S.sessionMode === 'quiz' ? card.quiz.q : card.flip.q;
    const lvlMap = { beginner: 'базовый', intermediate: 'средний', advanced: 'продвинутый' };

    const el = document.createElement('div');
    el.className = 'lesson-card-item';
    el.innerHTML = `
      <div class="lci-num${status ? ' done' : ''}">${i + 1}</div>
      <div class="lci-info">
        <div class="lci-q">${text}</div>
        <div class="lci-lvl lvl-${card.level}">${lvlMap[card.level] || card.level}</div>
      </div>
      <div class="lci-status">${status === 'correct' ? '✓' : status === 'wrong' ? '✗' : '·'}</div>
    `;
    grid.appendChild(el);
  });
}

function setSessionMode(mode, rerender = true) {
  S.sessionMode = mode;
  document.getElementById('modeFlipBtn').classList.toggle('active', mode === 'flip');
  document.getElementById('modeQuizBtn').classList.toggle('active', mode === 'quiz');
  if (rerender && S.activeSectionId) {
    const sec = S.data.sections.find(s => s.id === S.activeSectionId);
    renderLessonCards(sec);
  }
}

// ── SESSION ────────────────────────────────────
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function startSession() {
  const sec = S.data.sections.find(s => s.id === S.activeSectionId);
  S.deck = shuffle(sec.cards);
  S.idx = 0;
  S.correct = 0;
  S.wrong = 0;
  S.hearts = 3;
  S.isFlipped = false;
  S.quizAnswered = false;
  renderHearts();
  renderSessionCard();
  showScreen('sessionScreen');
}

function closeSession() {
  saveLocal();
  openLesson(S.activeSectionId);
}

function renderHearts() {
  const el = document.getElementById('sessionHearts');
  el.innerHTML = '';
  for (let i = 0; i < 3; i++) {
    const h = document.createElement('span');
    h.className = 'heart' + (i >= S.hearts ? ' lost' : '');
    h.textContent = '♥';
    el.appendChild(h);
  }
}

function updateBar() {
  const pct = S.deck.length ? Math.round((S.idx / S.deck.length) * 100) : 0;
  document.getElementById('sessionBar').style.width = pct + '%';
  const sec = S.data.sections.find(s => s.id === S.activeSectionId);
  document.getElementById('sessionBar').style.background = sec ? sec.color : 'var(--t2)';
}

function renderSessionCard() {
  updateBar();
  const content = document.getElementById('sessionContent');

  if (S.idx >= S.deck.length || S.hearts <= 0) {
    renderDone(content);
    return;
  }

  const card = S.deck[S.idx];
  S.isFlipped = false;
  S.quizAnswered = false;

  const statsHTML = renderStats();

  if (S.sessionMode === 'flip') {
    content.innerHTML = `
      ${renderLevelPill(card.level)}
      <div class="flip-scene card-in" onclick="flipCard()">
        <div class="flip-card" id="flipCard">
          <div class="flip-face">
            <div class="flip-q">${card.flip.q}</div>
            <div class="flip-tap">нажми чтобы увидеть ответ</div>
          </div>
          <div class="flip-face flip-back">
            <div class="flip-a">${card.flip.a}</div>
          </div>
        </div>
      </div>
      <div id="flipActionsWrap">
        <div id="flipShowBtn">
          <div class="flip-actions">
            <button class="fa-btn" onclick="flipCard()" style="flex:1;letter-spacing:0.06em;font-size:11px">Показать ответ</button>
          </div>
        </div>
        <div id="flipVoteWrap" style="display:none">
          <div class="flip-actions">
            <button class="fa-btn bad" id="btnBad" onclick="flipVote(false)">✕ Не знал</button>
            <button class="fa-btn" onclick="nextCard()" style="flex:0.6;border-style:dashed;font-size:10px;letter-spacing:0.04em">пропустить</button>
            <button class="fa-btn good" id="btnGood" onclick="flipVote(true)">✓ Знал</button>
          </div>
        </div>
      </div>
      ${statsHTML}
    `;
  } else {
    const q = card.quiz;
    const opts = q.options.map((o, i) => `
      <button class="opt" id="opt${i}" onclick="pickOpt(${i})">
        <span class="opt-key">${String.fromCharCode(65+i)}</span>
        <span>${o}</span>
      </button>
    `).join('');

    content.innerHTML = `
      ${renderLevelPill(card.level)}
      <div class="quiz-wrap card-in">
        <div class="quiz-question">
          <div class="quiz-q-text">${q.q}</div>
        </div>
        <div class="quiz-opts">${opts}</div>
        <div class="quiz-feedback" id="quizFeedback"></div>
        <button class="quiz-next" id="quizNext" onclick="nextCard()">Следующий →</button>
      </div>
      ${statsHTML}
    `;
  }
}

function renderLevelPill(level) {
  const map = { beginner: 'базовый', intermediate: 'средний', advanced: 'продвинутый' };
  return `<span class="lvl-pill lvl-${level}">${map[level] || level}</span>`;
}

function renderStats() {
  return `
    <div class="session-stats">
      <div class="ss"><div class="ss-n g">${S.correct}</div><div class="ss-l">Верно</div></div>
      <div class="ss"><div class="ss-n r">${S.wrong}</div><div class="ss-l">Ошибок</div></div>
      <div class="ss"><div class="ss-n">${S.deck.length - S.idx}</div><div class="ss-l">Осталось</div></div>
    </div>
  `;
}

// Flip logic
function flipCard() {
  S.isFlipped = !S.isFlipped;
  const fc = document.getElementById('flipCard');
  if (fc) fc.classList.toggle('flipped', S.isFlipped);
  if (S.isFlipped) {
    const show = document.getElementById('flipShowBtn');
    const vote = document.getElementById('flipVoteWrap');
    if (show) show.style.display = 'none';
    if (vote) vote.style.display = 'block';
  }
}

function flipVote(knew) {
  const card = S.deck[S.idx];
  if (knew) {
    S.correct++;
    S.xp += 10;
    S.progress[card.id] = 'correct';
    const btn = document.getElementById('btnGood');
    if (btn) { btn.classList.add('highlight'); setTimeout(() => btn.classList.remove('highlight'), 200); }
  } else {
    S.wrong++;
    S.hearts = Math.max(0, S.hearts - 1);
    S.progress[card.id] = 'wrong';
    const btn = document.getElementById('btnBad');
    if (btn) { btn.classList.add('highlight'); setTimeout(() => btn.classList.remove('highlight'), 200); }
    renderHearts();
  }
  saveLocal();
  setTimeout(nextCard, 180);
}

// Quiz logic
function pickOpt(i) {
  if (S.quizAnswered) return;
  S.quizAnswered = true;
  const card = S.deck[S.idx];
  const q = card.quiz;
  const correct = i === q.correct;

  document.querySelectorAll('.opt').forEach((b, j) => {
    b.disabled = true;
    if (j === q.correct) b.classList.add('correct');
    else if (j === i && !correct) b.classList.add('wrong');
  });

  const fb = document.getElementById('quizFeedback');
  const next = document.getElementById('quizNext');
  if (fb) {
    fb.className = 'quiz-feedback show ' + (correct ? 'ok' : 'err');
    fb.textContent = (correct ? '✓ Верно. ' : '✗ Неверно. ') + q.explain;
  }
  if (next) next.classList.add('show');

  if (correct) {
    S.correct++;
    S.xp += 10;
    S.progress[card.id] = 'correct';
  } else {
    S.wrong++;
    S.hearts = Math.max(0, S.hearts - 1);
    S.progress[card.id] = 'wrong';
    renderHearts();
  }
  saveLocal();
}

function nextCard() {
  S.idx++;
  renderSessionCard();
}

// Done screen
function renderDone(content) {
  updateBar();
  const outOfHearts = S.hearts <= 0 && S.idx < S.deck.length;
  const total = S.deck.length;
  const acc = total ? Math.round((S.correct / (S.correct + S.wrong || 1)) * 100) : 0;
  const earned = S.correct * 10;
  const sec = S.data.sections.find(s => s.id === S.activeSectionId);

  content.innerHTML = `
    <div class="done-wrap">
      <div class="done-emoji">${outOfHearts ? '💔' : acc >= 80 ? '🔥' : acc >= 50 ? '👍' : '📖'}</div>
      <div class="done-title">${outOfHearts ? 'Жизни кончились' : 'Готово'}</div>
      <div class="done-sub">
        ${S.idx} карточек · ${S.correct} верно · ${S.wrong} ошибок<br>
        Точность: ${acc}%
      </div>
      <div class="done-xp">+ ${earned} XP</div>
      <div class="done-btns">
        <button class="done-btn primary" onclick="restartSession()">Повторить ещё раз</button>
        <button class="done-btn" onclick="closeSession()">← К разделу</button>
      </div>
    </div>
    <div class="session-stats">
      <div class="ss"><div class="ss-n g">${S.correct}</div><div class="ss-l">Верно</div></div>
      <div class="ss"><div class="ss-n r">${S.wrong}</div><div class="ss-l">Ошибок</div></div>
      <div class="ss"><div class="ss-n" style="color:var(--yellow)">${acc}%</div><div class="ss-l">Точность</div></div>
    </div>
  `;
}

function restartSession() {
  startSession();
}

// ── Error ──────────────────────────────────────
function showError(msg) {
  document.body.innerHTML = `
    <div style="padding:40px 24px;color:#f87171;font-family:'DM Mono',monospace;font-size:13px;line-height:1.7">
      <div style="font-size:22px;margin-bottom:12px;color:#e0e0e0;font-family:'Instrument Serif',serif;font-style:italic">Ошибка загрузки</div>
      ${msg}
      <div style="margin-top:16px;color:#444;font-size:11px">
        Структура файлов должна быть:<br>
        index.html<br>app.js<br>cards.json
      </div>
    </div>
  `;
}

// ── Start ──────────────────────────────────────
boot();
