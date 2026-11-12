import {
  formatAllMarkdown,
  formatCommentMarkdown,
  isOpenStatus,
  statusLabel,
} from './shared.js';

const API = '/__review';
const HOST_ID = 'pin-note-root';
const LOCAL_KEY = 'pin-note:comments:v1';
const TOOLBAR_KEY = 'pin-note:toolbar-position:v1';
const LOCAL_FALLBACK_SUFFIX = 'local';
const PIN_OFFSET = 20;
const SHOT_COLORS = ['#ff5d5d', '#ff9f43', '#ffd93d', '#48d597', '#4dd0e1', '#5b8cff', '#b57bff'];
const SHOT_MAX_SIDE = 2200;

const STATIC_HTML = `
  <div class="pn-highlight" data-role="highlight" hidden>
    <span class="pn-highlight-label" data-role="highlight-label"></span>
  </div>
  <div class="pn-pins" data-role="pins"></div>
  <div class="pn-toolbar" role="toolbar" aria-label="Комментарии к сайту">
    <button type="button" class="pn-grip" data-role="grip" aria-label="Перетащить панель" title="Перетащить">⠿</button>
    <button type="button" class="pn-btn pn-btn-primary" data-action="mode" aria-pressed="false"></button>
    <button type="button" class="pn-btn pn-btn-ghost" data-action="panel" aria-label="Открыть список комментариев">
      <span class="pn-count" data-role="count">0</span>
      <span>Комментарии</span>
    </button>
  </div>
  <aside class="pn-panel" data-role="panel" aria-label="Комментарии" hidden>
    <header class="pn-panel-head">
      <div>
        <div class="pn-eyebrow">Review mode</div>
        <h2>Комментарии <span data-role="panel-count"></span></h2>
      </div>
      <button type="button" class="pn-icon-btn" data-action="close-panel" aria-label="Закрыть">×</button>
    </header>
    <div class="pn-filters" role="tablist" aria-label="Фильтр комментариев">
      <button type="button" class="pn-chip is-active" data-action="filter" data-filter="all">Все</button>
      <button type="button" class="pn-chip" data-action="filter" data-filter="open">Открытые</button>
      <button type="button" class="pn-chip" data-action="filter" data-filter="resolved">Решённые</button>
    </div>
    <div class="pn-list" data-role="list"></div>
    <footer class="pn-panel-foot">
      <div class="pn-server" data-role="server"></div>
      <div class="pn-foot-actions">
        <button type="button" class="pn-btn pn-btn-primary" data-action="copy-all">Скопировать для агента</button>
        <button type="button" class="pn-btn pn-btn-ghost" data-action="refresh">Обновить</button>
      </div>
    </footer>
  </aside>
  <div class="pn-popover" data-role="popover" role="dialog" aria-label="Новый комментарий" hidden>
    <div class="pn-popover-head">
      <div class="pn-target">
        <span class="pn-target-tag" data-role="target-tag"></span>
        <span class="pn-target-text" data-role="target-text"></span>
      </div>
      <button type="button" class="pn-icon-btn" data-action="cancel" aria-label="Закрыть">×</button>
    </div>
    <div class="pn-shot-row">
      <button type="button" class="pn-btn pn-btn-ghost pn-shot-trigger" data-action="capture-screenshot">Скриншот элемента</button>
      <div class="pn-shot-preview" data-role="shot-preview" hidden>
        <img data-role="shot-preview-img" alt="Прикреплённый скриншот">
        <button type="button" class="pn-icon-btn pn-shot-remove" data-action="remove-screenshot" aria-label="Убрать скриншот">×</button>
      </div>
    </div>
    <textarea data-role="comment-input" rows="4" placeholder="Что изменить? Например: сделай заголовок крупнее и добавь отступ…"></textarea>
    <div class="pn-popover-foot">
      <span class="pn-hint">⌘↵ — сохранить<br>Alt/Option+клик — выше по дереву</span>
      <div class="pn-popover-actions">
        <button type="button" class="pn-btn pn-btn-ghost" data-action="cancel">Отмена</button>
        <button type="button" class="pn-btn pn-btn-primary" data-action="save" disabled>Сохранить</button>
      </div>
    </div>
  </div>
  <div class="pn-toast" data-role="toast" role="status" hidden></div>
  <div class="pn-annotator" data-role="annotator" hidden>
    <div class="pn-annotator-card" role="dialog" aria-modal="true" aria-label="Аннотация скриншота">
      <div class="pn-annotator-head">
        <div>
          <div class="pn-eyebrow">Скриншот</div>
          <strong>Нарисуй пометки на изображении</strong>
        </div>
        <button type="button" class="pn-icon-btn" data-action="close-annotator" aria-label="Закрыть">×</button>
      </div>
      <div class="pn-annotator-stage">
        <canvas data-role="annotator-canvas"></canvas>
      </div>
      <div class="pn-annotator-foot">
        <div class="pn-annotator-colors" data-role="annotator-colors" aria-label="Цвет линии"></div>
        <div class="pn-annotator-actions">
          <button type="button" class="pn-btn pn-btn-ghost" data-action="annotator-undo">Отменить</button>
          <button type="button" class="pn-btn pn-btn-ghost" data-action="annotator-clear">Очистить</button>
          <button type="button" class="pn-btn pn-btn-ghost" data-action="annotator-cancel">Отмена</button>
          <button type="button" class="pn-btn pn-btn-primary" data-action="annotator-attach">Прикрепить</button>
        </div>
      </div>
    </div>
  </div>
`;

class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

class ReviewClient {
  constructor(host, shadow) {
    this.host = host;
    this.shadow = shadow;
    this.app = shadow.querySelector('.pn-app') || null;
    this.refs = {};
    this.pinElements = new Map();
    if (!this.app) throw new Error('Review UI root was not found');
    this.state = {
      comments: [],
      mode: false,
      panel: false,
      filter: 'all',
      activeId: null,
      server: false,
      config: {},
      compose: null,
      annotator: null,
      hovered: null,
      flash: null,
      pendingReload: false,
      reloadScheduled: false,
      busy: false,
      hintShown: false,
      eventSource: null,
      toastTimer: null,
      highlightRaf: 0,
      pinsRaf: 0,
    };
  }

  async boot() {
    this.captureRefs();
    this.host.dataset.filter = this.state.filter;
    this.host.dataset.panel = this.state.panel ? 'open' : 'closed';
    this.bindUi();
    this.bindToolbarDrag();
    this.restoreToolbarPosition();
    this.bindPage();
    await this.loadInitial();
    this.renderAll();
    this.startTicker();
  }

  captureRefs() {
    const find = (role) => this.shadow.querySelector(`[data-role="${role}"]`);
    this.refs = {
      highlight: find('highlight'),
      highlightLabel: find('highlight-label'),
      pins: find('pins'),
      toolbar: this.shadow.querySelector('.pn-toolbar'),
      grip: find('grip'),
      panel: find('panel'),
      list: find('list'),
      count: find('count'),
      panelCount: find('panel-count'),
      server: find('server'),
      popover: find('popover'),
      targetTag: find('target-tag'),
      targetText: find('target-text'),
      input: find('comment-input'),
      toast: find('toast'),
      modeButton: this.shadow.querySelector('[data-action="mode"]'),
      saveButton: this.shadow.querySelector('[data-action="save"]'),
      filters: [...this.shadow.querySelectorAll('[data-action="filter"]')],
      panelButton: this.shadow.querySelector('[data-action="panel"]'),
      shotPreview: find('shot-preview'),
      shotPreviewImg: find('shot-preview-img'),
      annotator: find('annotator'),
      annotatorCanvas: find('annotator-canvas'),
      annotatorColors: find('annotator-colors'),
    };
    this.refs.modeButton.innerHTML = '<span class="pn-dot"></span><span data-role="mode-label">Комментировать</span>';
    this.refs.modeLabel = this.shadow.querySelector('[data-role="mode-label"]');
  }

  bindUi() {
    this.app.addEventListener('click', (event) => {
      const target = event.target.closest?.('[data-action]');
      if (!target || !this.app.contains(target)) return;
      event.preventDefault();
      event.stopPropagation();
      this.handleAction(target.dataset.action, target.dataset.id, target.dataset.filter, target.dataset.color);
    });

    this.app.addEventListener('input', (event) => {
      if (event.target !== this.refs.input) return;
      this.refs.saveButton.disabled = !event.target.value.trim();
    });

    this.app.addEventListener('keydown', (event) => {
      if (event.target !== this.refs.input) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        this.closeCompose();
        return;
      }
      if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        event.stopPropagation();
        this.saveDraft();
      }
    });

    this.refs.pins.addEventListener('mouseover', (event) => {
      const pin = event.target.closest?.('.pn-pin');
      if (!pin) return;
      const comment = this.findComment(pin.dataset.id);
      const element = comment ? this.resolveAnchor(comment.anchor) : null;
      if (!element) return;
      this.state.hovered = element;
      this.scheduleHighlight();
    });

    this.refs.pins.addEventListener('mouseout', (event) => {
      if (event.relatedTarget?.closest?.('.pn-pin')) return;
      this.state.hovered = null;
      this.scheduleHighlight();
    });

    const canvas = this.refs.annotatorCanvas;
    if (canvas) {
      canvas.addEventListener('pointerdown', (event) => this.onAnnotatorPointerDown(event));
      canvas.addEventListener('pointermove', (event) => this.onAnnotatorPointerMove(event));
      canvas.addEventListener('pointerup', (event) => this.onAnnotatorPointerUp(event));
      canvas.addEventListener('pointercancel', (event) => this.onAnnotatorPointerUp(event));
    }
  }

  bindToolbarDrag() {
    const { toolbar, grip } = this.refs;
    if (!toolbar || !grip) return;
    let drag = null;

    const clamp = () => {
      if (toolbar.style.right !== 'auto') return;
      const width = toolbar.offsetWidth;
      const height = toolbar.offsetHeight;
      const maxLeft = Math.max(4, innerWidth - width - 4);
      const maxTop = Math.max(4, innerHeight - height - 4);
      const left = Math.min(maxLeft, Math.max(4, Number.parseFloat(toolbar.style.left) || 4));
      const top = Math.min(maxTop, Math.max(4, Number.parseFloat(toolbar.style.top) || 4));
      toolbar.style.left = `${Math.round(left)}px`;
      toolbar.style.top = `${Math.round(top)}px`;
    };

    const move = (event) => {
      if (!drag) return;
      const maxLeft = Math.max(4, innerWidth - toolbar.offsetWidth - 4);
      const maxTop = Math.max(4, innerHeight - toolbar.offsetHeight - 4);
      const left = Math.min(maxLeft, Math.max(4, event.clientX - drag.offsetX));
      const top = Math.min(maxTop, Math.max(4, event.clientY - drag.offsetY));
      toolbar.style.left = `${Math.round(left)}px`;
      toolbar.style.top = `${Math.round(top)}px`;
    };

    const stop = () => {
      drag = null;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
      this.saveToolbarPosition();
    };

    grip.addEventListener('pointerdown', (event) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      const rect = toolbar.getBoundingClientRect();
      drag = {
        offsetX: event.clientX - rect.left,
        offsetY: event.clientY - rect.top,
      };
      toolbar.style.left = `${Math.round(rect.left)}px`;
      toolbar.style.top = `${Math.round(rect.top)}px`;
      toolbar.style.right = 'auto';
      toolbar.style.bottom = 'auto';
      window.addEventListener('pointermove', move, { passive: false });
      window.addEventListener('pointerup', stop);
      window.addEventListener('pointercancel', stop);
      try {
        grip.setPointerCapture(event.pointerId);
      } catch {
        // Pointer capture is an enhancement.
      }
    });

    window.addEventListener('resize', clamp, { passive: true });
  }

  restoreToolbarPosition() {
    const { toolbar } = this.refs;
    if (!toolbar) return;
    try {
      const raw = localStorage.getItem(TOOLBAR_KEY);
      if (!raw) return;
      const position = JSON.parse(raw);
      if (!Number.isFinite(position?.left) || !Number.isFinite(position?.top)) return;
      toolbar.style.right = 'auto';
      toolbar.style.bottom = 'auto';
      toolbar.style.left = `${position.left}px`;
      toolbar.style.top = `${position.top}px`;
      const width = toolbar.offsetWidth;
      const height = toolbar.offsetHeight;
      const left = Math.min(Math.max(4, position.left), Math.max(4, innerWidth - width - 4));
      const top = Math.min(Math.max(4, position.top), Math.max(4, innerHeight - height - 4));
      toolbar.style.left = `${Math.round(left)}px`;
      toolbar.style.top = `${Math.round(top)}px`;
    } catch {
      // Ignore invalid saved positions.
    }
  }

  saveToolbarPosition() {
    const { toolbar } = this.refs;
    if (!toolbar || toolbar.style.right !== 'auto') return;
    try {
      localStorage.setItem(
        TOOLBAR_KEY,
        JSON.stringify({
          left: Math.round(Number.parseFloat(toolbar.style.left) || 0),
          top: Math.round(Number.parseFloat(toolbar.style.top) || 0),
        })
      );
    } catch {
      // Storage may be unavailable.
    }
  }

  bindPage() {
    document.addEventListener('pointermove', (event) => this.onPagePointerMove(event), true);
    document.addEventListener('click', (event) => this.onPageClick(event), true);
    document.addEventListener('submit', (event) => this.onPageSubmit(event), true);
    document.addEventListener('keydown', (event) => this.onPageKeydown(event), true);
    const onViewportChange = () => {
      this.scheduleHighlight();
      this.schedulePins();
      if (this.state.compose) this.positionPopover(this.state.compose.element);
    };
    document.addEventListener('scroll', onViewportChange, true);
    window.addEventListener('scroll', onViewportChange, { passive: true });
    window.addEventListener('resize', onViewportChange, { passive: true });
  }

  startTicker() {
    setInterval(() => {
      if (document.hidden) return;
      if (this.state.flash && this.state.flash.until <= Date.now()) this.state.flash = null;
      if (this.state.comments.length > 0) this.schedulePins();
      if (this.state.hovered || this.state.flash) this.scheduleHighlight();
    }, 650);
  }

  isUiEvent(event) {
    return event.composedPath().includes(this.host);
  }

  targetElement(event) {
    const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
    for (const node of path) {
      if (node instanceof Element && !this.host.contains(node)) return node;
    }
    return event.target instanceof Element ? event.target : null;
  }

  onPagePointerMove(event) {
    if (!this.state.mode || this.state.compose) return;
    if (event.pointerType && event.pointerType !== 'mouse' && event.pointerType !== 'pen') return;
    if (this.isUiEvent(event)) return;
    const element = this.targetElement(event);
    if (!element) return;
    this.state.hovered = element;
    this.scheduleHighlight();
  }

  onPageClick(event) {
    if (!this.state.mode || event.button !== 0 || this.isUiEvent(event)) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    const clicked = this.targetElement(event);
    if (!clicked) return;

    if (!event.altKey) {
      this.openCompose(clicked, event);
      return;
    }

    const current = this.state.compose?.element;
    if (current?.isConnected && (current === clicked || current.contains(clicked))) {
      this.selectParent(event);
      return;
    }

    const parent = clicked.parentElement;
    if (!parent || parent === document.documentElement) return;
    this.openCompose(parent, event);
  }

  onPageSubmit(event) {
    if (!this.state.mode || this.isUiEvent(event)) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
  }

  onPageKeydown(event) {
    if (event.key !== 'Escape') return;
    if (this.state.annotator) {
      event.preventDefault();
      this.closeAnnotator();
      return;
    }
    if (this.state.compose) {
      event.preventDefault();
      this.closeCompose();
      return;
    }
    if (this.state.panel) {
      event.preventDefault();
      this.closePanel();
      return;
    }
    if (this.state.mode) {
      event.preventDefault();
      this.setMode(false);
    }
  }

  async loadInitial() {
    try {
      const [config, data] = await Promise.all([this.api('/config'), this.api('/comments')]);
      this.state.config = config || {};
      this.state.comments = Array.isArray(data?.comments) ? data.comments : [];
      this.state.server = true;
      this.saveLocal();
      this.connectEvents();
    } catch {
      this.state.server = false;
      this.state.config = {
        project: location.hostname || 'website',
        projectId: `${LOCAL_FALLBACK_SUFFIX}:${location.origin}${location.pathname}`,
        commentsFile: '.review/comments.json',
      };
      this.state.comments = this.loadLocal();
    }
  }

  connectEvents() {
    if (!this.state.server || typeof EventSource === 'undefined') return;
    const source = new EventSource(`${API}/events`);
    source.addEventListener('comments', () => this.refreshFromServer());
    source.addEventListener('reload', () => this.onServerReload());
    this.state.eventSource = source;
  }

  async refreshFromServer() {
    if (!this.state.server) return false;
    try {
      const data = await this.api('/comments');
      this.state.comments = Array.isArray(data?.comments) ? data.comments : [];
      this.saveLocal();
      this.renderAll();
      if (this.state.panel) this.renderPanel();
      return true;
    } catch {
      // Keep the last known state; EventSource will reconnect on its own.
      return false;
    }
  }

  onServerReload() {
    if (this.state.reloadScheduled) return;
    if (this.state.compose) {
      if (this.state.pendingReload) return;
      this.state.pendingReload = true;
      this.toast('Сайт обновился. Перезагрузка после закрытия комментария.');
      return;
    }
    this.state.reloadScheduled = true;
    this.toast('Сайт обновился, перезагружаю…');
    setTimeout(() => location.reload(), 350);
  }

  maybeReload() {
    if (!this.state.pendingReload) return;
    this.state.pendingReload = false;
    this.state.reloadScheduled = true;
    setTimeout(() => location.reload(), 250);
  }

  async api(path, options = {}) {
    const headers = { ...(options.headers || {}) };
    if (options.body !== undefined) headers['content-type'] = 'application/json';
    const response = await fetch(`${API}${path}`, {
      ...options,
      headers,
      cache: 'no-store',
    });
    if (!response.ok) {
      let message = `HTTP ${response.status}`;
      try {
        const data = await response.json();
        if (data?.error) message = data.error;
      } catch {
        // Ignore non-JSON error bodies.
      }
      throw new ApiError(message, response.status);
    }
    if (response.status === 204) return null;
    const type = response.headers.get('content-type') || '';
    if (type.includes('application/json')) return response.json();
    return response.text();
  }

  localStorageKey() {
    const projectId = this.state.config?.projectId;
    if (projectId) return `${LOCAL_KEY}:${projectId}`;
    return `${LOCAL_KEY}:${LOCAL_FALLBACK_SUFFIX}:${location.origin}${location.pathname}`;
  }

  loadLocal() {
    try {
      const raw = localStorage.getItem(this.localStorageKey());
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      const comments = Array.isArray(parsed) ? parsed : parsed?.comments;
      return Array.isArray(comments)
        ? comments.filter((comment) => comment && typeof comment === 'object')
        : [];
    } catch {
      return [];
    }
  }

  saveLocal() {
    try {
      localStorage.setItem(
        this.localStorageKey(),
        JSON.stringify({
          version: 1,
          updatedAt: new Date().toISOString(),
          comments: this.state.comments,
        })
      );
    } catch {
      // Storage can be unavailable in private mode; the in-memory state still works.
    }
  }

  setMode(active) {
    this.state.mode = Boolean(active);
    this.refs.modeButton.setAttribute('aria-pressed', String(this.state.mode));
    this.refs.modeLabel.textContent = this.state.mode ? 'Готово' : 'Комментировать';
    this.app.classList.toggle('is-commenting', this.state.mode);
    if (!this.state.mode) {
      this.state.hovered = null;
      this.closeCompose({ reload: false });
      this.scheduleHighlight();
      this.maybeReload();
      return;
    }
    this.setPanel(false);
    if (!this.state.hintShown) {
      this.state.hintShown = true;
      this.toast('Кликните по элементу. Alt/Option+клик — подняться по дереву.');
    }
  }

  setPanel(open) {
    this.state.panel = Boolean(open);
    this.refs.panel.hidden = !this.state.panel;
    this.host.dataset.panel = this.state.panel ? 'open' : 'closed';
    this.app.classList.toggle('has-panel', this.state.panel);
    if (this.state.panel) this.renderPanel();
  }

  openPanel() {
    this.setPanel(true);
  }

  closePanel() {
    this.setPanel(false);
  }

  openCompose(element, event) {
    this.clearScreenshot();
    const anchor = this.captureAnchor(element, event);
    const rect = element.getBoundingClientRect();
    this.state.compose = {
      element,
      anchor,
      screenshot: null,
      click: event
        ? { offsetX: event.clientX - rect.left, offsetY: event.clientY - rect.top }
        : null,
    };
    this.state.hovered = element;
    this.state.activeId = null;
    this.setPanel(false);
    this.refs.targetTag.textContent = `<${element.localName}>`;
    const text = anchor.text ? `«${anchor.text.slice(0, 110)}»` : anchor.selector;
    this.refs.targetText.textContent = text;
    this.refs.targetText.title = anchor.selector;
    this.refs.input.value = '';
    this.refs.saveButton.disabled = true;
    this.refs.popover.hidden = false;
    this.positionPopover(element);
    this.scheduleHighlight();
    requestAnimationFrame(() => this.refs.input.focus());
  }

  selectParent(event) {
    const compose = this.state.compose;
    if (!compose) return;
    const parent = compose.element?.parentElement;
    if (!parent || parent === document.documentElement) {
      this.toast('Выше уже некуда');
      return;
    }
    this.updateComposeTarget(parent, event);
  }

  updateComposeTarget(element, event) {
    this.clearScreenshot();
    const anchor = this.captureAnchor(element, event);
    const rect = element.getBoundingClientRect();
    this.state.compose = {
      element,
      anchor,
      screenshot: null,
      click: event
        ? { offsetX: event.clientX - rect.left, offsetY: event.clientY - rect.top }
        : null,
    };
    this.state.hovered = element;
    this.refs.targetTag.textContent = `<${element.localName}>`;
    const text = anchor.text ? `«${anchor.text.slice(0, 110)}»` : anchor.selector;
    this.refs.targetText.textContent = text;
    this.refs.targetText.title = anchor.selector;
    this.positionPopover(element);
    this.scheduleHighlight();
  }

  clearScreenshot() {
    const shot = this.state.compose?.screenshot;
    if (shot?.previewUrl) URL.revokeObjectURL(shot.previewUrl);
    if (this.state.compose) this.state.compose.screenshot = null;
    if (this.refs.shotPreview) this.refs.shotPreview.hidden = true;
    if (this.refs.shotPreviewImg) this.refs.shotPreviewImg.removeAttribute('src');
  }

  async captureScreenshot() {
    const compose = this.state.compose;
    if (!compose) return;
    if (!this.state.server) {
      this.toast('Скриншоты доступны только с review-сервером', 'error');
      return;
    }
    if (!navigator.mediaDevices?.getDisplayMedia) {
      this.toast('Браузер не поддерживает захват вкладки', 'error');
      return;
    }

    let stream = null;
    let video = null;
    try {
      try {
        stream = await navigator.mediaDevices.getDisplayMedia({
          video: { displaySurface: 'browser' },
          audio: false,
          preferCurrentTab: true,
        });
      } catch (err) {
        if (err?.name === 'NotAllowedError') return;
        stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      }

      const track = stream.getVideoTracks()[0];
      if (!track) throw new Error('Не удалось получить видеопоток');
      const surface = track.getSettings?.().displaySurface;
      video = document.createElement('video');
      video.muted = true;
      video.playsInline = true;
      video.srcObject = stream;
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Не удалось получить кадр')), 6000);
        video.onloadedmetadata = () => {
          clearTimeout(timer);
          resolve();
        };
        video.onerror = () => {
          clearTimeout(timer);
          reject(new Error('Не удалось прочитать видеопоток'));
        };
      });
      await video.play();

      if (this.state.compose !== compose) return;
      if (surface && surface !== 'browser') {
        throw new Error('Выбери вкладку с сайтом, а не окно или экран');
      }
      const videoRatio = video.videoWidth / video.videoHeight;
      const viewportRatio = innerWidth / innerHeight;
      if (Math.abs(videoRatio - viewportRatio) > 0.04) {
        throw new Error('Выбери вкладку с сайтом, а не окно или экран');
      }

      const element = compose.element.isConnected ? compose.element : null;
      const rect = element
        ? element.getBoundingClientRect()
        : { left: 0, top: 0, right: innerWidth, bottom: innerHeight };
      const padding = 16;
      let left = Math.max(0, Math.min(rect.left, rect.right) - padding);
      let top = Math.max(0, Math.min(rect.top, rect.bottom) - padding);
      let right = Math.min(innerWidth, Math.max(rect.left, rect.right) + padding);
      let bottom = Math.min(innerHeight, Math.max(rect.top, rect.bottom) + padding);
      if (right - left < 8 || bottom - top < 8) {
        left = 0;
        top = 0;
        right = innerWidth;
        bottom = innerHeight;
      }

      const scaleX = video.videoWidth / innerWidth;
      const scaleY = video.videoHeight / innerHeight;
      const sourceWidth = (right - left) * scaleX;
      const sourceHeight = (bottom - top) * scaleY;
      const scale = Math.min(1, SHOT_MAX_SIDE / Math.max(sourceWidth, sourceHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(sourceWidth * scale));
      canvas.height = Math.max(1, Math.round(sourceHeight * scale));
      const context = canvas.getContext('2d');

      const previousVisibility = this.host.style.visibility;
      this.host.style.visibility = 'hidden';
      try {
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        await new Promise((resolve) => setTimeout(resolve, 120));
        context.drawImage(
          video,
          left * scaleX,
          top * scaleY,
          sourceWidth,
          sourceHeight,
          0,
          0,
          canvas.width,
          canvas.height
        );
      } finally {
        this.host.style.visibility = previousVisibility;
      }

      this.openAnnotator(canvas);
    } catch (err) {
      if (err?.name !== 'NotAllowedError') {
        this.toast(err.message || 'Не удалось сделать скриншот', 'error');
      }
    } finally {
      for (const track of stream?.getTracks?.() || []) track.stop();
      if (video) video.srcObject = null;
    }
  }

  openAnnotator(sourceCanvas) {
    const base = document.createElement('canvas');
    base.width = sourceCanvas.width;
    base.height = sourceCanvas.height;
    base.getContext('2d').drawImage(sourceCanvas, 0, 0);

    const canvas = this.refs.annotatorCanvas;
    canvas.width = base.width;
    canvas.height = base.height;
    const ctx = canvas.getContext('2d');
    this.state.annotator = {
      base,
      canvas,
      ctx,
      strokes: [],
      current: null,
      color: SHOT_COLORS[0],
      lineWidth: Math.max(2, Math.round(base.width / 240)),
    };
    this.renderAnnotatorColors();
    this.renderAnnotator();
    this.refs.annotator.hidden = false;
    this.host.dataset.annotator = 'open';
  }

  renderAnnotatorColors() {
    const container = this.refs.annotatorColors;
    if (!container) return;
    container.replaceChildren();
    for (const color of SHOT_COLORS) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'pn-color';
      button.dataset.action = 'annotator-color';
      button.dataset.color = color;
      button.style.setProperty('--pn-color', color);
      button.title = color;
      button.setAttribute('aria-label', `Цвет линии ${color}`);
      container.append(button);
    }
    this.syncAnnotatorColor();
  }

  syncAnnotatorColor() {
    const color = this.state.annotator?.color;
    for (const button of this.refs.annotatorColors?.children || []) {
      const active = button.dataset.color === color;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    }
  }

  setAnnotatorColor(color) {
    if (!this.state.annotator || !SHOT_COLORS.includes(color)) return;
    this.state.annotator.color = color;
    this.syncAnnotatorColor();
  }

  annotatorPoint(event) {
    const canvas = this.refs.annotatorCanvas;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) * canvas.width) / Math.max(1, rect.width),
      y: ((event.clientY - rect.top) * canvas.height) / Math.max(1, rect.height),
    };
  }

  onAnnotatorPointerDown(event) {
    const annotator = this.state.annotator;
    if (!annotator || event.button !== 0) return;
    event.preventDefault();
    annotator.current = {
      color: annotator.color,
      width: annotator.lineWidth,
      points: [this.annotatorPoint(event)],
      pointerId: event.pointerId,
    };
    try {
      this.refs.annotatorCanvas.setPointerCapture?.(event.pointerId);
    } catch {
      // Synthetic pointer events and older browsers may not support capture.
    }
    this.renderAnnotator();
  }

  onAnnotatorPointerMove(event) {
    const annotator = this.state.annotator;
    if (!annotator?.current || annotator.current.pointerId !== event.pointerId) return;
    event.preventDefault();
    annotator.current.points.push(this.annotatorPoint(event));
    this.renderAnnotator();
  }

  onAnnotatorPointerUp(event) {
    const annotator = this.state.annotator;
    if (!annotator?.current || annotator.current.pointerId !== event.pointerId) return;
    event.preventDefault();
    annotator.strokes.push(annotator.current);
    annotator.current = null;
    try {
      this.refs.annotatorCanvas.releasePointerCapture?.(event.pointerId);
    } catch {
      // Ignore.
    }
    this.renderAnnotator();
  }

  renderAnnotator() {
    const annotator = this.state.annotator;
    if (!annotator) return;
    const { ctx, base, strokes, current } = annotator;
    ctx.clearRect(0, 0, base.width, base.height);
    ctx.drawImage(base, 0, 0);
    for (const stroke of strokes) this.drawAnnotationStroke(ctx, stroke);
    if (current) this.drawAnnotationStroke(ctx, current);
  }

  drawAnnotationStroke(ctx, stroke) {
    const points = stroke.points || [];
    if (points.length === 0) return;
    ctx.save();
    ctx.strokeStyle = stroke.color;
    ctx.fillStyle = stroke.color;
    ctx.lineWidth = stroke.width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (points.length === 1) {
      ctx.beginPath();
      ctx.arc(points[0].x, points[0].y, stroke.width / 2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (const point of points.slice(1)) ctx.lineTo(point.x, point.y);
      ctx.stroke();
    }
    ctx.restore();
  }

  undoAnnotation() {
    if (!this.state.annotator) return;
    this.state.annotator.strokes.pop();
    this.renderAnnotator();
  }

  clearAnnotation() {
    if (!this.state.annotator) return;
    this.state.annotator.strokes = [];
    this.state.annotator.current = null;
    this.renderAnnotator();
  }

  closeAnnotator() {
    this.state.annotator = null;
    this.refs.annotator.hidden = true;
    delete this.host.dataset.annotator;
  }

  async attachAnnotation() {
    const annotator = this.state.annotator;
    if (!annotator || !this.state.compose) return;
    const blob = await new Promise((resolve) => annotator.canvas.toBlob(resolve, 'image/png'));
    if (!blob) {
      this.toast('Не удалось подготовить скриншот', 'error');
      return;
    }
    this.clearScreenshot();
    const previewUrl = URL.createObjectURL(blob);
    this.state.compose.screenshot = {
      blob,
      width: annotator.canvas.width,
      height: annotator.canvas.height,
      previewUrl,
    };
    this.refs.shotPreviewImg.src = previewUrl;
    this.refs.shotPreview.hidden = false;
    this.positionPopover(this.state.compose.element);
    this.closeAnnotator();
    this.toast('Скриншот прикреплён');
  }

  async uploadScreenshot(shot) {
    const width = Math.round(shot.width || 0);
    const height = Math.round(shot.height || 0);
    const response = await fetch(`${API}/screenshots?width=${width}&height=${height}`, {
      method: 'POST',
      headers: { 'content-type': 'image/png' },
      body: shot.blob,
    });
    if (!response.ok) {
      let message = `HTTP ${response.status}`;
      try {
        const data = await response.json();
        if (data?.error) message = data.error;
      } catch {
        // Ignore non-JSON errors.
      }
      throw new ApiError(message, response.status);
    }
    const data = await response.json();
    return data.screenshot;
  }

  positionPopover(element) {
    const rect = element.isConnected ? element.getBoundingClientRect() : null;
    const fallback = this.state.compose?.anchor?.rect;
    let box = null;
    if (rect && (rect.width || rect.height)) {
      box = {
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      };
    } else if (fallback) {
      box = {
        left: Number(fallback.x) || 0,
        top: Number(fallback.y) || 0,
        right: (Number(fallback.x) || 0) + (Number(fallback.width) || 0),
        bottom: (Number(fallback.y) || 0) + (Number(fallback.height) || 0),
        width: Number(fallback.width) || 0,
        height: Number(fallback.height) || 0,
      };
    }
    if (!box) return;
    const popover = this.refs.popover;
    const width = popover.getBoundingClientRect().width || 340;
    const height = popover.getBoundingClientRect().height || 220;
    const margin = 12;
    const click = this.state.compose?.click;
    const anchorX = click ? box.left + click.offsetX : box.left;
    const anchorY = click ? box.top + click.offsetY : box.bottom;
    const maxLeft = Math.max(margin, innerWidth - width - margin);
    let left = anchorX + 14;
    if (left + width > innerWidth - margin) left = anchorX - width - 14;
    left = Math.min(maxLeft, Math.max(margin, left));
    let top = anchorY + 14;
    if (top + height > innerHeight - margin) top = anchorY - height - 14;
    top = Math.min(Math.max(margin, top), Math.max(margin, innerHeight - height - margin));
    popover.style.left = `${Math.round(left)}px`;
    popover.style.top = `${Math.round(top)}px`;
  }

  closeCompose({ reload = true } = {}) {
    if (!this.state.compose) return;
    this.clearScreenshot();
    this.state.compose = null;
    this.refs.popover.hidden = true;
    this.refs.input.value = '';
    this.refs.input.blur();
    this.refs.saveButton.disabled = true;
    this.state.hovered = null;
    this.scheduleHighlight();
    if (reload) this.maybeReload();
  }

  async saveDraft() {
    const compose = this.state.compose;
    const commentText = this.refs.input.value.trim();
    if (!compose || !commentText || this.state.busy) return;
    this.state.busy = true;
    this.refs.saveButton.disabled = true;
    const payload = {
      comment: commentText,
      url: location.href,
      anchor: compose.anchor,
    };

    if (compose.screenshot?.blob) {
      if (!this.state.server) {
        this.state.busy = false;
        this.refs.saveButton.disabled = false;
        this.toast('Скриншоты доступны только с review-сервером', 'error');
        return;
      }
      try {
        payload.screenshot = await this.uploadScreenshot(compose.screenshot);
      } catch (err) {
        this.state.busy = false;
        this.refs.saveButton.disabled = false;
        this.toast(err.message || 'Не удалось загрузить скриншот', 'error');
        return;
      }
    }

    let saved = null;
    let usedLocalFallback = false;
    if (this.state.server) {
      try {
        const data = await this.api('/comments', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        saved = data?.comment;
      } catch (err) {
        if (err instanceof ApiError && err.status >= 400 && err.status < 500) {
          this.state.busy = false;
          this.refs.saveButton.disabled = false;
          this.toast(err.message || 'Не удалось сохранить комментарий', 'error');
          return;
        }
        this.state.server = false;
        usedLocalFallback = true;
      }
    }

    if (!saved) {
      saved = this.createLocalComment(payload);
      usedLocalFallback = true;
    }

    if (!this.state.comments.some((comment) => comment.id === saved.id)) {
      this.state.comments.push(saved);
    }
    this.state.busy = false;
    this.saveLocal();
    this.closeCompose({ reload: false });
    this.renderAll();
    this.toast(
      usedLocalFallback
        ? 'Сервер недоступен — комментарий сохранён локально'
        : 'Комментарий добавлен',
      usedLocalFallback ? 'error' : ''
    );
    this.maybeReload();
  }

  createLocalComment(payload) {
    const now = new Date().toISOString();
    const comment = {
      id: `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
      status: 'open',
      comment: payload.comment,
      url: payload.url,
      anchor: payload.anchor,
      sourceHints: [],
      resolution: '',
      createdAt: now,
      updatedAt: now,
    };
    if (payload.screenshot) comment.screenshot = payload.screenshot;
    return comment;
  }

  captureAnchor(element, event) {
    const rect = element.getBoundingClientRect();
    const attributes = {};
    let attributeCount = 0;
    for (const attribute of element.attributes) {
      if (attributeCount >= 20) break;
      if (attribute.name === 'style' || attribute.name.startsWith('on')) continue;
      attributes[attribute.name] = String(attribute.value).slice(0, 600);
      attributeCount += 1;
    }

    const point =
      event && rect.width > 0 && rect.height > 0
        ? {
            x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
            y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
          }
        : null;

    return {
      selector: this.uniqueSelector(element),
      xpath: this.xpath(element),
      tag: element.localName,
      text: this.elementText(element).slice(0, 600),
      html: this.outerHtml(element).slice(0, 5000),
      ancestors: this.ancestors(element),
      attributes,
      rect: {
        x: Math.round(rect.left),
        y: Math.round(rect.top),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      },
      point,
      viewport: {
        width: innerWidth,
        height: innerHeight,
        dpr: Number(devicePixelRatio.toFixed(2)),
      },
      scroll: {
        x: Math.round(scrollX),
        y: Math.round(scrollY),
      },
      styles: this.styles(element),
    };
  }

  outerHtml(element) {
    try {
      return element.outerHTML || `<${element.localName}>`;
    } catch {
      return `<${element.localName}>`;
    }
  }

  elementText(element) {
    const tag = element.localName;
    if (tag === 'input' || tag === 'textarea') {
      return element.value || element.getAttribute('placeholder') || '';
    }
    if (tag === 'img') {
      return element.alt || element.getAttribute('title') || '';
    }
    try {
      return (element.innerText || element.textContent || '').replace(/\s+/g, ' ').trim();
    } catch {
      return '';
    }
  }

  styles(element) {
    const properties = [
      'display',
      'position',
      'width',
      'height',
      'font-family',
      'font-size',
      'font-weight',
      'line-height',
      'color',
      'background-color',
      'margin',
      'padding',
      'border',
      'border-radius',
      'gap',
      'flex-direction',
      'justify-content',
      'align-items',
      'text-align',
      'box-shadow',
      'opacity',
      'transform',
    ];
    try {
      const computed = getComputedStyle(element);
      const result = {};
      for (const property of properties) {
        const value = computed.getPropertyValue(property);
        if (value) result[property] = value.slice(0, 300);
      }
      return result;
    } catch {
      return {};
    }
  }

  ancestors(element) {
    const chain = [];
    let node = element.parentElement;
    while (node && chain.length < 6) {
      chain.push(this.describeElement(node, false));
      node = node.parentElement;
    }
    return chain;
  }

  describeElement(element, withText = true) {
    if (!element || element.nodeType !== 1) return '';
    const id = element.id ? `#${element.id}` : '';
    const classes = this.stableClasses(element)
      .slice(0, 2)
      .map((name) => `.${name}`)
      .join('');
    const text = withText ? this.elementText(element).slice(0, 70) : '';
    return `${element.localName}${id}${classes}${text ? ` · «${text}»` : ''}`;
  }

  stableClasses(element) {
    return [...element.classList].filter((name) => {
      if (name.length < 2 || name.length > 40) return false;
      if (/^[a-f0-9]{8,}$/i.test(name)) return false;
      if (/^(is-|has-)/.test(name)) return false;
      return !['active', 'open', 'show', 'visible', 'hidden', 'selected', 'current'].includes(name);
    });
  }

  uniqueSelector(element) {
    if (!(element instanceof Element)) return '';
    if (element.id && this.isUnique(`#${this.escapeCss(element.id)}`, element)) {
      return `#${this.escapeCss(element.id)}`;
    }
    const parts = [];
    let node = element;
    while (node && node.nodeType === 1) {
      if (node === document.documentElement) {
        parts.unshift('html');
        break;
      }
      if (node.id) {
        const idSelector = `#${this.escapeCss(node.id)}`;
        if (this.isUnique(idSelector, node)) {
          parts.unshift(idSelector);
          break;
        }
      }
      let part = node.localName;
      const classes = this.stableClasses(node).slice(0, 2);
      if (classes.length > 0) {
        part += `.${classes.map((name) => this.escapeCss(name)).join('.')}`;
      }
      const parent = node.parentElement;
      if (parent) {
        const siblings = [...parent.children].filter((sibling) => sibling.localName === node.localName);
        if (siblings.length > 1) {
          part += `:nth-of-type(${siblings.indexOf(node) + 1})`;
        }
      }
      parts.unshift(part);
      const selector = parts.join(' > ');
      if (this.isUnique(selector, node)) return selector;
      node = parent;
    }
    return parts.join(' > ');
  }

  isUnique(selector, element) {
    try {
      const found = document.querySelectorAll(selector);
      return found.length === 1 && found[0] === element;
    } catch {
      return false;
    }
  }

  escapeCss(value) {
    if (globalThis.CSS?.escape) return CSS.escape(value);
    return String(value).replace(/[^a-zA-Z0-9_-]/g, (character) => `\\${character}`);
  }

  xpath(element) {
    if (!(element instanceof Element)) return '';
    const parts = [];
    let node = element;
    while (node && node.nodeType === 1) {
      let index = 1;
      let sibling = node.previousElementSibling;
      while (sibling) {
        if (sibling.localName === node.localName) index += 1;
        sibling = sibling.previousElementSibling;
      }
      parts.unshift(`${node.localName}[${index}]`);
      node = node.parentElement;
    }
    return `/${parts.join('/')}`;
  }

  resolveAnchor(anchor) {
    if (!anchor || typeof anchor !== 'object') return null;
    if (anchor.selector) {
      try {
        const element = document.querySelector(anchor.selector);
        if (element) return element;
      } catch {
        // Try the next locator.
      }
    }
    if (anchor.xpath) {
      try {
        const result = document.evaluate(
          anchor.xpath,
          document,
          null,
          XPathResult.FIRST_ORDERED_NODE_TYPE,
          null
        );
        if (result.singleNodeValue instanceof Element) return result.singleNodeValue;
      } catch {
        // Try the next locator.
      }
    }
    if (anchor.tag && typeof anchor.text === 'string' && anchor.text.trim().length >= 3) {
      const text = anchor.text.trim();
      try {
        const candidates = [...document.getElementsByTagName(anchor.tag)].filter(
          (element) => this.elementText(element) === text
        );
        if (candidates.length === 1) return candidates[0];
      } catch {
        // Give up.
      }
    }
    return null;
  }

  scheduleHighlight() {
    if (this.state.highlightRaf) return;
    this.state.highlightRaf = requestAnimationFrame(() => {
      this.state.highlightRaf = 0;
      this.renderHighlight();
    });
  }

  renderHighlight() {
    const flashActive = this.state.flash && this.state.flash.until > Date.now();
    const element =
      this.state.hovered?.isConnected
        ? this.state.hovered
        : flashActive && this.state.flash.element?.isConnected
          ? this.state.flash.element
          : null;
    if (!element) {
      this.refs.highlight.hidden = true;
      return;
    }
    const rect = element.getBoundingClientRect();
    if (!rect.width && !rect.height) {
      this.refs.highlight.hidden = true;
      return;
    }
    this.refs.highlight.hidden = false;
    this.refs.highlight.classList.toggle('is-flash', Boolean(flashActive && element === this.state.flash?.element));
    this.refs.highlight.style.left = `${Math.round(rect.left)}px`;
    this.refs.highlight.style.top = `${Math.round(rect.top)}px`;
    this.refs.highlight.style.width = `${Math.round(rect.width)}px`;
    this.refs.highlight.style.height = `${Math.round(rect.height)}px`;
    this.refs.highlightLabel.textContent = this.describeElement(element);
    this.refs.highlightLabel.style.top = rect.top < 30 ? '4px' : '-25px';
  }

  schedulePins() {
    if (this.state.pinsRaf) return;
    this.state.pinsRaf = requestAnimationFrame(() => {
      this.state.pinsRaf = 0;
      this.renderPins();
    });
  }

  renderPins() {
    if (document.hidden) return;
    const seen = new Set();
    const offsets = new Map();
    this.filteredComments().forEach((comment) => {
      const element = this.resolveAnchor(comment.anchor);
      if (!element) return;
      const rect = element.getBoundingClientRect();
      if ((!rect.width && !rect.height) || rect.right < 0 || rect.left > innerWidth) return;
      if (rect.bottom < -30 || rect.top > innerHeight + 30) return;
      const offset = (offsets.get(element) || 0) * PIN_OFFSET;
      offsets.set(element, (offsets.get(element) || 0) + 1);
      const number = this.state.comments.findIndex((item) => item.id === comment.id) + 1;

      let pin = this.pinElements.get(comment.id);
      if (!pin || !pin.isConnected) {
        pin = document.createElement('button');
        pin.type = 'button';
        pin.dataset.action = 'focus';
        pin.dataset.id = comment.id;
        this.pinElements.set(comment.id, pin);
        this.refs.pins.append(pin);
      }
      pin.className = `pn-pin status-${comment.status || 'open'}${comment.id === this.state.activeId ? ' is-active' : ''}`;
      pin.textContent = String(number || 1);
      pin.title = comment.comment || comment.id;
      pin.setAttribute('aria-label', `Комментарий ${number || 1}`);
      pin.style.left = `${Math.round(Math.min(innerWidth - 28, Math.max(4, rect.left - 10 + offset)))}px`;
      pin.style.top = `${Math.round(Math.min(innerHeight - 28, Math.max(4, rect.top - 10)))}px`;
      seen.add(comment.id);
    });

    for (const [id, pin] of this.pinElements) {
      if (seen.has(id)) continue;
      pin.remove();
      this.pinElements.delete(id);
    }
  }

  renderAll() {
    this.updateCounts();
    this.updateServerNote();
    this.renderPanelIfOpen();
    this.schedulePins();
    this.scheduleHighlight();
  }

  updateCounts() {
    const openCount = this.state.comments.filter((comment) => isOpenStatus(comment.status)).length;
    this.refs.count.textContent = String(openCount);
    this.refs.count.title = `${openCount} открытых`;
    this.refs.panelCount.textContent = this.state.comments.length ? `(${this.state.comments.length})` : '';
    this.refs.panelButton.setAttribute(
      'aria-label',
      `Открыть комментарии, ${openCount} открытых`
    );
  }

  updateServerNote() {
    const local = !this.state.server;
    const project = this.state.config.project || 'website';
    this.refs.server.classList.toggle('is-local', local);
    if (local) {
      this.refs.server.textContent =
        `Проект: ${project} · локальный режим: комментарии в localStorage. Запусти review-сервер, чтобы писать в .review/comments.json.`;
    } else {
      const file = this.state.config.commentsFile || '.review/comments.json';
      this.refs.server.textContent = `Проект: ${project} · файл: ${file} · изменения подхватываются автоматически`;
    }
  }

  renderPanelIfOpen() {
    if (this.state.panel) this.renderPanel();
  }

  filteredComments() {
    const comments = [...this.state.comments];
    if (this.state.filter === 'open') return comments.filter((comment) => isOpenStatus(comment.status));
    if (this.state.filter === 'resolved') {
      return comments.filter((comment) => !isOpenStatus(comment.status));
    }
    return comments;
  }

  renderPanel() {
    const list = this.filteredComments();
    this.refs.list.replaceChildren();
    this.host.dataset.filter = this.state.filter;
    this.refs.panel.dataset.filter = this.state.filter;
    this.updateCounts();
    this.updateServerNote();
    for (const filter of this.refs.filters) {
      filter.classList.toggle('is-active', filter.dataset.filter === this.state.filter);
    }

    if (list.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'pn-empty';
      const title = document.createElement('strong');
      title.textContent = this.state.comments.length ? 'Ничего не найдено' : 'Пока нет комментариев';
      const hint = document.createElement('span');
      hint.textContent = this.state.comments.length
        ? 'Смени фильтр или добавь новый комментарий.'
        : 'Нажми «Комментировать», затем кликни по элементу на странице.';
      empty.append(title, hint);
      this.refs.list.append(empty);
      return;
    }

    const fragment = document.createDocumentFragment();
    list.forEach((comment) => {
      const number = this.state.comments.findIndex((item) => item.id === comment.id) + 1;
      fragment.append(this.renderCommentCard(comment, number || 1));
    });
    this.refs.list.append(fragment);
    const active = this.refs.list.querySelector('.pn-comment.is-active');
    active?.scrollIntoView({ block: 'nearest' });
  }

  renderCommentCard(comment, number) {
    const status = comment.status || 'open';
    const element = this.resolveAnchor(comment.anchor);
    const card = document.createElement('article');
    card.className = `pn-comment status-${status}${comment.id === this.state.activeId ? ' is-active' : ''}`;
    card.dataset.action = 'focus';
    card.dataset.id = comment.id;

    const head = document.createElement('div');
    head.className = 'pn-comment-head';
    const dot = document.createElement('span');
    dot.className = 'pn-status-dot';
    const idLabel = document.createElement('span');
    idLabel.className = 'pn-comment-id';
    idLabel.textContent = `#${number} · ${comment.id}`;
    const badge = document.createElement('span');
    badge.className = `pn-status-badge status-${status}`;
    badge.textContent = statusLabel(status);
    const time = document.createElement('time');
    time.className = 'pn-comment-time';
    time.textContent = this.formatTime(comment.createdAt);
    head.append(dot, idLabel, badge, time);

    const body = document.createElement('p');
    body.className = 'pn-comment-text';
    body.textContent = comment.comment || '';

    const resolution = comment.resolution
      ? document.createElement('div')
      : null;
    if (resolution) {
      resolution.className = 'pn-resolution';
      resolution.textContent = `Решение: ${comment.resolution}`;
    }

    const meta = document.createElement('div');
    meta.className = 'pn-comment-meta';
    if (comment.anchor?.tag) {
      const elementLine = document.createElement('div');
      const tag = document.createElement('code');
      tag.textContent = `<${comment.anchor.tag}>`;
      elementLine.append(tag);
      const text = this.cleanText(comment.anchor.text, 90);
      if (text) elementLine.append(document.createTextNode(` «${text}»`));
      meta.append(elementLine);
    }
    if (comment.anchor?.selector) {
      const selector = document.createElement('div');
      selector.textContent = comment.anchor.selector;
      meta.append(selector);
    }
    if (!element) {
      const missing = document.createElement('div');
      missing.textContent = 'Элемент не найден в текущем DOM';
      missing.style.color = 'var(--pn-red)';
      meta.append(missing);
    }
    if (Array.isArray(comment.sourceHints) && comment.sourceHints.length > 0) {
      const hint = document.createElement('div');
      hint.textContent = comment.sourceHints
        .slice(0, 3)
        .map((item) => `${item.file}${item.line ? `:${item.line}` : ''}`)
        .join(', ');
      meta.append(hint);
    }
    const page = this.pageLabel(comment.url);
    if (page) {
      const pageLine = document.createElement('div');
      pageLine.textContent = page;
      meta.append(pageLine);
    }

    const actions = document.createElement('div');
    actions.className = 'pn-comment-actions';
    if (element) {
      actions.append(this.actionButton('Показать', 'focus', comment.id));
    }
    actions.append(
      this.actionButton(
        isOpenStatus(comment.status) ? 'Решить' : 'Вернуть',
        'toggle-status',
        comment.id
      ),
      this.actionButton('Копировать', 'copy-one', comment.id),
      this.actionButton('Удалить', 'delete', comment.id, 'pn-action-danger')
    );

    card.append(head, body);
    if (resolution) card.append(resolution);
    if (comment.screenshot?.file) card.append(this.renderCommentScreenshot(comment.screenshot));
    card.append(meta, actions);
    return card;
  }

  screenshotUrl(file) {
    return `${API}/screenshots/${encodeURIComponent(String(file).split('/').pop())}`;
  }

  renderCommentScreenshot(screenshot) {
    const link = document.createElement('a');
    link.className = 'pn-comment-shot';
    link.href = this.screenshotUrl(screenshot.file);
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.title = 'Открыть скриншот';
    link.addEventListener('click', (event) => event.stopPropagation());
    const image = document.createElement('img');
    image.src = link.href;
    image.alt = 'Скриншот к комментарию';
    image.loading = 'lazy';
    image.addEventListener('error', () => link.remove());
    link.append(image);
    return link;
  }

  actionButton(label, action, id, extraClass = '') {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `pn-action ${extraClass}`.trim();
    button.dataset.action = action;
    button.dataset.id = id;
    button.textContent = label;
    return button;
  }

  cleanText(value, limit) {
    const text = String(value || '').replace(/\s+/g, ' ').trim();
    if (text.length <= limit) return text;
    return `${text.slice(0, limit - 1)}…`;
  }

  formatTime(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('ru-RU', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  }

  pageLabel(url) {
    if (!url) return '';
    try {
      const parsed = new URL(url);
      const current = `${location.pathname}${location.search}${location.hash}`;
      const target = `${parsed.pathname}${parsed.search}${parsed.hash}`;
      return target === current ? '' : `Страница: ${target}`;
    } catch {
      return '';
    }
  }

  async handleAction(action, id, filter, color) {
    switch (action) {
      case 'mode':
        this.setMode(!this.state.mode);
        break;
      case 'panel':
        this.setPanel(!this.state.panel);
        break;
      case 'close-panel':
        this.closePanel();
        break;
      case 'filter':
        this.state.filter = filter || 'all';
        this.state.hovered = null;
        this.state.flash = null;
        this.host.dataset.filter = this.state.filter;
        this.refs.panel.dataset.filter = this.state.filter;
        this.renderPanel();
        this.schedulePins();
        this.scheduleHighlight();
        break;
      case 'capture-screenshot':
        await this.captureScreenshot();
        break;
      case 'remove-screenshot':
        this.clearScreenshot();
        break;
      case 'annotator-color':
        this.setAnnotatorColor(color);
        break;
      case 'annotator-undo':
        this.undoAnnotation();
        break;
      case 'annotator-clear':
        this.clearAnnotation();
        break;
      case 'annotator-cancel':
      case 'close-annotator':
        this.closeAnnotator();
        break;
      case 'annotator-attach':
        await this.attachAnnotation();
        break;
      case 'save':
        await this.saveDraft();
        break;
      case 'cancel':
        this.closeCompose();
        break;
      case 'refresh':
        await this.refresh();
        break;
      case 'copy-all':
        await this.copyAll();
        break;
      case 'focus':
        this.focusComment(id);
        break;
      case 'toggle-status':
        await this.toggleStatus(id);
        break;
      case 'copy-one':
        await this.copyOne(id);
        break;
      case 'delete':
        await this.deleteComment(id);
        break;
      default:
        break;
    }
  }

  async refresh() {
    if (this.state.server) {
      const ok = await this.refreshFromServer();
      this.toast(ok ? 'Комментарии обновлены' : 'Не удалось получить комментарии', ok ? '' : 'error');
    } else {
      this.state.comments = this.loadLocal();
      this.renderAll();
      this.toast('Локальные комментарии обновлены');
    }
  }

  findComment(id) {
    return this.state.comments.find((comment) => comment.id === id) || null;
  }

  focusComment(id) {
    const comment = this.findComment(id);
    if (!comment) return;
    if (this.state.compose) {
      this.closeCompose({ reload: false });
      this.maybeReload();
    }
    this.state.activeId = id;
    this.openPanel();
    const element = this.resolveAnchor(comment.anchor);
    if (!element) {
      this.toast('Элемент не найден в текущем DOM. Возможно, разметка изменилась.', 'error');
      this.renderPanel();
      this.schedulePins();
      return;
    }
    element.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
    this.state.flash = { element, until: Date.now() + 1600 };
    this.scheduleHighlight();
    setTimeout(() => this.scheduleHighlight(), 1700);
    this.renderPanel();
    this.schedulePins();
  }

  async toggleStatus(id) {
    const comment = this.findComment(id);
    if (!comment) return;
    const nextStatus = isOpenStatus(comment.status) ? 'resolved' : 'open';
    await this.updateComment(id, { status: nextStatus });
  }

  async updateComment(id, patch) {
    if (this.state.server) {
      try {
        const data = await this.api(`/comments/${encodeURIComponent(id)}`, {
          method: 'PATCH',
          body: JSON.stringify(patch),
        });
        const comment = this.findComment(id);
        if (comment && data?.comment) Object.assign(comment, data.comment);
      } catch (err) {
        this.toast(err.message || 'Не удалось обновить комментарий', 'error');
        return;
      }
    } else {
      const comment = this.findComment(id);
      if (!comment) return;
      Object.assign(comment, patch);
      comment.updatedAt = new Date().toISOString();
      if (patch.status) {
        comment.resolvedAt = patch.status === 'resolved' ? new Date().toISOString() : null;
      }
    }
    this.saveLocal();
    this.renderAll();
    this.toast(patch.status === 'resolved' ? 'Комментарий решён' : 'Статус обновлён');
  }

  async deleteComment(id) {
    if (!window.confirm('Удалить комментарий?')) return;
    if (this.state.server) {
      try {
        await this.api(`/comments/${encodeURIComponent(id)}`, { method: 'DELETE' });
      } catch (err) {
        this.toast(err.message || 'Не удалось удалить комментарий', 'error');
        return;
      }
    }
    this.state.comments = this.state.comments.filter((comment) => comment.id !== id);
    if (this.state.activeId === id) this.state.activeId = null;
    this.saveLocal();
    this.renderAll();
    this.toast('Комментарий удалён');
  }

  async copyAll() {
    if (this.state.comments.length === 0) {
      this.toast('Комментариев пока нет');
      return;
    }
    const markdown = formatAllMarkdown(this.state.comments, {
      project: this.state.config.project || location.hostname || 'website',
      updatedAt: new Date().toISOString(),
    });
    const copied = await this.copyText(markdown);
    if (copied) this.toast('Markdown скопирован — вставь его в чат агенту');
    else this.download('feedback.md', markdown);
  }

  async copyOne(id) {
    const comment = this.findComment(id);
    if (!comment) return;
    const markdown = formatCommentMarkdown(comment);
    const copied = await this.copyText(markdown);
    if (copied) this.toast('Комментарий скопирован');
    else this.download(`${comment.id}.md`, markdown);
  }

  async copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall back to a temporary textarea for non-secure localhost contexts.
    }
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
    document.body.append(textarea);
    textarea.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    textarea.remove();
    return ok;
  }

  download(filename, text) {
    const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.style.display = 'none';
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    this.toast(`Скачан ${filename}`);
  }

  toast(message, type = '') {
    const { toast } = this.refs;
    toast.textContent = message;
    toast.classList.toggle('is-error', type === 'error');
    toast.hidden = false;
    if (this.state.toastTimer) clearTimeout(this.state.toastTimer);
    this.state.toastTimer = setTimeout(() => {
      toast.hidden = true;
      this.state.toastTimer = null;
    }, 3200);
  }
}

async function boot() {
  if (document.getElementById(HOST_ID)) return;
  const host = document.createElement('div');
  host.id = HOST_ID;
  host.setAttribute('data-pin-note', '');
  const shadow = host.attachShadow({ mode: 'open' });
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `${API}/client.css`;
  shadow.append(link);
  (document.documentElement || document.body).append(host);
  await new Promise((resolvePromise) => {
    link.addEventListener('load', resolvePromise, { once: true });
    link.addEventListener('error', resolvePromise, { once: true });
    setTimeout(resolvePromise, 1500);
  });
  const app = document.createElement('div');
  app.className = 'pn-app';
  app.innerHTML = STATIC_HTML;
  shadow.append(app);
  const client = new ReviewClient(host, shadow);
  await client.boot();
}

boot().catch((err) => {
  console.error('[pin-note]', err);
});
