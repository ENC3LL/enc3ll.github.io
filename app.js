// Карточки (потом будут загружаться из cards.json)
let cardsData = [];
let currentCardIndex = 0;
let cardOrder = []; // Массив с индексами для рандомного порядка

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
        cardsData = await response.json();
        initializeCardOrder();
        showCard(cardOrder[currentCardIndex]);
    } catch (error) {
        console.error('Ошибка загрузки карточек:', error);
        // Fallback: используем встроенные карточки
        cardsData = getDefaultCards();
        initializeCardOrder();
        showCard(cardOrder[currentCardIndex]);
    }
}

// Дефолтные карточки на случай отсутствия cards.json
function getDefaultCards() {
    return [
        {
            category: "C++ ООП",
            title: "unique_ptr",
            theory: "Умный указатель для уникального владения объектом. Автоматически освобождает память при выходе из области видимости. Нельзя копировать, только перемещать.",
            code: `std::unique_ptr<int> ptr = std::make_unique<int>(42);
std::cout << *ptr << std::endl;

// Передача владения
auto ptr2 = std::move(ptr);
// ptr теперь nullptr`
        },
        {
            category: "C++ ООП",
            title: "shared_ptr",
            theory: "Умный указатель с разделяемым владением. Использует счётчик ссылок. Память освобождается когда последний shared_ptr уничтожен.",
            code: `auto ptr1 = std::make_shared<int>(42);
auto ptr2 = ptr1; // Копирование OK

std::cout << ptr1.use_count(); // 2
std::cout << *ptr1 << std::endl;`
        },
        {
            category: "C++ ООП",
            title: "weak_ptr",
            theory: "Слабая ссылка на объект, управляемый shared_ptr. Не увеличивает счётчик ссылок. Используется для разрыва циклических ссылок.",
            code: `auto shared = std::make_shared<int>(42);
std::weak_ptr<int> weak = shared;

if (auto locked = weak.lock()) {
    std::cout << *locked << std::endl;
}`
        },
        {
            category: "C++ Шаблоны",
            title: "Template Basics",
            theory: "Шаблоны позволяют писать обобщённый код, работающий с разными типами данных. Компилятор генерирует отдельную версию функции/класса для каждого используемого типа.",
            code: `template<typename T>
T max(T a, T b) {
    return (a > b) ? a : b;
}

int i = max(5, 10);
double d = max(3.14, 2.71);`
        },
        {
            category: "C++ STL",
            title: "std::vector",
            theory: "Динамический массив с автоматическим управлением памятью. Элементы хранятся последовательно в памяти. Быстрый доступ по индексу O(1), добавление в конец амортизированно O(1).",
            code: `std::vector<int> vec = {1, 2, 3};
vec.push_back(4);
vec.emplace_back(5);

for (const auto& val : vec) {
    std::cout << val << " ";
}`
        }
    ];
}

// Инициализация массива с рандомным порядком
function initializeCardOrder() {
    cardOrder = Array.from({length: cardsData.length}, (_, i) => i);
    shuffleArray(cardOrder);
}

// Рандомизация массива (Fisher-Yates shuffle)
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

// Показать карточку
function showCard(index) {
    const cardData = cardsData[index];
    
    categoryEl.textContent = cardData.category;
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
    counterEl.textContent = `Карточка ${currentCardIndex + 1} из ${cardsData.length}`;
}

// Следующая карточка
function nextCard() {
    currentCardIndex++;
    
    // Если дошли до конца, перемешиваем и начинаем сначала
    if (currentCardIndex >= cardOrder.length) {
        currentCardIndex = 0;
        shuffleArray(cardOrder);
    }
    
    resetCardPosition();
    showCard(cardOrder[currentCardIndex]);
}

// Сброс позиции карточки
function resetCardPosition() {
    cardContainer.style.transition = 'none';
    cardContainer.style.transform = 'translate(0, 0) rotate(0deg)';
    card.scrollTop = 0; // Прокрутка вверх
    
    // Убираем transition после сброса
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
    // Проверяем, что касание не на области с прокруткой
    if (e.target.closest('.card') && e.target.closest('.card').scrollHeight > e.target.closest('.card').clientHeight) {
        return; // Разрешаем прокрутку
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
    
    // Если вертикальное движение больше горизонтального, отменяем свайп
    if (Math.abs(currentY) > Math.abs(currentX)) {
        return;
    }
    
    e.preventDefault();
    
    const rotation = currentX / 20;
    cardContainer.style.transform = `translate(${currentX}px, ${currentY}px) rotate(${rotation}deg)`;
    
    // Показываем индикаторы
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

// Mouse events (для десктопа)
cardContainer.addEventListener('mousedown', (e) => {
    // Проверяем прокрутку
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

// Клавиатура (стрелки)
document.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') {
        handleSwipe('left');
    } else if (e.key === 'ArrowRight') {
        handleSwipe('right');
    }
});

// Инициализация
loadCards();
