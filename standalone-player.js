// standalone-player.js
// Исправленная версия — прогресс привязан к каждому эпизоду отдельно

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
    this.autoplay = options.autoplay || false;
    
    // Состояние
    this.episodes = [];
    this.currentEpisodeIndex = 0;
    this.bookmarks = [];
    this.progressData = {};
    this.isPlaying = false;
    this.isRssLoaded = false;
    this.isProgressRestored = false;
    
    // Флаги для предотвращения конфликтов
    this.isSwitchingEpisode = false;
    this.progressSaveInterval = null;
    
    // Загружаем сохранённые данные
    this.loadBookmarks();
    this.loadProgress();
    
    // Аудио элемент
    this.audio = new Audio();
    this.audio.preload = 'metadata';
    
    // UI
    this.initUI();
    this.attachAudioEvents();
    
    // Загружаем RSS
    if (this.rssUrl) {
      this.loadRSSFeed();
    } else if (options.audio) {
      this.episodes = [{
        id: options.audio.src,
        title: options.audio.title,
        audioUrl: options.audio.src,
        cover: options.audio.cover,
        duration: options.audio.duration
      }];
      this.isRssLoaded = true;
      this.renderEpisodes();
      this.loadEpisode(0);
    }
  }
  
  initUI() {
    if (!this.container) return;
    
    this.container.innerHTML = `
      <div class="podcast-player" style="font-family: system-ui, sans-serif;">
        <div class="player-main" style="background: white; border-radius: 16px; overflow: hidden;">
          <div class="player-info" style="display: flex; padding: 20px; gap: 15px; background: linear-gradient(135deg, ${this.themeColor}20, white);">
            <div class="player-cover">
              <img id="player-cover" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' fill='%23${this.themeColor.replace('#', '')}'/%3E%3Ctext x='50' y='55' font-size='40' text-anchor='middle' fill='white'%3E🎙️%3C/text%3E%3C/svg%3E" 
                   style="width: 80px; height: 80px; border-radius: 12px; object-fit: cover;">
            </div>
            <div class="player-meta" style="flex: 1;">
              <div id="player-title" style="font-weight: bold; font-size: 16px;">Загрузка...</div>
              <div id="player-artist" style="font-size: 14px; color: #666;">Подкаст</div>
            </div>
          </div>
          
          <div class="player-progress" style="padding: 0 20px;">
            <input type="range" id="progress-bar" value="0" step="0.1" style="width: 100%; margin: 10px 0;">
            <div style="display: flex; justify-content: space-between; font-size: 12px; color: #666;">
              <span id="current-time">0:00</span>
              <span id="duration-time">0:00</span>
            </div>
          </div>
          
          <div class="player-controls" style="display: flex; justify-content: center; gap: 20px; padding: 15px 20px;">
            <button id="rewind-btn" style="background: none; border: none; font-size: 24px; cursor: pointer;">⏪ 15</button>
            <button id="play-pause-btn" style="background: ${this.themeColor}; border: none; width: 50px; height: 50px; border-radius: 50%; font-size: 24px; cursor: pointer; color: white;">▶</button>
            <button id="forward-btn" style="background: none; border: none; font-size: 24px; cursor: pointer;">30 ⏩</button>
          </div>
          
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
        
        <div class="player-panels" style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-top: 15px;">
          <div id="episodes-panel" style="background: white; border-radius: 12px; padding: 15px; max-height: 300px; overflow-y: auto;">
            <h4 style="margin-bottom: 10px;">📋 Эпизоды</h4>
            <div id="episodes-list"><div style="text-align: center; padding: 20px; color: #999;">Загрузка...</div></div>
          </div>
          ${this.enableBookmarks ? `
          <div id="bookmarks-panel" style="background: white; border-radius: 12px; padding: 15px; max-height: 300px; overflow-y: auto;">
            <h4 style="margin-bottom: 10px;">📌 Закладки (<span id="bookmarks-count">0</span>)</h4>
            <div id="bookmarks-list"><div style="text-align: center; padding: 20px; color: #999;">Загрузка...</div></div>
          </div>
          ` : ''}
        </div>
      </div>
    `;
    
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
    
    this.elements.playPauseBtn.addEventListener('click', () => this.togglePlay());
    this.elements.rewindBtn.addEventListener('click', () => this.rewind(15));
    this.elements.forwardBtn.addEventListener('click', () => this.forward(30));
    this.elements.progressBar.addEventListener('input', (e) => this.seek(parseFloat(e.target.value)));
    this.elements.speedSelect.addEventListener('change', (e) => this.setSpeed(parseFloat(e.target.value)));
  }
  
  attachAudioEvents() {
    // Обновление UI во время воспроизведения
    this.audio.addEventListener('timeupdate', () => {
      if (this.isSwitchingEpisode) return;
      
      const currentTime = this.audio.currentTime;
      if (this.elements.progressBar && !this.elements.progressBar.disabled) {
        this.elements.progressBar.value = currentTime;
        this.elements.currentTime.textContent = this.formatTime(currentTime);
      }
    });
    
    this.audio.addEventListener('loadedmetadata', () => {
      if (this.isSwitchingEpisode) return;
      
      const duration = this.audio.duration;
      if (this.elements.progressBar) {
        this.elements.progressBar.max = duration;
        this.elements.durationTime.textContent = this.formatTime(duration);
      }
      
      // Восстанавливаем прогресс для текущего эпизода
      this.restoreProgressForCurrentEpisode();
    });
    
    this.audio.addEventListener('play', () => {
      if (this.isSwitchingEpisode) return;
      this.isPlaying = true;
      if (this.elements.playPauseBtn) {
        this.elements.playPauseBtn.textContent = '⏸';
      }
    });
    
    this.audio.addEventListener('pause', () => {
      if (this.isSwitchingEpisode) return;
      this.isPlaying = false;
      if (this.elements.playPauseBtn) {
        this.elements.playPauseBtn.textContent = '▶';
      }
      // Сохраняем прогресс при паузе
      this.saveProgressForCurrentEpisode();
    });
    
    this.audio.addEventListener('ended', () => {
      if (this.isSwitchingEpisode) return;
      this.isPlaying = false;
      if (this.elements.playPauseBtn) {
        this.elements.playPauseBtn.textContent = '▶';
      }
      this.markCurrentAsCompleted();
    });
    
    this.audio.addEventListener('error', (e) => {
      console.error('Audio error:', e);
      this.showNotification('Ошибка воспроизведения', 'Не удалось загрузить аудио');
    });
    
    // Интервал сохранения прогресса (каждые 5 секунд)
    this.progressSaveInterval = setInterval(() => {
      if (!this.isSwitchingEpisode && this.isPlaying && this.audio.currentTime > 0) {
        this.saveProgressForCurrentEpisode();
      }
    }, 5000);
  }
  
  // ==================== ПРОГРЕСС (ПРИВЯЗАН К ЭПИЗОДУ) ====================
  
  saveProgressForCurrentEpisode() {
    const episode = this.episodes[this.currentEpisodeIndex];
    if (!episode) return;
    
    const currentTime = this.audio.currentTime;
    if (currentTime === 0 || isNaN(currentTime)) return;
    
    this.progressData[episode.id] = {
      id: episode.id,
      progress: currentTime,
      duration: this.audio.duration,
      timestamp: Date.now(),
      completed: currentTime >= this.audio.duration - 1,
      title: episode.title
    };
    
    try {
      localStorage.setItem('podcast_progress', JSON.stringify(this.progressData));
      console.log(`💾 Прогресс сохранён для "${episode.title?.substring(0, 30)}": ${this.formatTime(currentTime)}`);
    } catch(e) {
      console.error('Ошибка сохранения прогресса:', e);
    }
  }
  
  loadProgress() {
    try {
      const saved = localStorage.getItem('podcast_progress');
      if (saved) {
        this.progressData = JSON.parse(saved);
        console.log(`📊 Загружен прогресс для ${Object.keys(this.progressData).length} эпизодов`);
      } else {
        this.progressData = {};
        console.log('📭 Нет сохранённого прогресса');
      }
    } catch(e) {
      console.error('Ошибка загрузки прогресса:', e);
      this.progressData = {};
    }
  }
  
  restoreProgressForCurrentEpisode() {
    const episode = this.episodes[this.currentEpisodeIndex];
    if (!episode) return;
    
    const saved = this.progressData[episode.id];
    
    if (saved && saved.progress > 5 && saved.progress < this.audio.duration - 5 && !saved.completed) {
      console.log(`⏪ Восстановление прогресса для "${episode.title?.substring(0, 30)}": ${this.formatTime(saved.progress)}`);
      
      this.audio.currentTime = saved.progress;
      this.isProgressRestored = true;
      
      // Обновляем UI
      if (this.elements.progressBar) {
        this.elements.progressBar.value = saved.progress;
        this.elements.currentTime.textContent = this.formatTime(saved.progress);
      }
      
      this.showNotification('⏪ Продолжаем с', this.formatTime(saved.progress));
    } else if (saved && saved.progress > 0) {
      console.log(`ℹ️ Прогресс ${this.formatTime(saved.progress)} для "${episode.title?.substring(0, 30)}" не восстановлен (слишком близко к началу/концу)`);
    }
  }
  
  markCurrentAsCompleted() {
    const episode = this.episodes[this.currentEpisodeIndex];
    if (episode && this.progressData[episode.id]) {
      this.progressData[episode.id].completed = true;
      this.progressData[episode.id].progress = this.audio.duration;
      localStorage.setItem('podcast_progress', JSON.stringify(this.progressData));
      this.emit('episodeCompleted', this.progressData[episode.id]);
      this.showNotification('✅ Эпизод завершён', episode.title);
      
      if (this.autoNextEpisode && this.currentEpisodeIndex < this.episodes.length - 1) {
        setTimeout(() => this.loadEpisode(this.currentEpisodeIndex + 1), 1000);
      }
    }
  }
  
  // ==================== УПРАВЛЕНИЕ ЭПИЗОДАМИ ====================
  
  async loadRSSFeed() {
    if (!this.rssUrl) return;
    
    try {
      let data;
      
      if (this.rssUrl.startsWith('http')) {
        const apiUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(this.rssUrl)}`;
        const response = await fetch(apiUrl);
        
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        data = await response.json();
        
        if (data.status === 'ok') {
          this.episodes = this.parseRSS2JSON(data);
        } else {
          throw new Error(data.message || 'RSS2JSON вернул ошибку');
        }
      } else {
        const response = await fetch(this.rssUrl);
        const text = await response.text();
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(text, 'text/xml');
        this.episodes = this.parseXMLFeed(xmlDoc);
      }
      
      if (this.episodes.length > 0) {
        this.isRssLoaded = true;
        this.renderEpisodes();
        this.renderBookmarks();
        this.emit('rssLoaded', this.episodes);
        this.showNotification(`Загружено ${this.episodes.length} эпизодов`);
        
        if (this.episodes.length > 0) {
          this.loadEpisode(0);
        }
      }
      
    } catch (error) {
      console.error('RSS error:', error);
      this.emit('rssError', error);
      this.showNotification('Ошибка загрузки RSS', error.message);
      
      const episodesList = document.getElementById('episodes-list');
      if (episodesList) {
        episodesList.innerHTML = `<div style="text-align: center; padding: 20px; color: #f44336;">❌ Ошибка: ${error.message}</div>`;
      }
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
        const episodeId = item.guid || audioUrl;
        episodes.push({
          id: episodeId,
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
    console.log(`📡 Загружено эпизодов: ${episodes.length}`);
    return episodes;
  }
  
  parseXMLFeed(xmlDoc) {
    const items = xmlDoc.querySelectorAll('item');
    const episodes = [];
    
    items.forEach((item, index) => {
      const enclosure = item.querySelector('enclosure');
      const audioUrl = enclosure?.getAttribute('url');
      
      if (audioUrl) {
        const guidElement = item.querySelector('guid');
        const episodeId = guidElement?.textContent || audioUrl;
        
        episodes.push({
          id: episodeId,
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
    
    if (this.episodes.length === 0) {
      container.innerHTML = '<div style="text-align: center; padding: 20px; color: #999;">Нет эпизодов</div>';
      return;
    }
    
    container.innerHTML = this.episodes.map((ep, idx) => {
      const savedProgress = this.progressData[ep.id];
      const progressText = savedProgress && savedProgress.progress > 0 && !savedProgress.completed 
        ? ` • ⏺ ${Math.floor(savedProgress.progress / 60)}:${Math.floor(savedProgress.progress % 60).toString().padStart(2, '0')}` 
        : '';
      
      return `
      <div class="episode-item" data-index="${idx}" style="
        padding: 12px;
        margin-bottom: 8px;
        background: ${idx === this.currentEpisodeIndex ? this.themeColor + '20' : '#f5f5f5'};
        border-radius: 10px;
        cursor: pointer;
        border-left: 3px solid ${idx === this.currentEpisodeIndex ? this.themeColor : 'transparent'};
      ">
        <div style="font-weight: 500; font-size: 14px; margin-bottom: 5px;">${this.escapeHtml(ep.title)}</div>
        <div style="font-size: 11px; color: #666;">
          ${ep.pubDate ? new Date(ep.pubDate).toLocaleDateString() : ''}
          ${ep.duration ? ` • ${this.formatTime(ep.duration)}` : ''}
          ${progressText}
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
    `}).join('');
    
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
    if (index === this.currentEpisodeIndex && this.audio.src) return;
    
    const episode = this.episodes[index];
    
    // Сохраняем прогресс текущего эпизода перед переключением
    if (this.audio.src && this.audio.currentTime > 0) {
      this.saveProgressForCurrentEpisode();
    }
    
    // Останавливаем текущее воспроизведение
    this.audio.pause();
    this.isPlaying = false;
    if (this.elements.playPauseBtn) {
      this.elements.playPauseBtn.textContent = '▶';
    }
    
    // Устанавливаем флаг переключения
    this.isSwitchingEpisode = true;
    this.currentEpisodeIndex = index;
    this.isProgressRestored = false;
    
    // Отключаем прогресс-бар на время загрузки
    if (this.elements.progressBar) {
      this.elements.progressBar.disabled = true;
      this.elements.progressBar.value = 0;
      this.elements.currentTime.textContent = '0:00';
      this.elements.durationTime.textContent = '0:00';
    }
    
    // Обновляем UI
    if (this.elements.title) {
      this.elements.title.textContent = episode.title;
    }
    if (this.elements.cover && episode.cover) {
      this.elements.cover.src = episode.cover;
    }
    
    // Загружаем новое аудио
    this.audio.src = episode.audioUrl;
    this.audio.load();
    
    // Ждём загрузки метаданных
    const onLoaded = () => {
      this.audio.removeEventListener('loadedmetadata', onLoaded);
      this.isSwitchingEpisode = false;
      
      if (this.elements.progressBar) {
        this.elements.progressBar.disabled = false;
      }
      
      this.renderEpisodes();
      this.renderBookmarks();
      this.emit('episodeChange', episode);
      
      // Автовоспроизведение, если включено
      if (this.autoplay) {
        setTimeout(() => this.play(), 100);
      }
    };
    
    this.audio.addEventListener('loadedmetadata', onLoaded, { once: true });
    
    // Таймаут на случай ошибки загрузки
    setTimeout(() => {
      if (this.isSwitchingEpisode) {
        this.isSwitchingEpisode = false;
        if (this.elements.progressBar) {
          this.elements.progressBar.disabled = false;
        }
      }
    }, 5000);
  }
  
  // ==================== УПРАВЛЕНИЕ ВОСПРОИЗВЕДЕНИЕМ ====================
  
  play() {
    if (this.isSwitchingEpisode) {
      console.log('Ожидание загрузки эпизода...');
      return Promise.reject('Switching episode');
    }
    
    return this.audio.play().catch(err => {
      console.warn('Play failed:', err);
      if (err.name === 'NotAllowedError') {
        this.showNotification('🔊 Нажмите Play', 'Автовоспроизведение заблокировано браузером');
      }
    });
  }
  
  pause() {
    if (this.isSwitchingEpisode) return;
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
    if (this.isSwitchingEpisode) return;
    if (!isNaN(time) && time >= 0 && time <= this.audio.duration) {
      this.audio.currentTime = time;
    }
  }
  
  rewind(seconds) { this.seek(this.audio.currentTime - seconds); }
  forward(seconds) { this.seek(this.audio.currentTime + seconds); }
  setSpeed(speed) { this.audio.playbackRate = speed; }
  
  // ==================== ЗАКЛАДКИ ====================
  
  addBookmark(note = '') {
    const currentEpisode = this.episodes[this.currentEpisodeIndex];
    if (!currentEpisode) {
      this.showNotification('Ошибка', 'Нет активного эпизода');
      return;
    }
    
    const currentTime = this.audio.currentTime;
    const formattedTime = this.formatTime(currentTime);
    
    let bookmarkNote = note;
    if (!bookmarkNote) {
      bookmarkNote = prompt('Введите название закладки:', `Отметка ${formattedTime}`);
      if (!bookmarkNote) return;
    }
    
    const bookmark = {
      id: `bm_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      episodeId: currentEpisode.id,
      episodeTitle: currentEpisode.title,
      time: currentTime,
      formattedTime: formattedTime,
      note: bookmarkNote,
      timestamp: Date.now()
    };
    
    this.bookmarks.push(bookmark);
    this.saveBookmarks();
    this.renderBookmarks();
    
    this.showNotification('🔖 Закладка добавлена', `${bookmark.note} - ${formattedTime}`);
    this.emit('bookmarkAdded', bookmark);
  }
  
  saveBookmarks() {
    try {
      localStorage.setItem('podcast_bookmarks', JSON.stringify(this.bookmarks));
      console.log(`💾 Сохранено ${this.bookmarks.length} закладок`);
    } catch(e) {
      console.error('Ошибка сохранения закладок:', e);
    }
  }
  
  loadBookmarks() {
    try {
      const saved = localStorage.getItem('podcast_bookmarks');
      if (saved) {
        this.bookmarks = JSON.parse(saved);
        console.log(`📖 Загружено ${this.bookmarks.length} закладок`);
      } else {
        this.bookmarks = [];
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
    }
  }
  
  renderBookmarks() {
    const container = document.getElementById('bookmarks-list');
    if (!container) return;
    
    if (this.elements.bookmarksCount) {
      this.elements.bookmarksCount.textContent = this.bookmarks.length;
    }
    
    if (!this.isRssLoaded && this.episodes.length === 0) {
      container.innerHTML = '<div style="text-align: center; padding: 20px; color: #999;">⏳ Загрузка...</div>';
      return;
    }
    
    const currentEpisodeId = this.episodes[this.currentEpisodeIndex]?.id;
    const currentBookmarks = this.bookmarks.filter(b => b.episodeId === currentEpisodeId);
    
    if (currentBookmarks.length === 0) {
      container.innerHTML = '<div style="text-align: center; padding: 20px; color: #999;">📭 Нет закладок</div>';
      return;
    }
    
    currentBookmarks.sort((a, b) => a.time - b.time);
    
    container.innerHTML = currentBookmarks.map(b => `
      <div style="padding: 10px; margin-bottom: 8px; background: #f5f5f5; border-radius: 8px; border-left: 3px solid ${this.themeColor};">
        <div style="font-weight: bold; color: ${this.themeColor};">⏱️ ${b.formattedTime}</div>
        <div style="font-size: 13px; margin: 5px 0;">${this.escapeHtml(b.note)}</div>
        <div style="font-size: 11px; color: #999; margin-bottom: 8px;">${new Date(b.timestamp).toLocaleString()}</div>
        <div style="display: flex; gap: 8px;">
          <button class="goto-bookmark" data-time="${b.time}" style="padding: 5px 12px; background: ${this.themeColor}; color: white; border: none; border-radius: 5px; cursor: pointer;">▶ Перейти</button>
          <button class="delete-bookmark" data-id="${b.id}" style="padding: 5px 12px; background: #f44336; color: white; border: none; border-radius: 5px; cursor: pointer;">🗑️</button>
        </div>
      </div>
    `).join('');
    
    container.querySelectorAll('.goto-bookmark').forEach(btn => {
      btn.addEventListener('click', () => {
        this.seek(parseFloat(btn.dataset.time));
        this.play();
      });
    });
    
    container.querySelectorAll('.delete-bookmark').forEach(btn => {
      btn.addEventListener('click', () => this.removeBookmark(btn.dataset.id));
    });
  }
  
  // ==================== ИНТЕГРАЦИИ ====================
  
  shareEpisode() {
    const episode = this.episodes[this.currentEpisodeIndex];
    if (!episode) return;
    
    const text = `Слушаю: ${episode.title}`;
    if (navigator.share) {
      navigator.share({ title: episode.title, text: text, url: window.location.href });
    } else {
      navigator.clipboard.writeText(text);
      this.showNotification('📋 Скопировано', text);
    }
  }
  
  showDonation() {
    if (this.donationUrl) window.open(this.donationUrl, '_blank');
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
    notification.innerHTML = `<strong>${this.escapeHtml(message)}</strong>${detail ? `<br><small>${this.escapeHtml(detail)}</small>` : ''}`;
    notification.style.cssText = `
      position: fixed; bottom: 20px; right: 20px; background: #333; color: white;
      padding: 12px 20px; border-radius: 8px; z-index: 10000; font-size: 14px;
      animation: slideIn 0.3s ease; max-width: 300px; box-shadow: 0 4px 12px rgba(0,0,0,0.3);
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
    if (this.progressSaveInterval) {
      clearInterval(this.progressSaveInterval);
    }
    this.saveProgressForCurrentEpisode();
    this.audio.pause();
    this.audio.src = '';
    if (this.container) this.container.innerHTML = '';
  }
}

export { PodcastPlayer as Player };
