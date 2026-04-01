// shikwasa-enhanced.js
// Исправленная версия с корректной обработкой аудио

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
    this.rssService = options.rssService || 'rss2json';
    
    // Состояние
    this.episodes = [];
    this.currentEpisodeIndex = 0;
    this.bookmarks = this.loadBookmarks();
    this.progressData = this.loadProgress();
    this.player = null;
    this.isInitialized = false;
    
    // Инициализация
    this.init();
  }
  
  async init() {
    // Ждем загрузки Shikwasa
    if (typeof Shikwasa === 'undefined') {
      console.log('Waiting for Shikwasa...');
      await this.waitForShikwasa();
    }
    
    this.initOriginalPlayer();
    this.setupProgressTracking();
    this.addCustomUI();
    
    if (this.rssUrl) {
      await this.loadRSSFeed();
    }
  }
  
  waitForShikwasa() {
    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        if (typeof Shikwasa !== 'undefined' && Shikwasa.Player) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 100);
      
      // Таймаут через 5 секунд
      setTimeout(() => {
        clearInterval(checkInterval);
        console.error('Shikwasa failed to load');
        resolve();
      }, 5000);
    });
  }
  
  initOriginalPlayer() {
    try {
      // Создаем копию опций для оригинального плеера
      const playerOptions = {
        container: this.options.container,
        audio: this.options.audio ? { ...this.options.audio } : null,
        themeColor: this.options.themeColor || '#764ba2',
        theme: this.options.theme || 'auto',
        autoplay: this.options.autoplay || false,
        muted: this.options.muted || false,
        preload: this.options.preload || 'metadata',
        speedOptions: this.options.speedOptions || [0.5, 0.75, 1, 1.25, 1.5, 2],
        download: this.options.download || false
      };
      
      this.player = new Shikwasa.Player(playerOptions);
      this.isInitialized = true;
      
      // Проксируем методы
      this.play = () => {
        if (this.player && this.player.play) {
          return this.player.play();
        }
        return Promise.reject('Player not ready');
      };
      
      this.pause = () => {
        if (this.player && this.player.pause) {
          this.player.pause();
        }
      };
      
      this.toggle = () => {
        if (this.player && this.player.toggle) {
          return this.player.toggle();
        }
        return Promise.reject('Player not ready');
      };
      
      this.seek = (time) => {
        if (this.player && this.player.seek) {
          this.player.seek(time);
        }
      };
      
      this.update = (audio) => {
        if (this.player && this.player.update) {
          // Обновляем опции
          this.options.audio = { ...this.options.audio, ...audio };
          this.player.update(audio);
        } else {
          console.warn('Player not ready for update');
        }
      };
      
      this.destroy = () => {
        if (this.player && this.player.destroy) {
          this.player.destroy();
        }
        if (this.progressInterval) {
          clearInterval(this.progressInterval);
        }
      };
      
      this.on = (event, callback) => {
        if (this.player && this.player.on) {
          this.player.on(event, callback);
        }
      };
      
      // Свойства
      Object.defineProperty(this, 'currentTime', {
        get: () => this.player ? this.player.currentTime : 0
      });
      
      Object.defineProperty(this, 'duration', {
        get: () => this.player ? this.player.duration : 0
      });
      
      Object.defineProperty(this, 'playbackRate', {
        get: () => this.player ? this.player.playbackRate : 1,
        set: (val) => { if (this.player) this.player.playbackRate = val; }
      });
      
      console.log('✅ Original Shikwasa player initialized');
      
    } catch (error) {
      console.error('Failed to initialize Shikwasa:', error);
    }
  }
  
  setupProgressTracking() {
    if (!this.enableProgressTracking) return;
    
    // Сохраняем прогресс каждые 5 секунд
    this.progressInterval = setInterval(() => {
      if (this.player && this.player.currentTime > 0) {
        this.saveProgress();
      }
    }, 5000);
    
    // При завершении
    if (this.player) {
      this.player.on('ended', () => {
        this.markAsCompleted();
      });
    }
  }
  
  // ==================== RSS ПОДДЕРЖКА ====================
  
  async loadRSSFeed() {
    if (!this.rssUrl) return;
    
    try {
      let feedData;
      
      // Определяем тип RSS
      if (this.rssUrl.endsWith('.json')) {
        feedData = await this.loadJSONFeed();
      } else if (this.rssUrl.startsWith('http://') || this.rssUrl.startsWith('https://')) {
        feedData = await this.loadExternalRSS();
      } else {
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
    // Используем rss2json.com
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
    
    const parserError = xmlDoc.querySelector('parsererror');
    if (parserError) {
      throw new Error('Invalid XML format');
    }
    
    return this.parseXMLFeed(xmlDoc);
  }
  
  parseFeedData(data) {
    if (data.version && data.version.includes('https://jsonfeed.org')) {
      return this.parseJSONFeed(data);
    }
    if (data.feed && data.items) {
      return this.parseRSS2JSON(data);
    }
    if (data.querySelector) {
      return this.parseXMLFeed(data);
    }
    return [];
  }
  
  parseJSONFeed(json) {
    const episodes = [];
    json.items.forEach((item, index) => {
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
      const enclosure = item.querySelector('enclosure');
      const audioUrl = enclosure?.getAttribute('url');
      
      if (!audioUrl) return;
      
      let duration = 0;
      const durationElement = item.querySelector('itunes\\:duration, duration');
      if (durationElement) {
        duration = this.parseDuration(durationElement.textContent);
      }
      
      let cover = feedImage;
      const itunesImage = item.querySelector('itunes\\:image');
      if (itunesImage) {
        cover = itunesImage.getAttribute('href');
      }
      
      episodes.push({
        id: `ep_${index}_${Date.now()}`,
        title: title,
        description: item.querySelector('description')?.textContent || '',
        pubDate: item.querySelector('pubDate')?.textContent || '',
        audioUrl: audioUrl,
        duration: duration,
        cover: cover,
        played: false,
        progress: 0
      });
    });
    
    return episodes;
  }
  
  parseDuration(durationStr) {
    if (!durationStr) return 0;
    if (!isNaN(durationStr)) return parseInt(durationStr);
    
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
    if (!container) return;
    
    if (this.episodes.length === 0) {
      container.innerHTML = '<div class="shk-no-episodes">📭 Нет эпизодов. Проверьте RSS ссылку.</div>';
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
    
    // Обновляем активный класс в UI
    this.updateActiveEpisodeInUI(index);
    
    // Обновляем плеер
    if (this.player && this.player.update) {
      const audioData = {
        title: episode.title,
        artist: 'Подкаст',
        src: episode.audioUrl,
        cover: episode.cover || this.options.audio?.cover
      };
      
      if (episode.duration) {
        audioData.duration = episode.duration;
      }
      
      console.log('Loading episode:', audioData);
      this.player.update(audioData);
      
      // Небольшая задержка перед воспроизведением
      setTimeout(() => {
        if (this.player && this.player.play) {
          this.player.play().catch(err => {
            console.warn('Autoplay blocked:', err);
          });
        }
      }, 100);
    } else {
      console.error('Player not ready');
    }
    
    // Восстанавливаем прогресс
    if (this.progressData[episode.id] && this.player) {
      setTimeout(() => {
        if (this.player && this.player.seek) {
          this.player.seek(this.progressData[episode.id].progress);
        }
      }, 200);
    }
    
    this.emit('episodeChange', episode);
  }
  
  updateActiveEpisodeInUI(index) {
    const container = document.querySelector('.shk-episode-list');
    if (!container) return;
    
    container.querySelectorAll('.shk-episode-item').forEach((item, i) => {
      if (i === index) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });
  }
  
  // ==================== ПРОГРЕСС ====================
  
  getCurrentAudioId() {
    if (!this.options.audio?.src) return null;
    const episode = this.episodes.find(ep => ep.audioUrl === this.options.audio.src);
    return episode?.id || this.options.audio.src;
  }
  
  saveProgress() {
    if (!this.enableProgressTracking || !this.player) return;
    
    const audioId = this.getCurrentAudioId();
    if (!audioId) return;
    
    const progress = {
      id: audioId,
      progress: this.player.currentTime || 0,
      duration: this.player.duration || 0,
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
      console.warn('Failed to save progress', e);
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
      time: this.player.currentTime || 0,
      formattedTime: this.formatTime(this.player.currentTime || 0),
      note: note || `Отметка в ${this.formatTime(this.player.currentTime || 0)}`,
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
        if (this.player && this.player.seek) {
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
          <button class="shk-btn-bookmark" title="Добавить закладку">🔖 Закладка</button>
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
          <button class="shk-btn-donate" title="Поддержать">❤️ Поддержать</button>
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
    notification.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: #333;
      color: white;
      padding: 12px 20px;
      border-radius: 8px;
      z-index: 10000;
      opacity: 0;
      transform: translateY(100px);
      transition: all 0.3s;
      font-size: 14px;
    `;
    
    document.body.appendChild(notification);
    setTimeout(() => {
      notification.style.opacity = '1';
      notification.style.transform = 'translateY(0)';
    }, 10);
    setTimeout(() => {
      notification.style.opacity = '0';
      notification.style.transform = 'translateY(100px)';
      setTimeout(() => notification.remove(), 300);
    }, 3000);
  }
  
  emit(eventName, data) {
    const customEvent = new CustomEvent(`shikwasa:${eventName}`, { detail: data });
    this.container?.dispatchEvent(customEvent);
  }
}

// Экспортируем класс
export { EnhancedPlayer as Player };
