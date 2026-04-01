// shikwasa-enhanced.js
// Расширенная версия Shikwasa (без внешних зависимостей)

// Проверяем, загружена ли оригинальная библиотека
if (typeof window.Shikwasa === 'undefined') {
    console.warn('Shikwasa not loaded, using fallback');
}

// Создаем расширенный класс 

class EnhancedPlayer {
  constructor(options) {
    // Сохраняем опции
    this.options = options;
    this.container = typeof options.container === 'function' 
        ? options.container() 
        : options.container;
    
    // Новые опции
    this.rssUrl = options.rssUrl || null;
    this.enableProgressTracking = options.enableProgressTracking !== false;
    this.enableBookmarks = options.enableBookmarks !== false;
    this.socialSharing = options.socialSharing || false;
    this.donationUrl = options.donationUrl || null;
    this.autoNextEpisode = options.autoNextEpisode || false;
    this.rssService = options.rssService || 'jsonfeed'; // 'jsonfeed' или 'rss2json'
    
    // Состояние
    this.episodes = [];
    this.currentEpisodeIndex = 0;
    this.bookmarks = this.loadBookmarks();
    this.progressData = this.loadProgress();
    this.player = null;
    
    // Инициализируем оригинальный плеер
    this.initOriginalPlayer();
    
    // Добавляем обработчики
    if (this.enableProgressTracking) {
      this.setupProgressTracking();
    }
    
    // Добавляем UI элементы
    this.addCustomUI();
    
    // Загружаем RSS если указан
    if (this.rssUrl) {
      this.loadRSSFeed();
    }
  }
  
  initOriginalPlayer() {
    if (typeof Shikwasa !== 'undefined' && Shikwasa.Player) {
      this.player = new Shikwasa.Player(this.options);
      
      // Проксируем методы
      this.play = () => this.player.play();
      this.pause = () => this.player.pause();
      this.toggle = () => this.player.toggle();
      this.seek = (time) => this.player.seek(time);
      this.update = (audio) => this.player.update(audio);
      this.destroy = () => this.player.destroy();
      this.on = (event, callback) => this.player.on(event, callback);
      
      // Свойства
      Object.defineProperty(this, 'currentTime', {
        get: () => this.player.currentTime
      });
      Object.defineProperty(this, 'duration', {
        get: () => this.player.duration
      });
      Object.defineProperty(this, 'playbackRate', {
        get: () => this.player.playbackRate,
        set: (val) => { this.player.playbackRate = val; }
      });
    } else {
      console.error('Shikwasa library not loaded!');
    }
  }
  
  setupProgressTracking() {
    if (!this.player) return;
    
    this.progressInterval = setInterval(() => {
      if (this.player && this.player.currentTime > 0) {
        this.saveProgress();
      }
    }, 5000);
    
    this.player.on('ended', () => {
      this.markAsCompleted();
    });
  }
  
  // ==================== RSS ПОДДЕРЖКА (без CORS-прокси) ====================
  
  async loadRSSFeed() {
    if (!this.rssUrl) return;
    
    try {
      let feedData;
      
      // Определяем тип RSS и загружаем соответствующим способом
      if (this.rssService === 'jsonfeed' && this.rssUrl.endsWith('.json')) {
        // JSON Feed формат
        feedData = await this.loadJSONFeed();
      } else if (this.rssUrl.startsWith('http://') || this.rssUrl.startsWith('https://')) {
        // Внешний RSS - используем RSS2JSON сервис (бесплатный, без CORS)
        feedData = await this.loadExternalRSS();
      } else {
        // Локальный RSS файл
        feedData = await this.loadLocalRSS();
      }
      
      if (feedData) {
        this.episodes = this.parseFeedData(feedData);
        this.renderEpisodeList();
        this.emit('rssLoaded', this.episodes);
        
        if (this.options.autoplay && this.episodes.length > 0) {
          this.loadEpisode(0);
        }
      }
      
    } catch (error) {
      console.error('Failed to load RSS feed:', error);
      this.emit('rssError', error);
      this.showNotification('Ошибка загрузки RSS', error.message);
    }
  }
  
  async loadJSONFeed() {
    const response = await fetch(this.rssUrl);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  }
  
  async loadExternalRSS() {
    // Используем rss2json.com (бесплатный сервис, не требует CORS)
    // Документация: https://rss2json.com/
    const apiUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(this.rssUrl)}`;
    const response = await fetch(apiUrl);
    
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    
    if (data.status !== 'ok') {
      throw new Error(data.message || 'Failed to parse RSS');
    }
    
    return data;
  }
  
  async loadLocalRSS() {
    const response = await fetch(this.rssUrl);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const text = await response.text();
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(text, 'text/xml');
    
    // Проверяем на ошибки парсинга
    const parserError = xmlDoc.querySelector('parsererror');
    if (parserError) {
      throw new Error('Invalid XML format');
    }
    
    return this.parseXMLFeed(xmlDoc);
  }
  
  parseFeedData(data) {
    // Обработка JSON Feed формата
    if (data.version && data.version.includes('https://jsonfeed.org')) {
      return this.parseJSONFeed(data);
    }
    
    // Обработка RSS2JSON формата
    if (data.feed && data.items) {
      return this.parseRSS2JSON(data);
    }
    
    // Обработка XML формата
    if (data.querySelector) {
      return this.parseXMLFeed(data);
    }
    
    return [];
  }
  
  parseJSONFeed(json) {
    const episodes = [];
    
    json.items.forEach((item, index) => {
      // Находим аудио enclosure
      const audioUrl = item.attachments?.find(a => a.mime_type?.startsWith('audio/'))?.url;
      
      if (audioUrl) {
        episodes.push({
          id: `ep_${index}_${Date.now()}`,
          title: item.title,
          description: item.content_html || item.summary,
          pubDate: item.date_published,
          audioUrl: audioUrl,
          duration: item.duration || 0,
          cover: item.image || json.feed?.icon,
          played: false,
          progress: 0
        });
      }
    });
    
    return episodes;
  }
  
  parseRSS2JSON(data) {
    const episodes = [];
    
    data.items.forEach((item, index) => {
      // Ищем аудио в enclosures
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
          duration: this.parseDuration(item.enclosure?.duration || item.itunes_duration),
          cover: item.thumbnail || data.feed?.image,
          played: false,
          progress: 0
        });
      }
    });
    
    return episodes;
  }
  
  parseXMLFeed(xmlDoc) {
    const items = xmlDoc.querySelectorAll('item');
    const episodes = [];
    const feedImage = xmlDoc.querySelector('image url')?.textContent;
    
    items.forEach((item, index) => {
      const title = item.querySelector('title')?.textContent || 'Untitled';
      const description = item.querySelector('description')?.textContent || '';
      const pubDate = item.querySelector('pubDate')?.textContent || '';
      const enclosure = item.querySelector('enclosure');
      const audioUrl = enclosure?.getAttribute('url');
      
      if (!audioUrl) return;
      
      // Парсим длительность
      let duration = 0;
      const durationElement = item.querySelector('itunes\\:duration, duration');
      if (durationElement) {
        duration = this.parseDuration(durationElement.textContent);
      }
      
      // Парсим обложку
      let cover = feedImage;
      const itunesImage = item.querySelector('itunes\\:image');
      if (itunesImage) {
        cover = itunesImage.getAttribute('href');
      }
      
      episodes.push({
        id: `ep_${index}_${Date.now()}`,
        title,
        description,
        pubDate,
        audioUrl,
        duration,
        cover,
        played: false,
        progress: 0
      });
    });
    
    return episodes;
  }
  
  parseDuration(durationStr) {
    if (!durationStr) return 0;
    
    // Если число
    if (!isNaN(durationStr)) {
      return parseInt(durationStr);
    }
    
    // Формат HH:MM:SS или MM:SS
    if (durationStr.includes(':')) {
      const parts = durationStr.split(':').map(Number);
      if (parts.length === 3) {
        return parts[0] * 3600 + parts[1] * 60 + parts[2];
      } else if (parts.length === 2) {
        return parts[0] * 60 + parts[1];
      }
    }
    
    return 0;
  }
  
  renderEpisodeList() {
    const container = document.querySelector('.shk-episode-list');
    if (!container || this.episodes.length === 0) {
      if (container) {
        container.innerHTML = '<div class="shk-no-episodes">📭 Нет эпизодов. Проверьте RSS ссылку.</div>';
      }
      return;
    }
    
    const listHtml = `
      <div class="shk-episodes-panel">
        <h3 class="shk-episodes-title">📋 Эпизоды (${this.episodes.length})</h3>
        <div class="shk-episodes-list">
          ${this.episodes.map((ep, idx) => `
            <div class="shk-episode-item ${idx === this.currentEpisodeIndex ? 'active' : ''}" 
                 data-index="${idx}">
              <div class="shk-episode-info">
                <div class="shk-episode-title">${this.escapeHtml(ep.title)}</div>
                <div class="shk-episode-meta">
                  ${ep.pubDate ? this.formatDate(ep.pubDate) : ''}
                  ${ep.duration ? ` • ${this.formatTime(ep.duration)}` : ''}
                </div>
              </div>
              ${ep.played ? '<span class="shk-episode-badge">✓ Прослушан</span>' : ''}
              <button class="shk-episode-play" data-index="${idx}">▶</button>
            </div>
          `).join('')}
        </div>
      </div>
    `;
    
    container.innerHTML = listHtml;
    
    container.querySelectorAll('.shk-episode-play').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.dataset.index);
        this.loadEpisode(idx);
      });
    });
  }
  
  async loadEpisode(index) {
    if (index < 0 || index >= this.episodes.length) return;
    
    const episode = this.episodes[index];
    this.currentEpisodeIndex = index;
    
    if (this.player) {
      this.player.update({
        title: episode.title,
        artist: 'Подкаст',
        cover: episode.cover || this.options.audio?.cover,
        src: episode.audioUrl,
        duration: episode.duration
      });
    }
    
    if (this.progressData[episode.id]) {
      setTimeout(() => {
        if (this.player) {
          this.player.seek(this.progressData[episode.id].progress);
        }
      }, 100);
    }
    
    this.emit('episodeChange', episode);
    if (this.player) {
      this.player.play();
    }
  }
  
  // ==================== ПРОГРЕСС ====================
  
  getCurrentAudioId() {
    const currentSrc = this.options.audio?.src;
    if (!currentSrc) return null;
    
    const episode = this.episodes.find(ep => ep.audioUrl === currentSrc);
    return episode?.id || currentSrc;
  }
  
  saveProgress() {
    if (!this.enableProgressTracking || !this.player) return;
    
    const audioId = this.getCurrentAudioId();
    if (!audioId) return;
    
    const progress = {
      id: audioId,
      progress: this.player.currentTime,
      duration: this.player.duration,
      timestamp: Date.now(),
      completed: this.player.currentTime >= this.player.duration - 1,
      title: this.options.audio?.title
    };
    
    this.progressData[audioId] = progress;
    this.persistProgress();
    this.emit('progressSaved', progress);
  }
  
  persistProgress() {
    try {
      localStorage.setItem('shikwasa_progress', JSON.stringify(this.progressData));
    } catch (e) {
      console.warn('Failed to save progress to localStorage', e);
    }
  }
  
  loadProgress() {
    try {
      const saved = localStorage.getItem('shikwasa_progress');
      return saved ? JSON.parse(saved) : {};
    } catch (e) {
      return {};
    }
  }
  
  markAsCompleted() {
    const audioId = this.getCurrentAudioId();
    if (audioId && this.progressData[audioId]) {
      this.progressData[audioId].completed = true;
      this.persistProgress();
      this.emit('episodeCompleted', this.progressData[audioId]);
      
      if (this.autoNextEpisode && this.currentEpisodeIndex < this.episodes.length - 1) {
        setTimeout(() => this.loadEpisode(this.currentEpisodeIndex + 1), 1000);
      }
    }
  }
  
  // ==================== ЗАКЛАДКИ ====================
  
  addBookmark(note = '') {
    if (!this.enableBookmarks || !this.player) return false;
    
    const bookmark = {
      id: `bm_${Date.now()}_${Math.random()}`,
      time: this.player.currentTime,
      formattedTime: this.formatTime(this.player.currentTime),
      note: note || `Отметка в ${this.formatTime(this.player.currentTime)}`,
      timestamp: Date.now(),
      audioId: this.getCurrentAudioId(),
      audioTitle: this.options.audio?.title
    };
    
    this.bookmarks.push(bookmark);
    this.persistBookmarks();
    this.renderBookmarks();
    this.emit('bookmarkAdded', bookmark);
    this.showNotification('Закладка добавлена!', bookmark.formattedTime);
    
    return bookmark;
  }
  
  persistBookmarks() {
    try {
      localStorage.setItem('shikwasa_bookmarks', JSON.stringify(this.bookmarks));
    } catch (e) {
      console.warn('Failed to save bookmarks', e);
    }
  }
  
  loadBookmarks() {
    try {
      const saved = localStorage.getItem('shikwasa_bookmarks');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  }
  
  removeBookmark(bookmarkId) {
    this.bookmarks = this.bookmarks.filter(b => b.id !== bookmarkId);
    this.persistBookmarks();
    this.renderBookmarks();
    this.emit('bookmarkRemoved', bookmarkId);
  }
  
  renderBookmarks() {
    const container = document.querySelector('.shk-bookmarks-panel');
    if (!container) return;
    
    const currentAudioId = this.getCurrentAudioId();
    const currentBookmarks = this.bookmarks.filter(b => b.audioId === currentAudioId);
    
    if (currentBookmarks.length === 0) {
      container.innerHTML = '<div class="shk-bookmarks-empty">📭 Нет закладок</div>';
      return;
    }
    
    const bookmarksHtml = `
      <div class="shk-bookmarks-list">
        <h4>📌 Закладки (${currentBookmarks.length})</h4>
        ${currentBookmarks.map(b => `
          <div class="shk-bookmark-item" data-id="${b.id}">
            <div class="shk-bookmark-time">⏱️ ${b.formattedTime}</div>
            <div class="shk-bookmark-note">${this.escapeHtml(b.note)}</div>
            <div class="shk-bookmark-actions">
              <button class="shk-bookmark-play" data-time="${b.time}">▶ Перейти</button>
              <button class="shk-bookmark-delete" data-id="${b.id}">🗑️</button>
            </div>
          </div>
        `).join('')}
      </div>
    `;
    
    container.innerHTML = bookmarksHtml;
    
    container.querySelectorAll('.shk-bookmark-play').forEach(btn => {
      btn.addEventListener('click', () => {
        const time = parseFloat(btn.dataset.time);
        if (this.player) {
          this.player.seek(time);
          this.player.play();
        }
      });
    });
    
    container.querySelectorAll('.shk-bookmark-delete').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        this.removeBookmark(id);
      });
    });
  }
  
  // ==================== ИНТЕГРАЦИИ ====================
  
  shareCurrentEpisode(platform = 'twitter') {
    const episode = this.episodes[this.currentEpisodeIndex];
    if (!episode) return;
    
    const currentTime = this.player ? this.player.currentTime : 0;
    const shareText = `Слушаю: ${episode.title}${currentTime > 0 ? ` на ${this.formatTime(currentTime)}` : ''}`;
    const shareUrl = encodeURIComponent(window.location.href);
    const shareTextEncoded = encodeURIComponent(shareText);
    
    let shareLink = '';
    switch(platform) {
      case 'twitter':
        shareLink = `https://twitter.com/intent/tweet?text=${shareTextEncoded}&url=${shareUrl}`;
        break;
      case 'telegram':
        shareLink = `https://t.me/share/url?url=${shareUrl}&text=${shareTextEncoded}`;
        break;
      case 'facebook':
        shareLink = `https://www.facebook.com/sharer/sharer.php?u=${shareUrl}&quote=${shareTextEncoded}`;
        break;
      case 'vk':
        shareLink = `https://vk.com/share.php?url=${shareUrl}&title=${shareTextEncoded}`;
        break;
    }
    
    if (shareLink) {
      window.open(shareLink, '_blank', 'width=600,height=400');
    }
    
    this.emit('shared', { platform, episode, time: currentTime });
  }
  
  showDonationPrompt() {
    if (!this.donationUrl) return;
    
    if (confirm('❤️ Поддержать автора подкаста?')) {
      window.open(this.donationUrl, '_blank');
      this.emit('donationOpened');
    }
  }
  
  // ==================== UI ====================
  
  addCustomUI() {
    if (!this.container) return;
    
    const customUI = document.createElement('div');
    customUI.className = 'shk-custom-controls';
    customUI.innerHTML = `
      <div class="shk-controls-row">
        ${this.enableBookmarks ? `
          <button class="shk-btn-bookmark" title="Добавить закладку">🔖</button>
        ` : ''}
        
        ${this.socialSharing ? `
          <div class="shk-share-dropdown">
            <button class="shk-btn-share">📤 Поделиться</button>
            <div class="shk-share-options">
              <button data-platform="twitter">𝕏 Twitter</button>
              <button data-platform="telegram">📨 Telegram</button>
              <button data-platform="facebook">📘 Facebook</button>
              <button data-platform="vk">💙 VK</button>
            </div>
          </div>
        ` : ''}
        
        ${this.donationUrl ? `
          <button class="shk-btn-donate" title="Поддержать">❤️</button>
        ` : ''}
      </div>
      
      <div class="shk-panels">
        <div class="shk-episode-list"></div>
        ${this.enableBookmarks ? '<div class="shk-bookmarks-panel"></div>' : ''}
      </div>
    `;
    
    this.container.appendChild(customUI);
    
    const bookmarkBtn = customUI.querySelector('.shk-btn-bookmark');
    bookmarkBtn?.addEventListener('click', () => {
      const note = prompt('Введите заметку для закладки (опционально):');
      this.addBookmark(note || '');
    });
    
    if (this.socialSharing) {
      const shareBtn = customUI.querySelector('.shk-btn-share');
      const dropdown = customUI.querySelector('.shk-share-options');
      shareBtn?.addEventListener('click', () => {
        dropdown.classList.toggle('show');
      });
      
      dropdown?.querySelectorAll('[data-platform]').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const platform = btn.dataset.platform;
          this.shareCurrentEpisode(platform);
          dropdown.classList.remove('show');
        });
      });
    }
    
    const donateBtn = customUI.querySelector('.shk-btn-donate');
    donateBtn?.addEventListener('click', () => this.showDonationPrompt());
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
  
  formatDate(dateStr) {
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString();
    } catch {
      return dateStr;
    }
  }
  
  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
  
  showNotification(message, detail = '') {
    const notification = document.createElement('div');
    notification.className = 'shk-notification';
    notification.innerHTML = `
      <div class="shk-notification-content">
        <strong>${this.escapeHtml(message)}</strong>
        ${detail ? `<small>${this.escapeHtml(detail)}</small>` : ''}
      </div>
    `;
    
    document.body.appendChild(notification);
    setTimeout(() => notification.classList.add('show'), 10);
    setTimeout(() => {
      notification.classList.remove('show');
      setTimeout(() => notification.remove(), 300);
    }, 3000);
  }
  
  emit(eventName, data) {
    const customEvent = new CustomEvent(`shikwasa:${eventName}`, { detail: data });
    this.container?.dispatchEvent(customEvent);
  }
}

export { EnhancedPlayer as Player };
