document.addEventListener("DOMContentLoaded", function() {
        // Получаем элементы
        const modal = document.getElementById('settingsModal');
        const settingsBtn = document.getElementById('settingsButton');
        const closeBtn = document.getElementById('closeSettings');
        
        // Элементы управления
        const arSizeInput = document.getElementById('arSize');
        const trscSizeInput = document.getElementById('trscSize');
        const ruSizeInput = document.getElementById('ruSize');
        const showArCheck = document.getElementById('showAr');
        const showTrscCheck = document.getElementById('showTrsc');
        const showRuCheck = document.getElementById('showRu');
        
        // Дисплеи значений
        const arSizeValue = document.getElementById('arSizeValue');
        const trscSizeValue = document.getElementById('trscSizeValue');
        const ruSizeValue = document.getElementById('ruSizeValue');

        // Корневой элемент для CSS переменных
        const root = document.documentElement;

        // Функции обновления
        function updateArSize() {
            const val = arSizeInput.value + 'px';
            root.style.setProperty('--ar-size', val);
            arSizeValue.textContent = val;
        }

        function updateTrscSize() {
            const val = trscSizeInput.value + 'em';
            root.style.setProperty('--trsc-size', val);
            trscSizeValue.textContent = val;
        }

        function updateRuSize() {
            const val = ruSizeInput.value + 'em';
            root.style.setProperty('--ru-size', val);
            ruSizeValue.textContent = val;
        }

        function updateVisibility() {
            root.style.setProperty('--ar-display', showArCheck.checked ? 'block' : 'none');
            root.style.setProperty('--trsc-display', showTrscCheck.checked ? 'block' : 'none');
            root.style.setProperty('--ru-display', showRuCheck.checked ? 'block' : 'none');
        }

        // Загрузка сохраненных настроек (если есть)
        function loadSettings() {
            const savedArSize = localStorage.getItem('arSize');
            const savedTrscSize = localStorage.getItem('trscSize');
            const savedRuSize = localStorage.getItem('ruSize');
            const savedShowAr = localStorage.getItem('showAr');
            const savedShowTrsc = localStorage.getItem('showTrsc');
            const savedShowRu = localStorage.getItem('showRu');
            
            if (savedArSize) {
                arSizeInput.value = savedArSize;
                updateArSize();
            }
            if (savedTrscSize) {
                trscSizeInput.value = savedTrscSize;
                updateTrscSize();
            }
            if (savedRuSize) {
                ruSizeInput.value = savedRuSize;
                updateRuSize();
            }
            
            if (savedShowAr !== null) {
                showArCheck.checked = savedShowAr === 'true';
            }
            if (savedShowTrsc !== null) {
                showTrscCheck.checked = savedShowTrsc === 'true';
            }
            if (savedShowRu !== null) {
                showRuCheck.checked = savedShowRu === 'true';
            }
            
            updateVisibility();
        }

        // Сохранение настроек
        function saveSettings() {
            localStorage.setItem('arSize', arSizeInput.value);
            localStorage.setItem('trscSize', trscSizeInput.value);
            localStorage.setItem('ruSize', ruSizeInput.value);
            localStorage.setItem('showAr', showArCheck.checked);
            localStorage.setItem('showTrsc', showTrscCheck.checked);
            localStorage.setItem('showRu', showRuCheck.checked);
        }

        // Открыть модальное окно
        settingsBtn.addEventListener('click', () => {
            modal.style.display = 'flex';
        });

        // Закрыть и сохранить
        closeBtn.addEventListener('click', () => {
            saveSettings();
            modal.style.display = 'none';
        });

        // Закрыть по клику на overlay
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                saveSettings();
                modal.style.display = 'none';
            }
        });

        // Слушатели изменений
        arSizeInput.addEventListener('input', updateArSize);
        trscSizeInput.addEventListener('input', updateTrscSize);
        ruSizeInput.addEventListener('input', updateRuSize);
        
        showArCheck.addEventListener('change', updateVisibility);
        showTrscCheck.addEventListener('change', updateVisibility);
        showRuCheck.addEventListener('change', updateVisibility);

        // Инициализация
        loadSettings(); 
 });
