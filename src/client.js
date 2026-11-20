import {
  formatAllMarkdown,
  formatCommentMarkdown,
  formatTaskDate,
  isOpenStatus,
  statusLabel,
  taskStatusLabel,
  taskTitle,
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
    <button type="button" class="pn-btn pn-mode-btn" data-action="mode" aria-pressed="false" aria-label="Комментировать" title="Комментировать">
      <svg class="pn-mode-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5 9.9 9.9 0 0 1-4.2-.9L3 20.8l1.6-4.9A8.5 8.5 0 1 1 21 11.5Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
      </svg>
    </button>
    <span class="pn-count" data-role="count" aria-live="polite">0</span>
    <button type="button" class="pn-btn pn-panel-toggle" data-action="panel" aria-label="Открыть панель комментариев" aria-expanded="false" title="Открыть панель">
      <svg class="pn-panel-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="m14 6-6 6 6 6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </button>
  </div>
  <aside class="pn-panel" data-role="panel" aria-label="Комментарии" hidden>
    <header class="pn-panel-head">
      <div class="pn-head-actions">
        <button type="button" class="pn-icon-btn" data-action="refresh" aria-label="Обновить комментарии" title="Обновить">
          <svg class="pn-refresh-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M20 12a8 8 0 1 1-2.34-5.66M20 4v5h-5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
        <button type="button" class="pn-icon-btn" data-action="close-panel" aria-label="Закрыть">×</button>
      </div>
    </header>
    <div class="pn-tabs" role="tablist" aria-label="Задачи">
      <button type="button" class="pn-tab" data-action="task-tab" data-id="all" role="tab" aria-selected="false">Все задачи</button>
      <button type="button" class="pn-tab is-active" data-action="task-tab" data-id="current" role="tab" aria-selected="true">Текущая</button>
    </div>
    <section class="pn-taskbar" data-role="taskbar">
      <div class="pn-task-filters" data-role="task-filters">
        <svg class="pn-filter-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M4 5h16l-6.2 7.3v5.2l-3.6 1.8v-7L4 5Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>
        </svg>
        <div class="pn-filters" role="tablist" aria-label="Фильтр комментариев">
          <button type="button" class="pn-chip" data-action="filter" data-filter="open">Активные</button>
          <button type="button" class="pn-chip" data-action="filter" data-filter="resolved">Решённые</button>
          <button type="button" class="pn-chip is-active" data-action="filter" data-filter="all">Все</button>
        </div>
      </div>
      <div class="pn-task-head">
        <div class="pn-task-title-row">
          <h3 class="pn-task-title" data-role="task-title"></h3>
          <span class="pn-task-status" data-role="task-status"></span>
          <span class="pn-task-comments" data-role="task-comments"></span>
        </div>
        <input
          class="pn-task-description"
          data-role="task-description"
          maxlength="120"
          placeholder="Описание появится из первого комментария"
          aria-label="Описание задачи"
          title="Описание задачи можно изменить"
        >
      </div>
    </section>
    <div class="pn-tasklist" data-role="tasklist" hidden></div>
    <div class="pn-list" data-role="list"></div>
    <footer class="pn-panel-foot" data-role="actionbar">
      <div class="pn-server" data-role="server"></div>
      <div class="pn-actionbar">
        <button type="button" class="pn-btn pn-btn-primary pn-focus-btn" data-action="focus-task" data-role="focus-button"></button>
        <div class="pn-more-wrap">
          <button type="button" class="pn-icon-btn pn-more-btn" data-action="task-menu" data-role="task-menu-button" aria-haspopup="menu" aria-expanded="false" aria-label="Действия с задачей" title="Действия с задачей">
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <circle cx="12" cy="5" r="1.7" fill="currentColor"/>
              <circle cx="12" cy="12" r="1.7" fill="currentColor"/>
              <circle cx="12" cy="19" r="1.7" fill="currentColor"/>
            </svg>
          </button>
          <div class="pn-task-menu" data-role="task-menu" role="menu" hidden>
            <button type="button" class="pn-menu-item" data-action="close-task" role="menuitem">Закрыть задачу</button>
            <button type="button" class="pn-menu-item pn-menu-danger" data-action="delete-task" role="menuitem">Удалить задачу</button>
          </div>
        </div>
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
  constructor(message, status, details = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
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
      tasks: [],
      activeTaskId: null,
      nextTaskNumber: 1,
      taskView: 'current',
      taskMenuOpen: false,
      mode: false,
      panel: false,
      filter: 'all',
      activeId: null,
      editingId: null,
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
      tabs: [...this.shadow.querySelectorAll('[data-action="task-tab"]')],
      taskbar: find('taskbar'),
      taskFilters: find('task-filters'),
      taskTitle: find('task-title'),
      taskStatus: find('task-status'),
      taskComments: find('task-comments'),
      taskDescription: find('task-description'),
      taskList: find('tasklist'),
      actionbar: find('actionbar'),
      focusButton: find('focus-button'),
      taskMenu: find('task-menu'),
      taskMenuButton: find('task-menu-button'),
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
  }

  bindUi() {
    this.app.addEventListener('click', (event) => {
      const target = event.target.closest?.('[data-action]');
      if (!target || !this.app.contains(target)) {
        if (this.state.taskMenuOpen) {
          this.state.taskMenuOpen = false;
          this.renderPanel();
        }
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      this.handleAction(target.dataset.action, target.dataset.id, target.dataset.filter, target.dataset.color);
    });

    this.app.addEventListener('input', (event) => {
      const target = event.target;
      if (target === this.refs.input) {
        this.refs.saveButton.disabled = !target.value.trim();
        return;
      }
      if (target instanceof Element && target.closest('.pn-comment-editor')) {
        const editor = target.closest('.pn-comment-editor');
        const save = editor.querySelector('[data-action="save-edit"]');
        if (save) save.disabled = !target.value.trim();
      }
    });

    this.app.addEventListener('change', (event) => {
      if (event.target !== this.refs.taskDescription) return;
      this.updateTaskDescription(event.target.value, event.target.dataset.taskId);
    });

    this.app.addEventListener('keydown', (event) => {
      const target = event.target;
      const editor = target instanceof Element ? target.closest('.pn-comment-editor') : null;
      if (editor) {
        event.stopPropagation();
        if (event.key === 'Escape') {
          event.preventDefault();
          this.cancelEditComment();
          return;
        }
        if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          this.saveEditedComment(editor.dataset.id);
        }
        return;
      }
      if (target === this.refs.taskDescription) {
        event.stopPropagation();
        if (event.key === 'Enter') {
          event.preventDefault();
          target.blur();
        }
        return;
      }
      if (target !== this.refs.input) return;
      event.stopPropagation();
      if (event.key === 'Escape') {
        event.preventDefault();
        this.closeCompose();
        return;
      }
      if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
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
    if (this.state.taskMenuOpen && !this.isUiEvent(event)) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      this.state.taskMenuOpen = false;
      this.renderPanel();
      return;
    }
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
    if (this.state.editingId) {
      event.preventDefault();
      event.stopPropagation();
      this.cancelEditComment();
      return;
    }
    if (this.state.taskMenuOpen) {
      event.preventDefault();
      this.state.taskMenuOpen = false;
      this.renderPanel();
      return;
    }
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
      const [config, data] = await Promise.all([this.api('/config'), this.api('/state')]);
      this.state.config = config || {};
      this.applyState(data);
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
      const local = this.loadLocal();
      this.state.comments = local.comments;
      this.state.tasks = local.tasks;
      this.state.activeTaskId = local.activeTaskId;
      this.state.nextTaskNumber = local.nextTaskNumber;
    }
  }

  applyState(data) {
    this.state.comments = Array.isArray(data?.comments) ? data.comments : [];
    this.state.tasks = Array.isArray(data?.tasks) ? data.tasks : [];
    this.state.activeTaskId = data?.activeTaskId || null;
    this.state.nextTaskNumber = Number(data?.nextTaskNumber) || 1;
    if (this.state.taskView !== 'all' && !this.findTask(this.state.taskView)) {
      this.state.taskView = 'current';
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
      let data;
      try {
        data = await this.api('/state');
      } catch {
        data = await this.api('/comments');
      }
      this.applyState(data);
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
      let details = null;
      try {
        const data = await response.json();
        if (data?.error) message = data.error;
        details = data?.details || null;
      } catch {
        // Ignore non-JSON error bodies.
      }
      throw new ApiError(message, response.status, details);
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
      if (!raw) {
        return { comments: [], tasks: [], activeTaskId: null, nextTaskNumber: 1 };
      }
      const parsed = JSON.parse(raw);
      const comments = Array.isArray(parsed) ? parsed : parsed?.comments;
      const normalizedComments = Array.isArray(comments)
        ? comments.filter((comment) => comment && typeof comment === 'object')
        : [];
      const tasks = Array.isArray(parsed?.tasks) ? [...parsed.tasks] : [];
      let activeTaskId = parsed?.activeTaskId || null;
      let nextTaskNumber = Number(parsed?.nextTaskNumber) || 1;

      if (tasks.length === 0 && normalizedComments.length > 0) {
        const first = normalizedComments[0];
        const hasWork = normalizedComments.some(
          (comment) => comment.status === 'open' || comment.status === 'orphaned'
        );
        const description = String(first.comment || '')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 120);
        tasks.push({
          id: 't_local_1',
          number: 1,
          status: hasWork ? 'active' : 'review',
          description: description || 'Первая задача',
          createdAt: first.createdAt || new Date().toISOString(),
          updatedAt: null,
          submittedAt: hasWork ? null : first.createdAt || new Date().toISOString(),
          closedAt: null,
        });
        activeTaskId = hasWork ? 't_local_1' : null;
        nextTaskNumber = 2;
      }

      const active =
        tasks.find((task) => task.id === activeTaskId && task.status === 'active') ||
        tasks.find((task) => task.status === 'active') ||
        null;
      const fallback = active || tasks[0] || null;
      for (const comment of normalizedComments) {
        if (!comment.taskId || !tasks.some((task) => task.id === comment.taskId)) {
          if (fallback) comment.taskId = fallback.id;
        }
      }
      return {
        comments: normalizedComments,
        tasks,
        activeTaskId: active ? active.id : null,
        nextTaskNumber,
      };
    } catch {
      return { comments: [], tasks: [], activeTaskId: null, nextTaskNumber: 1 };
    }
  }

  saveLocal() {
    try {
      localStorage.setItem(
        this.localStorageKey(),
        JSON.stringify({
          version: 2,
          updatedAt: new Date().toISOString(),
          nextTaskNumber: this.state.nextTaskNumber,
          activeTaskId: this.state.activeTaskId,
          tasks: this.state.tasks,
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
    const modeLabel = this.state.mode ? 'Остановить комментирование' : 'Комментировать';
    this.refs.modeButton.setAttribute('aria-label', modeLabel);
    this.refs.modeButton.title = modeLabel;
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
    if (!this.state.panel) {
      this.state.taskMenuOpen = false;
      this.state.editingId = null;
    }
    this.refs.panel.hidden = !this.state.panel;
    this.refs.panel.setAttribute('aria-hidden', String(!this.state.panel));
    this.host.dataset.panel = this.state.panel ? 'open' : 'closed';
    this.app.classList.toggle('has-panel', this.state.panel);
    this.refs.panelButton.setAttribute('aria-expanded', String(this.state.panel));
    this.refs.panelButton.title = this.state.panel ? 'Свернуть панель' : 'Открыть панель';
    if (this.state.panel && this.state.mode) this.setMode(false);
    if (this.state.panel) this.renderPanel();
    this.updateCounts();
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
    let savedTask = null;
    let usedLocalFallback = false;
    if (this.state.server) {
      try {
        const data = await this.api('/comments', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        saved = data?.comment;
        savedTask = data?.task || null;
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

    this.state.busy = false;
    if (!this.state.server) {
      if (!this.state.comments.some((comment) => comment.id === saved.id)) {
        this.state.comments.push(saved);
      }
      this.saveLocal();
      this.closeCompose({ reload: false });
      this.renderAll();
    } else {
      this.state.taskView = 'current';
      this.closeCompose({ reload: false });
      const refreshed = await this.refreshFromServer();
      if (!refreshed && saved) {
        if (!this.state.comments.some((comment) => comment.id === saved.id)) {
          this.state.comments.push(saved);
        }
        if (savedTask && !this.findTask(savedTask.id)) {
          this.state.tasks.push(savedTask);
          if (savedTask.status === 'active') this.state.activeTaskId = savedTask.id;
        }
        this.saveLocal();
        this.renderAll();
      }
    }
    this.toast(
      usedLocalFallback
        ? 'Сервер недоступен — комментарий сохранён локально'
        : 'Комментарий добавлен',
      usedLocalFallback ? 'error' : ''
    );
    this.setMode(false);
  }

  ensureLocalActiveTask(description) {
    const current = this.currentTask();
    if (current) return current;
    const now = new Date().toISOString();
    const number = Math.max(1, Number(this.state.nextTaskNumber) || 1);
    const task = {
      id: `t_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
      number,
      status: 'active',
      description: this.cleanText(description, 120) || `Задача T-${number}`,
      createdAt: now,
      updatedAt: now,
      submittedAt: null,
      closedAt: null,
    };
    this.state.tasks.push(task);
    this.state.nextTaskNumber = number + 1;
    this.state.activeTaskId = task.id;
    this.state.taskView = 'current';
    return task;
  }

  createLocalComment(payload) {
    const now = new Date().toISOString();
    const task = this.ensureLocalActiveTask(payload.comment);
    const comment = {
      id: `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
      taskId: task.id,
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
    const visibleComments = this.filteredComments();
    visibleComments.forEach((comment, index) => {
      const element = this.resolveAnchor(comment.anchor);
      if (!element) return;
      const rect = element.getBoundingClientRect();
      if ((!rect.width && !rect.height) || rect.right < 0 || rect.left > innerWidth) return;
      if (rect.bottom < -30 || rect.top > innerHeight + 30) return;
      const offset = (offsets.get(element) || 0) * PIN_OFFSET;
      offsets.set(element, (offsets.get(element) || 0) + 1);
      const number = index + 1;

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
      const pinTask = this.taskForComment(comment);
      pin.title = [pinTask ? this.taskDisplayTag(pinTask) : '', comment.comment || comment.id]
        .filter(Boolean)
        .join(' · ');
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
    const task = this.currentTask();
    const taskComments = task
      ? this.state.comments.filter((comment) => comment.taskId === task.id)
      : this.state.comments;
    const openCount = taskComments.filter((comment) => isOpenStatus(comment.status)).length;
    this.refs.count.textContent = String(openCount);
    this.refs.count.title = `${openCount} нерешённых`;
    this.refs.count.classList.toggle('is-empty', openCount === 0);
    this.refs.panelButton.setAttribute(
      'aria-label',
      `${this.state.panel ? 'Свернуть' : 'Открыть'} панель комментариев, ${openCount} нерешённых`
    );
  }

  updateServerNote() {
    const local = !this.state.server;
    const project = this.state.config.project || 'website';
    const task = this.selectedTask();
    const taskText = task
      ? ` · ${this.taskDisplayTag(task)} ${taskStatusLabel(task.status).toLowerCase()}`
      : '';
    this.refs.server.classList.toggle('is-local', local);
    if (local) {
      this.refs.server.textContent =
        `Проект: ${project}${taskText} · локальный режим: комментарии в localStorage. Запусти review-сервер, чтобы писать в .review/comments.json.`;
    } else {
      const file = this.state.config.commentsFile || '.review/comments.json';
      this.refs.server.textContent = `Проект: ${project}${taskText} · файл: ${file} · изменения подхватываются автоматически`;
    }
  }

  renderPanelIfOpen() {
    if (this.state.panel) this.renderPanel();
  }

  commentsForSelectedTask() {
    const task = this.selectedTask();
    if (!task) return [...this.state.comments];
    return this.state.comments.filter((comment) => comment.taskId === task.id);
  }

  filteredComments() {
    const comments = this.commentsForSelectedTask();
    if (this.state.filter === 'open') return comments.filter((comment) => isOpenStatus(comment.status));
    if (this.state.filter === 'resolved') {
      return comments.filter((comment) => !isOpenStatus(comment.status));
    }
    return comments;
  }

  renderPanel() {
    const showingAll = this.state.taskView === 'all';
    const list = showingAll ? [] : this.filteredComments();
    this.refs.list.replaceChildren();
    this.host.dataset.filter = this.state.filter;
    this.refs.panel.dataset.filter = this.state.filter;
    this.updateCounts();
    this.updateServerNote();
    this.renderTabs();
    this.renderTaskbar();
    this.renderTaskList();
    this.renderActionbar();
    for (const filter of this.refs.filters) {
      filter.classList.toggle('is-active', filter.dataset.filter === this.state.filter);
    }
    this.refs.list.hidden = showingAll;

    if (showingAll) return;

    if (list.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'pn-empty';
      const title = document.createElement('strong');
      const selected = this.selectedTask();
      const taskComments = this.commentsForSelectedTask();
      title.textContent = taskComments.length
        ? 'Ничего не найдено'
        : selected
          ? 'В этой задаче нет комментариев'
          : 'Пока нет комментариев';
      const hint = document.createElement('span');
      hint.textContent = taskComments.length
        ? 'Смени фильтр или добавь новый комментарий.'
        : 'Нажми иконку комментария, затем кликни по элементу на странице.';
      empty.append(title, hint);
      this.refs.list.append(empty);
      return;
    }

    const fragment = document.createDocumentFragment();
    list.forEach((comment, index) => {
      fragment.append(this.renderCommentCard(comment, index + 1));
    });
    this.refs.list.append(fragment);
    const active = this.refs.list.querySelector('.pn-comment.is-active');
    active?.scrollIntoView({ block: 'nearest' });
  }

  renderTabs() {
    const showingAll = this.state.taskView === 'all';
    for (const tab of this.refs.tabs) {
      const active = tab.dataset.id === (showingAll ? 'all' : 'current');
      tab.classList.toggle('is-active', active);
      tab.setAttribute('aria-selected', String(active));
    }
  }

  renderTaskbar() {
    const task = this.selectedTask();
    const showingAll = this.state.taskView === 'all';
    this.refs.taskbar.hidden = showingAll;
    this.refs.taskFilters.hidden = showingAll;
    if (showingAll) return;

    this.refs.taskDescription.disabled = !task || task.status === 'closed';
    this.refs.taskDescription.dataset.taskId = task?.id || '';
    this.refs.taskDescription.value = task?.description || '';
    this.refs.taskTitle.textContent = task ? this.taskDisplayTag(task) : 'Новая задача';
    this.refs.taskStatus.textContent = task ? taskStatusLabel(task.status) : '';
    this.refs.taskStatus.className = `pn-task-status${task ? ` status-${task.status}` : ''}`;
    if (task) {
      const { total, counts } = this.taskCounts(task.id);
      this.refs.taskComments.textContent = `${total} комм.`;
      this.refs.taskComments.title = `Всего комментариев: ${total} · открыто: ${counts.open + counts.orphaned}`;
    } else {
      this.refs.taskComments.textContent = '';
      this.refs.taskComments.title = '';
    }
  }

  renderActionbar() {
    const task = this.selectedTask();
    const visible = this.state.taskView !== 'all' && Boolean(task);
    this.refs.actionbar.hidden = !visible;
    const menuOpen = Boolean(visible && this.state.taskMenuOpen);
    this.refs.taskMenu.hidden = !menuOpen;
    this.refs.taskMenuButton.setAttribute('aria-expanded', String(menuOpen));
    if (!visible) return;

    const { total, counts } = this.taskCounts(task.id);
    const unresolved = counts.open + counts.orphaned;
    const button = this.refs.focusButton;
    button.disabled = false;
    button.dataset.focus = '';

    if (task.status === 'closed') {
      button.textContent = 'Задача закрыта';
      button.disabled = true;
    } else if (total === 0) {
      button.textContent = 'Нет комментариев';
      button.disabled = true;
    } else if (unresolved > 0) {
      button.textContent = 'Скопировать задание для агента';
      button.dataset.focus = 'copy';
    } else {
      button.textContent = 'Завершить задачу';
      button.dataset.focus = 'close';
    }

    const closeButton = this.refs.taskMenu.querySelector('[data-action="close-task"]');
    closeButton.disabled = task.status === 'closed' || unresolved > 0;
    closeButton.title = closeButton.disabled
      ? unresolved > 0
        ? 'Сначала разберите открытые комментарии'
        : 'Задача уже закрыта'
      : 'Закрыть задачу';
  }

  renderTaskList() {
    const panel = this.refs.taskList;
    const showingAll = this.state.taskView === 'all';
    panel.hidden = !showingAll;
    panel.classList.toggle('is-all', showingAll);
    if (!showingAll) return;
    panel.replaceChildren();

    if (this.state.tasks.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'pn-tasklist-empty';
      empty.textContent = 'Задачи появятся с первым комментарием.';
      panel.append(empty);
      return;
    }

    const tasks = [...this.state.tasks].sort((left, right) => right.number - left.number);
    for (const task of tasks) {
      const { total, counts } = this.taskCounts(task.id);
      const done = counts.resolved + counts.wontfix;
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'pn-task-row';
      row.dataset.action = 'select-task';
      row.dataset.id = task.id;
      row.classList.toggle('is-active-task', task.status === 'active');

      const tag = document.createElement('span');
      tag.className = 'pn-task-row-tag';
      tag.textContent = this.taskDisplayTag(task);
      const main = document.createElement('span');
      main.className = 'pn-task-row-main';
      const description = document.createElement('span');
      description.className = 'pn-task-row-desc';
      description.textContent = task.description || 'Без описания';
      const meta = document.createElement('span');
      meta.className = 'pn-task-row-meta';
      meta.textContent = `${formatTaskDate(task.createdAt)} · ${done}/${total}`;
      main.append(description, meta);
      const status = document.createElement('span');
      status.className = `pn-task-row-status status-${task.status}`;
      status.textContent = taskStatusLabel(task.status);
      row.append(tag, main, status);
      panel.append(row);
    }
  }

  renderCommentCard(comment, number) {
    const status = comment.status || 'open';
    const task = this.taskForComment(comment);
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
    if (task) {
      const taskChip = document.createElement('span');
      taskChip.className = 'pn-task-chip pn-task-chip-small';
      taskChip.textContent = this.taskDisplayTag(task);
      taskChip.title = taskTitle(task);
      head.append(dot, idLabel, taskChip, badge, time);
    } else {
      head.append(dot, idLabel, badge, time);
    }

    const canEdit = this.canEditComment(comment, task);
    const editing = comment.id === this.state.editingId && canEdit;
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

    let editor = null;
    if (editing) {
      editor = document.createElement('div');
      editor.className = 'pn-comment-editor';
      editor.dataset.id = comment.id;
      editor.addEventListener('click', (event) => {
        const action = event.target.closest?.('[data-action]');
        if (!action || !editor.contains(action)) event.stopPropagation();
      });

      const textarea = document.createElement('textarea');
      textarea.rows = 4;
      textarea.value = comment.comment || '';
      textarea.dataset.role = 'edit-input';
      textarea.dataset.id = comment.id;
      textarea.setAttribute('aria-label', 'Редактировать комментарий');

      const editorActions = document.createElement('div');
      editorActions.className = 'pn-comment-editor-actions';
      const save = this.actionButton('Сохранить', 'save-edit', comment.id, 'pn-action-primary');
      save.disabled = !textarea.value.trim();
      const cancel = this.actionButton('Отмена', 'cancel-edit', comment.id);
      const hint = document.createElement('span');
      hint.className = 'pn-comment-editor-hint';
      hint.textContent = '⌘↵ — сохранить · Esc — отмена';
      editorActions.append(save, cancel, hint);
      editor.append(textarea, editorActions);
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
    if (comment.reopenedFrom) {
      const reopened = document.createElement('div');
      const fromTask = this.findTask(comment.reopenedFrom.taskId);
      reopened.textContent = fromTask
        ? `Возвращён из ${this.taskDisplayTag(fromTask)}`
        : 'Возвращён из удалённой задачи';
      meta.append(reopened);
    }
    const page = this.pageLabel(comment.url);
    if (page) {
      const pageLine = document.createElement('div');
      pageLine.textContent = page;
      meta.append(pageLine);
    }

    const actions = document.createElement('div');
    actions.className = 'pn-comment-actions';
    if (!editing) {
      if (element) {
        actions.append(this.actionButton('Показать', 'focus', comment.id));
      }
      if (canEdit) {
        actions.append(this.actionButton('Изменить', 'edit', comment.id));
      }
      if (task?.status === 'active') {
        actions.append(
          this.actionButton(
            isOpenStatus(comment.status) ? 'Решить' : 'Вернуть',
            'toggle-status',
            comment.id
          )
        );
        if (isOpenStatus(comment.status)) {
          actions.append(this.actionButton('Не правим', 'wontfix', comment.id));
        }
      } else {
        actions.append(this.actionButton('Вернуть в текущую', 'reopen', comment.id));
      }
      actions.append(
        this.actionButton('Копировать', 'copy-one', comment.id),
        this.actionButton('Удалить', 'delete', comment.id, 'pn-action-danger')
      );
    }

    card.append(head);
    if (editor) {
      card.append(editor);
    } else {
      card.append(body);
      if (resolution) card.append(resolution);
    }
    if (comment.screenshot?.file) card.append(this.renderCommentScreenshot(comment.screenshot));
    card.append(meta);
    if (!editing) card.append(actions);
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
    if (action !== 'task-menu') this.state.taskMenuOpen = false;
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
      case 'focus-task':
        await this.runFocusAction();
        break;
      case 'task-menu':
        this.state.taskMenuOpen = !this.state.taskMenuOpen;
        this.renderActionbar();
        break;
      case 'task-tab':
        this.state.taskView = id === 'all' ? 'all' : 'current';
        this.state.taskMenuOpen = false;
        this.state.activeId = null;
        this.state.editingId = null;
        this.renderPanel();
        this.schedulePins();
        break;
      case 'focus':
        this.focusComment(id);
        break;
      case 'edit':
        this.startEditComment(id);
        break;
      case 'save-edit':
        await this.saveEditedComment(id);
        break;
      case 'cancel-edit':
        this.cancelEditComment();
        break;
      case 'toggle-status':
        await this.toggleStatus(id);
        break;
      case 'wontfix':
        await this.markWontfix(id);
        break;
      case 'reopen':
        await this.reopenComment(id);
        break;
      case 'select-task':
        this.state.taskView = id || 'current';
        this.state.taskMenuOpen = false;
        this.state.activeId = null;
        this.state.editingId = null;
        this.renderPanel();
        this.schedulePins();
        break;
      case 'close-task':
        await this.closeTask();
        break;
      case 'delete-task':
        await this.deleteTask();
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
      const local = this.loadLocal();
      this.state.comments = local.comments;
      this.state.tasks = local.tasks;
      this.state.activeTaskId = local.activeTaskId;
      this.state.nextTaskNumber = local.nextTaskNumber;
      this.renderAll();
      this.toast('Локальные комментарии обновлены');
    }
  }

  findComment(id) {
    return this.state.comments.find((comment) => comment.id === id) || null;
  }

  findTask(id) {
    return this.state.tasks.find((task) => task.id === id) || null;
  }

  currentTask() {
    return (
      this.state.tasks.find(
        (task) => task.id === this.state.activeTaskId && task.status === 'active'
      ) ||
      this.state.tasks.find((task) => task.status === 'active') ||
      null
    );
  }

  latestTask() {
    return [...this.state.tasks].sort((left, right) => right.number - left.number)[0] || null;
  }

  selectedTask() {
    if (this.state.taskView === 'all') return null;
    if (this.state.taskView === 'current') {
      return this.currentTask() || this.latestTask();
    }
    return this.findTask(this.state.taskView) || this.currentTask() || this.latestTask();
  }

  taskForComment(comment) {
    return this.findTask(comment.taskId) || null;
  }

  taskDisplayTag(task) {
    const number = Number(task?.number);
    return Number.isFinite(number) && number > 0 ? `TASK-${number}` : 'TASK';
  }

  taskCounts(taskId) {
    const items = this.state.comments.filter((comment) => comment.taskId === taskId);
    const counts = { open: 0, resolved: 0, wontfix: 0, orphaned: 0 };
    for (const comment of items) {
      const status = counts[comment.status] === undefined ? 'open' : comment.status;
      counts[status] += 1;
    }
    return { total: items.length, counts };
  }

  canEditComment(comment, task = this.taskForComment(comment)) {
    return Boolean(comment && task && task.status !== 'closed' && isOpenStatus(comment.status));
  }

  editTextarea(id) {
    return [...this.refs.list.querySelectorAll('[data-role="edit-input"]')].find(
      (item) => item.dataset.id === id
    ) || null;
  }

  startEditComment(id) {
    const comment = this.findComment(id);
    if (!comment || !this.canEditComment(comment)) {
      this.toast('Редактировать можно только открытый комментарий в незакрытой задаче', 'error');
      return;
    }
    this.state.editingId = id;
    this.state.activeId = id;
    this.renderPanel();
    requestAnimationFrame(() => {
      const textarea = this.editTextarea(id);
      if (!textarea) return;
      textarea.focus();
      textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    });
  }

  cancelEditComment() {
    if (!this.state.editingId) return;
    this.state.editingId = null;
    this.renderPanel();
  }

  async saveEditedComment(id) {
    const comment = this.findComment(id);
    if (!comment) return;
    if (!this.canEditComment(comment)) {
      this.state.editingId = null;
      this.renderPanel();
      this.toast('Задача уже закрыта или комментарий решён', 'error');
      return;
    }
    const textarea = this.editTextarea(id);
    const value = String(textarea?.value || '').trim();
    if (!value) {
      this.toast('Комментарий не может быть пустым', 'error');
      textarea?.focus();
      return;
    }
    if (value === comment.comment) {
      this.cancelEditComment();
      return;
    }
    const saved = await this.updateComment(id, { comment: value }, { toast: false, render: false });
    if (!saved) return;
    this.state.editingId = null;
    this.renderAll();
    this.toast('Комментарий сохранён');
  }

  focusComment(id) {
    const comment = this.findComment(id);
    if (!comment) return;
    if (this.state.editingId && this.state.editingId !== id) this.state.editingId = null;
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
    const task = this.taskForComment(comment);
    if (task && task.status !== 'active') {
      await this.reopenComment(id);
      return;
    }
    const nextStatus = isOpenStatus(comment.status) ? 'resolved' : 'open';
    await this.updateComment(id, { status: nextStatus });
  }

  async markWontfix(id) {
    const comment = this.findComment(id);
    if (!comment) return;
    const reason = window.prompt('Почему не правим?', comment.resolution || 'Не требуется');
    if (reason === null) return;
    await this.updateComment(id, {
      status: 'wontfix',
      resolution: reason.trim() || 'Не требуется',
    });
  }

  async reopenComment(id) {
    const comment = this.findComment(id);
    if (!comment) return;
    if (this.state.server) {
      try {
        await this.api(`/comments/${encodeURIComponent(id)}/reopen`, {
          method: 'POST',
          body: JSON.stringify({}),
        });
        this.state.taskView = 'current';
        await this.refreshFromServer();
        this.toast('Комментарий возвращён в текущую задачу');
      } catch (err) {
        this.toast(err.message || 'Не удалось вернуть комментарий', 'error');
      }
      return;
    }

    const task = this.taskForComment(comment);
    if (task?.status === 'active') {
      comment.status = 'open';
      comment.resolution = '';
      comment.resolvedAt = null;
      comment.updatedAt = new Date().toISOString();
    } else {
      const active = this.ensureLocalActiveTask(comment.comment);
      const now = new Date().toISOString();
      this.state.comments.push({
        ...comment,
        id: `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
        taskId: active.id,
        status: 'open',
        resolution: '',
        resolvedAt: null,
        createdAt: now,
        updatedAt: now,
        reopenedFrom: { taskId: task?.id || null, commentId: comment.id },
      });
    }
    this.saveLocal();
    this.renderAll();
    this.toast('Комментарий возвращён в текущую задачу');
  }

  async runFocusAction() {
    const task = this.selectedTask();
    if (!task) return;
    const { counts } = this.taskCounts(task.id);
    const unresolved = counts.open + counts.orphaned;
    if (unresolved > 0) {
      await this.copyAll();
      return;
    }
    await this.closeTask();
  }

  async closeTask() {
    const task = this.selectedTask();
    if (!task || task.status === 'closed') return;
    const { counts } = this.taskCounts(task.id);
    if (counts.open > 0 || counts.orphaned > 0) {
      this.toast(
        `Сначала разберите открытые комментарии (${counts.open + counts.orphaned})`,
        'error'
      );
      return;
    }
    if (!window.confirm(`Закрыть ${this.taskDisplayTag(task)}? Новые комментарии попадут в новую задачу.`)) {
      return;
    }
    if (this.state.server) {
      try {
        await this.api(`/tasks/${encodeURIComponent(task.id)}/close`, {
          method: 'POST',
          body: JSON.stringify({}),
        });
        await this.refreshFromServer();
        this.toast(`${this.taskDisplayTag(task)} закрыта`);
      } catch (err) {
        this.toast(err.message || 'Не удалось закрыть задачу', 'error');
      }
      return;
    }
    task.status = 'closed';
    task.closedAt = new Date().toISOString();
    task.submittedAt = task.submittedAt || task.closedAt;
    task.updatedAt = task.closedAt;
    if (this.state.activeTaskId === task.id) this.state.activeTaskId = null;
    this.state.taskView = 'current';
    this.saveLocal();
    this.renderAll();
    this.toast(`${this.taskDisplayTag(task)} закрыта`);
  }

  async deleteTask() {
    const task = this.selectedTask();
    if (!task) return;
    const { total } = this.taskCounts(task.id);
    if (
      !window.confirm(
        `Удалить переписку ${this.taskDisplayTag(task)} и все её комментарии (${total})? Это необратимо.`
      )
    ) {
      return;
    }
    if (this.state.server) {
      try {
        await this.api(`/tasks/${encodeURIComponent(task.id)}`, { method: 'DELETE' });
        this.state.taskView = 'current';
        this.state.activeId = null;
        await this.refreshFromServer();
        this.toast(`${this.taskDisplayTag(task)} удалена`);
      } catch (err) {
        this.toast(err.message || 'Не удалось удалить задачу', 'error');
      }
      return;
    }
    this.state.comments = this.state.comments.filter((comment) => comment.taskId !== task.id);
    this.state.tasks = this.state.tasks.filter((item) => item.id !== task.id);
    if (this.state.activeTaskId === task.id) this.state.activeTaskId = null;
    this.state.taskView = 'current';
    this.state.activeId = null;
    this.saveLocal();
    this.renderAll();
    this.toast(`${this.taskDisplayTag(task)} удалена`);
  }

  async updateTaskDescription(value, taskId) {
    const task = taskId ? this.findTask(taskId) : this.selectedTask();
    if (!task) return;
    const description = String(value || '').trim();
    if (description === (task.description || '')) return;
    if (this.state.server) {
      try {
        const data = await this.api(`/tasks/${encodeURIComponent(task.id)}`, {
          method: 'PATCH',
          body: JSON.stringify({ description }),
        });
        if (data?.task) Object.assign(task, data.task);
        this.saveLocal();
        this.renderPanel();
        this.toast('Описание задачи сохранено');
      } catch (err) {
        this.toast(err.message || 'Не удалось сохранить описание', 'error');
      }
      return;
    }
    task.description = description;
    task.updatedAt = new Date().toISOString();
    this.saveLocal();
    this.renderPanel();
    this.toast('Описание задачи сохранено');
  }

  async updateComment(id, patch, { toast = true, render = true } = {}) {
    if (this.state.server) {
      try {
        const data = await this.api(`/comments/${encodeURIComponent(id)}`, {
          method: 'PATCH',
          body: JSON.stringify(patch),
        });
        const comment = this.findComment(id);
        if (comment && data?.comment) Object.assign(comment, data.comment);
      } catch (err) {
        if (toast) this.toast(err.message || 'Не удалось обновить комментарий', 'error');
        return false;
      }
    } else {
      const comment = this.findComment(id);
      if (!comment) return false;
      Object.assign(comment, patch);
      comment.updatedAt = new Date().toISOString();
      if (patch.status) {
        comment.resolvedAt = patch.status === 'resolved' ? new Date().toISOString() : null;
        if (patch.status === 'open' && patch.resolution === undefined) comment.resolution = '';
      }
    }
    this.saveLocal();
    if (render) this.renderAll();
    if (toast) {
      this.toast(
        patch.status === 'resolved'
          ? 'Комментарий решён'
          : patch.status
            ? 'Статус обновлён'
            : 'Комментарий сохранён'
      );
    }
    return true;
  }

  async deleteComment(id) {
    if (!window.confirm('Удалить комментарий?')) return;
    const comment = this.findComment(id);
    if (this.state.server) {
      try {
        await this.api(`/comments/${encodeURIComponent(id)}`, { method: 'DELETE' });
        await this.refreshFromServer();
        this.toast('Комментарий удалён');
      } catch (err) {
        this.toast(err.message || 'Не удалось удалить комментарий', 'error');
      }
      return;
    }
    if (!comment) return;
    this.state.comments = this.state.comments.filter((item) => item.id !== id);
    const remaining = this.state.comments.filter((item) => item.taskId === comment.taskId);
    if (remaining.length === 0) {
      this.state.tasks = this.state.tasks.filter((task) => task.id !== comment.taskId);
      if (this.state.activeTaskId === comment.taskId) this.state.activeTaskId = null;
    }
    if (this.state.activeId === id) this.state.activeId = null;
    this.saveLocal();
    this.renderAll();
    this.toast('Комментарий удалён');
  }

  async copyAll() {
    const task = this.selectedTask();
    const taskComments = task
      ? this.state.comments.filter((comment) => comment.taskId === task.id)
      : this.state.comments;
    const openComments = taskComments.filter((comment) => isOpenStatus(comment.status));
    const comments = openComments.length > 0 ? openComments : taskComments;
    if (comments.length === 0) {
      this.toast('Комментариев пока нет');
      return;
    }
    const markdown = formatAllMarkdown(comments, {
      project: this.state.config.project || location.hostname || 'website',
      updatedAt: new Date().toISOString(),
      task,
    });
    const copied = await this.copyText(markdown);
    if (copied) this.toast('Задание скопировано — вставьте его в чат агенту');
    else this.download('feedback.md', markdown);
  }

  async copyOne(id) {
    const comment = this.findComment(id);
    if (!comment) return;
    const task = this.taskForComment(comment);
    const markdown = `${task ? `**Задача:** ${taskTitle(task)}\n\n` : ''}${formatCommentMarkdown(comment)}`;
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
