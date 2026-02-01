// Структура данных
let allDecks = [];           // Все колоды карточек
let currentDeckIndex = 0;    // Текущая колода
let currentCardIndex = 0;    // Текущая карточка в колоде
let deckRepeatCount = 0;     // Сколько раз прошли текущую колоду
let cardOrder = [];          // Рандомный порядок карточек в текущей колоде

const REPEATS_PER_DECK = 3;  // Сколько раз повторяем колоду

// Элементы DOM
const cardContainer = document.getElementById('cardContainer');
const card = document.getElementById('card');
const categoryEl = document.getElementById('category');
const titleEl = document.getElementById('title');
const theoryEl = document.getElementById('theory');
const codeBlockEl = document.getElementById('codeBlock');
const codeEl = document.getElementById('code');
const counterEl = document.getElementById('counter');
const swipeLeft = document.querySelector('.swipe-indicator.left');
const swipeRight = document.querySelector('.swipe-indicator.right');

// Переменные для свайпа
let startX = 0;
let startY = 0;
let currentX = 0;
let currentY = 0;
let isDragging = false;

// Загрузка карточек
async function loadCards() {
    try {
        const response = await fetch('cards.json');
        allDecks = await response.json();
        initializeDeck();
        showCard(cardOrder[currentCardIndex]);
    } catch (error) {
        console.error('Ошибка загрузки карточек:', error);
        allDecks = getDefaultDecks();
        initializeDeck();
        showCard(cardOrder[currentCardIndex]);
    }
}

// Дефолтные колоды
function getDefaultDecks() {
    return [
        {
            name: "Move Semantics",
            cards: [
                {
                    title: "lvalue и rvalue",
                    theory: "В C++ есть два типа значений. lvalue — это объект с именем и адресом в памяти (например, переменная). rvalue — временное значение, которое существует только в момент вычисления.",
                    code: `int x = 42;\n// x — это lvalue (можно взять адрес &x)\n\nint y = x + 5;\n// (x + 5) — это rvalue (временное значение)`
                }
            ]
        }
    ];
}

// Инициализация колоды
function initializeDeck() {
    if (allDecks.length === 0) return;
    
    const currentDeck = allDecks[currentDeckIndex];
    cardOrder = Array.from({length: currentDeck.cards.length}, (_, i) => i);
    shuffleArray(cardOrder);
    currentCardIndex = 0;
    deckRepeatCount = 0;
}

// Рандомизация массива (Fisher-Yates)
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

// Показать карточку
function showCard(cardIdx) {
    const currentDeck = allDecks[currentDeckIndex];
    const cardData = currentDeck.cards[cardIdx];
    
    categoryEl.textContent = currentDeck.name;
    titleEl.textContent = cardData.title;
    theoryEl.textContent = cardData.theory;
    
    if (cardData.code) {
        codeEl.textContent = cardData.code;
        codeBlockEl.style.display = 'block';
        hljs.highlightElement(codeEl);
    } else {
        codeBlockEl.style.display = 'none';
    }
    
    updateCounter();
}

// Обновить счётчик
function updateCounter() {
    const currentDeck = allDecks[currentDeckIndex];
    const totalCards = currentDeck.cards.length;
    const progress = deckRepeatCount + 1;
    
    counterEl.textContent = `${currentDeck.name} | Карточка ${currentCardIndex + 1}/${totalCards} | Круг ${progress}/${REPEATS_PER_DECK}`;
}

// Следующая карточка
function nextCard() {
    currentCardIndex++;
    
    // Если дошли до конца колоды
    if (currentCardIndex >= cardOrder.length) {
        currentCardIndex = 0;
        deckRepeatCount++;
        
        // Если повторили колоду достаточно раз
        if (deckRepeatCount >= REPEATS_PER_DECK) {
            // Переходим к следующей колоде
            currentDeckIndex++;
            
            // Если закончились все колоды, начинаем сначала
            if (currentDeckIndex >= allDecks.length) {
                currentDeckIndex = 0;
            }
            
            initializeDeck();
        } else {
            // Перемешиваем карточки для следующего круга
            shuffleArray(cardOrder);
        }
    }
    
    resetCardPosition();
    showCard(cardOrder[currentCardIndex]);
}

// Сброс позиции карточки
function resetCardPosition() {
    cardContainer.style.transition = 'none';
    cardContainer.style.transform = 'translate(0, 0) rotate(0deg)';
    card.scrollTop = 0;
    
    setTimeout(() => {
        cardContainer.style.transition = '';
    }, 0);
}

// Обработка свайпа
function handleSwipe(direction) {
    const distance = window.innerWidth;
    const rotation = direction === 'right' ? 20 : -20;
    
    cardContainer.style.transition = 'transform 0.3s ease-out';
    cardContainer.style.transform = `translateX(${direction === 'right' ? distance : -distance}px) rotate(${rotation}deg)`;
    
    setTimeout(() => {
        nextCard();
    }, 300);
}

// Touch events
cardContainer.addEventListener('touchstart', (e) => {
    if (e.target.closest('.card') && e.target.closest('.card').scrollHeight > e.target.closest('.card').clientHeight) {
        return;
    }
    
    isDragging = true;
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    cardContainer.style.transition = 'none';
});

cardContainer.addEventListener('touchmove', (e) => {
    if (!isDragging) return;
    
    currentX = e.touches[0].clientX - startX;
    currentY = e.touches[0].clientY - startY;
    
    if (Math.abs(currentY) > Math.abs(currentX)) {
        return;
    }
    
    e.preventDefault();
    
    const rotation = currentX / 20;
    cardContainer.style.transform = `translate(${currentX}px, ${currentY}px) rotate(${rotation}deg)`;
    
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

cardContainer.addEventListener('touchend', () => {
    if (!isDragging) return;
    
    isDragging = false;
    swipeLeft.style.opacity = 0;
    swipeRight.style.opacity = 0;
    
    const threshold = 100;
    
    if (Math.abs(currentX) > threshold) {
        handleSwipe(currentX > 0 ? 'right' : 'left');
    } else {
        cardContainer.style.transition = 'transform 0.3s ease-out';
        cardContainer.style.transform = 'translate(0, 0) rotate(0deg)';
    }
    
    currentX = 0;
    currentY = 0;
});

// Mouse events
cardContainer.addEventListener('mousedown', (e) => {
    if (e.target.closest('.card') && e.target.closest('.card').scrollHeight > e.target.closest('.card').clientHeight) {
        return;
    }
    
    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;
    cardContainer.style.transition = 'none';
    e.preventDefault();
});

document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    
    currentX = e.clientX - startX;
    currentY = e.clientY - startY;
    
    const rotation = currentX / 20;
    cardContainer.style.transform = `translate(${currentX}px, ${currentY}px) rotate(${rotation}deg)`;
    
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
        cardContainer.style.transition = 'transform 0.3s ease-out';
        cardContainer.style.transform = 'translate(0, 0) rotate(0deg)';
    }
    
    currentX = 0;
    currentY = 0;
});

// Клавиатура
document.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') {
        handleSwipe('left');
    } else if (e.key === 'ArrowRight') {
        handleSwipe('right');
    }
});

// Инициализация
loadCards();
