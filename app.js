/* ═══════════════════════════════════════════════
   neural.cards — app.js  (Active Recall + SRS)

   FLOW:
   ┌─ Глава (Chapter) ──────────────────────────┐
   │  Урок 1: [Теория слайды] → [Квиз]          │
   │  Урок 2: [Теория] → [Квиз + review из ур1] │
   │  Урок 3: [Теория] → [Квиз + review]        │
   │  ★ Финал главы: все карточки вперемешку     │
   └────────────────────────────────────────────┘

   SRS INTERVALS (по streak):
     1 → завтра (1 день)
     2 → через 3 дня
     3 → через 7 дней
     4+ → через 21 день
     ошибка → повторить сегодня (возврат в конец очереди)

   ACTIVE RECALL:
   - Теория с подсказкой «закрой и воспроизведи»
   - Ошибочные карточки возвращаются в конец сессии
   - Подсказка-теория скрыта в квизе (можно раскрыть)
═══════════════════════════════════════════════ */

const LESSON_SIZE  = 3;   // карточек в уроке
const MAX_REVIEW   = 3;   // макс SRS-карточек за сессию
const SR_INTERVALS = [1, 3, 7, 21];

const S = {
  data: null,
  xp: 0,
  srs: {},          // { cardId: { streak, nextDate, lastSeen } }
  done: {},         // { "secId_lessonIdx" | "secId_final": true }
  streak: 0,
  lastDate: null,
  // theory nav
  thCards: [],
  thIdx: 0,
  activeSec: null,
  activeLi: null,   // null = chapter final
  // session
  queue: [],        // [{card, isReview}]
  qi: 0,
  correct: 0,
  wrong: 0,
  hearts: 3,
  answered: false,
};

// ── storage ──────────────────────────────────────
function save() {
  localStorage.setItem('nc_xp',   S.xp);
  localStorage.setItem('nc_srs',  JSON.stringify(S.srs));
  localStorage.setItem('nc_done', JSON.stringify(S.done));
  localStorage.setItem('nc_str',  S.streak);
  localStorage.setItem('nc_dt',   S.lastDate || '');
}
function load() {
  S.xp     = +(localStorage.getItem('nc_xp')  || 0);
  S.streak = +(localStorage.getItem('nc_str') || 0);
  S.lastDate = localStorage.getItem('nc_dt') || null;
  try { S.srs  = JSON.parse(localStorage.getItem('nc_srs')  || '{}'); } catch { S.srs  = {}; }
  try { S.done = JSON.parse(localStorage.getItem('nc_done') || '{}'); } catch { S.done = {}; }
}

// ── helpers ──────────────────────────────────────
const toDay = () => new Date().toISOString().slice(0,10);
function daysLater(n) {
  const d = new Date(); d.setDate(d.getDate()+n);
  return d.toISOString().slice(0,10);
}
function getSRS(id) { return S.srs[id] || {streak:0, nextDate:null, lastSeen:null}; }
function isNew(id)  { return !S.srs[id]?.lastSeen; }
function isDue(id)  { const s=getSRS(id); return s.nextDate && s.nextDate <= toDay(); }

function recordAnswer(id, ok) {
  const s = getSRS(id);
  if (ok) {
    s.streak   = Math.min(s.streak+1, SR_INTERVALS.length);
    s.nextDate = daysLater(SR_INTERVALS[s.streak-1] ?? 21);
  } else {
    s.streak   = 0;
    s.nextDate = toDay();
  }
  s.lastSeen = toDay();
  S.srs[id]  = s;
}

function markToday() {
  const t = toDay();
  if (S.lastDate === t) return;
  const diff = S.lastDate
    ? Math.round((new Date(t)-new Date(S.lastDate))/86400000)
    : 999;
  S.streak   = diff === 1 ? S.streak+1 : 1;
  S.lastDate = t;
  save();
}

function shuffle(arr) {
  const a = [...arr];
  for (let i=a.length-1; i>0; i--) {
    const j = 0|Math.random()*(i+1);
    [a[i],a[j]] = [a[j],a[i]];
  }
  return a;
}

function lessonCards(secId, li) {
  const sec = S.data.sections.find(s=>s.id===secId);
  return sec.cards.slice(li*LESSON_SIZE, (li+1)*LESSON_SIZE);
}

// ── screens ──────────────────────────────────────
function show(id) {
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}
function goHome() { renderHome(); show('homeScreen'); }

// ═══════════════════════════════════════════════
//  HOME
// ═══════════════════════════════════════════════
function renderHome() {
  document.getElementById('xpNum').textContent = S.xp;
  renderStreak();
  const list = document.getElementById('chapterList');
  list.innerHTML = '';

  S.data.sections.forEach(sec => {
    const total = sec.cards.length;
    const seen  = sec.cards.filter(c=>!isNew(c.id)&&getSRS(c.id).streak>=1).length;
    const pct   = total ? Math.round(seen/total*100) : 0;
    const chunks= [];
    for(let i=0;i<sec.cards.length;i+=LESSON_SIZE)
      chunks.push(sec.cards.slice(i,i+LESSON_SIZE));

    const el = document.createElement('div');
    el.className = 'chapter';
    el.innerHTML = `
      <div class="chapter-head" onclick="toggleCh(this)">
        <div class="ch-stripe" style="background:${sec.color}"></div>
        <div class="ch-icon" style="color:${sec.color}">${sec.icon}</div>
        <div class="ch-info">
          <div class="ch-title">${sec.title}</div>
          <div class="ch-desc">${sec.description}</div>
          <div class="ch-prog-row">
            <div class="ch-prog-bar">
              <div class="ch-prog-fill" style="width:${pct}%;background:${sec.color}"></div>
            </div>
            <div class="ch-pct">${pct}%</div>
          </div>
        </div>
        <div class="ch-chevron">›</div>
      </div>
      <div class="lessons-wrap">
        <div class="lessons-inner" id="li_${sec.id}"></div>
      </div>`;
    list.appendChild(el);

    const inner = document.getElementById(`li_${sec.id}`);
    let prevOk  = true;

    chunks.forEach((cards, li) => {
      const key    = `${sec.id}_${li}`;
      const isDone = !!S.done[key];
      const locked = !prevOk;
      const hasDue = isDone && cards.some(c=>isDue(c.id));
      if (!isDone) prevOk = false;

      const concepts = cards.map(c=>c.theory?.[0]?.concept||'').filter(Boolean).join(' · ');
      const row = document.createElement('div');
      row.className = `lesson-row${isDone?' done':''}${locked?' locked':''}`;
      row.innerHTML = `
        <div class="lr-icon${isDone?' done-ic':''}">${isDone?'✓':li+1}</div>
        <div class="lr-info">
          <div class="lr-title">Урок ${li+1}</div>
          <div class="lr-sub">${(concepts||cards.length+' карточки').slice(0,46)}</div>
        </div>
        <div class="lr-right">
          ${hasDue?'<div class="due-dot"></div>':''}
          <span style="font-size:13px">${isDone?(hasDue?'↺':''):locked?'🔒':'→'}</span>
        </div>`;
      if (!locked) row.addEventListener('click', ()=>openLesson(sec.id, li));
      inner.appendChild(row);
    });

    // chapter final
    const allDone = chunks.every((_,li)=>!!S.done[`${sec.id}_${li}`]);
    const finDone = !!S.done[`${sec.id}_final`];
    const finRow  = document.createElement('div');
    finRow.className = `lesson-row review-row chapter-final${!allDone?' locked':''}`;
    finRow.innerHTML = `
      <div class="lr-icon rev-ic">★</div>
      <div class="lr-info">
        <div class="lr-title">Финал главы</div>
        <div class="lr-sub">Все ${sec.cards.length} тем вперемешку</div>
      </div>
      <div class="lr-right">
        <span style="font-size:13px">${finDone?'✓':allDone?'→':'🔒'}</span>
      </div>`;
    if (allDone) finRow.addEventListener('click', ()=>openFinal(sec.id));
    inner.appendChild(finRow);
  });
}

function renderStreak() {
  const lbl  = document.getElementById('streakLabel');
  const sub  = document.getElementById('streakSub');
  const days = document.getElementById('streakDays');
  const w    = S.streak===1?'день':S.streak<5?'дня':'дней';
  lbl.textContent = S.streak ? `${S.streak} ${w} подряд 🔥` : 'Начни сегодня';
  sub.textContent = S.streak
    ? 'Мозг запоминает лучше когда повторяешь в нужный момент'
    : 'Заходи каждый день — интервальные повторения работают';
  days.innerHTML = '';
  for(let i=6;i>=0;i--) {
    const d = new Date(); d.setDate(d.getDate()-i);
    const ok = S.lastDate && S.streak >= (7-i);
    const dv = document.createElement('div');
    dv.className = `sb-day${ok?' done':''}`;
    dv.textContent = ['В','П','В','С','Ч','П','С'][d.getDay()];
    days.appendChild(dv);
  }
}

function toggleCh(head) { head.closest('.chapter').classList.toggle('open'); }

// ═══════════════════════════════════════════════
//  THEORY SCREEN
// ═══════════════════════════════════════════════
function openLesson(secId, li) {
  S.activeSec = secId;
  S.activeLi  = li;
  const sec   = S.data.sections.find(s=>s.id===secId);
  S.thCards   = lessonCards(secId, li);
  S.thIdx     = 0;

  document.getElementById('thChLbl').textContent = sec.title;
  document.getElementById('thLname').textContent = `Урок ${li+1}`;

  buildTheory(S.thCards);
  show('theoryScreen');
}

function buildTheory(cards) {
  const scroll = document.getElementById('thScroll');
  const dots   = document.getElementById('thDots');
  const lvlMap = {beginner:'базовый',intermediate:'средний',advanced:'продвинутый'};

  dots.innerHTML = cards.map((_,i)=>
    `<div class="th-dot${i===0?' cur':''}" id="td_${i}"></div>`
  ).join('');
  scroll.innerHTML = '';

  cards.forEach((card, idx) => {
    const div = document.createElement('div');
    div.className = `th-slide${idx===0?' active':''}`;
    div.id = `ts_${idx}`;
    const t = card.theory?.[0];

    let h = `<span class="lvl lvl-${card.level}">${lvlMap[card.level]||card.level}</span>`;
    if (t) {
      h += `<div class="th-tag">${t.tag||'концепт'}</div>
            <div class="th-concept">${t.concept}</div>
            <div class="th-def">${t.definition}</div>`;
      if (t.formula) h += `<div class="th-formula"><div class="th-formula-text">${t.formula}</div></div>`;
      if (t.example) h += `<div class="th-example"><div class="th-ex-lbl">— пример —</div><div class="th-ex-text">${t.example}</div></div>`;
      if (t.analogy) h += `<div class="th-analogy"><div class="th-analogy-ico">💡</div><div class="th-analogy-text">${t.analogy}</div></div>`;
    } else {
      h += `<div class="th-concept">${card.flip.q}</div><div class="th-def">${card.flip.a}</div>`;
    }

    h += `<div class="th-recall">
            <div class="th-recall-lbl">— активное воспроизведение —</div>
            <div class="th-recall-text">Закрой глаза и объясни концепт своими словами прежде чем двигаться дальше. <strong>Это важнее чем просто прочитать.</strong></div>
          </div>
          <div class="th-nav">
            ${idx>0?`<button class="th-btn" onclick="thGo(${idx-1})">← назад</button>`:''}
            ${idx<cards.length-1
              ?`<button class="th-btn primary" onclick="thGo(${idx+1})">Понял →</button>`
              :`<button class="th-btn go" onclick="startQuiz()">К заданиям →</button>`
            }
          </div>`;

    div.innerHTML = h;
    scroll.appendChild(div);
  });
}

function thGo(idx) {
  document.querySelectorAll('.th-slide').forEach((s,i)=>s.classList.toggle('active',i===idx));
  document.querySelectorAll('.th-dot').forEach((d,i)=>{
    d.className = `th-dot${i===idx?' cur':i<idx?' past':''}`;
  });
  S.thIdx = idx;
  document.getElementById('thScroll').scrollTop = 0;
}

// ═══════════════════════════════════════════════
//  SESSION
// ═══════════════════════════════════════════════
function buildReview() {
  const curIds = S.activeLi !== null
    ? lessonCards(S.activeSec, S.activeLi).map(c=>c.id) : [];
  const due = [];
  S.data.sections.forEach(sec =>
    sec.cards.forEach(c => {
      if (isDue(c.id) && !curIds.includes(c.id))
        due.push({card:c, isReview:true});
    })
  );
  return shuffle(due).slice(0, MAX_REVIEW);
}

function interleave(main, rev) {
  const out = []; let ri = 0;
  main.forEach((item, i) => {
    out.push(item);
    if ((i+1)%2===0 && ri<rev.length) out.push(rev[ri++]);
  });
  while(ri<rev.length) out.push(rev[ri++]);
  return out;
}

function startQuiz() {
  const cards = lessonCards(S.activeSec, S.activeLi);
  const main  = shuffle(cards).map(c=>({card:c, isReview:false}));
  const rev   = buildReview();
  initSession(interleave(main, rev));
}

function openFinal(secId) {
  S.activeSec = secId;
  S.activeLi  = null;
  const sec   = S.data.sections.find(s=>s.id===secId);
  initSession(shuffle(sec.cards).map(c=>({card:c, isReview:false})));
}

function initSession(queue) {
  S.queue    = queue;
  S.qi       = 0;
  S.correct  = 0;
  S.wrong    = 0;
  S.hearts   = 3;
  S.answered = false;
  markToday();
  renderQ();
  show('sessionScreen');
}

function renderQ() {
  const sec = S.data.sections.find(s=>s.id===S.activeSec);
  const bar = document.getElementById('sessBar');
  bar.style.background = sec?.color || 'var(--t2)';

  if (S.qi >= S.queue.length || S.hearts <= 0) { renderDone(); return; }

  bar.style.width = Math.round(S.qi/S.queue.length*100)+'%';
  renderHearts();

  const {card, isReview} = S.queue[S.qi];
  const t      = card.theory?.[0];
  const q      = card.quiz;
  const lvlMap = {beginner:'базовый',intermediate:'средний',advanced:'продвинутый'};
  let html = '';

  // SRS review banner
  if (isReview) {
    html += `<div class="rev-band card-in">
      <div class="rev-band-ico">↺</div>
      <div class="rev-band-text">
        <strong>Повторение из прошлых уроков</strong>
        Spaced repetition: мозг укрепляет память именно в момент когда почти забыл
      </div>
    </div>`;
  }

  // collapsible theory hint
  if (t) {
    html += `<div class="mini-th card-in" id="mth">
      <div class="mini-th-head" onclick="toggleHint()">
        <div class="mini-th-lbl">подсказка — теория</div>
        <div class="mini-th-toggle" id="hintToggle">показать ▾</div>
      </div>
      <div class="mini-th-body" id="hintBody">
        <div class="mini-th-concept">${t.concept}</div>
        <div class="mini-th-def">${t.definition}</div>
      </div>
    </div>`;
  }

  // quiz
  html += `<div class="quiz-wrap card-in">
    <div class="quiz-q-area">
      <div class="quiz-q-lbl">
        <span class="lvl lvl-${card.level}">${lvlMap[card.level]}</span>
      </div>
      <div class="quiz-q-text">${q.q}</div>
    </div>
    <div class="quiz-opts">
      ${q.options.map((o,i)=>`
        <button class="opt" id="opt_${i}" onclick="pick(${i})">
          <span class="opt-key">${String.fromCharCode(65+i)}</span>
          <span>${o}</span>
        </button>`).join('')}
    </div>
    <div class="quiz-fb" id="qfb"></div>
    <button class="quiz-nxt" id="qnxt" onclick="nextQ()">Следующий →</button>
  </div>
  <div class="stats-row">
    <div class="stat-box"><div class="stat-n g">${S.correct}</div><div class="stat-l">Верно</div></div>
    <div class="stat-box"><div class="stat-n r">${S.wrong}</div><div class="stat-l">Ошибок</div></div>
    <div class="stat-box"><div class="stat-n y">${S.queue.length-S.qi}</div><div class="stat-l">Осталось</div></div>
  </div>`;

  document.getElementById('sessContent').innerHTML = html;
  S.answered = false;
}

function toggleHint() {
  const body = document.getElementById('hintBody');
  const lbl  = document.getElementById('hintToggle');
  const open = body.classList.toggle('open');
  lbl.textContent = open ? 'скрыть ▴' : 'показать ▾';
}

function pick(i) {
  if (S.answered) return;
  S.answered = true;
  const {card} = S.queue[S.qi];
  const ok = i === card.quiz.correct;

  document.querySelectorAll('.opt').forEach((b,j)=>{
    b.disabled = true;
    if (j===card.quiz.correct) b.classList.add('correct');
    else if (j===i && !ok)     b.classList.add('wrong');
  });

  const fb  = document.getElementById('qfb');
  const nxt = document.getElementById('qnxt');
  fb.className = `quiz-fb show ${ok?'ok':'err'}`;
  fb.textContent = (ok ? '✓ Верно. ' : '✗ Неверно. ') + card.quiz.explain;
  nxt.classList.add('show');

  recordAnswer(card.id, ok);

  if (ok) {
    S.correct++;
    S.xp += 10;
  } else {
    S.wrong++;
    S.hearts = Math.max(0, S.hearts-1);
    renderHearts();
    // push to end for retry
    if (S.hearts > 0) S.queue.push({card, isReview:true});
  }
  save();
}

function nextQ() { S.qi++; renderQ(); }

function renderHearts() {
  const el = document.getElementById('sessHearts');
  if (!el) return;
  el.innerHTML = '';
  for (let i=0;i<3;i++) {
    const h = document.createElement('span');
    h.className = `heart${i>=S.hearts?' lost':''}`;
    h.textContent = '♥';
    el.appendChild(h);
  }
}

// ── session done ──────────────────────────────────
function renderDone() {
  document.getElementById('sessBar').style.width = '100%';
  renderHearts();

  const total  = S.correct + S.wrong || 1;
  const acc    = Math.round(S.correct/total*100);
  const outOfH = S.hearts <= 0;
  const earned = S.correct * 10;

  // mark lesson/final done
  if (!outOfH && acc >= 60) {
    const key = S.activeLi !== null
      ? `${S.activeSec}_${S.activeLi}`
      : `${S.activeSec}_final`;
    S.done[key] = true;
    save();
  }

  // next SRS date
  const allDates = S.queue.slice(0,S.qi)
    .map(({card})=>getSRS(card.id).nextDate).filter(Boolean).sort();
  const soonest = allDates[0];
  const soonDays = soonest
    ? Math.max(0, Math.round((new Date(soonest)-new Date())/86400000))
    : null;

  document.getElementById('sessContent').innerHTML = `
    <div class="done-wrap">
      <div class="done-emoji">${outOfH?'💔':acc>=80?'🔥':acc>=60?'✓':'📖'}</div>
      <div class="done-title">${outOfH?'Жизни кончились':acc>=80?'Отлично!':'Готово'}</div>
      <div class="done-sub">${S.correct} верно · ${S.wrong} ошибок · ${acc}% точность</div>

      <div class="done-sr">
        <div class="done-sr-title">— spaced repetition —</div>
        <div class="done-sr-row"><span>Правильных (в памяти):</span><span>${S.correct}</span></div>
        <div class="done-sr-row"><span>Требуют повторения:</span><span>${S.wrong}</span></div>
        ${soonDays!==null?`<div class="done-sr-row">
          <span>Ближайшее повторение:</span>
          <span>${soonDays===0?'сегодня':soonDays===1?'завтра':'через '+soonDays+' дн.'}</span>
        </div>`:''}
        <div class="done-sr-note">
          Карточки вернутся когда мозг почти забудет —<br>именно в этот момент повторение наиболее эффективно.
        </div>
      </div>

      <div class="done-xp">+ ${earned} XP</div>
      <div class="done-btns">
        ${!outOfH&&acc<60?`<button class="done-btn primary" onclick="retryWrong()">Повторить ошибки</button>`:''}
        <button class="done-btn${acc>=60?' primary':''}" onclick="closeSession()">← К урокам</button>
      </div>
    </div>`;
}

function retryWrong() {
  const wrongs = S.queue.slice(0,S.qi)
    .filter(({card})=>getSRS(card.id).streak===0);
  if (!wrongs.length) { closeSession(); return; }
  S.queue    = shuffle(wrongs);
  S.qi=0; S.correct=0; S.wrong=0; S.hearts=3; S.answered=false;
  renderQ();
}

function closeSession() { goHome(); }

// ── boot ──────────────────────────────────────────
async function boot() {
  load();
  try {
    const res = await fetch('cards.json');
    if (!res.ok) throw 0;
    S.data = await res.json();
  } catch {
    document.body.innerHTML = `<div style="padding:40px 20px;font-family:'DM Mono',monospace;
      color:#f87171;font-size:12px;line-height:2">
      Не удалось загрузить cards.json<br>
      Положи все три файла (index.html, app.js, cards.json) в одну папку.
    </div>`;
    return;
  }
  renderHome();
}
boot();

/* ═══════════════════════════════════════════════
   ADHD MODE — быстрый режим "время убить"
   Механика Duolingo: нулевой фрикцион,
   немедленная награда, визуальная дорожка,
   комбо-счётчик, частицы при правильном ответе
═══════════════════════════════════════════════ */

const ADHD = {
  allItems:    [],   // все сгенерированные элементы (факты + вопросы)
  queue:       [],   // текущая очередь
  qi:          0,
  combo:       0,
  bestCombo:   0,
  sessionXP:   0,
  totalRight:  0,
  totalSeen:   0,
  answered:    false,
  activeTopics: new Set(), // пустое = все
  trailHistory: [],  // 'ok'|'err'|'fact' последние N
  TRAIL_VISIBLE: 12, // сколько точек показываем
  QUEUE_CHUNK:  10,  // сколько элементов генерируем за раз
};

// ── Переключение режимов ──────────────────────────
function switchToStudy() {
  show('homeScreen');
}
function switchToAdhd() {
  loadAdhdStats();
  renderAdhdTopics();
  document.getElementById('adhdHome').style.display = 'flex';
  document.getElementById('adhdTrail').style.display = 'none';
  show('adhdScreen');
}
function exitAdhd() {
  // save session XP
  S.xp += ADHD.sessionXP;
  save();
  loadAdhdStats();
  document.getElementById('adhdHome').style.display = 'flex';
  document.getElementById('adhdTrail').style.display = 'none';
}

// Inject ADHD button into home header after render
function injectAdhdBtn() {
  const hdr = document.querySelector('#homeScreen .home-header');
  if (hdr && !hdr.querySelector('.adhd-switch-btn')) {
    const btn = document.createElement('button');
    btn.className = 'adhd-switch-btn';
    btn.textContent = '⚡ СДВГ';
    btn.style.cssText = 'padding:5px 11px;border:1px solid #2a2a2a;border-radius:3px;font-family:\'DM Mono\',monospace;font-size:11px;letter-spacing:.06em;color:#888;cursor:pointer;background:none;margin-right:8px';
    btn.addEventListener('click', switchToAdhd);
    hdr.insertBefore(btn, hdr.querySelector('.xp-pill'));
  }
}

function loadAdhdStats() {
  const bs = +(localStorage.getItem('adhd_best') || 0);
  const tr = +(localStorage.getItem('adhd_right') || 0);
  const ts = +(localStorage.getItem('adhd_seen')  || 0);
  ADHD.bestCombo  = bs;
  ADHD.totalRight = tr;
  ADHD.totalSeen  = ts;
  document.getElementById('adhdBestStreak').textContent = bs;
  document.getElementById('adhdTotalRight').textContent = tr;
  document.getElementById('adhdTotalSeen').textContent  = ts;
  document.getElementById('adhdXP').textContent = S.xp;
}

function saveAdhdStats() {
  localStorage.setItem('adhd_best',  ADHD.bestCombo);
  localStorage.setItem('adhd_right', ADHD.totalRight);
  localStorage.setItem('adhd_seen',  ADHD.totalSeen);
}

// ── Topic filter ──────────────────────────────────
function renderAdhdTopics() {
  const el = document.getElementById('adhdTopicFilter');
  if (!el || !S.data) return;
  el.innerHTML = '';
  S.data.sections.forEach(sec => {
    const pill = document.createElement('button');
    pill.className = `topic-pill${ADHD.activeTopics.size===0||ADHD.activeTopics.has(sec.id)?' active':''}`;
    pill.textContent = `${sec.icon} ${sec.title}`;
    pill.addEventListener('click', () => {
      if (ADHD.activeTopics.has(sec.id)) {
        ADHD.activeTopics.delete(sec.id);
      } else {
        ADHD.activeTopics.add(sec.id);
      }
      // if none selected = all
      renderAdhdTopics();
    });
    el.appendChild(pill);
  });
}

function getFilteredCards() {
  if (!S.data) return [];
  const all = [];
  S.data.sections.forEach(sec => {
    if (ADHD.activeTopics.size === 0 || ADHD.activeTopics.has(sec.id)) {
      sec.cards.forEach(c => all.push({card: c, secId: sec.id, secColor: sec.color, secIcon: sec.icon, secTitle: sec.title}));
    }
  });
  return all;
}

// ── Item generation ───────────────────────────────
// Each item is either {type:'fact', ...} or {type:'quiz', ...}
function generateChunk() {
  const pool = shuffle(getFilteredCards());
  const chunk = [];
  pool.slice(0, ADHD.QUEUE_CHUNK).forEach((entry, i) => {
    const {card, secId, secColor, secIcon, secTitle} = entry;
    // alternate: fact every 3rd, quiz otherwise
    if (i % 3 === 0) {
      chunk.push({type:'fact', card, secColor, secIcon, secTitle});
    } else {
      chunk.push({type:'quiz', card, secColor, secTitle});
    }
  });
  return shuffle(chunk);
}

// ── Start ─────────────────────────────────────────
function startAdhd() {
  ADHD.qi         = 0;
  ADHD.combo      = 0;
  ADHD.sessionXP  = 0;
  ADHD.answered   = false;
  ADHD.trailHistory = [];
  ADHD.queue      = generateChunk();

  document.getElementById('adhdHome').style.display  = 'none';
  document.getElementById('adhdTrail').style.display = 'flex';
  document.getElementById('adhdCombo').textContent   = 0;
  document.getElementById('adhdSessionXP').textContent = 0;

  renderTrail();
  renderAdhdCard();
}

// ── Trail dots ────────────────────────────────────
function renderTrail() {
  const el = document.getElementById('trailDots');
  el.innerHTML = '';
  const hist   = ADHD.trailHistory;
  const ahead  = Math.min(ADHD.TRAIL_VISIBLE - hist.length, 8);
  const icons  = generateAheadIcons(ahead);

  // past dots
  hist.forEach(status => {
    const d = document.createElement('div');
    d.className = `trail-dot ${status==='ok'?'done-ok':status==='err'?'done-err':'done-ok'}`;
    d.textContent = status==='ok'?'✓':status==='err'?'✗':'★';
    el.appendChild(d);
  });
  // current
  const cur = document.createElement('div');
  cur.className = 'trail-dot current';
  cur.textContent = ADHD.queue[ADHD.qi]?.type==='fact'?'★':'?';
  el.appendChild(cur);
  // upcoming
  icons.forEach(ic => {
    const d = document.createElement('div');
    d.className = 'trail-dot upcoming';
    d.textContent = ic;
    el.appendChild(d);
  });
  // auto scroll to end
  el.scrollLeft = el.scrollWidth;
}

function generateAheadIcons(n) {
  const pool = ['?','?','★','?','?','★','?','?','?','★'];
  return pool.slice(0, n);
}

// ── Render current card ───────────────────────────
function renderAdhdCard() {
  // top up queue if running low
  if (ADHD.qi >= ADHD.queue.length - 3) {
    ADHD.queue = ADHD.queue.concat(generateChunk());
  }

  const item = ADHD.queue[ADHD.qi];
  const area = document.getElementById('adhdCardArea');
  ADHD.answered = false;

  if (item.type === 'fact') {
    renderFactCard(item, area);
  } else {
    renderQuizCard(item, area);
  }
  renderTrail();
}

function renderFactCard(item, area) {
  const t = item.card.theory?.[0];
  const lvlMap = {beginner:'базовый',intermediate:'средний',advanced:'продвинутый'};
  let bodyHTML = '';
  if (t) {
    bodyHTML = `
      <div class="adhd-fact-tag">${item.secIcon} ${item.secTitle} · ${lvlMap[item.card.level]||item.card.level}</div>
      <div class="adhd-fact-title">${t.concept}</div>
      <div class="adhd-fact-body">${t.definition}</div>
      ${t.formula ? `<div class="adhd-fact-formula">${t.formula}</div>` : ''}
      ${t.analogy ? `<div style="margin-top:10px;font-size:11px;color:#444;font-style:italic;line-height:1.6;padding-top:10px;border-top:1px solid #1e1e1e">💡 ${t.analogy}</div>` : ''}
    `;
  } else {
    bodyHTML = `
      <div class="adhd-fact-tag">${item.secIcon} ${item.secTitle}</div>
      <div class="adhd-fact-title">${item.card.flip.q}</div>
      <div class="adhd-fact-body">${item.card.flip.a}</div>
    `;
  }

  area.innerHTML = `
    <div class="adhd-fact-card">
      <div style="font-size:9px;letter-spacing:.12em;text-transform:uppercase;color:#444;margin-bottom:10px">— быстрый факт —</div>
      ${bodyHTML}
      <button class="adhd-ok-btn" onclick="adhdNextFact()">Понял →</button>
    </div>
  `;
  area.scrollTop = 0;
}

function adhdNextFact() {
  ADHD.trailHistory.push('fact');
  if (ADHD.trailHistory.length > ADHD.TRAIL_VISIBLE) ADHD.trailHistory.shift();
  ADHD.totalSeen++;
  ADHD.sessionXP += 2;
  document.getElementById('adhdSessionXP').textContent = ADHD.sessionXP;
  saveAdhdStats();
  ADHD.qi++;
  renderAdhdCard();
}

function renderQuizCard(item, area) {
  const q = item.card.quiz;
  const lvlMap = {beginner:'базовый',intermediate:'средний',advanced:'продвинутый'};
  const opts = q.options.map((o,i)=>`
    <button class="adhd-opt" id="ao_${i}" onclick="adhdPick(${i})">
      <span class="adhd-opt-key">${String.fromCharCode(65+i)}</span>
      <span>${o}</span>
    </button>`).join('');

  area.innerHTML = `
    <div class="adhd-quiz-card">
      <div class="adhd-quiz-q">
        <div class="adhd-quiz-type">
          <span style="font-size:9px;letter-spacing:.12em;text-transform:uppercase;color:#444">${item.secIcon} ${item.secTitle}</span>
          <span style="display:inline-block;margin-left:8px;font-size:9px;letter-spacing:.08em;text-transform:uppercase;padding:2px 6px;border-radius:2px;border:1px solid;
            ${item.card.level==='beginner'?'color:#4ade80;border-color:#4ade8030':
              item.card.level==='intermediate'?'color:#60a5fa;border-color:#60a5fa30':
              'color:#c084fc;border-color:#c084fc30'}">${lvlMap[item.card.level]||item.card.level}</span>
        </div>
        <div class="adhd-quiz-qtext">${q.q}</div>
      </div>
      <div class="adhd-quiz-opts">${opts}</div>
      <div class="adhd-fb" id="adhd_fb"></div>
      <button class="adhd-nxt" id="adhd_nxt" onclick="adhdNext()">Следующий →</button>
    </div>
  `;
  area.scrollTop = 0;
}

function adhdPick(i) {
  if (ADHD.answered) return;
  ADHD.answered = true;
  const item = ADHD.queue[ADHD.qi];
  const ok   = i === item.card.quiz.correct;

  document.querySelectorAll('.adhd-opt').forEach((b,j)=>{
    b.disabled = true;
    if (j===item.card.quiz.correct) b.classList.add('correct');
    else if (j===i&&!ok) b.classList.add('wrong');
  });

  const fb  = document.getElementById('adhd_fb');
  const nxt = document.getElementById('adhd_nxt');
  fb.className = `adhd-fb show ${ok?'ok':'err'}`;
  fb.textContent = (ok?'✓ Верно. ':'✗ Неверно. ') + item.card.quiz.explain;
  nxt.classList.add('show');

  ADHD.totalSeen++;

  if (ok) {
    ADHD.combo++;
    ADHD.totalRight++;
    ADHD.sessionXP += 5;
    if (ADHD.combo > ADHD.bestCombo) ADHD.bestCombo = ADHD.combo;
    ADHD.trailHistory.push('ok');
    spawnParticles();
  } else {
    ADHD.combo = 0;
    ADHD.sessionXP = Math.max(0, ADHD.sessionXP - 1);
    ADHD.trailHistory.push('err');
  }
  if (ADHD.trailHistory.length > ADHD.TRAIL_VISIBLE) ADHD.trailHistory.shift();

  // update combo display
  const comboEl = document.getElementById('adhdCombo');
  comboEl.textContent = ADHD.combo;
  comboEl.classList.remove('combo-flash');
  void comboEl.offsetWidth; // reflow
  if (ok) comboEl.classList.add('combo-flash');
  if (ADHD.combo >= 5) comboEl.style.color = '#f87171';
  else if (ADHD.combo >= 3) comboEl.style.color = '#fb923c';
  else comboEl.style.color = '#fbbf24';

  document.getElementById('adhdSessionXP').textContent = ADHD.sessionXP;
  saveAdhdStats();
}

function adhdNext() {
  ADHD.qi++;
  renderAdhdCard();
}

// ── Particles ─────────────────────────────────────
function spawnParticles() {
  const emojis = ['✓','⚡','🔥','★','✦'];
  for (let i=0; i<3; i++) {
    const p = document.createElement('div');
    p.className = 'particle';
    p.textContent = emojis[Math.floor(Math.random()*emojis.length)];
    p.style.left = (30+Math.random()*40)+'%';
    p.style.top  = (40+Math.random()*20)+'%';
    p.style.animationDelay = (i*0.1)+'s';
    document.body.appendChild(p);
    setTimeout(()=>p.remove(), 900);
  }
}

// ── Hook: inject ADHD btn after each renderHome ──────
const _origRH = renderHome;
renderHome = function() { _origRH(); injectAdhdBtn(); };
