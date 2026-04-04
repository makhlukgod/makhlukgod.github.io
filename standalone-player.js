// standalone-player.js
// Полностью автономный подкаст-плеер с сохранением множества закладок

class PodcastPlayer {
  constructor(options) {
    this.options = options;
    this.container = typeof options.container === 'function' 
        ? options.container() 
        : options.container;
    
    // Опции
    this.rssUrl = options.rssUrl || null;
    this.enableProgressTracking = options.enableProgressTracking !== false;
    this.enableBookmarks = options.enableBookmarks !== false;
    this.socialSharing = options.socialSharing || false;
    this.donationUrl = options.donationUrl || null;
    this.autoNextEpisode = options.autoNextEpisode || false;
    this.themeColor = options.themeColor || '#764ba2';
    
    // Состояние
    this.episodes = [];
    this.currentEpisodeIndex = 0;
    this.bookmarks = []; // Будет загружено из localStorage
    this.progressData = {};
    this.isPlaying = false;
    this.currentTime = 0;
    this.duration = 0;
    this.isInitialized = false;
    
    // Загружаем сохранённые данные
    this.loadBookmarks();
    this.loadProgress();
    
    // Создаем аудио элемент
    this.audio = new Audio();
    this.audio.preload = 'metadata';
    
    // События
    this.eventListeners = {};
    
    // Инициализация
    this.initUI();
    this.attachAudioEvents();
    
    if (this.rssUrl) {
      this.loadRSSFeed();
    } else if (options.audio) {
      this.setCurrentAudio(options.audio);
    }
  }
  
  // ==================== UI СОЗДАНИЕ ====================
  
  initUI() {
    if (!this.container) return;
    
    this.container.innerHTML = `
      <div class="podcast-player" style="font-family: system-ui, sans-serif;">
        <!-- Основной плеер -->
        <div class="player-main" style="background: white; border-radius: 16px; overflow: hidden;">
          <!-- Обложка и информация -->
          <div class="player-info" style="display: flex; padding: 20px; gap: 15px; background: linear-gradient(135deg, ${this.themeColor}20, white);">
            <div class="player-cover">
              <img id="player-cover" src="${this.options.audio?.cover || 'https://via.placeholder.com/80?text=🎙️'}" 
                   style="width: 80px; height: 80px; border-radius: 12px; object-fit: cover;">
            </div>
            <div class="player-meta" style="flex: 1;">
              <div id="player-title" style="font-weight: bold; font-size: 16px;">${this.options.audio?.title || 'Нет эпизода'}</div>
              <div id="player-artist" style="font-size: 14px; color: #666;">${this.options.audio?.artist || 'Подкаст'}</div>
            </div>
          </div>
          
          <!-- Прогресс бар -->
          <div class="player-progress" style="padding: 0 20px;">
            <input type="range" id="progress-bar" value="0" step="0.1" style="width: 100%; margin: 10px 0;">
            <div style="display: flex; justify-content: space-between; font-size: 12px; color: #666;">
              <span id="current-time">0:00</span>
              <span id="duration-time">0:00</span>
            </div>
          </div>
          
          <!-- Кнопки управления -->
          <div class="player-controls" style="display: flex; justify-content: center; gap: 20px; padding: 15px 20px;">
            <button id="rewind-btn" style="background: none; border: none; font-size: 24px; cursor: pointer;">⏪ 15</button>
            <button id="play-pause-btn" style="background: ${this.themeColor}; border: none; width: 50px; height: 50px; border-radius: 50%; font-size: 24px; cursor: pointer; color: white;">▶</button>
            <button id="forward-btn" style="background: none; border: none; font-size: 24px; cursor: pointer;">30 ⏩</button>
          </div>
          
          <!-- Дополнительные контролы -->
          <div class="player-extras" style="display: flex; justify-content: center; gap: 15px; padding: 10px 20px; border-top: 1px solid #eee;">
            <select id="speed-select" style="padding: 5px 10px; border-radius: 20px; border: 1px solid #ddd;">
              <option value="0.5">0.5x</option>
              <option value="0.75">0.75x</option>
              <option value="1" selected>1x</option>
              <option value="1.25">1.25x</option>
              <option value="1.5">1.5x</option>
              <option value="2">2x</option>
            </select>
            ${this.enableBookmarks ? '<button id="bookmark-btn" style="padding: 5px 15px; border-radius: 20px; border: 1px solid #ddd; background: white; cursor: pointer;">🔖 Закладка</button>' : ''}
            ${this.socialSharing ? '<button id="share-btn" style="padding: 5px 15px; border-radius: 20px; border: 1px solid #ddd; background: white; cursor: pointer;">📤 Поделиться</button>' : ''}
            ${this.donationUrl ? '<button id="donate-btn" style="padding: 5px 15px; border-radius: 20px; border: 1px solid #ff4444; background: #ff4444; color: white; cursor: pointer;">❤️ Поддержать</button>' : ''}
          </div>
        </div>
        
        <!-- Панели с эпизодами и закладками -->
        <div class="player-panels" style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-top: 15px;">
          <div id="episodes-panel" style="background: white; border-radius: 12px; padding: 15px; max-height: 300px; overflow-y: auto;">
            <h4 style="margin-bottom: 10px;">📋 Эпизоды</h4>
            <div id="episodes-list"></div>
          </div>
          ${this.enableBookmarks ? `
          <div id="bookmarks-panel" style="background: white; border-radius: 12px; padding: 15px; max-height: 300px; overflow-y: auto;">
            <h4 style="margin-bottom: 10px;">📌 Закладки (всего: <span id="bookmarks-count">0</span>)</h4>
            <div id="bookmarks-list"></div>
          </div>
          ` : ''}
        </div>
      </div>
    `;
    
    // Сохраняем ссылки на элементы
    this.elements = {
      cover: document.getElementById('player-cover'),
      title: document.getElementById('player-title'),
      artist: document.getElementById('player-artist'),
      progressBar: document.getElementById('progress-bar'),
      currentTime: document.getElementById('current-time'),
      durationTime: document.getElementById('duration-time'),
      playPauseBtn: document.getElementById('play-pause-btn'),
      rewindBtn: document.getElementById('rewind-btn'),
      forwardBtn: document.getElementById('forward-btn'),
      speedSelect: document.getElementById('speed-select')
    };
    
    if (this.enableBookmarks) {
      this.elements.bookmarkBtn = document.getElementById('bookmark-btn');
      this.elements.bookmarksCount = document.getElementById('bookmarks-count');
      this.elements.bookmarkBtn?.addEventListener('click', () => this.addBookmark());
    }
    
    if (this.socialSharing) {
      this.elements.shareBtn = document.getElementById('share-btn');
      this.elements.shareBtn?.addEventListener('click', () => this.shareEpisode());
    }
    
    if (this.donationUrl) {
      this.elements.donateBtn = document.getElementById('donate-btn');
      this.elements.donateBtn?.addEventListener('click', () => this.showDonation());
    }
    
    // Добавляем обработчики
    this.elements.playPauseBtn.addEventListener('click', () => this.togglePlay());
    this.elements.rewindBtn.addEventListener('click', () => this.rewind(15));
    this.elements.forwardBtn.addEventListener('click', () => this.forward(30));
    this.elements.progressBar.addEventListener('input', (e) => this.seek(parseFloat(e.target.value)));
    this.elements.speedSelect.addEventListener('change', (e) => this.setSpeed(parseFloat(e.target.value)));
  }
  
  attachAudioEvents() {
    this.audio.addEventListener('timeupdate', () => {
      this.currentTime = this.audio.currentTime;
      if (this.elements.progressBar) {
        this.elements.progressBar.value = this.currentTime;
        this.elements.currentTime.textContent = this.formatTime(this.currentTime);
      }
      
      if (this.enableProgressTracking) {
        this.saveProgress();
      }
    });
    
    this.audio.addEventListener('loadedmetadata', () => {
      this.duration = this.audio.duration;
      if (this.elements.progressBar) {
        this.elements.progressBar.max = this.duration;
        this.elements.durationTime.textContent = this.formatTime(this.duration);
      }
    });
    
    this.audio.addEventListener('play', () => {
      this.isPlaying = true;
      if (this.elements.playPauseBtn) {
        this.elements.playPauseBtn.textContent = '⏸';
      }
    });
    
    this.audio.addEventListener('pause', () => {
      this.isPlaying = false;
      if (this.elements.playPauseBtn) {
        this.elements.playPauseBtn.textContent = '▶';
      }
    });
    
    this.audio.addEventListener('ended', () => {
      this.isPlaying = false;
      if (this.elements.playPauseBtn) {
        this.elements.playPauseBtn.textContent = '▶';
      }
      this.markAsCompleted();
    });
    
    this.audio.addEventListener('error', (e) => {
      console.error('Audio error:', e);
      this.showNotification('Ошибка воспроизведения', 'Не удалось загрузить аудио');
    });
  }
  
  // ==================== RSS ПОДДЕРЖКА ====================
  
  async loadRSSFeed() {
    if (!this.rssUrl) return;
    
    try {
      let data;
      
      if (this.rssUrl.startsWith('http')) {
        const apiUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(this.rssUrl)}`;
        const response = await fetch(apiUrl);
        data = await response.json();
        
        if (data.status === 'ok') {
          this.episodes = this.parseRSS2JSON(data);
        }
      } else {
        const response = await fetch(this.rssUrl);
        const text = await response.text();
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(text, 'text/xml');
        this.episodes = this.parseXMLFeed(xmlDoc);
      }
      
      if (this.episodes.length > 0) {
        this.renderEpisodes();
        // ПОСЛЕ ЗАГРУЗКИ ЭПИЗОДОВ ОБНОВЛЯЕМ ЗАКЛАДКИ
        this.renderBookmarks();
        this.emit('rssLoaded', this.episodes);
        this.showNotification(`Загружено ${this.episodes.length} эпизодов`);
      }
      
    } catch (error) {
      console.error('RSS error:', error);
      this.emit('rssError', error);
      this.showNotification('Ошибка загрузки RSS', 'Проверьте ссылку');
    }
  }
  
  parseRSS2JSON(data) {
    const episodes = [];
    data.items.forEach((item, index) => {
      let audioUrl = null;
      if (item.enclosure && item.enclosure.link) {
        audioUrl = item.enclosure.link;
      } else if (item.attachments && item.attachments.length > 0) {
        audioUrl = item.attachments[0].url;
      }
      
      if (audioUrl) {
        episodes.push({
          id: `ep_${index}_${Date.now()}`,
          title: item.title,
          description: item.description,
          pubDate: item.pubDate,
          audioUrl: audioUrl,
          duration: this.parseDuration(item.enclosure?.duration),
          cover: item.thumbnail || data.feed?.image,
          played: false
        });
      }
    });
    return episodes;
  }
  
  parseXMLFeed(xmlDoc) {
    const items = xmlDoc.querySelectorAll('item');
    const episodes = [];
    
    items.forEach((item, index) => {
      const enclosure = item.querySelector('enclosure');
      const audioUrl = enclosure?.getAttribute('url');
      
      if (audioUrl) {
        episodes.push({
          id: `ep_${index}_${Date.now()}`,
          title: item.querySelector('title')?.textContent || 'Untitled',
          description: item.querySelector('description')?.textContent || '',
          pubDate: item.querySelector('pubDate')?.textContent || '',
          audioUrl: audioUrl,
          duration: this.parseDuration(item.querySelector('itunes\\:duration, duration')?.textContent),
          cover: item.querySelector('itunes\\:image')?.getAttribute('href'),
          played: false
        });
      }
    });
    
    return episodes;
  }
  
  parseDuration(durationStr) {
    if (!durationStr) return 0;
    if (!isNaN(durationStr)) return parseInt(durationStr);
    
    if (durationStr.includes(':')) {
      const parts = durationStr.split(':').map(Number);
      if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
      if (parts.length === 2) return parts[0] * 60 + parts[1];
    }
    return 0;
  }
  
  renderEpisodes() {
    const container = document.getElementById('episodes-list');
    if (!container) return;
    
    container.innerHTML = this.episodes.map((ep, idx) => `
      <div class="episode-item" data-index="${idx}" style="
        padding: 12px;
        margin-bottom: 8px;
        background: ${idx === this.currentEpisodeIndex ? this.themeColor + '20' : '#f5f5f5'};
        border-radius: 10px;
        cursor: pointer;
        transition: all 0.2s;
        border-left: 3px solid ${idx === this.currentEpisodeIndex ? this.themeColor : 'transparent'};
      ">
        <div style="font-weight: 500; font-size: 14px; margin-bottom: 5px;">${this.escapeHtml(ep.title)}</div>
        <div style="font-size: 11px; color: #666;">
          ${ep.pubDate ? new Date(ep.pubDate).toLocaleDateString() : ''}
          ${ep.duration ? ` • ${this.formatTime(ep.duration)}` : ''}
        </div>
        <button class="episode-play-btn" data-index="${idx}" style="
          margin-top: 8px;
          padding: 4px 12px;
          background: ${this.themeColor};
          color: white;
          border: none;
          border-radius: 15px;
          cursor: pointer;
          font-size: 12px;
        ">▶ Воспроизвести</button>
      </div>
    `).join('');
    
    // Добавляем обработчики
    container.querySelectorAll('.episode-play-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.dataset.index);
        this.loadEpisode(idx);
      });
    });
    
    container.querySelectorAll('.episode-item').forEach(item => {
      item.addEventListener('click', (e) => {
        if (!e.target.classList.contains('episode-play-btn')) {
          const idx = parseInt(item.dataset.index);
          this.loadEpisode(idx);
        }
      });
    });
  }
  
  loadEpisode(index) {
    if (index < 0 || index >= this.episodes.length) return;
    
    const episode = this.episodes[index];
    this.currentEpisodeIndex = index;
    
    this.setCurrentAudio({
      title: episode.title,
      artist: 'Подкаст',
      src: episode.audioUrl,
      cover: episode.cover
    });
    
    this.renderEpisodes(); // Обновляем активный эпизод
    this.renderBookmarks(); // ОБНОВЛЯЕМ ЗАКЛАДКИ ДЛЯ НОВОГО ЭПИЗОДА
    
    this.emit('episodeChange', episode);
    this.play();
    
    // Восстанавливаем прогресс
    if (this.progressData[episode.id] && this.progressData[episode.id].progress > 0) {
      setTimeout(() => {
        this.seek(this.progressData[episode.id].progress);
      }, 500);
    }
  }
  
  setCurrentAudio(audio) {
    if (!audio || !audio.src) return;
    
    this.audio.src = audio.src;
    this.audio.load();
    
    if (this.elements.title) {
      this.elements.title.textContent = audio.title || 'Нет названия';
    }
    if (this.elements.artist) {
      this.elements.artist.textContent = audio.artist || 'Подкаст';
    }
    if (this.elements.cover && audio.cover) {
      this.elements.cover.src = audio.cover;
    }
    
    this.options.audio = audio;
  }
  
  // ==================== УПРАВЛЕНИЕ ВОСПРОИЗВЕДЕНИЕМ ====================
  
  play() {
    return this.audio.play().catch(err => {
      console.warn('Play failed:', err);
      this.showNotification('Автовоспроизведение заблокировано', 'Нажмите play вручную');
    });
  }
  
  pause() {
    this.audio.pause();
  }
  
  togglePlay() {
    if (this.isPlaying) {
      this.pause();
    } else {
      this.play();
    }
  }
  
  seek(time) {
    if (!isNaN(time) && time >= 0 && time <= this.duration) {
      this.audio.currentTime = time;
    }
  }
  
  rewind(seconds) {
    this.seek(this.audio.currentTime - seconds);
  }
  
  forward(seconds) {
    this.seek(this.audio.currentTime + seconds);
  }
  
  setSpeed(speed) {
    this.audio.playbackRate = speed;
  }
  
  // ==================== ПРОГРЕСС ====================
  
  saveProgress() {
    const audioId = this.episodes[this.currentEpisodeIndex]?.id;
    if (!audioId) return;
    
    this.progressData[audioId] = {
      id: audioId,
      progress: this.audio.currentTime,
      duration: this.audio.duration,
      timestamp: Date.now(),
      completed: this.audio.currentTime >= this.audio.duration - 1,
      title: this.options.audio?.title
    };
    
    try {
      localStorage.setItem('podcast_progress', JSON.stringify(this.progressData));
    } catch(e) {}
  }
  
  loadProgress() {
    try {
      const saved = localStorage.getItem('podcast_progress');
      if (saved) {
        this.progressData = JSON.parse(saved);
        console.log(`📊 Загружен прогресс для ${Object.keys(this.progressData).length} эпизодов`);
      }
    } catch(e) {
      this.progressData = {};
    }
  }
  
  markAsCompleted() {
    const audioId = this.episodes[this.currentEpisodeIndex]?.id;
    if (audioId && this.progressData[audioId]) {
      this.progressData[audioId].completed = true;
      localStorage.setItem('podcast_progress', JSON.stringify(this.progressData));
      this.emit('episodeCompleted', this.progressData[audioId]);
      
      if (this.autoNextEpisode && this.currentEpisodeIndex < this.episodes.length - 1) {
        setTimeout(() => this.loadEpisode(this.currentEpisodeIndex + 1), 1000);
      }
    }
  }
  
  // ==================== ЗАКЛАДКИ (ИСПРАВЛЕНО) ====================
  
  addBookmark(note = '') {
    const currentAudio = this.episodes[this.currentEpisodeIndex];
    if (!currentAudio) {
      this.showNotification('Ошибка', 'Нет активного эпизода');
      return;
    }
    
    const currentTime = this.audio.currentTime;
    const formattedTime = this.formatTime(currentTime);
    
    // Диалог для ввода названия закладки
    let bookmarkNote = note;
    if (!bookmarkNote) {
      bookmarkNote = prompt('Введите название закладки:', `Отметка ${formattedTime}`);
      if (!bookmarkNote) return; // Пользователь отменил
    }
    
    // Создаём новую закладку
    const bookmark = {
      id: `bm_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      episodeId: currentAudio.id,
      episodeTitle: currentAudio.title,
      time: currentTime,
      formattedTime: formattedTime,
      note: bookmarkNote,
      timestamp: Date.now()
    };
    
    // Добавляем в массив
    this.bookmarks.push(bookmark);
    
    // Сохраняем в localStorage
    this.saveBookmarks();
    
    // Обновляем UI
    this.renderBookmarks();
    
    // Показываем уведомление
    this.showNotification('🔖 Закладка добавлена', `${bookmark.note} - ${formattedTime}`);
    this.emit('bookmarkAdded', bookmark);
    
    console.log(`📌 Закладка добавлена. Всего закладок: ${this.bookmarks.length}`);
  }
  
  saveBookmarks() {
    try {
      localStorage.setItem('podcast_bookmarks', JSON.stringify(this.bookmarks));
      console.log(`💾 Сохранено ${this.bookmarks.length} закладок в localStorage`);
    } catch(e) {
      console.error('Ошибка сохранения закладок:', e);
    }
  }
  
  loadBookmarks() {
    try {
      const saved = localStorage.getItem('podcast_bookmarks');
      if (saved) {
        this.bookmarks = JSON.parse(saved);
        console.log(`📖 Загружено ${this.bookmarks.length} закладок из localStorage`);
        // Выводим список загруженных закладок для отладки
        if (this.bookmarks.length > 0) {
          console.log('Список загруженных закладок:', this.bookmarks);
        }
      } else {
        this.bookmarks = [];
        console.log('📭 Нет сохранённых закладок');
      }
    } catch(e) {
      console.error('Ошибка загрузки закладок:', e);
      this.bookmarks = [];
    }
  }
  
  removeBookmark(id) {
    const index = this.bookmarks.findIndex(b => b.id === id);
    if (index !== -1) {
      const removed = this.bookmarks.splice(index, 1)[0];
      this.saveBookmarks();
      this.renderBookmarks();
      this.showNotification('🗑️ Закладка удалена', removed.note);
      this.emit('bookmarkRemoved', removed);
      console.log(`Закладка удалена. Осталось: ${this.bookmarks.length}`);
    }
  }
  
  renderBookmarks() {
    const container = document.getElementById('bookmarks-list');
    if (!container) {
      console.warn('Контейнер bookmarks-list не найден');
      return;
    }
    
    const currentEpisodeId = this.episodes[this.currentEpisodeIndex]?.id;
    
    // Фильтруем закладки для текущего эпизода
    const currentBookmarks = this.bookmarks.filter(b => b.episodeId === currentEpisodeId);
    
    console.log(`📌 Рендеринг закладок: найдено ${currentBookmarks.length} для текущего эпизода (всего в хранилище: ${this.bookmarks.length})`);
    
    // Обновляем счётчик
    if (this.elements.bookmarksCount) {
      this.elements.bookmarksCount.textContent = this.bookmarks.length;
    }
    
    if (currentBookmarks.length === 0) {
      container.innerHTML = '<div style="color: #999; text-align: center; padding: 20px;">📭 Нет закладок для этого эпизода</div>';
      return;
    }
    
    // Сортируем по времени
    currentBookmarks.sort((a, b) => a.time - b.time);
    
    container.innerHTML = currentBookmarks.map(b => `
      <div style="
        padding: 10px;
        margin-bottom: 8px;
        background: #f5f5f5;
        border-radius: 8px;
        border-left: 3px solid ${this.themeColor};
      ">
        <div style="font-weight: bold; color: ${this.themeColor};">⏱️ ${b.formattedTime}</div>
        <div style="font-size: 13px; margin: 5px 0; font-weight: 500;">${this.escapeHtml(b.note)}</div>
        <div style="font-size: 11px; color: #999; margin-bottom: 8px;">${new Date(b.timestamp).toLocaleString()}</div>
        <div style="display: flex; gap: 8px;">
          <button class="goto-bookmark" data-time="${b.time}" style="padding: 5px 12px; background: ${this.themeColor}; color: white; border: none; border-radius: 5px; cursor: pointer; font-size: 12px;">▶ Перейти</button>
          <button class="delete-bookmark" data-id="${b.id}" style="padding: 5px 12px; background: #f44336; color: white; border: none; border-radius: 5px; cursor: pointer; font-size: 12px;">🗑️ Удалить</button>
        </div>
      </div>
    `).join('');
    
    // Добавляем обработчики для перехода
    container.querySelectorAll('.goto-bookmark').forEach(btn => {
      btn.addEventListener('click', () => {
        this.seek(parseFloat(btn.dataset.time));
        this.play();
        this.showNotification('🎯 Переход к закладке', this.formatTime(parseFloat(btn.dataset.time)));
      });
    });
    
    // Добавляем обработчики для удаления
    container.querySelectorAll('.delete-bookmark').forEach(btn => {
      btn.addEventListener('click', () => {
        this.removeBookmark(btn.dataset.id);
      });
    });
  }
  
  // ==================== ИНТЕГРАЦИИ ====================
  
  shareEpisode() {
    const episode = this.episodes[this.currentEpisodeIndex];
    if (!episode) return;
    
    const text = `Слушаю: ${episode.title} на ${this.formatTime(this.audio.currentTime)}`;
    if (navigator.share) {
      navigator.share({
        title: episode.title,
        text: text,
        url: window.location.href
      });
    } else {
      navigator.clipboard.writeText(text);
      this.showNotification('📋 Ссылка скопирована', text);
    }
  }
  
  showDonation() {
    if (this.donationUrl) {
      window.open(this.donationUrl, '_blank');
    }
  }
  
  // ==================== ВСПОМОГАТЕЛЬНЫЕ ====================
  
  formatTime(seconds) {
    if (isNaN(seconds) || seconds === 0) return '0:00';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  }
  
  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
  
  showNotification(message, detail = '') {
    const notification = document.createElement('div');
    notification.innerHTML = `
      <strong>${this.escapeHtml(message)}</strong>
      ${detail ? `<br><small>${this.escapeHtml(detail)}</small>` : ''}
    `;
    notification.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: #333;
      color: white;
      padding: 12px 20px;
      border-radius: 8px;
      z-index: 10000;
      font-size: 14px;
      animation: slideIn 0.3s ease;
      max-width: 300px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    `;
    
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 3000);
  }
  
  emit(eventName, data) {
    const event = new CustomEvent(`podcast:${eventName}`, { detail: data });
    this.container?.dispatchEvent(event);
  }
  
  on(eventName, callback) {
    this.container?.addEventListener(`podcast:${eventName}`, (e) => callback(e.detail));
  }
  
  destroy() {
    this.audio.pause();
    this.audio.src = '';
    if (this.container) {
      this.container.innerHTML = '';
    }
  }
}

export { PodcastPlayer as Player };
