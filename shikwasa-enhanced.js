// shikwasa-enhanced.js
// Расширенная версия Shikwasa с поддержкой RSS, прогресса, закладок и интеграций

import { Player as BasePlayer } from 'shikwasa';
import jsmediatags from 'jsmediatags';

class EnhancedPlayer extends BasePlayer {
  constructor(options) {
    super(options);
    
    // Новые опции
    this.rssUrl = options.rssUrl || null;
    this.enableProgressTracking = options.enableProgressTracking !== false;
    this.enableBookmarks = options.enableBookmarks !== false;
    this.socialSharing = options.socialSharing || false;
    this.donationUrl = options.donationUrl || null;
    
    // Состояние
    this.episodes = [];
    this.currentEpisodeIndex = 0;
    this.bookmarks = this.loadBookmarks();
    this.progressData = this.loadProgress();
    
    // Инициализация
    if (this.rssUrl) {
      this.loadRSSFeed();
    }
    
    if (this.enableProgressTracking && this.progressData[this.getCurrentAudioId()]) {
      this.restoreProgress();
    }
    
    // Добавляем UI элементы
    this.addCustomUI();
    
    // Слушаем события для сохранения прогресса
    if (this.enableProgressTracking) {
      this.on('timeupdate', this.saveProgress.bind(this));
      this.on('ended', this.markAsCompleted.bind(this));
    }
  }
  
  // ==================== RSS ПОДДЕРЖКА ====================
  
  async loadRSSFeed() {
    try {
      // Используем CORS-прокси для обхода ограничений
      const proxyUrl = 'https://api.allorigins.win/raw?url=';
      const response = await fetch(proxyUrl + encodeURIComponent(this.rssUrl));
      const text = await response.text();
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(text, 'text/xml');
      
      // Парсим RSS
      this.episodes = this.parseRSS(xmlDoc);
      
      // Создаем UI для списка эпизодов
      this.renderEpisodeList();
      
      // Триггерим событие
      this.emit('rssLoaded', this.episodes);
      
      // Загружаем первый эпизод если autoplay включен
      if (this.options.autoplay && this.episodes.length > 0) {
        this.loadEpisode(0);
      }
      
    } catch (error) {
      console.error('Failed to load RSS feed:', error);
      this.emit('rssError', error);
    }
  }
  
  parseRSS(xmlDoc) {
    const items = xmlDoc.querySelectorAll('item');
    const episodes = [];
    
    items.forEach((item, index) => {
      const title = item.querySelector('title')?.textContent || 'Untitled';
      const description = item.querySelector('description')?.textContent || '';
      const pubDate = item.querySelector('pubDate')?.textContent || '';
      const enclosure = item.querySelector('enclosure');
      const audioUrl = enclosure?.getAttribute('url');
      
      // Парсим длительность из iTunes тега
      const durationElement = item.querySelector('itunes\\:duration, duration');
      let duration = 0;
      if (durationElement) {
        const durationStr = durationElement.textContent;
        if (durationStr.includes(':')) {
          const parts = durationStr.split(':').map(Number);
          duration = parts.length === 3 
            ? parts[0] * 3600 + parts[1] * 60 + parts[2]
            : parts[0] * 60 + parts[1];
        } else {
          duration = parseInt(durationStr) || 0;
        }
      }
      
      if (audioUrl) {
        episodes.push({
          id: `ep_${index}_${Date.now()}`,
          title,
          description,
          pubDate,
          audioUrl,
          duration,
          cover: item.querySelector('itunes\\:image')?.getAttribute('href') || 
                 xmlDoc.querySelector('itunes\\:image')?.getAttribute('href'),
          played: false,
          progress: 0
        });
      }
    });
    
    return episodes;
  }
  
  renderEpisodeList() {
    const container = document.querySelector('.shk-episode-list');
    if (!container) return;
    
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
                  ${ep.pubDate ? new Date(ep.pubDate).toLocaleDateString() : ''}
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
    
    // Добавляем обработчики
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
    
    // Обновляем плеер
    this.update({
      title: episode.title,
      artist: 'Подкаст',
      cover: episode.cover || this.options.audio?.cover,
      src: episode.audioUrl,
      duration: episode.duration
    });
    
    // Восстанавливаем прогресс
    if (this.progressData[episode.id]) {
      setTimeout(() => {
        this.seek(this.progressData[episode.id].progress);
      }, 100);
    }
    
    this.emit('episodeChange', episode);
    this.play();
  }
  
  // ==================== ЭКСПОРТ ПРОГРЕССА ====================
  
  getCurrentAudioId() {
    const currentSrc = this.options.audio?.src;
    if (!currentSrc) return null;
    
    // Используем URL как ID или находим ID в списке эпизодов
    const episode = this.episodes.find(ep => ep.audioUrl === currentSrc);
    return episode?.id || currentSrc;
  }
  
  saveProgress() {
    if (!this.enableProgressTracking) return;
    
    const audioId = this.getCurrentAudioId();
    if (!audioId) return;
    
    const progress = {
      id: audioId,
      progress: this.currentTime,
      duration: this.duration,
      timestamp: Date.now(),
      completed: this.currentTime >= this.duration - 1,
      title: this.options.audio?.title
    };
    
    this.progressData[audioId] = progress;
    this.persistProgress();
    
    // Триггерим событие
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
  
  restoreProgress() {
    const audioId = this.getCurrentAudioId();
    if (!audioId) return;
    
    const progress = this.progressData[audioId];
    if (progress && progress.progress > 5 && progress.progress < this.duration - 10) {
      // Спрашиваем пользователя
      const shouldRestore = confirm(`Продолжить с ${this.formatTime(progress.progress)}?`);
      if (shouldRestore) {
        this.seek(progress.progress);
      }
    }
  }
  
  markAsCompleted() {
    const audioId = this.getCurrentAudioId();
    if (audioId && this.progressData[audioId]) {
      this.progressData[audioId].completed = true;
      this.persistProgress();
      this.emit('episodeCompleted', this.progressData[audioId]);
      
      // Автоматически загружаем следующий эпизод
      if (this.options.autoNextEpisode && this.currentEpisodeIndex < this.episodes.length - 1) {
        setTimeout(() => this.loadEpisode(this.currentEpisodeIndex + 1), 1000);
      }
    }
  }
  
  // ==================== ЗАКЛАДКИ ====================
  
  addBookmark(note = '') {
    if (!this.enableBookmarks) return false;
    
    const bookmark = {
      id: `bm_${Date.now()}_${Math.random()}`,
      time: this.currentTime,
      formattedTime: this.formatTime(this.currentTime),
      note: note || `Отметка в ${this.formatTime(this.currentTime)}`,
      timestamp: Date.now(),
      audioId: this.getCurrentAudioId(),
      audioTitle: this.options.audio?.title
    };
    
    this.bookmarks.push(bookmark);
    this.persistBookmarks();
    this.renderBookmarks();
    
    this.emit('bookmarkAdded', bookmark);
    
    // Показываем уведомление
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
  
  goToBookmark(bookmark) {
    this.seek(bookmark.time);
    this.play();
    this.emit('bookmarkUsed', bookmark);
  }
  
  renderBookmarks() {
    const container = document.querySelector('.shk-bookmarks-panel');
    if (!container) return;
    
    const currentAudioId = this.getCurrentAudioId();
    const currentBookmarks = this.bookmarks.filter(b => b.audioId === currentAudioId);
    
    if (currentBookmarks.length === 0) {
      container.innerHTML = '<div class="shk-bookmarks-empty">Нет закладок</div>';
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
    
    // Добавляем обработчики
    container.querySelectorAll('.shk-bookmark-play').forEach(btn => {
      btn.addEventListener('click', () => {
        const time = parseFloat(btn.dataset.time);
        this.seek(time);
        this.play();
      });
    });
    
    container.querySelectorAll('.shk-bookmark-delete').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        this.removeBookmark(id);
      });
    });
  }
  
  // ==================== ИНТЕГРАЦИЯ С ВНЕШНИМИ СЕРВИСАМИ ====================
  
  shareCurrentEpisode(platform = 'twitter') {
    const episode = this.episodes[this.currentEpisodeIndex];
    if (!episode) return;
    
    const currentTime = this.currentTime;
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
    if (!this.donationUrl) {
      console.warn('No donation URL provided');
      return;
    }
    
    const modal = document.createElement('div');
    modal.className = 'shk-donation-modal';
    modal.innerHTML = `
      <div class="shk-donation-content">
        <h3>❤️ Поддержите подкаст</h3>
        <p>Если вам нравится этот подкаст, вы можете поддержать авторов!</p>
        <button class="shk-donation-button">Поддержать</button>
        <button class="shk-donation-close">Закрыть</button>
      </div>
    `;
    
    document.body.appendChild(modal);
    
    modal.querySelector('.shk-donation-button').addEventListener('click', () => {
      window.open(this.donationUrl, '_blank');
      modal.remove();
      this.emit('donationOpened');
    });
    
    modal.querySelector('.shk-donation-close').addEventListener('click', () => {
      modal.remove();
    });
    
    // Показываем модальное окно раз в 5 прослушанных эпизодов
    const completedCount = Object.values(this.progressData).filter(p => p.completed).length;
    if (completedCount % 5 === 0 && completedCount > 0) {
      setTimeout(() => modal.classList.add('show'), 1000);
    }
  }
  
  // ==================== UI КОМПОНЕНТЫ ====================
  
  addCustomUI() {
    // Находим контейнер плеера
    const container = this.options.container;
    if (!container || typeof container === 'function') return;
    
    // Создаем дополнительный UI
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
        ${this.rssUrl ? '<div class="shk-episode-list"></div>' : ''}
        ${this.enableBookmarks ? '<div class="shk-bookmarks-panel"></div>' : ''}
      </div>
    `;
    
    container.appendChild(customUI);
    
    // Добавляем обработчики
    if (this.enableBookmarks) {
      const bookmarkBtn = customUI.querySelector('.shk-btn-bookmark');
      bookmarkBtn?.addEventListener('click', () => {
        const note = prompt('Введите заметку для закладки (опционально):');
        this.addBookmark(note || '');
      });
    }
    
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
    
    if (this.donationUrl) {
      const donateBtn = customUI.querySelector('.shk-btn-donate');
      donateBtn?.addEventListener('click', () => this.showDonationPrompt());
    }
  }
  
  // ==================== ВСПОМОГАТЕЛЬНЫЕ МЕТОДЫ ====================
  
  formatTime(seconds) {
    if (isNaN(seconds)) return '0:00';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  }
  
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
  
  showNotification(message, detail = '') {
    const notification = document.createElement('div');
    notification.className = 'shk-notification';
    notification.innerHTML = `
      <div class="shk-notification-content">
        <strong>${message}</strong>
        ${detail ? `<small>${detail}</small>` : ''}
      </div>
    `;
    
    document.body.appendChild(notification);
    setTimeout(() => notification.classList.add('show'), 10);
    setTimeout(() => {
      notification.classList.remove('show');
      setTimeout(() => notification.remove(), 300);
    }, 3000);
  }
  
  // Эмит событий (добавляем, если нет в базовом классе)
  emit(eventName, data) {
    const customEvent = new CustomEvent(`shikwasa:${eventName}`, { detail: data });
    this.container?.dispatchEvent(customEvent);
  }
}

export { EnhancedPlayer as Player };