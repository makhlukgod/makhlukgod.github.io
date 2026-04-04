// simple-player.js
// Максимально простой и надёжный подкаст-плеер

class SimplePodcastPlayer {
  constructor(options) {
    this.options = options;
    this.container = typeof options.container === 'function' 
        ? options.container() 
        : options.container;
    
    this.rssUrl = options.rssUrl || null;
    this.themeColor = options.themeColor || '#764ba2';
    
    // Данные
    this.episodes = [];
    this.currentEpisodeIndex = 0;
    this.bookmarks = this.loadFromStorage('podcast_bookmarks', []);
    this.progress = this.loadFromStorage('podcast_progress', {});
    
    // Аудио
    this.audio = new Audio();
    this.isPlaying = false;
    
    // Инициализация
    this.initUI();
    this.attachEvents();
    
    if (this.rssUrl) {
      this.loadRSS();
    }
  }
  
  loadFromStorage(key, defaultValue) {
    try {
      const saved = localStorage.getItem(key);
      return saved ? JSON.parse(saved) : defaultValue;
    } catch(e) {
      return defaultValue;
    }
  }
  
  saveToStorage(key, data) {
    try {
      localStorage.setItem(key, JSON.stringify(data));
    } catch(e) {}
  }
  
  initUI() {
    if (!this.container) return;
    
    this.container.innerHTML = `
      <div style="font-family: system-ui, sans-serif;">
        <!-- Плеер -->
        <div style="background: white; border-radius: 16px; overflow: hidden;">
          <div style="display: flex; padding: 20px; gap: 15px; background: linear-gradient(135deg, ${this.themeColor}20, white);">
            <img id="player-cover" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' fill='${this.themeColor}'/%3E%3Ctext x='50' y='55' font-size='40' text-anchor='middle' fill='white'%3E🎙️%3C/text%3E%3C/svg%3E" 
                 style="width: 60px; height: 60px; border-radius: 12px;">
            <div style="flex: 1;">
              <div id="player-title" style="font-weight: bold;">Загрузка...</div>
              <div id="player-artist" style="font-size: 13px; color: #666;">Подкаст</div>
            </div>
          </div>
          
          <div style="padding: 15px 20px;">
            <input type="range" id="progress-bar" value="0" step="0.1" style="width: 100%;">
            <div style="display: flex; justify-content: space-between; font-size: 12px; margin-top: 5px;">
              <span id="current-time">0:00</span>
              <span id="duration-time">0:00</span>
            </div>
          </div>
          
          <div style="display: flex; justify-content: center; gap: 20px; padding: 10px 20px 20px;">
            <button id="rewind-15" style="background: none; border: none; font-size: 20px; cursor: pointer;">⏪ 15</button>
            <button id="play-pause" style="background: ${this.themeColor}; border: none; width: 50px; height: 50px; border-radius: 50%; font-size: 24px; cursor: pointer; color: white;">▶</button>
            <button id="forward-30" style="background: none; border: none; font-size: 20px; cursor: pointer;">30 ⏩</button>
          </div>
          
          <div style="display: flex; justify-content: center; gap: 10px; padding: 0 20px 20px; border-top: 1px solid #eee; padding-top: 15px;">
            <select id="speed" style="padding: 5px 10px; border-radius: 20px;">
              <option value="0.5">0.5x</option>
              <option value="0.75">0.75x</option>
              <option value="1" selected>1x</option>
              <option value="1.25">1.25x</option>
              <option value="1.5">1.5x</option>
              <option value="2">2x</option>
            </select>
            <button id="bookmark-btn" style="padding: 5px 15px; border-radius: 20px; border: 1px solid #ddd; background: white; cursor: pointer;">🔖 Закладка</button>
          </div>
        </div>
        
        <!-- Панели -->
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-top: 15px;">
          <div id="episodes-panel" style="background: white; border-radius: 12px; padding: 15px; max-height: 300px; overflow-y: auto;">
            <h4 style="margin: 0 0 10px 0;">📋 Эпизоды</h4>
            <div id="episodes-list">Загрузка...</div>
          </div>
          <div id="bookmarks-panel" style="background: white; border-radius: 12px; padding: 15px; max-height: 300px; overflow-y: auto;">
            <h4 style="margin: 0 0 10px 0;">📌 Закладки (<span id="bookmarks-count">0</span>)</h4>
            <div id="bookmarks-list"></div>
          </div>
        </div>
      </div>
    `;
    
    // Элементы
    this.elements = {
      cover: document.getElementById('player-cover'),
      title: document.getElementById('player-title'),
      artist: document.getElementById('player-artist'),
      progressBar: document.getElementById('progress-bar'),
      currentTime: document.getElementById('current-time'),
      durationTime: document.getElementById('duration-time'),
      playPause: document.getElementById('play-pause'),
      rewind15: document.getElementById('rewind-15'),
      forward30: document.getElementById('forward-30'),
      speed: document.getElementById('speed'),
      bookmarkBtn: document.getElementById('bookmark-btn'),
      bookmarksCount: document.getElementById('bookmarks-count'),
      episodesList: document.getElementById('episodes-list'),
      bookmarksList: document.getElementById('bookmarks-list')
    };
    
    // Обработчики
    this.elements.playPause.onclick = () => this.togglePlay();
    this.elements.rewind15.onclick = () => this.rewind(15);
    this.elements.forward30.onclick = () => this.forward(30);
    this.elements.speed.onchange = (e) => this.audio.playbackRate = parseFloat(e.target.value);
    this.elements.progressBar.oninput = (e) => this.seek(parseFloat(e.target.value));
    this.elements.bookmarkBtn.onclick = () => this.addBookmark();
  }
  
  attachEvents() {
    // Обновление прогресс-бара
    this.audio.ontimeupdate = () => {
      if (this.elements.progressBar && !this.isSeeking) {
        this.elements.progressBar.value = this.audio.currentTime;
        this.elements.currentTime.textContent = this.formatTime(this.audio.currentTime);
      }
    };
    
    // Загрузка метаданных
    this.audio.onloadedmetadata = () => {
      this.elements.progressBar.max = this.audio.duration;
      this.elements.durationTime.textContent = this.formatTime(this.audio.duration);
      this.restoreProgress();
    };
    
    // Воспроизведение
    this.audio.onplay = () => {
      this.isPlaying = true;
      this.elements.playPause.textContent = '⏸';
    };
    
    // Пауза
    this.audio.onpause = () => {
      this.isPlaying = false;
      this.elements.playPause.textContent = '▶';
      this.saveProgress();
    };
    
    // Завершение
    this.audio.onended = () => {
      this.isPlaying = false;
      this.elements.playPause.textContent = '▶';
      this.markCompleted();
    };
    
    // Ошибка
    this.audio.onerror = () => {
      console.log('Ошибка загрузки аудио');
    };
    
    // Сохранение прогресса каждые 5 секунд
    setInterval(() => {
      if (this.isPlaying && this.audio.currentTime > 0) {
        this.saveProgress();
      }
    }, 5000);
  }
  
  // ==================== RSS ====================
  
  async loadRSS() {
    try {
      const apiUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(this.rssUrl)}`;
      const response = await fetch(apiUrl);
      const data = await response.json();
      
      if (data.status === 'ok') {
        this.episodes = [];
        data.items.forEach(item => {
          let audioUrl = item.enclosure?.link || item.attachments?.[0]?.url;
          if (audioUrl) {
            this.episodes.push({
              id: item.guid || audioUrl,
              title: item.title,
              audioUrl: audioUrl,
              cover: item.thumbnail,
              pubDate: item.pubDate
            });
          }
        });
        
        this.renderEpisodes();
        if (this.episodes.length > 0) {
          this.loadEpisode(0);
        }
      }
    } catch(e) {
      console.error('RSS error:', e);
      this.elements.episodesList.innerHTML = '<div style="color: red;">Ошибка загрузки RSS</div>';
    }
  }
  
  renderEpisodes() {
    if (!this.elements.episodesList) return;
    
    if (this.episodes.length === 0) {
      this.elements.episodesList.innerHTML = '<div style="color: #999;">Нет эпизодов</div>';
      return;
    }
    
    this.elements.episodesList.innerHTML = this.episodes.map((ep, idx) => {
      const prog = this.progress[ep.id];
      const progText = prog && prog > 30 && prog < (ep.duration || 3600) - 30 
        ? ` ⏺ ${this.formatTime(prog)}` : '';
      
      return `
        <div onclick="window.player.loadEpisode(${idx})" style="
          padding: 10px;
          margin-bottom: 8px;
          background: ${idx === this.currentEpisodeIndex ? this.themeColor + '20' : '#f5f5f5'};
          border-radius: 10px;
          cursor: pointer;
          border-left: 3px solid ${idx === this.currentEpisodeIndex ? this.themeColor : 'transparent'};
        ">
          <div style="font-weight: 500; font-size: 14px;">${this.escapeHtml(ep.title)}</div>
          <div style="font-size: 11px; color: #666;">
            ${ep.pubDate ? new Date(ep.pubDate).toLocaleDateString() : ''}
            ${progText}
          </div>
        </div>
      `;
    }).join('');
  }
  
  loadEpisode(index) {
    if (index < 0 || index >= this.episodes.length) return;
    if (index === this.currentEpisodeIndex && this.audio.src) return;
    
    // Сохраняем прогресс текущего
    this.saveProgress();
    
    // Останавливаем
    this.audio.pause();
    this.isPlaying = false;
    this.elements.playPause.textContent = '▶';
    
    // Меняем эпизод
    this.currentEpisodeIndex = index;
    const episode = this.episodes[index];
    
    this.elements.title.textContent = episode.title;
    if (episode.cover) {
      this.elements.cover.src = episode.cover;
    }
    
    // Загружаем новое аудио
    this.audio.src = episode.audioUrl;
    this.audio.load();
    
    // Обновляем списки
    this.renderEpisodes();
    this.renderBookmarks();
  }
  
  // ==================== ПРОГРЕСС ====================
  
  saveProgress() {
    const episode = this.episodes[this.currentEpisodeIndex];
    if (!episode) return;
    
    const currentTime = this.audio.currentTime;
    if (currentTime > 0 && currentTime < this.audio.duration - 3) {
      this.progress[episode.id] = currentTime;
      this.saveToStorage('podcast_progress', this.progress);
      console.log(`Сохранён прогресс: ${episode.title} - ${this.formatTime(currentTime)}`);
    }
  }
  
  restoreProgress() {
    const episode = this.episodes[this.currentEpisodeIndex];
    if (!episode) return;
    
    const savedTime = this.progress[episode.id];
    if (savedTime && savedTime > 10 && savedTime < this.audio.duration - 10) {
      this.audio.currentTime = savedTime;
      console.log(`Восстановлен прогресс: ${episode.title} - ${this.formatTime(savedTime)}`);
      this.showNotification(`⏪ Продолжаем с ${this.formatTime(savedTime)}`);
    }
  }
  
  markCompleted() {
    const episode = this.episodes[this.currentEpisodeIndex];
    if (episode) {
      delete this.progress[episode.id];
      this.saveToStorage('podcast_progress', this.progress);
      this.renderEpisodes();
      this.showNotification('✅ Эпизод завершён');
    }
  }
  
  // ==================== ЗАКЛАДКИ ====================
  
  addBookmark() {
    const episode = this.episodes[this.currentEpisodeIndex];
    if (!episode) {
      this.showNotification('Нет активного эпизода');
      return;
    }
    
    const time = this.audio.currentTime;
    const formattedTime = this.formatTime(time);
    let note = prompt('Название закладки:', `Отметка ${formattedTime}`);
    if (!note) return;
    
    this.bookmarks.push({
      id: Date.now(),
      episodeId: episode.id,
      episodeTitle: episode.title,
      time: time,
      formattedTime: formattedTime,
      note: note,
      date: new Date().toISOString()
    });
    
    this.saveToStorage('podcast_bookmarks', this.bookmarks);
    this.renderBookmarks();
    this.showNotification(`🔖 Закладка: ${note} - ${formattedTime}`);
  }
  
  renderBookmarks() {
    if (!this.elements.bookmarksList) return;
    
    const episode = this.episodes[this.currentEpisodeIndex];
    if (!episode) {
      this.elements.bookmarksList.innerHTML = '<div style="color: #999;">Нет эпизода</div>';
      return;
    }
    
    const episodeBookmarks = this.bookmarks.filter(b => b.episodeId === episode.id);
    this.elements.bookmarksCount.textContent = this.bookmarks.length;
    
    if (episodeBookmarks.length === 0) {
      this.elements.bookmarksList.innerHTML = '<div style="color: #999; text-align: center; padding: 20px;">Нет закладок</div>';
      return;
    }
    
    episodeBookmarks.sort((a, b) => a.time - b.time);
    
    this.elements.bookmarksList.innerHTML = episodeBookmarks.map(b => `
      <div style="
        padding: 10px;
        margin-bottom: 8px;
        background: #f5f5f5;
        border-radius: 8px;
        border-left: 3px solid ${this.themeColor};
      ">
        <div style="font-weight: bold; color: ${this.themeColor};">⏱️ ${b.formattedTime}</div>
        <div style="font-size: 13px; margin: 5px 0;">${this.escapeHtml(b.note)}</div>
        <div style="display: flex; gap: 8px;">
          <button onclick="window.player.seekTo(${b.time})" style="padding: 4px 10px; background: ${this.themeColor}; color: white; border: none; border-radius: 4px; cursor: pointer;">▶ Перейти</button>
          <button onclick="window.player.deleteBookmark(${b.id})" style="padding: 4px 10px; background: #f44336; color: white; border: none; border-radius: 4px; cursor: pointer;">🗑️</button>
        </div>
      </div>
    `).join('');
  }
  
  deleteBookmark(id) {
    this.bookmarks = this.bookmarks.filter(b => b.id !== id);
    this.saveToStorage('podcast_bookmarks', this.bookmarks);
    this.renderBookmarks();
    this.showNotification('Закладка удалена');
  }
  
  // ==================== УПРАВЛЕНИЕ ====================
  
  togglePlay() {
    if (this.audio.paused) {
      this.audio.play();
    } else {
      this.audio.pause();
    }
  }
  
  seek(time) {
    this.isSeeking = true;
    this.audio.currentTime = time;
    setTimeout(() => { this.isSeeking = false; }, 100);
  }
  
  seekTo(time) {
    this.seek(time);
    this.audio.play();
  }
  
  rewind(sec) {
    this.seek(this.audio.currentTime - sec);
  }
  
  forward(sec) {
    this.seek(this.audio.currentTime + sec);
  }
  
  // ==================== ВСПОМОГАТЕЛЬНЫЕ ====================
  
  formatTime(seconds) {
    if (isNaN(seconds) || seconds === 0) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }
  
  escapeHtml(text) {
    if (!text) return '';
    return text.replace(/[&<>]/g, function(m) {
      if (m === '&') return '&amp;';
      if (m === '<') return '&lt;';
      if (m === '>') return '&gt;';
      return m;
    });
  }
  
  showNotification(msg) {
    const div = document.createElement('div');
    div.textContent = msg;
    div.style.cssText = `
      position: fixed; bottom: 20px; right: 20px; background: #333; color: white;
      padding: 10px 16px; border-radius: 8px; z-index: 10000; font-size: 14px;
      animation: fadeInOut 2s ease;
    `;
    document.body.appendChild(div);
    setTimeout(() => div.remove(), 2000);
  }
}

// Экспорт
export { SimplePodcastPlayer as Player };
