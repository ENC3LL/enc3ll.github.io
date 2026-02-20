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

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const database = firebase.database();
console.log('🔥 Firebase Realtime Database initialized');

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

const state = {
    currentUser: null,
    currentPack: null,
    currentCardIndex: 0,
    cardOrder: [],
    startTime: null,
    sessionTime: 0
};

// ============================================================================
// STORAGE HELPERS (Firebase Realtime Database)
// ============================================================================

async function getStorageKey(key, shared = false) {
    try {
        const path = shared ? `shared/${key}` : `users/${key}`;
        const snapshot = await database.ref(path).once('value');
        return snapshot.val();
    } catch (error) {
        console.error('Get error:', error);
        return null;
    }
}

async function setStorageKey(key, value, shared = false) {
    try {
        const path = shared ? `shared/${key}` : `users/${key}`;
        await database.ref(path).set(value);
        console.log(`✅ Saved: ${path}`);
        return true;
    } catch (error) {
        console.error('Set error:', error);
        return false;
    }
}

async function deleteStorageKey(key, shared = false) {
    try {
        const path = shared ? `shared/${key}` : `users/${key}`;
        await database.ref(path).remove();
        return true;
    } catch (error) {
        console.error('Delete error:', error);
        return false;
    }
}

async function listStorageKeys(prefix, shared = false) {
    try {
        const path = shared ? 'shared' : 'users';
        const snapshot = await database.ref(path).once('value');
        const data = snapshot.val() || {};
        return Object.keys(data).filter(k => k.startsWith(prefix));
    } catch (error) {
        console.error('List error:', error);
        return [];
    }
}

// ============================================================================
// USER MANAGEMENT
// ============================================================================

async function loginUser(username) {
    const trimmedUsername = username.trim();
    if (!trimmedUsername) return false;
    
    try {
        let user = await getStorageKey(`user-${trimmedUsername}`);
        
        if (!user) {
            user = {
                username: trimmedUsername,
                createdAt: Date.now(),
                stats: {
                    totalCards: 0,
                    totalTime: 0,
                    lastActive: Date.now(),
                    streak: 0,
                    dailyActivity: {}
                }
            };
            await setStorageKey(`user-${trimmedUsername}`, user);
        } else {
            user.stats.lastActive = Date.now();
            await setStorageKey(`user-${trimmedUsername}`, user);
        }
        
        state.currentUser = user;
        return true;
    } catch (error) {
        console.error('Login error:', error);
        alert('Error accessing storage. Please check browser settings and disable tracking prevention for this site.');
        return false;
    }
}

async function logoutUser() {
    if (state.currentUser) {
        await saveUserStats();
    }
    localStorage.removeItem('rememberedUsername');
    state.currentUser = null;
    showScreen('loginScreen');
}

async function saveUserStats() {
    if (!state.currentUser) return;
    
    const today = new Date().toISOString().split('T')[0];
    
    if (!state.currentUser.stats.dailyActivity[today]) {
        state.currentUser.stats.dailyActivity[today] = { cards: 0, time: 0 };
    }
    
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    const hasYesterdayActivity = state.currentUser.stats.dailyActivity[yesterday];
    const hasTodayActivity = state.currentUser.stats.dailyActivity[today].cards > 0;
    
    if (hasTodayActivity) {
        if (hasYesterdayActivity || state.currentUser.stats.streak === 0) {
            // continue
        } else {
            state.currentUser.stats.streak = 0;
        }
        state.currentUser.stats.streak = Math.max(state.currentUser.stats.streak, 1);
    }
    
    await setStorageKey(`user-${state.currentUser.username}`, state.currentUser);
}

async function updateUserActivity(cardsViewed, timeSpent) {
    if (!state.currentUser) return;
    
    const today = new Date().toISOString().split('T')[0];
    
    if (!state.currentUser.stats.dailyActivity[today]) {
        state.currentUser.stats.dailyActivity[today] = { cards: 0, time: 0 };
    }
    
    state.currentUser.stats.dailyActivity[today].cards += cardsViewed;
    state.currentUser.stats.dailyActivity[today].time += timeSpent;
    state.currentUser.stats.totalCards += cardsViewed;
    state.currentUser.stats.totalTime += timeSpent;
    
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    const hasYesterdayActivity = state.currentUser.stats.dailyActivity[yesterday];
    
    if (state.currentUser.stats.dailyActivity[today].cards === cardsViewed) {
        if (hasYesterdayActivity) {
            state.currentUser.stats.streak++;
        } else {
            state.currentUser.stats.streak = 1;
        }
    }
    
    await saveUserStats();
    updateStatsDisplay();
}

// ============================================================================
// PACKS MANAGEMENT
// ============================================================================

async function getAllPacks() {
    const packKeys = await listStorageKeys('pack-', true);
    const packs = [];
    
    for (const key of packKeys) {
        const pack = await getStorageKey(key, true);
        if (pack) packs.push(pack);
    }
    
    return packs.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

async function createPack(name, description, cards) {
    const packId = `pack-${Date.now()}`;
    const pack = { id: packId, name, description, cards, createdAt: Date.now() };
    await setStorageKey(packId, pack, true);
    return pack;
}

async function updatePack(packId, name, description, cards) {
    const pack = await getStorageKey(packId, true);
    if (!pack) return false;
    pack.name = name;
    pack.description = description;
    pack.cards = cards;
    pack.updatedAt = Date.now();
    await setStorageKey(packId, pack, true);
    return true;
}

async function deletePack(packId) {
    return await deleteStorageKey(packId, true);
}

async function loadDefaultPacks() {
    const packs = await getAllPacks();
    if (packs.length > 0) return;
    
    try {
        const response = await fetch('cards__1_.json');
        const defaultCards = await response.json();
        await createPack(
            'C++ Complete Guide',
            'Comprehensive C++ learning pack covering Move Semantics, Smart Pointers, Templates, and Threading',
            defaultCards
        );
    } catch (error) {
        console.log('No default cards file found, will create empty state');
    }
}

// ============================================================================
// ROADMAP MANAGEMENT
// ============================================================================

async function getRoadmap() {
    if (!state.currentUser) return null;
    return await getStorageKey(`roadmap-${state.currentUser.username}`);
}

async function saveRoadmap(title, items) {
    if (!state.currentUser) return false;
    const roadmap = {
        title,
        items: items.map((text, index) => ({
            id: `item-${Date.now()}-${index}`,
            text,
            completed: false
        })),
        createdAt: Date.now()
    };
    await setStorageKey(`roadmap-${state.currentUser.username}`, roadmap);
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

function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(screenId)?.classList.add('active');
}

function showView(viewId) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById(viewId)?.classList.add('active');
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.toggle('active', item.dataset.view === viewId.replace('View', ''));
    });
}

function showModal(modalId) {
    document.getElementById(modalId)?.classList.add('active');
}

function hideModal(modalId) {
    document.getElementById(modalId)?.classList.remove('active');
}

// ============================================================================
// CARDS FUNCTIONALITY
// ============================================================================

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

async function selectPack(pack) {
    state.currentPack = pack;
    state.currentCardIndex = 0;
    state.cardOrder = Array.from({length: pack.cards.length}, (_, i) => i);
    shuffleArray(state.cardOrder);
    state.startTime = Date.now();
    
    document.getElementById('packSelection').style.display = 'none';
    
    const container = document.getElementById('cardsContainer');
    container.style.display = 'flex';
    document.getElementById('currentPackName').textContent = pack.name;
    
    // Lock body scroll while cards are open
    document.body.classList.add('cards-open');
    document.body.style.overflow = 'hidden';
    
    buildCardFeed();
    goToCard(0, false);
}

/**
 * Build the vertical feed DOM: one .card-slide per card
 */
function buildCardFeed() {
    const stage = document.getElementById('cardStage');
    let feed = document.getElementById('cardFeed');
    
    // Create feed wrapper if it doesn't exist
    if (!feed) {
        feed = document.createElement('div');
        feed.id = 'cardFeed';
        feed.className = 'card-feed';
        stage.appendChild(feed);
    }
    feed.innerHTML = '';
    
    // Build progress dots
    renderProgressDots();
    
    // Create one slide per card
    state.cardOrder.forEach((cardIdx, slideIdx) => {
        const cardData = state.currentPack.cards[cardIdx];
        
        const slide = document.createElement('div');
        slide.className = 'card-slide';
        slide.dataset.slideIndex = slideIdx;
        
        const cardEl = document.createElement('div');
        cardEl.className = 'card-container';
        
        const inner = document.createElement('div');
        inner.className = 'card';
        
        // Category badge
        if (cardData.category) {
            const cat = document.createElement('div');
            cat.className = 'card-category';
            cat.textContent = cardData.category;
            inner.appendChild(cat);
        }
        
        // Title
        const title = document.createElement('div');
        title.className = 'card-title';
        title.textContent = cardData.title || '';
        inner.appendChild(title);
        
        // Theory
        if (cardData.theory) {
            const theory = document.createElement('div');
            theory.className = 'card-theory';
            theory.textContent = cardData.theory;
            inner.appendChild(theory);
        }
        
        // Code block
        if (cardData.code) {
            const codeWrap = document.createElement('div');
            codeWrap.className = 'card-code';
            const pre = document.createElement('pre');
            const code = document.createElement('code');
            code.className = 'language-cpp';
            code.textContent = cardData.code;
            pre.appendChild(code);
            codeWrap.appendChild(pre);
            inner.appendChild(codeWrap);
            // Highlight async to not block render
            requestAnimationFrame(() => hljs.highlightElement(code));
        }
        
        cardEl.appendChild(inner);
        slide.appendChild(cardEl);
        feed.appendChild(slide);
    });
}

function renderProgressDots() {
    const stage = document.getElementById('cardStage');
    
    // Remove old dots
    const oldDots = stage.querySelector('.card-progress-dots');
    if (oldDots) oldDots.remove();
    
    if (!state.currentPack) return;
    
    const totalCards = state.currentPack.cards.length;
    // Only show dots if ≤ 30 cards (otherwise too many)
    if (totalCards > 30) return;
    
    const dotsContainer = document.createElement('div');
    dotsContainer.className = 'card-progress-dots';
    
    for (let i = 0; i < totalCards; i++) {
        const dot = document.createElement('div');
        dot.className = 'progress-dot';
        dot.dataset.dotIndex = i;
        dotsContainer.appendChild(dot);
    }
    
    stage.appendChild(dotsContainer);
    updateProgressDots(0);
}

function updateProgressDots(activeIndex) {
    const dots = document.querySelectorAll('.progress-dot');
    dots.forEach((dot, i) => {
        dot.classList.remove('active', 'passed');
        if (i < activeIndex) dot.classList.add('passed');
        else if (i === activeIndex) dot.classList.add('active');
    });
}

/**
 * Animate the feed to the target card index
 */
function goToCard(index, animate = true) {
    if (!state.currentPack) return;
    
    const totalCards = state.currentPack.cards.length;
    if (index >= totalCards) {
        showPackComplete();
        return;
    }
    
    state.currentCardIndex = index;
    
    const feed = document.getElementById('cardFeed');
    if (!feed) return;
    
    const slideHeight = document.getElementById('cardStage').clientHeight;
    const targetY = -index * slideHeight;
    
    feed.style.transition = animate ? 'transform 0.42s cubic-bezier(0.32, 0.72, 0, 1)' : 'none';
    feed.style.transform = `translateY(${targetY}px)`;
    
    // Update counter
    const counter = document.getElementById('cardCounter');
    if (counter) counter.textContent = `${index + 1}/${totalCards}`;
    
    updateProgressDots(index);
}

async function nextCard() {
    if (!state.currentPack) return;
    
    const timeSpent = Math.floor((Date.now() - state.startTime) / 1000);
    await updateUserActivity(1, timeSpent);
    state.startTime = Date.now();
    
    const newIndex = state.currentCardIndex + 1;
    
    if (newIndex >= state.currentPack.cards.length) {
        showPackComplete();
        return;
    }
    
    goToCard(newIndex);
}

async function prevCard() {
    if (!state.currentPack) return;
    if (state.currentCardIndex <= 0) return;
    goToCard(state.currentCardIndex - 1);
}

function showPackComplete() {
    showModal('packCompleteModal');
}

function restartPack() {
    hideModal('packCompleteModal');
    state.currentCardIndex = 0;
    shuffleArray(state.cardOrder);
    state.startTime = Date.now();
    buildCardFeed();
    goToCard(0, false);
}

async function backToPacks() {
    document.getElementById('packSelection').style.display = 'block';
    document.getElementById('cardsContainer').style.display = 'none';
    
    // Restore body scroll
    document.body.classList.remove('cards-open');
    document.body.style.overflow = '';
    
    state.currentPack = null;
    await renderPackSelection();
}

// ============================================================================
// VERTICAL SWIPE FUNCTIONALITY
// ============================================================================

let swipeStartX = 0;
let swipeStartY = 0;
let swipeDeltaY = 0;
let isSwipeDragging = false;
let swipeAxisLocked = null; // 'vertical' | 'horizontal' | null
let cardScrolledToTop = true;

function getCardScrollEl() {
    const feed = document.getElementById('cardFeed');
    if (!feed) return null;
    const slides = feed.querySelectorAll('.card-slide');
    const slide = slides[state.currentCardIndex];
    if (!slide) return null;
    return slide.querySelector('.card');
}

function initializeSwipe() {
    const stage = document.getElementById('cardStage');
    const swipeTop = document.querySelector('.swipe-indicator.top');
    const swipeBottom = document.querySelector('.swipe-indicator.bottom');
    
    // ── TOUCH ──────────────────────────────────────────────────────────────
    stage.addEventListener('touchstart', (e) => {
        swipeStartX = e.touches[0].clientX;
        swipeStartY = e.touches[0].clientY;
        swipeDeltaY = 0;
        isSwipeDragging = true;
        swipeAxisLocked = null;
        
        const feed = document.getElementById('cardFeed');
        if (feed) feed.style.transition = 'none';
    }, { passive: true });
    
    stage.addEventListener('touchmove', (e) => {
        if (!isSwipeDragging) return;
        
        const dx = e.touches[0].clientX - swipeStartX;
        const dy = e.touches[0].clientY - swipeStartY;
        
        // Lock axis on first significant move
        if (!swipeAxisLocked) {
            if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 8) {
                swipeAxisLocked = 'vertical';
            } else if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 8) {
                swipeAxisLocked = 'horizontal';
            } else {
                return;
            }
        }
        
        // If horizontal, bail out (don't interfere)
        if (swipeAxisLocked === 'horizontal') return;
        
        // Check if the inner card is scrollable and not at top/bottom
        const cardEl = getCardScrollEl();
        if (cardEl) {
            const atTop = cardEl.scrollTop <= 0;
            const atBottom = cardEl.scrollTop >= cardEl.scrollHeight - cardEl.clientHeight - 2;
            
            // Allow internal scroll when card content is longer than viewport
            if (cardEl.scrollHeight > cardEl.clientHeight) {
                // Only intercept if at the edges
                if (dy < 0 && !atBottom) return; // scrolling down inside card
                if (dy > 0 && !atTop) return;     // scrolling up inside card
            }
        }
        
        e.preventDefault();
        swipeDeltaY = dy;
        
        const stage = document.getElementById('cardStage');
        const slideHeight = stage.clientHeight;
        const baseY = -state.currentCardIndex * slideHeight;
        const resistance = 0.35; // rubber-band effect
        const dragY = swipeDeltaY * resistance;
        
        const feed = document.getElementById('cardFeed');
        if (feed) feed.style.transform = `translateY(${baseY + dragY}px)`;
        
        // Show swipe hints
        const threshold = 40;
        if (swipeDeltaY < -threshold) {
            if (swipeBottom) swipeBottom.style.opacity = Math.min(Math.abs(swipeDeltaY) / 200, 1);
            if (swipeTop) swipeTop.style.opacity = 0;
        } else if (swipeDeltaY > threshold) {
            if (swipeTop) swipeTop.style.opacity = Math.min(Math.abs(swipeDeltaY) / 200, 1);
            if (swipeBottom) swipeBottom.style.opacity = 0;
        } else {
            if (swipeTop) swipeTop.style.opacity = 0;
            if (swipeBottom) swipeBottom.style.opacity = 0;
        }
    }, { passive: false });
    
    stage.addEventListener('touchend', () => {
        if (!isSwipeDragging) return;
        isSwipeDragging = false;
        swipeAxisLocked = null;
        if (swipeTop) swipeTop.style.opacity = 0;
        if (swipeBottom) swipeBottom.style.opacity = 0;
        
        const threshold = 80;
        if (swipeDeltaY < -threshold) {
            nextCard();
        } else if (swipeDeltaY > threshold) {
            prevCard();
        } else {
            // Snap back
            goToCard(state.currentCardIndex, true);
        }
        swipeDeltaY = 0;
    });
    
    // ── MOUSE ──────────────────────────────────────────────────────────────
    stage.addEventListener('mousedown', (e) => {
        // Don't start swipe if clicking inside a scrollable card
        const cardEl = getCardScrollEl();
        if (cardEl && cardEl.scrollHeight > cardEl.clientHeight) {
            // Allow scrolling inside card
        }
        
        swipeStartX = e.clientX;
        swipeStartY = e.clientY;
        swipeDeltaY = 0;
        isSwipeDragging = true;
        swipeAxisLocked = null;
        
        const feed = document.getElementById('cardFeed');
        if (feed) feed.style.transition = 'none';
        e.preventDefault();
    });
    
    document.addEventListener('mousemove', (e) => {
        if (!isSwipeDragging) return;
        
        const dx = e.clientX - swipeStartX;
        const dy = e.clientY - swipeStartY;
        
        if (!swipeAxisLocked) {
            if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 5) {
                swipeAxisLocked = 'vertical';
            } else if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 5) {
                swipeAxisLocked = 'horizontal';
                isSwipeDragging = false;
                return;
            } else {
                return;
            }
        }
        
        if (swipeAxisLocked !== 'vertical') return;
        
        swipeDeltaY = dy;
        
        const stageEl = document.getElementById('cardStage');
        const slideHeight = stageEl.clientHeight;
        const baseY = -state.currentCardIndex * slideHeight;
        const resistance = 0.35;
        const dragY = swipeDeltaY * resistance;
        
        const feed = document.getElementById('cardFeed');
        if (feed) feed.style.transform = `translateY(${baseY + dragY}px)`;
        
        const threshold = 40;
        if (swipeDeltaY < -threshold) {
            if (swipeBottom) swipeBottom.style.opacity = Math.min(Math.abs(swipeDeltaY) / 200, 1);
            if (swipeTop) swipeTop.style.opacity = 0;
        } else if (swipeDeltaY > threshold) {
            if (swipeTop) swipeTop.style.opacity = Math.min(Math.abs(swipeDeltaY) / 200, 1);
            if (swipeBottom) swipeBottom.style.opacity = 0;
        } else {
            if (swipeTop) swipeTop.style.opacity = 0;
            if (swipeBottom) swipeBottom.style.opacity = 0;
        }
    });
    
    document.addEventListener('mouseup', () => {
        if (!isSwipeDragging) return;
        isSwipeDragging = false;
        swipeAxisLocked = null;
        if (swipeTop) swipeTop.style.opacity = 0;
        if (swipeBottom) swipeBottom.style.opacity = 0;
        
        const threshold = 80;
        if (swipeDeltaY < -threshold) {
            nextCard();
        } else if (swipeDeltaY > threshold) {
            prevCard();
        } else {
            goToCard(state.currentCardIndex, true);
        }
        swipeDeltaY = 0;
    });
    
    // ── KEYBOARD ────────────────────────────────────────────────────────────
    document.addEventListener('keydown', (e) => {
        // Only handle when cards are open
        if (!state.currentPack) return;
        if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
            e.preventDefault();
            nextCard();
        } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
            e.preventDefault();
            prevCard();
        }
    });
    
    // ── MOUSE WHEEL ─────────────────────────────────────────────────────────
    // Debounced wheel handler so one scroll = one card
    let wheelTimeout = null;
    let wheelAccum = 0;
    stage.addEventListener('wheel', (e) => {
        if (!state.currentPack) return;
        
        // Check if internal card content is scrollable and not at edge
        const cardEl = getCardScrollEl();
        if (cardEl && cardEl.scrollHeight > cardEl.clientHeight) {
            const atTop = cardEl.scrollTop <= 0;
            const atBottom = cardEl.scrollTop >= cardEl.scrollHeight - cardEl.clientHeight - 2;
            if ((e.deltaY > 0 && !atBottom) || (e.deltaY < 0 && !atTop)) {
                return; // Let card scroll internally
            }
        }
        
        e.preventDefault();
        wheelAccum += e.deltaY;
        
        clearTimeout(wheelTimeout);
        wheelTimeout = setTimeout(() => {
            if (wheelAccum > 30) {
                nextCard();
            } else if (wheelAccum < -30) {
                prevCard();
            }
            wheelAccum = 0;
        }, 50);
    }, { passive: false });
    
    // Re-calculate positions on resize
    window.addEventListener('resize', () => {
        if (state.currentPack) {
            goToCard(state.currentCardIndex, false);
        }
    });
}

// ============================================================================
// RENDER FUNCTIONS
// ============================================================================

async function renderPackSelection() {
    const packsList = document.getElementById('packsList');
    const settingsPacksList = document.getElementById('settingsPacksList');
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
        </div>
    `).join('');
    
    if (packsList) packsList.innerHTML = html || '<p style="text-align: center; color: var(--text-tertiary);">No packs available. Create one from desktop.</p>';
    if (settingsPacksList) settingsPacksList.innerHTML = html || '<p style="text-align: center; color: var(--text-tertiary);">No packs available.</p>';
}

async function renderPacksManager() {
    const container = document.getElementById('packsManagerList');
    const packs = await getAllPacks();
    
    const html = packs.map(pack => `
        <div class="pack-manager-item">
            <div class="pack-manager-info">
                <div class="pack-manager-name">${pack.name}</div>
                <div class="pack-manager-meta">${pack.cards.length} cards • Created ${new Date(pack.createdAt).toLocaleDateString()}</div>
            </div>
            <div class="pack-manager-actions">
                <button class="secondary-button" onclick="editPack('${pack.id}')">Edit</button>
                <button class="secondary-button" onclick="deletePack('${pack.id}')">Delete</button>
            </div>
        </div>
    `).join('');
    
    container.innerHTML = html || '<p style="text-align: center; color: var(--text-tertiary); padding: 40px;">No packs yet. Create your first pack!</p>';
}

async function renderRoadmap() {
    const container = document.getElementById('roadmapContent');
    const roadmap = await getRoadmap();
    
    if (!roadmap) {
        container.innerHTML = `
            <div class="roadmap-empty">
                <p>No roadmap created yet.</p>
                <button class="primary-button desktop-only" onclick="showModal('roadmapEditorModal')" style="margin-top: 20px;">Create Roadmap</button>
            </div>
        `;
        return;
    }
    
    const completedCount = roadmap.items.filter(i => i.completed).length;
    const progress = (completedCount / roadmap.items.length) * 100;
    
    const itemsHtml = roadmap.items.map((item) => `
        <div class="roadmap-item">
            <div class="roadmap-dot ${item.completed ? 'completed' : ''}" onclick="toggleRoadmapItem('${item.id}')"></div>
            <div class="roadmap-item-content ${item.completed ? 'completed' : ''}" onclick="toggleRoadmapItem('${item.id}')">
                <div class="roadmap-item-title">${item.text}</div>
            </div>
        </div>
    `).join('');
    
    const fillHeight = roadmap.items.length > 0 ? (completedCount / roadmap.items.length) * 100 : 0;
    
    container.innerHTML = `
        <div class="roadmap-header">
            <h2 class="roadmap-title">${roadmap.title}</h2>
            <div class="roadmap-progress-bar">
                <div class="roadmap-progress-fill" style="width: ${progress}%"></div>
            </div>
        </div>
        <div class="roadmap-items">
            <div class="roadmap-line">
                <div class="roadmap-line-fill" style="height: ${fillHeight}%"></div>
            </div>
            ${itemsHtml}
        </div>
    `;
}

async function renderStats() {
    if (!state.currentUser) return;
    
    const stats = state.currentUser.stats;
    const today = new Date().toISOString().split('T')[0];
    const todayStats = stats.dailyActivity[today] || { cards: 0, time: 0 };
    
    document.getElementById('totalCardsReviewed').textContent = stats.totalCards;
    
    const hours = Math.floor(stats.totalTime / 3600);
    const minutes = Math.floor((stats.totalTime % 3600) / 60);
    document.getElementById('totalTimeSpent').textContent = `${hours}h ${minutes}m`;
    
    document.getElementById('currentStreak').textContent = `${stats.streak} days`;
    document.getElementById('todayProgress').textContent = `${todayStats.cards} cards`;
    
    const activityGrid = document.getElementById('activityGrid');
    const days = [];
    
    for (let i = 83; i >= 0; i--) {
        const date = new Date(Date.now() - i * 86400000).toISOString().split('T')[0];
        const dayStats = stats.dailyActivity[date];
        const level = dayStats ? Math.min(Math.floor(dayStats.cards / 5) + 1, 4) : 0;
        days.push(`<div class="activity-day ${level > 0 ? `active-${level}` : ''}" title="${date}"></div>`);
    }
    
    activityGrid.innerHTML = days.join('');
}

function updateStatsDisplay() {
    if (!state.currentUser) return;
    
    const today = new Date().toISOString().split('T')[0];
    const todayStats = state.currentUser.stats.dailyActivity[today] || { cards: 0, time: 0 };
    
    const todayCardsEl = document.getElementById('todayCards');
    if (todayCardsEl) todayCardsEl.textContent = todayStats.cards.toString();
    
    const minutes = Math.floor(todayStats.time / 60);
    const todayTimeEl = document.getElementById('todayTime');
    if (todayTimeEl) todayTimeEl.textContent = `${minutes}m`;
}

// ============================================================================
// PACK EDITOR
// ============================================================================

let editingPackId = null;
let editorCards = [];

function openPackEditor(packId = null) {
    editingPackId = packId;
    editorCards = [];
    
    if (packId) {
        getStorageKey(packId, true).then(pack => {
            if (pack) {
                document.getElementById('packNameInput').value = pack.name;
                document.getElementById('packDescInput').value = pack.description || '';
                editorCards = [...pack.cards];
                document.getElementById('packEditorTitle').textContent = 'Edit Pack';
                renderCardsEditor();
            }
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
    const container = document.getElementById('cardsEditor');
    
    const html = editorCards.map((card, index) => `
        <div class="card-editor-item">
            <div class="card-editor-header">
                <span class="card-editor-index">Card ${index + 1}</span>
                <button class="delete-card-button" onclick="deleteEditorCard(${index})">✕</button>
            </div>
            <div class="card-editor-fields">
                <input type="text" placeholder="Category" value="${card.category || ''}" onchange="updateEditorCard(${index}, 'category', this.value)">
                <input type="text" placeholder="Title" value="${card.title || ''}" onchange="updateEditorCard(${index}, 'title', this.value)">
                <textarea placeholder="Theory" rows="3" onchange="updateEditorCard(${index}, 'theory', this.value)">${card.theory || ''}</textarea>
                <textarea placeholder="Code (optional)" rows="4" onchange="updateEditorCard(${index}, 'code', this.value)">${card.code || ''}</textarea>
            </div>
        </div>
    `).join('');
    
    container.innerHTML = html || '<p style="text-align: center; color: var(--text-tertiary); padding: 20px;">No cards yet. Click "Add Card" to start.</p>';
}

function addEditorCard() {
    editorCards.push({ category: '', title: '', theory: '', code: '' });
    renderCardsEditor();
}

function deleteEditorCard(index) {
    editorCards.splice(index, 1);
    renderCardsEditor();
}

function updateEditorCard(index, field, value) {
    editorCards[index][field] = value;
}

async function savePackFromEditor() {
    const name = document.getElementById('packNameInput').value.trim();
    const description = document.getElementById('packDescInput').value.trim();
    
    if (!name) { alert('Please enter a pack name'); return; }
    if (editorCards.length === 0) { alert('Please add at least one card'); return; }
    
    if (editingPackId) {
        await updatePack(editingPackId, name, description, editorCards);
    } else {
        await createPack(name, description, editorCards);
    }
    
    hideModal('packEditorModal');
    await renderPacksManager();
    await renderPackSelection();
}

async function deletePackPrompt(packId) {
    if (confirm('Are you sure you want to delete this pack? This cannot be undone.')) {
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
    const itemsText = document.getElementById('roadmapItemsInput').value.trim();
    
    if (!title) { alert('Please enter a roadmap title'); return; }
    if (!itemsText) { alert('Please enter at least one milestone'); return; }
    
    const items = itemsText
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0)
        .map(line => line.replace(/^\d+\.\s*/, ''));
    
    await saveRoadmap(title, items);
    hideModal('roadmapEditorModal');
    await renderRoadmap();
}

// ============================================================================
// GLOBAL FUNCTIONS (for onclick handlers)
// ============================================================================

window.selectPackById = async function(packId) {
    const pack = await getStorageKey(packId, true);
    if (pack) await selectPack(pack);
};

window.editPack = openPackEditor;
window.deletePack = deletePackPrompt;
window.addEditorCard = addEditorCard;
window.deleteEditorCard = deleteEditorCard;
window.updateEditorCard = updateEditorCard;
window.toggleRoadmapItem = toggleRoadmapItem;

// ============================================================================
// INITIALIZATION
// ============================================================================

document.addEventListener('DOMContentLoaded', async () => {
    console.log('DOM Content Loaded');
    console.log('🔥 Using Firebase Realtime Database for sync');
    
    await loadDefaultPacks();
    
    // Check for remembered user
    const rememberedUser = localStorage.getItem('rememberedUsername');
    if (rememberedUser) {
        document.getElementById('usernameInput').value = rememberedUser;
        const success = await loginUser(rememberedUser);
        if (success) {
            showScreen('mainApp');
            const sidebarUsername = document.getElementById('sidebarUsername');
            const settingsUsername = document.getElementById('settingsUsername');
            if (sidebarUsername) sidebarUsername.textContent = state.currentUser.username;
            if (settingsUsername) settingsUsername.textContent = state.currentUser.username;
            updateStatsDisplay();
            await renderPackSelection();
            await renderStats();
        }
    }
    
    // Login button
    const loginButton = document.getElementById('loginButton');
    if (!loginButton) { console.error('Login button not found!'); return; }
    
    loginButton.addEventListener('click', async () => {
        const username = document.getElementById('usernameInput').value;
        const success = await loginUser(username);
        if (success) {
            localStorage.setItem('rememberedUsername', username);
            showScreen('mainApp');
            const sidebarUsername = document.getElementById('sidebarUsername');
            const settingsUsername = document.getElementById('settingsUsername');
            if (sidebarUsername) sidebarUsername.textContent = state.currentUser.username;
            if (settingsUsername) settingsUsername.textContent = state.currentUser.username;
            updateStatsDisplay();
            await renderPackSelection();
            await renderStats();
        } else {
            alert('Please enter a username');
        }
    });
    
    const usernameInput = document.getElementById('usernameInput');
    if (usernameInput) {
        usernameInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') loginButton.click();
        });
    }
    
    // Logout
    const logoutButton = document.getElementById('logoutButton');
    const mobileLogoutButton = document.getElementById('mobileLogoutButton');
    if (logoutButton) logoutButton.addEventListener('click', logoutUser);
    if (mobileLogoutButton) mobileLogoutButton.addEventListener('click', logoutUser);
    
    // Navigation
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', async () => {
            const view = item.dataset.view;
            showView(view + 'View');
            if (view === 'packs') await renderPacksManager();
            if (view === 'roadmap') await renderRoadmap();
            if (view === 'stats') await renderStats();
        });
    });
    
    // Pack controls
    const backToPacksBtn = document.getElementById('backToPacks');
    const restartPackBtn = document.getElementById('restartPack');
    const selectNewPackBtn = document.getElementById('selectNewPack');
    
    if (backToPacksBtn) backToPacksBtn.addEventListener('click', backToPacks);
    if (restartPackBtn) restartPackBtn.addEventListener('click', restartPack);
    if (selectNewPackBtn) {
        selectNewPackBtn.addEventListener('click', () => {
            hideModal('packCompleteModal');
            backToPacks();
        });
    }
    
    // Pack editor
    const createPackButton = document.getElementById('createPackButton');
    const addCardButton = document.getElementById('addCardButton');
    const savePackButton = document.getElementById('savePackButton');
    const cancelPackEdit = document.getElementById('cancelPackEdit');
    const closePackEditor = document.getElementById('closePackEditor');
    
    if (createPackButton) createPackButton.addEventListener('click', () => openPackEditor());
    if (addCardButton) addCardButton.addEventListener('click', addEditorCard);
    if (savePackButton) savePackButton.addEventListener('click', savePackFromEditor);
    if (cancelPackEdit) cancelPackEdit.addEventListener('click', () => hideModal('packEditorModal'));
    if (closePackEditor) closePackEditor.addEventListener('click', () => hideModal('packEditorModal'));
    
    // Roadmap editor
    const createRoadmapButton = document.getElementById('createRoadmapButton');
    const saveRoadmapButton = document.getElementById('saveRoadmapButton');
    const cancelRoadmapEdit = document.getElementById('cancelRoadmapEdit');
    const closeRoadmapEditor = document.getElementById('closeRoadmapEditor');
    
    if (createRoadmapButton) createRoadmapButton.addEventListener('click', () => showModal('roadmapEditorModal'));
    if (saveRoadmapButton) saveRoadmapButton.addEventListener('click', saveRoadmapFromEditor);
    if (cancelRoadmapEdit) cancelRoadmapEdit.addEventListener('click', () => hideModal('roadmapEditorModal'));
    if (closeRoadmapEditor) closeRoadmapEditor.addEventListener('click', () => hideModal('roadmapEditorModal'));
    
    // Initialize swipe
    initializeSwipe();
    
    // Save stats periodically
    setInterval(async () => {
        if (state.currentUser) await saveUserStats();
    }, 30000);
    
    console.log('All event listeners initialized');
});
