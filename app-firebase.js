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
        // Get or create user
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
            // Update last active
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
    
    // Forget remembered user
    localStorage.removeItem('rememberedUsername');
    
    state.currentUser = null;
    showScreen('loginScreen');
}

async function saveUserStats() {
    if (!state.currentUser) return;
    
    const today = new Date().toISOString().split('T')[0];
    
    // Update daily activity
    if (!state.currentUser.stats.dailyActivity[today]) {
        state.currentUser.stats.dailyActivity[today] = {
            cards: 0,
            time: 0
        };
    }
    
    // Calculate streak
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    const hasYesterdayActivity = state.currentUser.stats.dailyActivity[yesterday];
    const hasTodayActivity = state.currentUser.stats.dailyActivity[today].cards > 0;
    
    if (hasTodayActivity) {
        if (hasYesterdayActivity || state.currentUser.stats.streak === 0) {
            // Continue or start streak
        } else {
            // Reset streak if missed a day
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
    
    // Check and update streak
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    const hasYesterdayActivity = state.currentUser.stats.dailyActivity[yesterday];
    
    if (state.currentUser.stats.dailyActivity[today].cards === cardsViewed) {
        // First card of the day
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
    
    // Sort by creation date
    return packs.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

async function createPack(name, description, cards) {
    const packId = `pack-${Date.now()}`;
    const pack = {
        id: packId,
        name,
        description,
        cards,
        createdAt: Date.now()
    };
    
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
    // Check if default packs exist
    const packs = await getAllPacks();
    if (packs.length > 0) return;
    
    // Load from uploaded file
    try {
        const response = await fetch('cards__1_.json');
        const defaultCards = await response.json();
        
        // Create default pack
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
    console.log('showScreen called with:', screenId);
    const screens = document.querySelectorAll('.screen');
    console.log('Found screens:', screens.length);
    
    screens.forEach(s => {
        s.classList.remove('active');
        console.log('Removed active from:', s.id);
    });
    
    const targetScreen = document.getElementById(screenId);
    if (targetScreen) {
        targetScreen.classList.add('active');
        console.log('Added active to:', screenId);
    } else {
        console.error('Screen not found:', screenId);
    }
}

function showView(viewId) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById(viewId)?.classList.add('active');
    
    // Update nav
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
    document.getElementById('cardsContainer').style.display = 'flex';
    document.getElementById('currentPackName').textContent = pack.name;
    
    showCard();
}

function showCard() {
    if (!state.currentPack || state.currentCardIndex >= state.cardOrder.length) {
        showPackComplete();
        return;
    }
    
    const cardData = state.currentPack.cards[state.cardOrder[state.currentCardIndex]];
    
    document.getElementById('category').textContent = cardData.category || '';
    document.getElementById('title').textContent = cardData.title || '';
    document.getElementById('theory').textContent = cardData.theory || '';
    
    const codeBlock = document.getElementById('codeBlock');
    const codeEl = document.getElementById('code');
    
    if (cardData.code) {
        codeEl.textContent = cardData.code;
        codeBlock.style.display = 'block';
        hljs.highlightElement(codeEl);
    } else {
        codeBlock.style.display = 'none';
    }
    
    updateCardCounter();
}

function updateCardCounter() {
    const counter = document.getElementById('cardCounter');
    if (counter && state.currentPack) {
        counter.textContent = `${state.currentCardIndex + 1}/${state.currentPack.cards.length}`;
    }
}

async function nextCard() {
    if (!state.currentPack) return;
    
    // Track card view
    const timeSpent = Math.floor((Date.now() - state.startTime) / 1000);
    await updateUserActivity(1, timeSpent);
    state.startTime = Date.now();
    
    state.currentCardIndex++;
    
    if (state.currentCardIndex >= state.cardOrder.length) {
        showPackComplete();
        return;
    }
    
    resetCardPosition();
    showCard();
}

function resetCardPosition() {
    const container = document.getElementById('cardContainer');
    container.style.transition = 'none';
    container.style.transform = 'translate(0, 0) rotate(0deg)';
    document.getElementById('card').scrollTop = 0;
    
    setTimeout(() => {
        container.style.transition = '';
    }, 0);
}

function showPackComplete() {
    showModal('packCompleteModal');
}

function restartPack() {
    hideModal('packCompleteModal');
    state.currentCardIndex = 0;
    shuffleArray(state.cardOrder);
    state.startTime = Date.now();
    showCard();
}

async function backToPacks() {
    document.getElementById('packSelection').style.display = 'block';
    document.getElementById('cardsContainer').style.display = 'none';
    state.currentPack = null;
    await renderPackSelection();
}

// ============================================================================
// SWIPE FUNCTIONALITY
// ============================================================================

let startX = 0, startY = 0, currentX = 0, currentY = 0, isDragging = false;

function handleSwipe(direction) {
    const container = document.getElementById('cardContainer');
    const distance = window.innerWidth;
    const rotation = direction === 'right' ? 20 : -20;
    
    container.style.transition = 'transform 0.3s ease-out';
    container.style.transform = `translateX(${direction === 'right' ? distance : -distance}px) rotate(${rotation}deg)`;
    
    setTimeout(() => {
        nextCard();
    }, 300);
}

function initializeSwipe() {
    const container = document.getElementById('cardContainer');
    const swipeLeft = document.querySelector('.swipe-indicator.left');
    const swipeRight = document.querySelector('.swipe-indicator.right');
    
    // Touch events
    container.addEventListener('touchstart', (e) => {
        if (e.target.closest('.card').scrollHeight > e.target.closest('.card').clientHeight) {
            return;
        }
        isDragging = true;
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        container.style.transition = 'none';
    });
    
    container.addEventListener('touchmove', (e) => {
        if (!isDragging) return;
        
        currentX = e.touches[0].clientX - startX;
        currentY = e.touches[0].clientY - startY;
        
        if (Math.abs(currentY) > Math.abs(currentX)) return;
        
        e.preventDefault();
        
        const rotation = currentX / 20;
        container.style.transform = `translate(${currentX}px, ${currentY}px) rotate(${rotation}deg)`;
        
        if (Math.abs(currentX) > 50) {
            if (currentX > 0) {
                swipeRight.style.opacity = Math.min(currentX / 200, 1);
                swipeLeft.style.opacity = 0;
            } else {
                swipeLeft.style.opacity = Math.min(Math.abs(currentX) / 200, 1);
                swipeRight.style.opacity = 0;
            }
        } else {
            swipeLeft.style.opacity = 0;
            swipeRight.style.opacity = 0;
        }
    });
    
    container.addEventListener('touchend', () => {
        if (!isDragging) return;
        
        isDragging = false;
        swipeLeft.style.opacity = 0;
        swipeRight.style.opacity = 0;
        
        const threshold = 100;
        
        if (Math.abs(currentX) > threshold) {
            handleSwipe(currentX > 0 ? 'right' : 'left');
        } else {
            container.style.transition = 'transform 0.3s ease-out';
            container.style.transform = 'translate(0, 0) rotate(0deg)';
        }
        
        currentX = 0;
        currentY = 0;
    });
    
    // Mouse events
    container.addEventListener('mousedown', (e) => {
        if (e.target.closest('.card').scrollHeight > e.target.closest('.card').clientHeight) {
            return;
        }
        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;
        container.style.transition = 'none';
        e.preventDefault();
    });
    
    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        
        currentX = e.clientX - startX;
        currentY = e.clientY - startY;
        
        const rotation = currentX / 20;
        container.style.transform = `translate(${currentX}px, ${currentY}px) rotate(${rotation}deg)`;
        
        if (Math.abs(currentX) > 50) {
            if (currentX > 0) {
                swipeRight.style.opacity = Math.min(currentX / 200, 1);
                swipeLeft.style.opacity = 0;
            } else {
                swipeLeft.style.opacity = Math.min(Math.abs(currentX) / 200, 1);
                swipeRight.style.opacity = 0;
            }
        } else {
            swipeLeft.style.opacity = 0;
            swipeRight.style.opacity = 0;
        }
    });
    
    document.addEventListener('mouseup', () => {
        if (!isDragging) return;
        
        isDragging = false;
        swipeLeft.style.opacity = 0;
        swipeRight.style.opacity = 0;
        
        const threshold = 100;
        
        if (Math.abs(currentX) > threshold) {
            handleSwipe(currentX > 0 ? 'right' : 'left');
        } else {
            container.style.transition = 'transform 0.3s ease-out';
            container.style.transform = 'translate(0, 0) rotate(0deg)';
        }
        
        currentX = 0;
        currentY = 0;
    });
    
    // Keyboard
    document.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
            handleSwipe(e.key === 'ArrowRight' ? 'right' : 'left');
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
            <div class="pack-card-icon">📦</div>
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
    
    const itemsHtml = roadmap.items.map((item, index) => `
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
    
    // Total stats
    document.getElementById('totalCardsReviewed').textContent = stats.totalCards;
    
    const hours = Math.floor(stats.totalTime / 3600);
    const minutes = Math.floor((stats.totalTime % 3600) / 60);
    document.getElementById('totalTimeSpent').textContent = `${hours}h ${minutes}m`;
    
    document.getElementById('currentStreak').textContent = `${stats.streak} days`;
    document.getElementById('todayProgress').textContent = `${todayStats.cards} cards`;
    
    // Activity calendar (last 84 days)
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
    editorCards.push({
        category: '',
        title: '',
        theory: '',
        code: ''
    });
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
    
    if (!name) {
        alert('Please enter a pack name');
        return;
    }
    
    if (editorCards.length === 0) {
        alert('Please add at least one card');
        return;
    }
    
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
    
    if (!title) {
        alert('Please enter a roadmap title');
        return;
    }
    
    if (!itemsText) {
        alert('Please enter at least one milestone');
        return;
    }
    
    // Parse items (remove numbers like "1. ", "2. ")
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
    
    // Load default packs
    console.log('Loading default packs...');
    await loadDefaultPacks();
    console.log('Default packs loaded');
    
    // Check for remembered user
    const rememberedUser = localStorage.getItem('rememberedUsername');
    if (rememberedUser) {
        console.log('Found remembered user:', rememberedUser);
        document.getElementById('usernameInput').value = rememberedUser;
        
        // Auto-login
        const success = await loginUser(rememberedUser);
        if (success) {
            console.log('Auto-login successful');
            showScreen('mainApp');
            
            const sidebarUsername = document.getElementById('sidebarUsername');
            const settingsUsername = document.getElementById('settingsUsername');
            
            if (sidebarUsername) sidebarUsername.textContent = state.currentUser.username;
            if (settingsUsername) settingsUsername.textContent = state.currentUser.username;
            
            updateStatsDisplay();
            await renderPackSelection();
            await renderStats();
            console.log('Auto-login complete');
        }
    }
    
    // Login button
    const loginButton = document.getElementById('loginButton');
    if (!loginButton) {
        console.error('Login button not found!');
        return;
    }
    
    loginButton.addEventListener('click', async () => {
        console.log('Login button clicked');
        const username = document.getElementById('usernameInput').value;
        console.log('Username:', username);
        
        const success = await loginUser(username);
        console.log('Login success:', success);
        
        if (success) {
            // Remember username
            localStorage.setItem('rememberedUsername', username);
            
            console.log('Showing main app...');
            showScreen('mainApp');
            
            const sidebarUsername = document.getElementById('sidebarUsername');
            const settingsUsername = document.getElementById('settingsUsername');
            
            if (sidebarUsername) sidebarUsername.textContent = state.currentUser.username;
            if (settingsUsername) settingsUsername.textContent = state.currentUser.username;
            
            updateStatsDisplay();
            await renderPackSelection();
            await renderStats();
            console.log('Login complete');
        } else {
            alert('Please enter a username');
        }
    });
    
    // Enter key on login
    const usernameInput = document.getElementById('usernameInput');
    if (usernameInput) {
        usernameInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                console.log('Enter key pressed');
                loginButton.click();
            }
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
            console.log('Navigating to view:', view);
            showView(view + 'View');
            
            // Load view data
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
        if (state.currentUser) {
            await saveUserStats();
        }
    }, 30000); // Every 30 seconds
    
    console.log('All event listeners initialized');
});
