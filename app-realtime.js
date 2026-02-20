// ============================================================================
// FIREBASE REALTIME DATABASE
// ============================================================================

const firebaseConfig = {
  apiKey: "AIzaSyBIGxcMkbDM-GhMCCTQlUfUB5MvTA4FYo4",
  authDomain: "learn-cards-1ff17.firebaseapp.com",
  databaseURL: "https://learn-cards-1ff17-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "learn-cards-1ff17",
  storageBucket: "learn-cards-1ff17.firebasestorage.app",
  messagingSenderId: "778357247094",
  appId: "1:778357247094:web:9430b43f53d729d7c4a357"
};

firebase.initializeApp(firebaseConfig);
const database = firebase.database();
console.log('🔥 Firebase Realtime Database initialized');

// ============================================================================
// STATE
// ============================================================================

const state = {
    currentUser: null,
    currentPack: null,
    currentCardIndex: 0,
    cardOrder: [],
    startTime: null
};

// ============================================================================
// STORAGE HELPERS
// ============================================================================

async function getStorageKey(key, shared = false) {
    try {
        const snap = await database.ref((shared ? 'shared/' : 'users/') + key).once('value');
        return snap.val();
    } catch (e) { return null; }
}

async function setStorageKey(key, value, shared = false) {
    try {
        await database.ref((shared ? 'shared/' : 'users/') + key).set(value);
        return true;
    } catch (e) { return false; }
}

async function deleteStorageKey(key, shared = false) {
    try {
        await database.ref((shared ? 'shared/' : 'users/') + key).remove();
        return true;
    } catch (e) { return false; }
}

async function listStorageKeys(prefix, shared = false) {
    try {
        const snap = await database.ref(shared ? 'shared' : 'users').once('value');
        const data = snap.val() || {};
        return Object.keys(data).filter(k => k.startsWith(prefix));
    } catch (e) { return []; }
}

// ============================================================================
// USER MANAGEMENT
// ============================================================================

async function loginUser(username) {
    const u = username.trim();
    if (!u) return false;
    try {
        let user = await getStorageKey(`user-${u}`);
        if (!user) {
            user = {
                username: u, createdAt: Date.now(),
                stats: { totalCards: 0, totalTime: 0, lastActive: Date.now(), streak: 0, dailyActivity: {} }
            };
        } else {
            user.stats.lastActive = Date.now();
        }
        await setStorageKey(`user-${u}`, user);
        state.currentUser = user;
        return true;
    } catch (e) {
        alert('Error accessing storage.');
        return false;
    }
}

async function logoutUser() {
    if (state.currentUser) await saveUserStats();
    localStorage.removeItem('rememberedUsername');
    state.currentUser = null;
    showScreen('loginScreen');
}

async function saveUserStats() {
    if (!state.currentUser) return;
    await setStorageKey(`user-${state.currentUser.username}`, state.currentUser);
}

async function updateUserActivity(cardsViewed, timeSpent) {
    if (!state.currentUser) return;
    const today = new Date().toISOString().split('T')[0];
    const act = state.currentUser.stats.dailyActivity;
    if (!act[today]) act[today] = { cards: 0, time: 0 };
    act[today].cards += cardsViewed;
    act[today].time  += timeSpent;
    state.currentUser.stats.totalCards += cardsViewed;
    state.currentUser.stats.totalTime  += timeSpent;
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    if (act[today].cards === cardsViewed) {
        state.currentUser.stats.streak = act[yesterday] ? state.currentUser.stats.streak + 1 : 1;
    }
    await saveUserStats();
    updateStatsDisplay();
}

// ============================================================================
// PACKS MANAGEMENT
// ============================================================================

async function getAllPacks() {
    const keys = await listStorageKeys('pack-', true);
    const packs = await Promise.all(keys.map(k => getStorageKey(k, true)));
    return packs.filter(Boolean).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

async function createPack(name, description, cards) {
    const id = `pack-${Date.now()}`;
    const pack = { id, name, description, cards, createdAt: Date.now() };
    await setStorageKey(id, pack, true);
    return pack;
}

async function updatePack(packId, name, description, cards) {
    const pack = await getStorageKey(packId, true);
    if (!pack) return false;
    Object.assign(pack, { name, description, cards, updatedAt: Date.now() });
    await setStorageKey(packId, pack, true);
    return true;
}

async function deletePack(packId) {
    return deleteStorageKey(packId, true);
}

async function loadDefaultPacks() {
    const packs = await getAllPacks();
    if (packs.length > 0) return;
    try {
        const r = await fetch('cards__1_.json');
        const defaultCards = await r.json();
        await createPack('C++ Complete Guide', 'Comprehensive C++ learning pack', defaultCards);
    } catch (e) { console.log('No default cards file'); }
}

// ============================================================================
// ROADMAP
// ============================================================================

async function getRoadmap() {
    if (!state.currentUser) return null;
    return getStorageKey(`roadmap-${state.currentUser.username}`);
}

async function saveRoadmap(title, items) {
    if (!state.currentUser) return false;
    await setStorageKey(`roadmap-${state.currentUser.username}`, {
        title,
        items: items.map((text, i) => ({ id: `item-${Date.now()}-${i}`, text, completed: false })),
        createdAt: Date.now()
    });
    return true;
}

async function toggleRoadmapItem(itemId) {
    const roadmap = await getRoadmap();
    if (!roadmap) return;
    const item = roadmap.items.find(i => i.id === itemId);
    if (item) {
        item.completed = !item.completed;
        await setStorageKey(`roadmap-${state.currentUser.username}`, roadmap);
        renderRoadmap();
    }
}

// ============================================================================
// UI HELPERS
// ============================================================================

function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(id)?.classList.add('active');
}

function showView(id) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById(id)?.classList.add('active');
    document.querySelectorAll('.nav-item').forEach(item =>
        item.classList.toggle('active', item.dataset.view === id.replace('View', '')));
}

function showModal(id) { document.getElementById(id)?.classList.add('active'); }
function hideModal(id) { document.getElementById(id)?.classList.remove('active'); }

// ============================================================================
// VIRTUALIZED CARD FEED
// ============================================================================
// Only 3 slot elements exist in the DOM at any time:
//   slots[0] = prev  (above viewport)
//   slots[1] = curr  (in viewport)
//   slots[2] = next  (below viewport)
//
// On navigation we shift the cyclic array and refill the recycled slot.
// This keeps the DOM tiny regardless of pack size → no lag with 62+ cards.

let slots = [];
let isAnimating = false;

function shuffleArray(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
}

// ── Fill a slot with card data at cardIndex ─────────────────────────────────
function fillSlot(slotEl, cardIndex) {
    const inner = slotEl.querySelector('.card');
    inner.innerHTML = '';
    inner.scrollTop = 0;

    if (cardIndex < 0 || cardIndex >= state.currentPack.cards.length) {
        slotEl.dataset.cardIndex = -1;
        return;
    }

    slotEl.dataset.cardIndex = cardIndex;
    const data = state.currentPack.cards[state.cardOrder[cardIndex]];

    if (data.category) {
        const el = document.createElement('div');
        el.className = 'card-category';
        el.textContent = data.category;
        inner.appendChild(el);
    }

    const titleEl = document.createElement('div');
    titleEl.className = 'card-title';
    titleEl.textContent = data.title || '';
    inner.appendChild(titleEl);

    if (data.theory) {
        const el = document.createElement('div');
        el.className = 'card-theory';
        el.textContent = data.theory;
        inner.appendChild(el);
    }

    if (data.code) {
        const wrap = document.createElement('div');
        wrap.className = 'card-code';
        // touch-action: pan-x lets the browser handle horizontal scroll natively
        // so it won't interfere with our vertical swipe gesture
        wrap.style.touchAction = 'pan-x pinch-zoom';
        const pre  = document.createElement('pre');
        pre.style.touchAction = 'pan-x pinch-zoom';
        const code = document.createElement('code');
        code.className = 'language-cpp';
        code.textContent = data.code;
        pre.appendChild(code);
        wrap.appendChild(pre);
        inner.appendChild(wrap);
        // Defer highlight so it doesn't block the transition frame
        setTimeout(() => hljs.highlightElement(code), 0);
    }
}

// ── Create 3 slot DOM elements ──────────────────────────────────────────────
function buildSlots() {
    const stage = document.getElementById('cardStage');
    stage.querySelectorAll('.card-slot').forEach(s => s.remove());
    slots = [];

    for (let i = 0; i < 3; i++) {
        const slot = document.createElement('div');
        slot.className = 'card-slot';
        const container = document.createElement('div');
        container.className = 'card-container';
        const inner = document.createElement('div');
        inner.className = 'card';
        container.appendChild(inner);
        slot.appendChild(container);
        stage.appendChild(slot);
        slots.push(slot);
    }
}

// ── Set slot positions (no-animate or animate) ──────────────────────────────
function setSlotPositions(animate) {
    const h = document.getElementById('cardStage').clientHeight;
    const offsets = [-h, 0, h];
    slots.forEach((slot, i) => {
        if (animate) {
            slot.style.transition = 'transform 0.44s cubic-bezier(0.32, 0.72, 0, 1)';
        } else {
            slot.style.transition = 'none';
        }
        slot.style.transform = `translateY(${offsets[i]}px)`;
    });
}

// ── Called on pack open ──────────────────────────────────────────────────────
function initCardFeed() {
    buildSlots();
    fillSlot(slots[0], state.currentCardIndex - 1);
    fillSlot(slots[1], state.currentCardIndex);
    fillSlot(slots[2], state.currentCardIndex + 1);
    setSlotPositions(false);
    updateCardCounter();
    updateProgressDots(state.currentCardIndex);
}

// ── Move forward (+1) or backward (-1) ──────────────────────────────────────
function navigateCard(direction) {
    if (isAnimating) return;

    const total = state.currentPack.cards.length;
    const next  = state.currentCardIndex + direction;

    if (next < 0) return;
    if (next >= total) { showPackComplete(); return; }

    isAnimating = true;
    const h = document.getElementById('cardStage').clientHeight;

    // Slide all 3 slots in the swipe direction
    slots.forEach(slot => {
        const cur = parseTranslateY(slot);
        slot.style.transition = 'transform 0.44s cubic-bezier(0.32, 0.72, 0, 1)';
        slot.style.transform  = `translateY(${cur - direction * h}px)`;
    });

    setTimeout(() => {
        state.currentCardIndex = next;

        if (direction === 1) {
            // The slot that slid off the top (prev) → recycle as new next
            const recycled = slots.shift();
            recycled.style.transition = 'none';
            recycled.style.transform  = `translateY(${h}px)`;
            fillSlot(recycled, state.currentCardIndex + 1);
            slots.push(recycled);
        } else {
            // The slot that slid off the bottom (next) → recycle as new prev
            const recycled = slots.pop();
            recycled.style.transition = 'none';
            recycled.style.transform  = `translateY(${-h}px)`;
            fillSlot(recycled, state.currentCardIndex - 1);
            slots.unshift(recycled);
        }

        // Scroll active card to top
        slots[1].querySelector('.card').scrollTop = 0;

        updateCardCounter();
        updateProgressDots(state.currentCardIndex);
        isAnimating = false;
    }, 450);
}

function parseTranslateY(el) {
    const m = new DOMMatrix(getComputedStyle(el).transform);
    return m.m42;
}

// ── Drag all slots interactively (rubber-band feel) ─────────────────────────
function dragSlotsBy(deltaY) {
    const h = document.getElementById('cardStage').clientHeight;
    slots.forEach((slot, i) => {
        const base = (i - 1) * h; // prev=-h, curr=0, next=+h
        slot.style.transition = 'none';
        slot.style.transform  = `translateY(${base + deltaY}px)`;
    });
}

// ── Snap back with spring animation ─────────────────────────────────────────
function snapBack() {
    setSlotPositions(true);
}

// ============================================================================
// PROGRESS & COUNTER
// ============================================================================

function renderProgressDots() {
    const stage = document.getElementById('cardStage');
    stage.querySelectorAll('.card-progress-dots').forEach(e => e.remove());
    if (!state.currentPack) return;
    const total = state.currentPack.cards.length;
    if (total > 40) return;

    const container = document.createElement('div');
    container.className = 'card-progress-dots';
    for (let i = 0; i < total; i++) {
        const dot = document.createElement('div');
        dot.className = 'progress-dot';
        dot.dataset.dotIndex = i;
        container.appendChild(dot);
    }
    stage.appendChild(container);
    updateProgressDots(0);
}

function updateProgressDots(active) {
    document.querySelectorAll('.progress-dot').forEach((dot, i) => {
        dot.classList.toggle('active', i === active);
        dot.classList.toggle('passed', i < active);
    });
}

function updateCardCounter() {
    const el = document.getElementById('cardCounter');
    if (el && state.currentPack)
        el.textContent = `${state.currentCardIndex + 1}/${state.currentPack.cards.length}`;
}

// ============================================================================
// PACK OPEN / CLOSE
// ============================================================================

async function selectPack(pack) {
    state.currentPack    = pack;
    state.currentCardIndex = 0;
    state.cardOrder      = Array.from({ length: pack.cards.length }, (_, i) => i);
    shuffleArray(state.cardOrder);
    state.startTime      = Date.now();

    document.getElementById('packSelection').style.display = 'none';
    document.getElementById('desktopPacksList')?.closest('.desktop-pack-section') &&
        (document.getElementById('desktopPacksList').closest('.desktop-pack-section').style.display = 'none');
    document.getElementById('cardsContainer').style.display = 'flex';
    document.getElementById('currentPackName').textContent  = pack.name;
    document.body.classList.add('cards-open');

    renderProgressDots();
    initCardFeed();
}

async function backToPacks() {
    document.getElementById('packSelection').style.display = '';
    const dp = document.getElementById('desktopPacksList')?.closest('.desktop-pack-section');
    if (dp) dp.style.display = '';
    document.getElementById('cardsContainer').style.display = 'none';
    document.body.classList.remove('cards-open');
    state.currentPack = null;
    slots = [];
    await renderPackSelection();
}

function showPackComplete() { showModal('packCompleteModal'); }

function restartPack() {
    hideModal('packCompleteModal');
    state.currentCardIndex = 0;
    shuffleArray(state.cardOrder);
    state.startTime = Date.now();
    renderProgressDots();
    initCardFeed();
}

async function nextCard() {
    const timeSpent = Math.floor((Date.now() - state.startTime) / 1000);
    await updateUserActivity(1, timeSpent);
    state.startTime = Date.now();
    navigateCard(1);
}

async function prevCard() { navigateCard(-1); }

// ============================================================================
// SWIPE / DRAG HANDLER
// ============================================================================

function initSwipe() {
    const stage  = document.getElementById('cardStage');
    const indTop = stage.querySelector('.swipe-indicator.top');
    const indBot = stage.querySelector('.swipe-indicator.bottom');

    // ── helpers ──────────────────────────────────────────────────────────────
    function setHints(dy) {
        const abs = Math.abs(dy);
        const str = Math.min(abs / 180, 1);
        if (abs < 40) { hide(); return; }
        if (dy < 0) { indBot && (indBot.style.opacity = str); indTop && (indTop.style.opacity = 0); }
        else        { indTop && (indTop.style.opacity = str); indBot && (indBot.style.opacity = 0); }
    }
    function hide() { indTop && (indTop.style.opacity = 0); indBot && (indBot.style.opacity = 0); }

    // Returns true if the touch/click target is inside a code block
    // (so horizontal scroll there should be handled by the browser, not us)
    function isCodeTarget(el) { return !!(el?.closest?.('.card-code')); }

    // Returns true if the CURRENT card's own vertical scroll should consume this delta
    function cardAbsorbs(dy) {
        if (!slots[1]) return false;
        const card = slots[1].querySelector('.card');
        if (!card || card.scrollHeight <= card.clientHeight + 2) return false;
        const atTop    = card.scrollTop <= 1;
        const atBottom = card.scrollTop >= card.scrollHeight - card.clientHeight - 1;
        if (dy < 0 && !atBottom) return true; // swiping up, card not at bottom
        if (dy > 0 && !atTop)    return true; // swiping down, card not at top
        return false;
    }

    const THRESHOLD = 88; // px needed to trigger navigation

    // ── TOUCH ─────────────────────────────────────────────────────────────────
    let tSX = 0, tSY = 0, tDY = 0, tActive = false, tAxis = null;

    stage.addEventListener('touchstart', e => {
        tSX = e.touches[0].clientX;
        tSY = e.touches[0].clientY;
        tDY = 0; tActive = true; tAxis = null;
    }, { passive: true });

    stage.addEventListener('touchmove', e => {
        if (!tActive) return;
        const dx = e.touches[0].clientX - tSX;
        const dy = e.touches[0].clientY - tSY;

        // Determine axis on first notable movement
        if (!tAxis) {
            if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 8) tAxis = 'v';
            else if (Math.abs(dx) > 8) { tAxis = 'h'; }
            else return;
        }

        // Horizontal intent → let browser handle (code block panning etc.)
        if (tAxis === 'h') return;

        // Vertical: if inside a code block, let the browser handle panning
        if (isCodeTarget(e.target)) return;

        // If the card itself can still scroll in this direction, let it
        if (cardAbsorbs(dy)) return;

        // We own this gesture
        e.preventDefault();
        tDY = dy;
        dragSlotsBy(tDY * 0.38);
        setHints(tDY);
    }, { passive: false });

    stage.addEventListener('touchend', () => {
        if (!tActive) return;
        tActive = false; tAxis = null; hide();
        if      (tDY < -THRESHOLD) nextCard();
        else if (tDY >  THRESHOLD) prevCard();
        else snapBack();
        tDY = 0;
    });

    // ── MOUSE ─────────────────────────────────────────────────────────────────
    let mSX = 0, mSY = 0, mDY = 0, mActive = false, mAxis = null;

    stage.addEventListener('mousedown', e => {
        if (isCodeTarget(e.target)) return;
        mSX = e.clientX; mSY = e.clientY;
        mDY = 0; mActive = true; mAxis = null;
        e.preventDefault();
    });

    document.addEventListener('mousemove', e => {
        if (!mActive) return;
        const dx = e.clientX - mSX, dy = e.clientY - mSY;
        if (!mAxis) {
            if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 5) mAxis = 'v';
            else if (Math.abs(dx) > 5) { mAxis = 'h'; mActive = false; return; }
            else return;
        }
        if (mAxis !== 'v') return;
        if (cardAbsorbs(dy)) return;
        mDY = dy;
        dragSlotsBy(mDY * 0.38);
        setHints(mDY);
    });

    document.addEventListener('mouseup', () => {
        if (!mActive) return;
        mActive = false; mAxis = null; hide();
        if      (mDY < -THRESHOLD) nextCard();
        else if (mDY >  THRESHOLD) prevCard();
        else snapBack();
        mDY = 0;
    });

    // ── KEYBOARD ──────────────────────────────────────────────────────────────
    document.addEventListener('keydown', e => {
        if (!state.currentPack) return;
        if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { e.preventDefault(); nextCard(); }
        if (e.key === 'ArrowUp'   || e.key === 'ArrowLeft')  { e.preventDefault(); prevCard(); }
    });

    // ── WHEEL ─────────────────────────────────────────────────────────────────
    let wheelLocked = false;
    stage.addEventListener('wheel', e => {
        if (!state.currentPack || isAnimating || wheelLocked) return;
        if (cardAbsorbs(e.deltaY)) return;
        e.preventDefault();
        wheelLocked = true;
        if      (e.deltaY >  30) nextCard();
        else if (e.deltaY < -30) prevCard();
        setTimeout(() => { wheelLocked = false; }, 520);
    }, { passive: false });

    // ── RESIZE ────────────────────────────────────────────────────────────────
    window.addEventListener('resize', () => {
        if (state.currentPack && slots.length) setSlotPositions(false);
    });
}

// ============================================================================
// RENDER FUNCTIONS
// ============================================================================

async function renderPackSelection() {
    const packs = await getAllPacks();
    const html = packs.map(pack => `
        <div class="pack-card" onclick="selectPackById('${pack.id}')">
            <div class="pack-card-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
                    <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
                    <line x1="12" y1="22.08" x2="12" y2="12"/>
                </svg>
            </div>
            <div class="pack-card-name">${pack.name}</div>
            <div class="pack-card-desc">${pack.description || ''}</div>
            <div class="pack-card-count">${pack.cards.length} cards</div>
        </div>`).join('');
    const fallback = '<p style="text-align:center;color:var(--text-tertiary)">No packs available.</p>';
    ['packsList', 'desktopPacksList', 'settingsPacksList'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = html || fallback;
    });
}

async function renderPacksManager() {
    const container = document.getElementById('packsManagerList');
    if (!container) return;
    const packs = await getAllPacks();
    container.innerHTML = packs.map(pack => `
        <div class="pack-manager-item">
            <div class="pack-manager-info">
                <div class="pack-manager-name">${pack.name}</div>
                <div class="pack-manager-meta">${pack.cards.length} cards · ${new Date(pack.createdAt).toLocaleDateString()}</div>
            </div>
            <div class="pack-manager-actions">
                <button class="secondary-button" onclick="editPack('${pack.id}')">Edit</button>
                <button class="secondary-button" onclick="deletePack('${pack.id}')">Delete</button>
            </div>
        </div>`).join('') || '<p style="text-align:center;color:var(--text-tertiary);padding:40px">No packs yet.</p>';
}

async function renderRoadmap() {
    const container = document.getElementById('roadmapContent');
    if (!container) return;
    const roadmap = await getRoadmap();
    if (!roadmap) {
        container.innerHTML = `<div class="roadmap-empty"><p>No roadmap created yet.</p>
            <button class="primary-button" onclick="showModal('roadmapEditorModal')" style="margin-top:20px">Create Roadmap</button></div>`;
        return;
    }
    const done = roadmap.items.filter(i => i.completed).length;
    const pct  = roadmap.items.length ? (done / roadmap.items.length) * 100 : 0;
    container.innerHTML = `
        <div class="roadmap-header">
            <h2 class="roadmap-title">${roadmap.title}</h2>
            <div class="roadmap-progress-bar"><div class="roadmap-progress-fill" style="width:${pct}%"></div></div>
        </div>
        <div class="roadmap-items">
            <div class="roadmap-line"><div class="roadmap-line-fill" style="height:${pct}%"></div></div>
            ${roadmap.items.map(item => `
                <div class="roadmap-item">
                    <div class="roadmap-dot ${item.completed ? 'completed' : ''}" onclick="toggleRoadmapItem('${item.id}')"></div>
                    <div class="roadmap-item-content ${item.completed ? 'completed' : ''}" onclick="toggleRoadmapItem('${item.id}')">
                        <div class="roadmap-item-title">${item.text}</div>
                    </div>
                </div>`).join('')}
        </div>`;
}

async function renderStats() {
    if (!state.currentUser) return;
    const s    = state.currentUser.stats;
    const today = new Date().toISOString().split('T')[0];
    const td   = s.dailyActivity[today] || { cards: 0, time: 0 };
    document.getElementById('totalCardsReviewed').textContent = s.totalCards;
    document.getElementById('totalTimeSpent').textContent = `${Math.floor(s.totalTime/3600)}h ${Math.floor((s.totalTime%3600)/60)}m`;
    document.getElementById('currentStreak').textContent = `${s.streak} days`;
    document.getElementById('todayProgress').textContent = `${td.cards} cards`;
    const grid = document.getElementById('activityGrid');
    if (grid) {
        grid.innerHTML = Array.from({ length: 84 }, (_, i) => {
            const date = new Date(Date.now() - (83 - i) * 86400000).toISOString().split('T')[0];
            const lvl  = s.dailyActivity[date] ? Math.min(Math.floor(s.dailyActivity[date].cards/5)+1, 4) : 0;
            return `<div class="activity-day ${lvl?`active-${lvl}`:''}" title="${date}"></div>`;
        }).join('');
    }
}

function updateStatsDisplay() {
    if (!state.currentUser) return;
    const today = new Date().toISOString().split('T')[0];
    const td = state.currentUser.stats.dailyActivity[today] || { cards: 0, time: 0 };
    const tc = document.getElementById('todayCards');
    const tt = document.getElementById('todayTime');
    if (tc) tc.textContent = td.cards;
    if (tt) tt.textContent = `${Math.floor(td.time/60)}m`;
}

// ============================================================================
// PACK EDITOR
// ============================================================================

let editingPackId = null, editorCards = [];

function openPackEditor(packId = null) {
    editingPackId = packId;
    editorCards = [];
    if (packId) {
        getStorageKey(packId, true).then(pack => {
            if (!pack) return;
            document.getElementById('packNameInput').value = pack.name;
            document.getElementById('packDescInput').value = pack.description || '';
            editorCards = [...pack.cards];
            document.getElementById('packEditorTitle').textContent = 'Edit Pack';
            renderCardsEditor();
        });
    } else {
        document.getElementById('packNameInput').value = '';
        document.getElementById('packDescInput').value = '';
        document.getElementById('packEditorTitle').textContent = 'Create Pack';
        renderCardsEditor();
    }
    showModal('packEditorModal');
}

function renderCardsEditor() {
    document.getElementById('cardsEditor').innerHTML = editorCards.map((card, i) => `
        <div class="card-editor-item">
            <div class="card-editor-header">
                <span class="card-editor-index">Card ${i + 1}</span>
                <button class="delete-card-button" onclick="deleteEditorCard(${i})">✕</button>
            </div>
            <div class="card-editor-fields">
                <input  type="text" placeholder="Category" value="${card.category||''}" onchange="updateEditorCard(${i},'category',this.value)">
                <input  type="text" placeholder="Title"    value="${card.title   ||''}" onchange="updateEditorCard(${i},'title',this.value)">
                <textarea placeholder="Theory"      rows="3" onchange="updateEditorCard(${i},'theory',this.value)">${card.theory||''}</textarea>
                <textarea placeholder="Code (opt.)" rows="4" onchange="updateEditorCard(${i},'code',this.value)">${card.code  ||''}</textarea>
            </div>
        </div>`).join('') || '<p style="text-align:center;color:var(--text-tertiary);padding:20px">No cards yet.</p>';
}

function addEditorCard()           { editorCards.push({category:'',title:'',theory:'',code:''}); renderCardsEditor(); }
function deleteEditorCard(i)       { editorCards.splice(i,1); renderCardsEditor(); }
function updateEditorCard(i,f,v)   { editorCards[i][f]=v; }

async function savePackFromEditor() {
    const name = document.getElementById('packNameInput').value.trim();
    const desc = document.getElementById('packDescInput').value.trim();
    if (!name)               { alert('Please enter a pack name'); return; }
    if (!editorCards.length) { alert('Please add at least one card'); return; }
    if (editingPackId) await updatePack(editingPackId, name, desc, editorCards);
    else               await createPack(name, desc, editorCards);
    hideModal('packEditorModal');
    await renderPacksManager();
    await renderPackSelection();
}

async function deletePackPrompt(packId) {
    if (confirm('Delete this pack? This cannot be undone.')) {
        await deletePack(packId);
        await renderPacksManager();
        await renderPackSelection();
    }
}

// ============================================================================
// ROADMAP EDITOR
// ============================================================================

async function saveRoadmapFromEditor() {
    const title = document.getElementById('roadmapTitleInput').value.trim();
    const text  = document.getElementById('roadmapItemsInput').value.trim();
    if (!title) { alert('Please enter a title'); return; }
    if (!text)  { alert('Please enter at least one milestone'); return; }
    const items = text.split('\n').map(l=>l.trim()).filter(Boolean).map(l=>l.replace(/^\d+\.\s*/,''));
    await saveRoadmap(title, items);
    hideModal('roadmapEditorModal');
    await renderRoadmap();
}

// ============================================================================
// GLOBAL BINDINGS
// ============================================================================

window.selectPackById   = async id => { const p = await getStorageKey(id,true); if(p) await selectPack(p); };
window.editPack         = openPackEditor;
window.deletePack       = deletePackPrompt;
window.addEditorCard    = addEditorCard;
window.deleteEditorCard = deleteEditorCard;
window.updateEditorCard = updateEditorCard;
window.toggleRoadmapItem= toggleRoadmapItem;
window.showModal        = showModal;

// ============================================================================
// INIT
// ============================================================================

document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 Init');

    await loadDefaultPacks();

    // Auto-login
    const saved = localStorage.getItem('rememberedUsername');
    if (saved) {
        document.getElementById('usernameInput').value = saved;
        if (await loginUser(saved)) {
            showScreen('mainApp');
            if (document.getElementById('sidebarUsername'))
                document.getElementById('sidebarUsername').textContent = state.currentUser.username;
            if (document.getElementById('settingsUsername'))
                document.getElementById('settingsUsername').textContent = state.currentUser.username;
            updateStatsDisplay();
            await renderPackSelection();
            await renderStats();
        }
    }

    // Login
    const loginBtn = document.getElementById('loginButton');
    loginBtn?.addEventListener('click', async () => {
        const u = document.getElementById('usernameInput').value;
        if (await loginUser(u)) {
            localStorage.setItem('rememberedUsername', u);
            showScreen('mainApp');
            if (document.getElementById('sidebarUsername'))
                document.getElementById('sidebarUsername').textContent = state.currentUser.username;
            if (document.getElementById('settingsUsername'))
                document.getElementById('settingsUsername').textContent = state.currentUser.username;
            updateStatsDisplay();
            await renderPackSelection();
            await renderStats();
        } else { alert('Please enter a username'); }
    });
    document.getElementById('usernameInput')?.addEventListener('keypress', e => {
        if (e.key === 'Enter') loginBtn?.click();
    });

    // Logout
    document.getElementById('logoutButton')?.addEventListener('click', logoutUser);
    document.getElementById('mobileLogoutButton')?.addEventListener('click', logoutUser);

    // Navigation
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', async () => {
            const view = item.dataset.view;
            showView(view + 'View');
            if (view === 'packs')   await renderPacksManager();
            if (view === 'roadmap') await renderRoadmap();
            if (view === 'stats')   await renderStats();
        });
    });

    // Pack controls
    document.getElementById('backToPacks')?.addEventListener('click', backToPacks);
    document.getElementById('restartPack')?.addEventListener('click', restartPack);
    document.getElementById('selectNewPack')?.addEventListener('click', () => { hideModal('packCompleteModal'); backToPacks(); });

    // Pack editor
    document.getElementById('createPackButton')?.addEventListener('click', () => openPackEditor());
    document.getElementById('addCardButton')?.addEventListener('click', addEditorCard);
    document.getElementById('savePackButton')?.addEventListener('click', savePackFromEditor);
    document.getElementById('cancelPackEdit')?.addEventListener('click', () => hideModal('packEditorModal'));
    document.getElementById('closePackEditor')?.addEventListener('click', () => hideModal('packEditorModal'));

    // Roadmap editor
    document.getElementById('createRoadmapButton')?.addEventListener('click', () => showModal('roadmapEditorModal'));
    document.getElementById('saveRoadmapButton')?.addEventListener('click', saveRoadmapFromEditor);
    document.getElementById('cancelRoadmapEdit')?.addEventListener('click', () => hideModal('roadmapEditorModal'));
    document.getElementById('closeRoadmapEditor')?.addEventListener('click', () => hideModal('roadmapEditorModal'));

    // Swipe
    initSwipe();

    // Periodic save
    setInterval(() => { if (state.currentUser) saveUserStats(); }, 30000);

    console.log('✅ Ready');
});
