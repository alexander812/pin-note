import { formatAllMarkdown, isOpenStatus, STATUSES, taskTitle } from './shared.js';

const API = '/__review';
const HOST_ID = 'pin-note-root';
const LOCAL_KEY = 'pin-note:comments:v1';
const TOOLBAR_KEY = 'pin-note:toolbar-position:v1';
const LOCAL_FALLBACK_SUFFIX = 'local';
const PIN_OFFSET = 27;
const BAR_HEIGHT = 54;
const PANEL_WIDTH = 382;
const MOBILE_BREAKPOINT = 740;
const SHOT_COLORS = ['#ff5d5d', '#ff9f43', '#ffd93d', '#48d597', '#4dd0e1', '#5b8cff', '#b57bff'];
const SHOT_MAX_SIDE = 2200;

const STATIC_HTML = `
  <div class="pn-highlight" data-role="highlight" hidden>
    <span class="pn-highlight-label" data-role="highlight-label"></span>
  </div>
  <div class="pn-pins" data-role="pins"></div>
  <header class="pn-bar" data-role="bar" aria-label="Панель PinNote">
    <span class="pn-brand"><span class="pn-brand-mark" aria-hidden="true">◈</span>PINNOTE</span>
    <span class="pn-bar-sep" aria-hidden="true"></span>
    <button type="button" class="pn-mode-btn" data-action="mode" aria-pressed="false" aria-label="Комментировать" title="Комментировать · Esc — выйти">
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5 9.9 9.9 0 0 1-4.2-.9L3 20.8l1.6-4.9A8.5 8.5 0 1 1 21 11.5Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>
      </svg>
    </button>
    <button type="button" class="pn-current-task" data-action="open-current" data-role="current-task" title="Текущая задача">НОВАЯ ЗАДАЧА</button>
    <span class="pn-bar-hint" data-role="hint"></span>
    <span class="pn-bar-spacer"></span>
    <button type="button" class="pn-reload" data-action="reload-site" data-role="reload-site" hidden title="Сайт обновился. Перезагрузить страницу">
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M20 12a8 8 0 1 1-2.34-5.66M20 4v5h-5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      <span>Обновить сайт</span>
    </button>
    <span class="pn-count" data-role="count" hidden aria-live="polite"></span>
    <button type="button" class="pn-compose-action pn-parent-action" data-action="select-parent" data-role="parent-action" hidden aria-label="Выбрать родительский элемент" title="Выбрать родительский элемент">
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M7 20h10M12 16V5M7 10l5-5 5 5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </button>
    <button type="button" class="pn-compose-action" data-action="compose-selection" data-role="compose-action" hidden aria-label="Написать комментарий" title="Написать комментарий">
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17v3Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>
        <path d="m14 7 3 3" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>
      </svg>
    </button>
    <button type="button" class="pn-panel-toggle" data-action="panel" aria-expanded="false" title="Открыть панель">
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <rect x="3" y="4" width="18" height="16" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/>
        <path d="M15 4v16" fill="none" stroke="currentColor" stroke-width="1.6"/>
      </svg>
      <span data-role="toggle-label">Открыть</span>
    </button>
  </header>
  <button type="button" class="pn-scrim" data-action="close-panel" aria-label="Закрыть панель" hidden></button>
  <aside class="pn-panel" data-role="panel" aria-label="Задачи PinNote" hidden>
    <section class="pn-list-screen" data-role="list-screen" aria-label="Все задачи">
      <header class="pn-list-head">
        <div class="pn-kicker"><span>// TASKS</span><span class="pn-kicker-count" data-role="task-count"></span></div>
        <div class="pn-list-title-row">
          <h2 class="pn-list-title">Задачи</h2>
          <button type="button" class="pn-refresh" data-action="refresh" aria-label="Обновить" title="Обновить">
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M20 12a8 8 0 1 1-2.34-5.66M20 4v5h-5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
        </div>
        <div class="pn-segmented" role="group" aria-label="Фильтр задач">
          <button type="button" data-action="task-filter" data-filter="active" aria-pressed="true">Активные</button>
          <button type="button" data-action="task-filter" data-filter="closed" aria-pressed="false">Закрытые</button>
          <button type="button" data-action="task-filter" data-filter="all" aria-pressed="false">Все</button>
        </div>
      </header>
      <div class="pn-task-list" data-role="task-list"></div>
      <button type="button" class="pn-add-task" data-action="create-task" data-role="add-task">
        <span class="pn-add-task-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" focusable="false"><path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>
        </span>
        <span class="pn-add-task-label">Добавить задачу</span>
      </button>
      <div class="pn-list-foot" data-role="server"></div>
    </section>
    <section class="pn-detail-screen" data-role="detail-screen" aria-label="Подробности задачи" hidden>
      <header class="pn-detail-head">
        <div class="pn-detail-nav">
          <button type="button" class="pn-back" data-action="back">
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m15 18-6-6 6-6" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>
            <span>К задачам</span>
          </button>
          <div class="pn-more-wrap">
            <button type="button" class="pn-more" data-action="task-menu" data-role="task-menu-button" aria-haspopup="menu" aria-expanded="false" aria-label="Действия с задачей" title="Действия с задачей">
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="5" r="1.6" fill="currentColor"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><circle cx="12" cy="19" r="1.6" fill="currentColor"/></svg>
            </button>
            <div class="pn-menu" data-role="task-menu" role="menu" hidden>
              <button type="button" data-action="dispatch-agent" data-role="menu-dispatch" role="menuitem">Отправить агенту</button>
              <button type="button" data-action="cancel-agent" data-role="menu-cancel" role="menuitem">Остановить агента</button>
              <button type="button" data-action="reset-agent" data-role="menu-reset" role="menuitem">Сбросить сессию агента</button>
              <div class="pn-menu-sep" role="separator"></div>
              <button type="button" data-action="copy-all" role="menuitem">Скопировать задание</button>
              <button type="button" data-action="close-task" data-role="menu-close" role="menuitem">Закрыть задачу</button>
              <button type="button" class="pn-menu-danger" data-action="delete-task" data-role="menu-delete" role="menuitem">Удалить задачу</button>
            </div>
          </div>
        </div>
        <div class="pn-detail-title">
          <div class="pn-detail-title-main">
            <h2 class="pn-task-title" data-role="task-title">Задача</h2>
            <time class="pn-detail-meta" data-role="task-date"></time>
          </div>
          <span class="pn-badge" data-role="task-status"></span>
        </div>
        <div class="pn-progress-row">
          <div class="pn-progress-summary">
            <div class="pn-progress-label"><span>Принято правок</span><span data-role="accepted-count">0 из 0</span></div>
            <div class="pn-progress" data-role="progress" role="progressbar" aria-label="Принятые правки" aria-valuemin="0" aria-valuemax="1" aria-valuenow="0">
              <div class="pn-progress-fill" data-role="progress-fill"></div>
            </div>
          </div>
          <button type="button" class="pn-primary" data-action="accept-task" data-role="accept-task" disabled>Принять</button>
        </div>
        <div class="pn-confirm" data-role="confirm" hidden>
          <p data-role="confirm-label"></p>
          <div class="pn-confirm-actions">
            <button type="button" class="pn-primary" data-action="confirm" data-role="confirm-button">Подтвердить</button>
            <button type="button" class="pn-cancel" data-action="cancel-confirm">Отмена</button>
          </div>
        </div>
        <div class="pn-agent-note" data-role="agent-note" hidden></div>
      </header>
      <section class="pn-fixes" aria-label="Список правок">
        <div class="pn-section-label"><span>Правки</span><span data-role="fix-count"></span></div>
        <div class="pn-fix-list" data-role="fix-list"></div>
      </section>
      <section class="pn-thread" aria-label="Диалог по выбранной правке">
        <div class="pn-thread-head">
          <span class="pn-thread-title" data-role="thread-title"></span>
          <span class="pn-agent-activity" data-role="agent-activity" hidden></span>
        </div>
        <div class="pn-fix-state" data-role="fix-state" role="status" aria-live="polite" hidden></div>
        <div class="pn-messages" data-role="messages"></div>
      </section>
      <footer class="pn-footer">
        <div class="pn-footer-actions" data-role="footer-actions">
          <div class="pn-suggestions" role="group" aria-label="Действия по выбранной правке">
            <button type="button" class="pn-suggestion pn-suggestion-accept" data-action="accept-fix" data-role="accept-fix" aria-pressed="false">
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m5 13 4 4L19 7" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>
              <span data-role="accept-label">Принять правку</span>
            </button>
            <button type="button" class="pn-suggestion" data-action="reply" data-role="reply-button" aria-expanded="false">
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m9 17-5-5 5-5M4 12h10a6 6 0 0 1 6 6v1" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>
              <span>Ответить</span>
            </button>
            <button type="button" class="pn-suggestion pn-suggestion-stop" data-action="stop-fix-agent" data-role="stop-fix-button" hidden>
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="7" y="7" width="10" height="10" rx="1.5" fill="currentColor"/></svg>
              <span>Остановить агента</span>
            </button>
          </div>
        </div>
        <div class="pn-composer" data-role="composer" hidden>
          <div class="pn-reply-box">
            <textarea data-role="reply-input" rows="2" maxlength="2000" placeholder="Что уточнить или доделать?" aria-label="Реплика по выбранной правке"></textarea>
            <button type="button" class="pn-send" data-action="send-reply" data-role="send-reply" aria-label="Отправить реплику" title="Отправить · ⌘ / Ctrl ↵" disabled>
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 19V5M6 11l6-6 6 6" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
          </div>
          <div class="pn-composer-caption">
            <span data-role="reply-context"></span>
            <span class="pn-composer-tools">
              <button type="button" class="pn-cancel-reply" data-action="cancel-reply">Отмена</button>
            </span>
          </div>
        </div>
        <div class="pn-task-action" data-role="task-action" hidden>
          <button type="button" class="pn-task-action-btn" data-action="task-action" data-role="task-action-button">
            <span class="pn-task-action-icon" data-role="task-action-icon" aria-hidden="true">→</span>
            <span class="pn-task-action-label" data-role="task-action-label">Отправить всё агенту</span>
          </button>
        </div>
      </footer>
    </section>
    <span class="pn-sr" role="status" aria-live="polite" data-role="live"></span>
  </aside>
  <div class="pn-popover" data-role="popover" role="dialog" aria-label="Новый комментарий" hidden>
    <div class="pn-popover-head">
      <div class="pn-kicker">// NEW FIX</div>
      <button type="button" class="pn-icon-btn" data-action="cancel" aria-label="Закрыть">×</button>
    </div>
    <div class="pn-target">
      <span class="pn-target-tag" data-role="target-tag"></span>
      <span class="pn-target-text" data-role="target-text"></span>
    </div>
    <div class="pn-attach-row">
      <button type="button" class="pn-btn pn-btn-ghost pn-shot-trigger" data-action="capture-screenshot">Скриншот элемента</button>
      <button type="button" class="pn-btn pn-btn-ghost pn-shot-trigger" data-action="pick-files" title="Прикрепить картинку или другой файл">Загрузить файл</button>
      <input type="file" data-role="file-input" multiple hidden>
    </div>
    <div class="pn-compose-media">
      <div class="pn-shot-preview" data-role="shot-preview" hidden>
        <img data-role="shot-preview-img" alt="Прикреплённый скриншот">
        <button type="button" class="pn-icon-btn pn-shot-remove" data-action="remove-screenshot" aria-label="Убрать скриншот">×</button>
      </div>
      <div class="pn-attachment-list" data-role="compose-attachments" hidden></div>
    </div>
    <textarea data-role="comment-input" rows="5" placeholder="Что изменить? Например: сделай заголовок крупнее и добавь отступ…"></textarea>
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
          <div class="pn-eyebrow">// SCREENSHOT</div>
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
      currentTaskId: null,
      viewedTaskId: null,
      nextTaskNumber: 1,
      agents: {},
      agentConfig: null,
      agentPollAt: 0,
      agentPolling: false,
      taskFilter: 'active',
      taskMenuOpen: false,
      confirmAction: '',
      mode: false,
      panel: false,
      activeId: null,
      editingId: null,
      rejectingId: null,
      server: false,
      config: {},
      compose: null,
      selected: null,
      pickHintShown: false,
      replyDrafts: {},
      replyOpen: false,
      replyBusy: null,
      editingMessage: null,
      uiSaveTimer: 0,
      taskActionBusy: false,
      taskCreateBusy: false,
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
      layout: null,
      fixedRaf: 0,
      resizeNotice: false,
      layoutResizeNotice: false,
      revealToken: 0,
    };
  }

  async boot() {
    this.captureRefs();
    this.host.dataset.panel = 'closed';
    this.bindUi();
    this.bindPage();
    this.applyPageLayout();
    await this.loadInitial();
    this.restoreUiState();
    this.renderAll();
    this.startTicker();
    this.notifySiteResize();
  }

  captureRefs() {
    const find = (role) => this.shadow.querySelector(`[data-role="${role}"]`);
    this.refs = {
      highlight: find('highlight'),
      highlightLabel: find('highlight-label'),
      pins: find('pins'),
      bar: find('bar'),
      panel: find('panel'),
      listScreen: find('list-screen'),
      detailScreen: find('detail-screen'),
      currentTask: find('current-task'),
      hint: find('hint'),
      count: find('count'),
      reloadSite: find('reload-site'),
      composeAction: find('compose-action'),
      parentAction: find('parent-action'),
      toggleLabel: find('toggle-label'),
      taskFilters: [...this.shadow.querySelectorAll('[data-action="task-filter"]')],
      taskCount: find('task-count'),
      taskList: find('task-list'),
      addTask: find('add-task'),
      server: find('server'),
      taskTitle: find('task-title'),
      taskStatus: find('task-status'),
      taskDate: find('task-date'),
      acceptedCount: find('accepted-count'),
      progress: find('progress'),
      progressFill: find('progress-fill'),
      acceptTask: find('accept-task'),
      confirm: find('confirm'),
      confirmLabel: find('confirm-label'),
      confirmButton: find('confirm-button'),
      agentNote: find('agent-note'),
      agentActivity: find('agent-activity'),
      fixList: find('fix-list'),
      fixCount: find('fix-count'),
      threadTitle: find('thread-title'),
      fixState: find('fix-state'),
      messages: find('messages'),
      acceptFix: find('accept-fix'),
      acceptLabel: find('accept-label'),
      replyButton: find('reply-button'),
      stopFixButton: find('stop-fix-button'),
      footer: this.shadow.querySelector('.pn-footer'),
      footerActions: find('footer-actions'),
      composer: find('composer'),
      replyInput: find('reply-input'),
      sendReply: find('send-reply'),
      replyContext: find('reply-context'),
      taskAction: find('task-action'),
      taskActionButton: find('task-action-button'),
      taskActionIcon: find('task-action-icon'),
      taskActionLabel: find('task-action-label'),
      live: find('live'),
      taskMenu: find('task-menu'),
      taskMenuButton: find('task-menu-button'),
      menuDispatch: find('menu-dispatch'),
      menuCancel: find('menu-cancel'),
      menuReset: find('menu-reset'),
      menuClose: find('menu-close'),
      menuDelete: find('menu-delete'),
      popover: find('popover'),
      targetTag: find('target-tag'),
      targetText: find('target-text'),
      input: find('comment-input'),
      toast: find('toast'),
      modeButton: this.shadow.querySelector('[data-action="mode"]'),
      saveButton: this.shadow.querySelector('[data-action="save"]'),
      panelButton: this.shadow.querySelector('[data-action="panel"]'),
      scrim: this.shadow.querySelector('.pn-scrim'),
      shotPreview: find('shot-preview'),
      shotPreviewImg: find('shot-preview-img'),
      fileInput: find('file-input'),
      composeAttachments: find('compose-attachments'),
      annotator: find('annotator'),
      annotatorCanvas: find('annotator-canvas'),
      annotatorColors: find('annotator-colors'),
    };
  }

  bindUi() {
    for (const type of ['wheel', 'touchstart', 'touchmove', 'touchend']) {
      this.host.addEventListener(type, (event) => event.stopPropagation(), {
        passive: true,
      });
    }

    // While a native modal is open the host is moved inside the dialog, so
    // site handlers would otherwise see our clicks as "outside" clicks and
    // close the modal. PinNote handles its own events first (document capture).
    for (const type of ['click', 'pointerdown', 'mousedown', 'pointerup', 'mouseup', 'contextmenu']) {
      this.host.addEventListener(type, (event) => event.stopPropagation());
    }

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
      this.handleAction(
        target.dataset.action,
        target.dataset.id,
        target.dataset.filter,
        target.dataset.color,
        target.dataset.messageId || ''
      );
    });

    this.app.addEventListener('input', (event) => {
      const target = event.target;
      if (target === this.refs.input) {
        this.refs.saveButton.disabled = !target.value.trim();
        return;
      }
      if (target?.matches?.('[data-role="edit-input"]')) {
        if (this.state.editingMessage) {
          this.state.editingMessage.draft = target.value;
          const save = this.shadow.querySelector('[data-role="edit-save"]');
          if (save) save.disabled = !target.value.trim();
          this.scheduleUiSave();
        }
        return;
      }
      if (target === this.refs.replyInput) {
        const key = this.replyDraftKey();
        if (key) this.state.replyDrafts[key] = target.value;
        const empty = !target.value.trim() || this.viewedTask()?.status === 'closed';
        this.refs.sendReply.disabled = empty;
        this.scheduleUiSave();
      }
    });

    this.app.addEventListener('change', (event) => {
      if (event.target !== this.refs.fileInput) return;
      this.addComposeFiles([...(event.target.files || [])]);
      event.target.value = '';
    });

    this.app.addEventListener('keydown', (event) => {
      const target = event.target;
      if (
        this.state.taskMenuOpen &&
        ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)
      ) {
        const items = [
          ...this.refs.taskMenu.querySelectorAll('button:not(:disabled)'),
        ].filter((item) => !item.hidden);
        if (items.length > 0) {
          event.preventDefault();
          const index = items.indexOf(document.activeElement);
          const next =
            event.key === 'Home'
              ? 0
              : event.key === 'End'
                ? items.length - 1
                : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
          items[next].focus();
        }
        return;
      }
      if (target === this.refs.replyInput) {
        event.stopPropagation();
        if (event.key === 'Escape') {
          event.preventDefault();
          this.rememberReply();
          this.state.replyOpen = false;
          this.renderPanel();
          this.refs.replyButton.focus();
          return;
        }
        if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          this.sendReply();
        }
        return;
      }
      if (target?.matches?.('[data-role="edit-input"]')) {
        event.stopPropagation();
        if (event.key === 'Escape') {
          event.preventDefault();
          this.cancelEditMessage();
          return;
        }
        if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          this.saveEditedMessage();
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

  pageLayoutKey() {
    const projectId = this.state.config?.projectId || `${location.origin}${location.pathname}`;
    return `pin-note:ui:v2:${projectId}`;
  }

  ensurePageStyle() {
    if (document.getElementById('pin-note-page-style')) return;
    const style = document.createElement('style');
    style.id = 'pin-note-page-style';
    const cursor =
      '<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24">' +
      '<path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5 9.9 9.9 0 0 1-4.2-.9L3 20.8l1.6-4.9A8.5 8.5 0 1 1 21 11.5Z" ' +
      'fill="#b388ff" stroke="#140726" stroke-width="1.3" stroke-linejoin="round"/></svg>';
    const cursorUrl = `url("data:image/svg+xml,${encodeURIComponent(cursor)}") 3 21, crosshair`;
    style.textContent = [
      'html.pn-comment-mode,',
      'html.pn-comment-mode body,',
      `html.pn-comment-mode body *:not(#pin-note-root) { cursor: ${cursorUrl} !important; }`,
    ].join('\n');
    (document.head || document.documentElement).append(style);
  }

  applyPageLayout() {
    if (!document.body) return;
    this.ensurePageStyle();
    const style = getComputedStyle(document.body);
    this.state.layout = {
      paddingTop: Number.parseFloat(style.paddingTop) || 0,
      paddingRight: Number.parseFloat(style.paddingRight) || 0,
    };
    this.fixedElements = new WeakMap();
    this.fixedSet = new Set();
    this.updatePageOffsets();
    window.addEventListener('resize', () => {
      if (!this.state.layoutResizeNotice) this.resetFixedBases();
      this.updatePageOffsets();
      this.updateScrim();
      if (this.state.panel) this.renderPanel();
    }, { passive: true });
    window.addEventListener('beforeunload', () => this.restorePageLayout());
    if (typeof MutationObserver === 'function') {
      this.fixedObserver = new MutationObserver(() => this.scheduleFixedRebase());
      this.fixedObserver.observe(document.body, { childList: true, subtree: true });
    }
  }

  updatePageOffsets() {
    const mobile = innerWidth <= MOBILE_BREAKPOINT;
    this.state.mobile = mobile;
    const layout = this.state.layout || { paddingTop: 0, paddingRight: 0 };
    const right = this.state.panel && !mobile ? PANEL_WIDTH : 0;
    document.documentElement.style.setProperty('--pn-bar-height', `${BAR_HEIGHT}px`);
    document.documentElement.style.setProperty('--pn-panel-width', `${PANEL_WIDTH}px`);
    if (document.body) {
      document.body.style.paddingTop = `${layout.paddingTop + BAR_HEIGHT}px`;
      document.body.style.paddingRight = `${layout.paddingRight + right}px`;
    }
    this.host.dataset.panel = this.state.panel ? 'open' : 'closed';
    this.host.dataset.mobile = mobile ? 'true' : 'false';
    this.renderBar();
    this.scheduleFixedRebase();
  }

  restorePageLayout() {
    if (this.state.layout && document.body) {
      document.body.style.paddingTop = `${this.state.layout.paddingTop}px`;
      document.body.style.paddingRight = `${this.state.layout.paddingRight}px`;
    }
    if (this.fixedObserver) {
      this.fixedObserver.disconnect();
      this.fixedObserver = null;
    }
    if (this.state.fixedRaf) {
      clearTimeout(this.state.fixedRaf);
      this.state.fixedRaf = 0;
    }
    if (this.fixedSet) {
      for (const element of this.fixedSet) {
        this.restoreFixedBase(element);
      }
      this.fixedSet = null;
    }
    this.fixedElements = null;
  }

  scheduleFixedRebase() {
    if (this.state.fixedRaf) return;
    this.state.fixedRaf = setTimeout(() => {
      this.state.fixedRaf = 0;
      this.rebaseFixedElements();
    }, 50);
  }

  rememberFixedBase(element) {
    if (!this.fixedElements) this.fixedElements = new WeakMap();
    let base = this.fixedElements.get(element);
    if (base) return base;
    const style = getComputedStyle(element);
    if (style.position !== 'fixed') return null;
    const rect = element.getBoundingClientRect();
    base = {
      position: style.position,
      top: style.top,
      right: style.right,
      bottom: style.bottom,
      left: style.left,
      width: style.width,
      height: style.height,
      transform: style.transform,
      rect,
      inline: {},
    };
    for (const property of ['top', 'right', 'bottom', 'left', 'width', 'height']) {
      base.inline[property] = {
        value: element.style.getPropertyValue(property),
        priority: element.style.getPropertyPriority(property),
      };
    }
    this.fixedElements.set(element, base);
    this.fixedSet?.add(element);
    return base;
  }

  restoreFixedProperty(element, base, property) {
    const original = base.inline[property];
    if (original?.value) {
      element.style.setProperty(property, original.value, original.priority);
    } else {
      element.style.removeProperty(property);
    }
  }

  resetFixedBases() {
    if (!this.fixedSet) return;
    for (const element of this.fixedSet) {
      this.restoreFixedBase(element);
    }
    this.fixedElements = new WeakMap();
    this.fixedSet = new Set();
  }

  restoreFixedBase(element) {
    const base = this.fixedElements?.get(element);
    if (!base) return;
    for (const property of ['top', 'right', 'bottom', 'left', 'width', 'height']) {
      this.restoreFixedProperty(element, base, property);
    }
  }

  rebaseFixedElements() {
    if (!this.fixedElements || !document.body) return;
    const mobile = innerWidth <= MOBILE_BREAKPOINT;
    const panel = this.state.panel && !mobile ? PANEL_WIDTH : 0;
    const siteWidth = innerWidth - panel;
    const elements = document.body.querySelectorAll('*');
    for (const element of elements) {
      // The host can temporarily live inside an open dialog (to escape the
      // modal's inertness). It is our own fixed layer, not a site layer.
      if (element === this.host) continue;
      let base = this.fixedElements.get(element);
      if (!base) {
        base = this.rememberFixedBase(element);
        if (!base) continue;
      }
      // Restore our own previous overrides before applying fresh ones.
      for (const property of ['top', 'right', 'bottom', 'left', 'width', 'height']) {
        this.restoreFixedProperty(element, base, property);
      }
      const top = Number.parseFloat(base.top);
      const right = Number.parseFloat(base.right);
      const bottom = Number.parseFloat(base.bottom);
      const left = Number.parseFloat(base.left);
      const rect = base.rect;
      const fullWidth =
        Number.isFinite(left) &&
        Number.isFinite(right) &&
        Math.abs(left) < 1 &&
        Math.abs(right) < 1 &&
        (base.width === 'auto' || rect.width >= innerWidth * 0.9);
      const fullHeight =
        Number.isFinite(top) &&
        Number.isFinite(bottom) &&
        Math.abs(top) < 1 &&
        Math.abs(bottom) < 1;
      const tall = rect.height >= innerHeight - 2;
      const bottomAnchored =
        Number.isFinite(bottom) &&
        bottom >= 0 &&
        bottom <= innerHeight * 0.35 &&
        Math.abs(rect.bottom - (innerHeight - bottom)) <= 48 &&
        top > innerHeight * 0.5;
      const rightAnchored =
        Number.isFinite(right) &&
        right <= 48 &&
        rect.right >= innerWidth - right - 2 &&
        !fullWidth;

      if (Number.isFinite(top) && top >= 0 && top < innerHeight && !bottomAnchored) {
        element.style.setProperty('top', `${top + BAR_HEIGHT}px`, 'important');
      }
      if (fullHeight) {
        element.style.setProperty('bottom', `${bottom}px`, 'important');
      } else if (Number.isFinite(top) && tall) {
        element.style.setProperty(
          'height',
          `calc(100vh - ${BAR_HEIGHT + top}px)`,
          'important'
        );
      }

      if (panel > 0) {
        if (fullWidth) {
          element.style.setProperty('right', `${right + panel}px`, 'important');
          if (base.width !== 'auto') element.style.setProperty('width', 'auto', 'important');
        } else if (rect.width > siteWidth + 2) {
          const gutter = 24;
          const width = Math.max(1, Math.min(rect.width, siteWidth - gutter));
          element.style.setProperty('width', `${width}px`, 'important');
          const centered =
            Math.abs(rect.left + rect.width / 2 - innerWidth / 2) <= 4;
          if (centered && Number.isFinite(left) && left > 0) {
            element.style.setProperty('left', `${left - panel / 2}px`, 'important');
          }
        } else if (rightAnchored) {
          element.style.setProperty('left', `${left - panel}px`, 'important');
          element.style.setProperty('right', 'auto', 'important');
        }
      }
    }
  }

  notifySiteResize() {
    if (this.state.resizeNotice) return;
    this.state.resizeNotice = true;
    setTimeout(() => {
      this.state.resizeNotice = false;
      this.state.layoutResizeNotice = true;
      window.dispatchEvent(new Event('resize'));
      this.state.layoutResizeNotice = false;
    }, 40);
  }

  restoreUiState() {
    let saved = null;
    try {
      const raw = localStorage.getItem(this.pageLayoutKey());
      if (raw) saved = JSON.parse(raw);
    } catch {
      saved = null;
    }
    if (saved && typeof saved === 'object') {
      if (saved.taskFilter && ['active', 'closed', 'all'].includes(saved.taskFilter)) {
        this.state.taskFilter = saved.taskFilter;
      }
      if (saved.currentTaskId && this.findTask(saved.currentTaskId)?.status !== 'closed') {
        this.state.currentTaskId = saved.currentTaskId;
      }
      if (saved.viewedTaskId && this.findTask(saved.viewedTaskId)) {
        this.state.viewedTaskId = saved.viewedTaskId;
        if (saved.selectedFixId) this.state.activeId = saved.selectedFixId;
      }
      if (typeof saved.panel === 'boolean') this.state.panel = saved.panel;
      if (saved.replyDrafts && typeof saved.replyDrafts === 'object') {
        for (const [key, value] of Object.entries(saved.replyDrafts)) {
          if (key && typeof value === 'string') this.state.replyDrafts[key] = value;
        }
      }
      if (saved.replyOpen === true) this.state.replyOpen = true;
      if (saved.editingMessage && typeof saved.editingMessage === 'object') {
        const commentId = String(saved.editingMessage.commentId || '');
        const messageId = saved.editingMessage.messageId
          ? String(saved.editingMessage.messageId)
          : null;
        if (commentId) {
          this.state.editingMessage = {
            commentId,
            messageId,
            draft: String(saved.editingMessage.draft || ''),
          };
        }
      }
      if (this.state.panel) {
        this.refs.panel.hidden = false;
        this.refs.panel.setAttribute('aria-hidden', 'false');
        this.app.classList.add('has-panel');
        this.refs.panelButton.setAttribute('aria-expanded', 'true');
        this.refs.toggleLabel.textContent = 'Закрыть';
        this.updatePageOffsets();
      }
    }
    this.normalizeSelection();
    this.validateRestoredEditors();
    this.updateScrim();
    this.updateReloadNotice();
  }

  validateRestoredEditors() {
    const viewed = this.viewedTask();
    if (this.state.replyOpen) {
      const fix = this.selectedFix();
      if (!viewed || !fix || viewed.status === 'closed') this.state.replyOpen = false;
    }
    const editing = this.state.editingMessage;
    if (!editing) return;
    const comment = this.findComment(editing.commentId);
    if (!comment) {
      this.state.editingMessage = null;
      return;
    }
    if (editing.messageId) {
      const message = this.commentUserMessage(comment, editing.messageId);
      if (!message) {
        this.state.editingMessage = null;
        return;
      }
      if (!editing.draft) editing.draft = message.text || '';
    } else if (!editing.draft) {
      editing.draft = comment.comment || '';
    }
  }

  scheduleUiSave() {
    if (this.state.uiSaveTimer) return;
    this.state.uiSaveTimer = setTimeout(() => {
      this.state.uiSaveTimer = 0;
      this.saveUiState();
    }, 250);
  }

  saveUiState() {
    const editing = this.state.editingMessage;
    try {
      localStorage.setItem(
        this.pageLayoutKey(),
        JSON.stringify({
          panel: this.state.panel,
          taskFilter: this.state.taskFilter,
          currentTaskId: this.state.currentTaskId,
          viewedTaskId: this.state.viewedTaskId,
          selectedFixId: this.state.activeId,
          replyDrafts: this.state.replyDrafts,
          replyOpen: this.state.replyOpen,
          editingMessage: editing
            ? {
                commentId: editing.commentId,
                messageId: editing.messageId || null,
                draft: editing.draft || '',
              }
            : null,
        })
      );
    } catch {
      // Storage can be unavailable.
    }
  }

  normalizeSelection() {
    let current = this.findTask(this.state.currentTaskId);
    if (!current || current.status === 'closed') {
      current = this.openTasks()[0] || null;
      this.state.currentTaskId = current?.id || null;
    }
    if (this.state.viewedTaskId && !this.findTask(this.state.viewedTaskId)) {
      this.state.viewedTaskId = null;
    }
    const viewed = this.viewedTask();
    if (viewed) {
      const fixes = this.taskFixes(viewed.id);
      if (!fixes.some((fix) => fix.id === this.state.activeId)) {
        this.state.activeId = fixes.find((fix) => this.isFixActive(fix))?.id || fixes[0]?.id || null;
      }
    } else if (this.state.activeId && !this.findComment(this.state.activeId)) {
      this.state.activeId = null;
    }
  }

  openTasks() {
    return [...this.state.tasks]
      .filter((task) => task.status !== 'closed')
      .sort((left, right) => right.number - left.number);
  }

  viewedTask() {
    return this.findTask(this.state.viewedTaskId);
  }

  currentTask() {
    const task = this.findTask(this.state.currentTaskId);
    return task && task.status !== 'closed' ? task : this.openTasks()[0] || null;
  }

  taskFixes(taskId) {
    return this.state.comments
      .filter((comment) => comment.taskId === taskId)
      .sort((left, right) => {
        const leftAt = Date.parse(left.createdAt) || 0;
        const rightAt = Date.parse(right.createdAt) || 0;
        if (leftAt !== rightAt) return leftAt - rightAt;
        return String(left.id).localeCompare(String(right.id));
      });
  }

  selectedFix() {
    const task = this.viewedTask();
    if (!task) return null;
    const fixes = this.taskFixes(task.id);
    return fixes.find((fix) => fix.id === this.state.activeId) || null;
  }

  fixNumber(comment) {
    if (!comment) return 0;
    const fixes = this.taskFixes(comment.taskId);
    const index = fixes.findIndex((fix) => fix.id === comment.id);
    return index === -1 ? 0 : index + 1;
  }

  fixName(comment) {
    const anchor = comment?.anchor || {};
    const text = this.cleanText(anchor.text || '', 34);
    if (text) return text;
    if (anchor.tag) return `<${anchor.tag}>`;
    return this.cleanText(comment?.comment || 'Правка', 34);
  }

  isFixActive(comment) {
    return ['open', 'review', 'rejected', 'orphaned'].includes(comment?.status || 'open');
  }

  isFixAccepted(comment) {
    return ['approved', 'resolved', 'wontfix'].includes(comment?.status || '');
  }

  fixStatusLabel(comment) {
    const status = comment?.status || 'open';
    return {
      open: 'В работе',
      review: 'К проверке',
      approved: 'Принято',
      rejected: 'Доработать',
      resolved: 'Принято',
      wontfix: 'Не правим',
      orphaned: 'Не найден',
    }[status] || 'В работе';
  }

  fixStateLabel(task, fix) {
    const status = fix?.status || 'open';
    if (status === 'approved' || status === 'resolved') return 'Принята';
    if (status === 'wontfix') return 'Решено не править';
    if (status === 'orphaned') return 'Элемент не найден в текущем DOM';
    const agent = this.agentForTask(task?.id);
    const agentBusy = agent?.status === 'running' || agent?.status === 'queued';
    if (agentBusy) {
      const activity = agent?.activity ? ` — ${agent.activity}` : '';
      return (
        (agent?.commentId && agent.commentId === fix?.id
          ? 'Агент работает над этой правкой'
          : 'Отправлена агенту — агент работает над задачей') + activity
      );
    }
    if (status === 'review') return 'На проверке — примите правку или ответьте агенту';
    if (status === 'rejected') return 'Возвращена агенту на доработку';
    return 'В работе — ожидает агента';
  }

  taskAccepted(task) {
    const fixes = this.taskFixes(task?.id);
    return fixes.length > 0 && fixes.every((fix) => this.isFixAccepted(fix));
  }

  taskDateLabel(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const day = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' }).format(date);
    const time = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' }).format(date);
    return `${day}, ${time}`;
  }

  taskTag(task) {
    const number = Number(task?.number);
    return Number.isFinite(number) && number > 0 ? `ЗАДАЧА-${number}` : 'ЗАДАЧА';
  }

  openTask(taskId, fixId = null) {
    const task = this.findTask(taskId);
    if (!task) return;
    this.rememberReply();
    this.state.taskMenuOpen = false;
    this.state.confirmAction = '';
    this.state.replyOpen = false;
    this.state.editingMessage = null;
    this.state.viewedTaskId = task.id;
    if (task.status !== 'closed') {
      this.state.currentTaskId = task.id;
      if (task.status === 'active') this.state.activeTaskId = task.id;
    }
    const fixes = this.taskFixes(task.id);
    const selected = fixId && fixes.some((fix) => fix.id === fixId) ? fixId : null;
    this.state.activeId = selected || fixes.find((fix) => this.isFixActive(fix))?.id || fixes[0]?.id || null;
    this.state.panel = true;
    this.refs.panel.hidden = false;
    this.refs.panel.setAttribute('aria-hidden', 'false');
    this.app.classList.add('has-panel');
    this.refs.panelButton.setAttribute('aria-expanded', 'true');
    this.refs.toggleLabel.textContent = 'Закрыть';
    this.updatePageOffsets();
    this.updateScrim();
    this.notifySiteResize();
    this.renderPanel();
    this.schedulePins();
    this.saveUiState();
  }

  backToTasks() {
    this.rememberReply();
    this.state.replyOpen = false;
    this.state.editingMessage = null;
    this.state.viewedTaskId = null;
    this.state.taskMenuOpen = false;
    this.state.confirmAction = '';
    this.renderPanel();
    this.saveUiState();
    this.maybeReload();
  }

  rememberReply() {
    if (!this.state.replyOpen || !this.refs.replyInput) return;
    const key = this.replyDraftKey();
    if (key) this.state.replyDrafts[key] = this.refs.replyInput.value || '';
  }

  replyDraftKey() {
    const fix = this.selectedFix();
    if (!fix) return '';
    return `${fix.taskId}/${fix.id}`;
  }

  fillReply() {
    const key = this.replyDraftKey();
    if (!key) return;
    this.refs.replyInput.value = this.state.replyDrafts[key] || '';
    const empty = !this.refs.replyInput.value.trim() || this.viewedTask()?.status === 'closed';
    this.refs.sendReply.disabled = empty;
  }

  finishReply(key) {
    delete this.state.replyDrafts[key];
    if (this.replyDraftKey() !== key) {
      this.scheduleUiSave();
      return;
    }
    this.state.replyOpen = false;
    if (this.refs.replyInput) this.refs.replyInput.value = '';
    this.saveUiState();
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
    document.body?.addEventListener('scroll', onViewportChange, { passive: true });
    window.addEventListener('scroll', onViewportChange, { passive: true });
    window.addEventListener('resize', onViewportChange, { passive: true });
    window.addEventListener('pagehide', () => this.saveUiState());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.saveUiState();
    });
  }

  startTicker() {
    setInterval(() => {
      if (document.hidden) return;
      if (this.state.flash && this.state.flash.until <= Date.now()) this.state.flash = null;
      if (this.state.comments.length > 0) this.schedulePins();
      if (this.state.hovered || this.state.flash) this.scheduleHighlight();
      if (
        this.state.panel &&
        this.agentEnabled() &&
        Date.now() - this.state.agentPollAt > 4000
      ) {
        this.state.agentPollAt = Date.now();
        this.refreshAgentStates();
      }
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
    const mobile = innerWidth <= MOBILE_BREAKPOINT;

    if (event.altKey) {
      const current = this.state.compose?.element || this.state.selected?.element;
      const base =
        current?.isConnected && (current === clicked || current.contains(clicked))
          ? current
          : clicked;
      const parent = base.parentElement;
      if (!parent || parent === document.documentElement) {
        this.toast('Выше уже некуда');
        return;
      }
      if (mobile && !this.state.compose) this.selectElement(parent, event);
      else if (this.state.compose) this.updateComposeTarget(parent, event);
      else this.openCompose(parent, event);
      return;
    }

    // On narrow screens the compose popover covers the layout, so pick the
    // element first and open the popover from the bar button instead.
    if (mobile && !this.state.compose) {
      this.selectElement(clicked, event);
      return;
    }

    this.openCompose(clicked, event);
  }

  onPageSubmit(event) {
    if (!this.state.mode || this.isUiEvent(event)) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
  }

  onPageKeydown(event) {
    if (event.key !== 'Escape') return;
    const tag = event.target?.tagName;
    if (tag === 'TEXTAREA' || tag === 'INPUT') return;
    if (this.state.confirmAction) {
      event.preventDefault();
      this.state.confirmAction = '';
      this.renderPanel();
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
    if (this.state.replyOpen) {
      event.preventDefault();
      this.rememberReply();
      this.state.replyOpen = false;
      this.renderPanel();
      return;
    }
    if (this.state.mode) {
      event.preventDefault();
      this.setMode(false);
      return;
    }
    if (this.state.panel) {
      event.preventDefault();
      this.closePanel();
    }
  }

  async loadInitial() {
    try {
      const [config, data, agentState] = await Promise.all([
        this.api('/config'),
        this.api('/state'),
        this.api('/agent').catch(() => null),
      ]);
      this.state.config = config || {};
      this.state.agentConfig = config?.agent || null;
      this.applyState(data);
      if (agentState) this.applyAgentSnapshot(agentState);
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
      this.normalizeSelection();
    }
  }

  applyState(data) {
    this.state.comments = Array.isArray(data?.comments) ? data.comments : [];
    this.state.tasks = Array.isArray(data?.tasks) ? data.tasks : [];
    this.state.activeTaskId = data?.activeTaskId || null;
    this.state.nextTaskNumber = Number(data?.nextTaskNumber) || 1;
    if (!['active', 'closed', 'all'].includes(this.state.taskFilter)) this.state.taskFilter = 'active';
    const previous = this.findTask(this.state.currentTaskId);
    if (!previous || previous.status === 'closed') {
      this.state.currentTaskId = this.openTasks()[0]?.id || null;
    }
    this.normalizeSelection();
  }

  connectEvents() {
    if (!this.state.server || typeof EventSource === 'undefined') return;
    const source = new EventSource(`${API}/events`);
    source.addEventListener('comments', () => this.refreshFromServer());
    source.addEventListener('reload', () => this.onServerReload());
    source.addEventListener('agent', (event) => this.onAgentEvent(event));
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

  agentEnabled() {
    return Boolean(this.state.server && this.state.agentConfig?.enabled);
  }

  agentForTask(taskId) {
    return this.state.agents[taskId] || null;
  }

  applyAgentSnapshot(data) {
    let changed = false;
    if (data?.config) {
      const previous = this.state.agentConfig;
      if (JSON.stringify(previous) !== JSON.stringify(data.config)) changed = true;
      this.state.agentConfig = data.config;
    }
    for (const item of data?.tasks || []) {
      if (!item?.taskId) continue;
      const previous = this.state.agents[item.taskId] || {};
      const keys = [
        'status',
        'sessionId',
        'error',
        'queued',
        'mode',
        'startedAt',
        'finishedAt',
        'activity',
        'activityAt',
        'commentId',
      ];
      if (keys.some((key) => previous[key] !== item[key])) changed = true;
      this.state.agents[item.taskId] = { ...previous, ...item };
    }
    return changed;
  }

  applyAgentEvent(payload) {
    if (!payload?.taskId) return;
    const previous = this.state.agents[payload.taskId];
    this.state.agents[payload.taskId] = {
      ...(previous || {}),
      ...payload,
    };
    if (payload.reset) {
      this.toast('Сессия агента сброшена');
    } else if (payload.status === 'error' && previous?.status !== 'error') {
      this.toast(`Агент: ${this.agentErrorMessage(payload.error) || 'ошибка выполнения'}`, 'error');
    } else if (payload.status === 'completed' && previous?.status === 'running') {
      this.toast('Агент завершил работу — проверьте комментарии');
    }
    if (
      (payload.status === 'running' || payload.status === 'queued') &&
      payload.commentId &&
      this.state.replyOpen &&
      this.state.activeId === payload.commentId
    ) {
      this.rememberReply();
      this.state.replyOpen = false;
      this.saveUiState();
    }
    if (this.state.panel) this.renderPanel();
  }

  onAgentEvent(event) {
    try {
      this.applyAgentEvent(JSON.parse(event.data));
    } catch {
      // Ignore malformed SSE payloads.
    }
  }

  async refreshAgentStates() {
    if (!this.state.server || !this.agentEnabled() || this.state.agentPolling) return;
    this.state.agentPolling = true;
    try {
      const data = await this.api('/agent');
      const changed = this.applyAgentSnapshot(data);
      if (changed && this.state.panel) this.renderPanel();
    } catch {
      // The SSE stream remains the primary source of updates.
    } finally {
      this.state.agentPolling = false;
    }
  }

  onServerReload() {
    const wasPending = this.state.pendingReload;
    this.state.pendingReload = true;
    this.updateReloadNotice();
    if (this.state.reloadScheduled) return;
    if (this.hasUnsavedInput()) {
      if (!wasPending) {
        this.toast(
          'Сайт обновился. Ввод сохранён — перезагрузка после отправки или по кнопке «Обновить сайт».'
        );
      }
      return;
    }
    this.reloadSoon();
  }

  hasUnsavedInput() {
    if (this.state.compose) return true;
    if (this.state.replyOpen && String(this.refs.replyInput?.value || '').trim()) return true;
    if (this.state.editingMessage && String(this.state.editingMessage.draft || '').trim()) return true;
    const active = this.shadow.activeElement;
    if (
      active &&
      (active === this.refs.replyInput ||
        active === this.refs.input ||
        active.matches?.('[data-role="edit-input"]'))
    ) {
      return true;
    }
    return false;
  }

  updateReloadNotice() {
    if (!this.refs.reloadSite) return;
    const pending = Boolean(this.state.pendingReload && !this.state.reloadScheduled);
    this.refs.reloadSite.hidden = !pending;
    if (pending) {
      const waiting = this.hasUnsavedInput();
      this.refs.reloadSite.title = waiting
        ? 'Сайт обновился. Текст сохранён — перезагрузите страницу после отправки или нажмите здесь.'
        : 'Сайт обновился. Перезагрузить страницу';
    }
  }

  reloadSoon() {
    if (this.state.reloadScheduled || this.hasUnsavedInput()) return;
    this.state.reloadScheduled = true;
    this.state.pendingReload = false;
    this.updateReloadNotice();
    this.toast('Сайт обновился, перезагружаю…');
    setTimeout(() => {
      if (this.hasUnsavedInput()) {
        // The customer started typing during the short delay: keep the page
        // alive and let them finish; drafts are already persisted.
        this.state.reloadScheduled = false;
        this.state.pendingReload = true;
        this.updateReloadNotice();
        this.toast('Сайт обновился. Ввод сохранён — перезагрузка после отправки.', '');
        return;
      }
      location.reload();
    }, 350);
  }

  reloadNow() {
    this.state.reloadScheduled = true;
    this.state.pendingReload = false;
    this.updateReloadNotice();
    location.reload();
  }

  maybeReload() {
    if (!this.state.pendingReload || this.state.reloadScheduled) return;
    this.state.pendingReload = false;
    this.updateReloadNotice();
    this.reloadSoon();
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
        const hasWork = normalizedComments.some((comment) => isOpenStatus(comment.status));
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
    this.state.selected = null;
    this.refs.modeButton.setAttribute('aria-pressed', String(this.state.mode));
    const modeLabel = this.state.mode ? 'Остановить комментирование' : 'Комментировать';
    this.refs.modeButton.setAttribute('aria-label', modeLabel);
    this.refs.modeButton.title = modeLabel;
    this.app.classList.toggle('is-commenting', this.state.mode);
    document.documentElement.classList.toggle('pn-comment-mode', this.state.mode);
    this.refs.hint.textContent = this.state.mode
      ? 'выберите элемент на странице'
      : this.projectLabel();
    this.renderBar();
    if (!this.state.mode) {
      this.state.hovered = null;
      this.closeCompose({ reload: false });
      this.scheduleHighlight();
      this.maybeReload();
      return;
    }
    if (innerWidth <= MOBILE_BREAKPOINT) this.setPanel(false);
    if (!this.state.hintShown) {
      this.state.hintShown = true;
      this.toast(
        innerWidth <= MOBILE_BREAKPOINT
          ? 'Кликните по элементу, затем нажмите кнопку с карандашом в баре.'
          : 'Кликните по элементу. Alt/Option+клик — подняться по дереву.'
      );
    }
  }

  setPanel(open) {
    this.state.panel = Boolean(open);
    if (!this.state.panel) {
      this.state.taskMenuOpen = false;
      this.state.confirmAction = '';
      this.state.replyOpen = false;
      this.state.editingMessage = null;
      this.state.editingId = null;
    }
    this.refs.panel.hidden = !this.state.panel;
    this.refs.panel.setAttribute('aria-hidden', String(!this.state.panel));
    this.app.classList.toggle('has-panel', this.state.panel);
    this.refs.panelButton.setAttribute('aria-expanded', String(this.state.panel));
    this.refs.panelButton.title = this.state.panel ? 'Свернуть панель' : 'Открыть панель';
    this.refs.toggleLabel.textContent = this.state.panel ? 'Закрыть' : 'Открыть';
    this.updatePageOffsets();
    this.updateScrim();
    this.notifySiteResize();
    this.schedulePins();
    this.scheduleHighlight();
    if (this.state.panel) this.renderPanel();
    this.updateCounts();
    this.saveUiState();
    if (!this.state.panel) this.maybeReload();
  }

  updateScrim() {
    if (!this.refs.scrim) return;
    this.refs.scrim.hidden = !(this.state.panel && innerWidth <= MOBILE_BREAKPOINT);
  }

  openPanel() {
    this.setPanel(true);
  }

  closePanel() {
    this.setPanel(false);
  }

  projectLabel() {
    return this.state.config?.project || location.hostname || 'website';
  }

  selectElement(element, event) {
    const anchor = this.captureAnchor(element, event);
    this.state.selected = { element, anchor };
    this.state.hovered = element;
    this.renderBar();
    this.scheduleHighlight();
    if (!this.state.pickHintShown) {
      this.state.pickHintShown = true;
      this.toast('Элемент выбран. Нажмите кнопку с карандашом в баре.');
    } else {
      this.announce(`Выбран элемент ${this.describeElement(element)}.`);
    }
  }

  clearSelection() {
    if (!this.state.selected) return;
    this.state.selected = null;
    if (!this.state.compose) {
      this.state.hovered = null;
      this.scheduleHighlight();
    }
    this.renderBar();
  }

  composeSelectedElement() {
    const selected = this.state.selected;
    if (!selected) return;
    this.dismissToast();
    if (!selected.element?.isConnected) {
      this.clearSelection();
      this.toast('Элемент больше не на странице', 'error');
      return;
    }
    this.state.selected = null;
    this.openCompose(selected.element, null, selected.anchor);
  }

  selectParentOfSelection() {
    const selected = this.state.selected;
    if (!selected) return;
    if (!selected.element?.isConnected) {
      this.clearSelection();
      this.toast('Элемент больше не на странице', 'error');
      return;
    }
    const parent = selected.element.parentElement;
    if (!parent || parent === document.documentElement) {
      this.toast('Выше уже некуда');
      return;
    }
    const point = selected.anchor?.point;
    let event = null;
    if (point) {
      const rect = selected.element.getBoundingClientRect();
      event = {
        clientX: rect.left + point.x * rect.width,
        clientY: rect.top + point.y * rect.height,
      };
    }
    this.selectElement(parent, event);
  }

  openCompose(element, event, anchorOverride = null) {
    this.clearScreenshot();
    this.clearComposeAttachments();
    this.state.selected = null;
    const anchor = anchorOverride || this.captureAnchor(element, event);
    const rect = element.getBoundingClientRect();
    const point = event
      ? { offsetX: event.clientX - rect.left, offsetY: event.clientY - rect.top }
      : anchor?.point
        ? { offsetX: anchor.point.x * rect.width, offsetY: anchor.point.y * rect.height }
        : null;
    this.state.compose = {
      element,
      anchor,
      screenshot: null,
      attachments: [],
      click: point,
    };
    this.state.hovered = element;
    if (innerWidth <= MOBILE_BREAKPOINT) this.setPanel(false);
    this.refs.targetTag.textContent = `<${element.localName}>`;
    const text = anchor.text ? `«${anchor.text.slice(0, 110)}»` : anchor.selector;
    this.refs.targetText.textContent = text;
    this.refs.targetText.title = anchor.selector;
    this.refs.input.value = '';
    this.refs.saveButton.disabled = true;
    this.refs.popover.hidden = false;
    this.positionPopover(element);
    this.renderSelectionActions();
    this.scheduleHighlight();
    requestAnimationFrame(() => this.refs.input.focus());
  }

  updateComposeTarget(element, event) {
    this.clearScreenshot();
    const anchor = this.captureAnchor(element, event);
    const rect = element.getBoundingClientRect();
    this.state.compose = {
      element,
      anchor,
      screenshot: null,
      attachments: this.state.compose?.attachments || [],
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

  clearComposeAttachments() {
    for (const attachment of this.state.compose?.attachments || []) {
      if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
    }
    if (this.state.compose) this.state.compose.attachments = [];
    if (this.refs.composeAttachments) {
      this.refs.composeAttachments.replaceChildren();
      this.refs.composeAttachments.hidden = true;
    }
    if (this.refs.fileInput) this.refs.fileInput.value = '';
  }

  addComposeFiles(files) {
    const compose = this.state.compose;
    if (!compose || files.length === 0) return;
    const maxFiles = Number(this.state.config?.capabilities?.maxAttachments) || 10;
    const maxBytes = Number(this.state.config?.capabilities?.maxAttachmentBytes) || 32 * 1024 * 1024;
    if (!Array.isArray(compose.attachments)) compose.attachments = [];
    let added = 0;
    let tooBig = 0;
    for (const file of files) {
      if (compose.attachments.length >= maxFiles) {
        this.toast(`Можно прикрепить не больше ${maxFiles} файлов`, 'error');
        break;
      }
      if (file.size > maxBytes) {
        tooBig += 1;
        continue;
      }
      const isImage = this.attachmentIsImage({ name: file.name, type: file.type });
      compose.attachments.push({
        file,
        name: file.name || 'file',
        type: file.type || 'application/octet-stream',
        size: file.size,
        previewUrl: isImage ? URL.createObjectURL(file) : '',
        width: 0,
        height: 0,
      });
      added += 1;
    }
    if (tooBig > 0) {
      this.toast(`Файл больше ${this.formatBytes(maxBytes)} не прикреплён`, 'error');
    }
    this.renderComposeAttachments();
    if (added > 0) {
      this.toast(added === 1 ? 'Файл прикреплён' : `Прикреплено файлов: ${added}`);
      this.positionPopover(this.state.compose.element);
    }
  }

  removeComposeAttachment(index) {
    const compose = this.state.compose;
    if (!compose || !Array.isArray(compose.attachments)) return;
    const [removed] = compose.attachments.splice(index, 1);
    if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl);
    this.renderComposeAttachments();
    this.positionPopover(compose.element);
  }

  renderComposeAttachments() {
    const container = this.refs.composeAttachments;
    if (!container) return;
    const attachments = this.state.compose?.attachments || [];
    container.replaceChildren();
    container.hidden = attachments.length === 0;
    attachments.forEach((attachment, index) => {
      const chip = document.createElement('div');
      chip.className = 'pn-attachment-chip';
      chip.title = `${attachment.name} · ${this.formatBytes(attachment.size)}`;
      if (attachment.previewUrl) {
        const image = document.createElement('img');
        image.src = attachment.previewUrl;
        image.alt = attachment.name;
        image.addEventListener('load', () => {
          attachment.width = image.naturalWidth || 0;
          attachment.height = image.naturalHeight || 0;
        });
        chip.append(image);
      } else {
        const icon = document.createElement('span');
        icon.className = 'pn-attachment-icon';
        icon.textContent = this.fileBadge(attachment.name);
        chip.append(icon);
      }
      const name = document.createElement('span');
      name.className = 'pn-attachment-name';
      name.textContent = attachment.name;
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'pn-icon-btn pn-attachment-remove';
      remove.dataset.action = 'remove-compose-attachment';
      remove.dataset.id = String(index);
      remove.setAttribute('aria-label', `Убрать ${attachment.name}`);
      remove.title = 'Убрать файл';
      remove.textContent = '×';
      chip.append(name, remove);
      container.append(chip);
    });
  }

  fileBadge(name) {
    const extension = String(name || '').split('.').pop().toLowerCase();
    if (!extension || extension === name || extension.length > 4) return 'FILE';
    return extension.toUpperCase().slice(0, 4);
  }

  formatBytes(value) {
    const size = Number(value);
    if (!Number.isFinite(size) || size <= 0) return '0 Б';
    const units = ['Б', 'КБ', 'МБ', 'ГБ'];
    let amount = size;
    let index = 0;
    while (amount >= 1024 && index < units.length - 1) {
      amount /= 1024;
      index += 1;
    }
    const rounded = amount >= 10 || index === 0 ? Math.round(amount) : Math.round(amount * 10) / 10;
    return `${rounded} ${units[index]}`;
  }

  async uploadAttachment(attachment) {
    const params = new URLSearchParams({
      name: attachment.name || 'file',
      type: attachment.type || 'application/octet-stream',
    });
    const response = await fetch(`${API}/attachments?${params.toString()}`, {
      method: 'POST',
      headers: { 'content-type': attachment.type || 'application/octet-stream' },
      body: attachment.file,
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
    return data.attachment;
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
    const siteRight =
      this.state.panel && innerWidth > MOBILE_BREAKPOINT
        ? innerWidth - PANEL_WIDTH
        : innerWidth;
    const maxLeft = Math.max(margin, siteRight - width - margin);
    let left = anchorX + 14;
    if (left + width > siteRight - margin) left = anchorX - width - 14;
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
    this.clearComposeAttachments();
    this.state.compose = null;
    this.state.selected = null;
    this.refs.popover.hidden = true;
    this.refs.input.value = '';
    this.refs.input.blur();
    this.refs.saveButton.disabled = true;
    this.state.hovered = null;
    this.renderSelectionActions();
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
      taskId: this.currentTask()?.id || null,
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

    if (compose.attachments?.length > 0) {
      if (!this.state.server) {
        this.state.busy = false;
        this.refs.saveButton.disabled = false;
        this.toast('Файлы доступны только с review-сервером', 'error');
        return;
      }
      try {
        payload.attachments = [];
        for (const attachment of compose.attachments) {
          const uploaded = await this.uploadAttachment(attachment);
          if (uploaded) payload.attachments.push(uploaded);
        }
      } catch (err) {
        this.state.busy = false;
        this.refs.saveButton.disabled = false;
        this.toast(err.message || 'Не удалось загрузить файл', 'error');
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
    const savedTaskId = savedTask?.id || saved?.taskId || null;
    this.closeCompose({ reload: false });
    if (!this.state.server) {
      if (!this.state.comments.some((comment) => comment.id === saved.id)) {
        this.state.comments.push(saved);
      }
      this.saveLocal();
      this.normalizeSelection();
      this.renderAll();
    } else {
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
      }
    }
    if (savedTaskId) {
      this.state.currentTaskId = savedTaskId;
      this.state.viewedTaskId = savedTaskId;
      this.state.activeId = saved.id;
      if (this.state.taskFilter === 'closed') this.state.taskFilter = 'active';
      this.state.panel = true;
      this.refs.panel.hidden = false;
      this.refs.panel.setAttribute('aria-hidden', 'false');
      this.app.classList.add('has-panel');
      this.refs.panelButton.setAttribute('aria-expanded', 'true');
      this.refs.toggleLabel.textContent = 'Закрыть';
      this.updatePageOffsets();
      this.updateScrim();
      this.notifySiteResize();
      this.renderPanel();
      this.schedulePins();
      this.saveUiState();
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
    return task;
  }

  createLocalTask() {
    const now = new Date().toISOString();
    const number = Math.max(1, Number(this.state.nextTaskNumber) || 1);
    const task = {
      id: `t_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
      number,
      status: 'active',
      description: `Задача T-${number}`,
      createdAt: now,
      updatedAt: now,
      submittedAt: null,
      closedAt: null,
    };
    this.state.tasks.push(task);
    this.state.nextTaskNumber = number + 1;
    this.state.activeTaskId = task.id;
    return task;
  }

  placeholderTaskDescription(task) {
    const description = String(task?.description || '').trim();
    return !description || /^Задача\s+T-\d+$/i.test(description) || description === 'Новая задача';
  }

  createLocalComment(payload) {
    const now = new Date().toISOString();
    const requested = payload.taskId ? this.findTask(payload.taskId) : null;
    const task =
      requested && requested.status !== 'closed'
        ? requested
        : this.ensureLocalActiveTask(payload.comment);
    const firstComment = !this.state.comments.some((comment) => comment.taskId === task.id);
    if (firstComment && this.placeholderTaskDescription(task)) {
      task.description = this.cleanText(payload.comment, 120);
      task.updatedAt = now;
    }
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
    if (payload.attachments?.length) comment.attachments = payload.attachments;
    comment.thread = [];
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
    const current = this.currentTask();
    const visibleComments = current
      ? this.taskFixes(current.id).filter((comment) => this.isFixActive(comment))
      : [];
    visibleComments.forEach((comment, index) => {
      const element = this.resolveAnchor(comment.anchor);
      if (!element) return;
      const rect = element.getBoundingClientRect();
      if ((!rect.width && !rect.height) || rect.right < 0 || rect.left > innerWidth) return;
      if (rect.bottom < -30 || rect.top > innerHeight + 30) return;
      const offset = (offsets.get(element) || 0) * PIN_OFFSET;
      offsets.set(element, (offsets.get(element) || 0) + 1);
      const number = this.fixNumber(comment);

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
      pin.title = [pinTask ? this.taskTag(pinTask) : '', `правка ${String(number).padStart(2, '0')}`, this.fixName(comment)]
        .filter(Boolean)
        .join(' · ');
      pin.setAttribute('aria-label', `Правка ${number || 1}: ${this.fixName(comment)}`);
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
    this.renderBar();
    this.renderPanelIfOpen();
    this.schedulePins();
    this.scheduleHighlight();
  }

  updateCounts() {
    const task = this.currentTask();
    const fixes = task ? this.taskFixes(task.id) : [];
    const pending = fixes.filter((fix) => fix.status === 'review').length;
    const working = fixes.filter((fix) => ['open', 'rejected', 'orphaned'].includes(fix.status)).length;
    const attention = pending + working;
    this.refs.count.hidden = attention === 0;
    this.refs.count.textContent = attention > 0 ? String(attention) : '';
    const details = [];
    if (pending > 0) details.push(`${pending} к проверке`);
    if (working > 0) details.push(`${working} в работе`);
    this.refs.count.title = details.join(' · ') || 'Нет активных правок';
    this.refs.count.classList.toggle('is-review', pending > 0);
    this.refs.panelButton.setAttribute(
      'aria-label',
      `${this.state.panel ? 'Свернуть' : 'Открыть'} панель задач, ${attention} требуют внимания`
    );
  }

  updateServerNote() {
    const local = !this.state.server;
    const project = this.projectLabel();
    this.refs.server.classList.toggle('is-local', local);
    this.refs.server.textContent = local
      ? `// LOCAL MODE · ${project} · только localStorage`
      : `// SYNC · ${project} · ${this.state.config.commentsFile || '.review/comments.json'}`;
    this.refs.server.title = local
      ? 'Review-сервер не запущен: комментарии хранятся в localStorage.'
      : 'Изменения подхватываются автоматически по SSE.';
  }

  renderPanelIfOpen() {
    if (this.state.panel) this.renderPanel();
  }

  renderPanel() {
    this.normalizeSelection();
    this.updateCounts();
    this.updateServerNote();
    this.renderBar();
    const viewed = this.viewedTask();
    this.refs.listScreen.hidden = Boolean(viewed);
    this.refs.detailScreen.hidden = !viewed;
    this.renderTaskList();
    if (viewed) {
      this.renderDetail(viewed);
    } else {
      this.refs.taskMenu.hidden = true;
    }
    this.updateScrim();
  }

  renderBar() {
    const current = this.currentTask();
    const label = current ? this.taskTag(current) : 'НОВАЯ ЗАДАЧА';
    this.refs.currentTask.textContent = label;
    this.refs.currentTask.title = current
      ? `Текущая задача · ${current.description || 'без описания'}`
      : 'Задача появится с первым комментарием';
    this.refs.currentTask.classList.toggle('is-empty', !current);
    this.refs.hint.textContent = this.state.mode ? 'выберите элемент на странице' : this.projectLabel();
    this.refs.modeButton.setAttribute('aria-pressed', String(this.state.mode));
    this.refs.panelButton.setAttribute('aria-expanded', String(this.state.panel));
    this.refs.toggleLabel.textContent = this.state.panel ? 'Закрыть' : 'Открыть';
    this.renderSelectionActions();
    this.updateReloadNotice();
  }

  renderSelectionActions() {
    const selected = this.state.selected;
    const available =
      Boolean(selected) &&
      this.state.mode &&
      !this.state.compose &&
      innerWidth <= MOBILE_BREAKPOINT;
    this.refs.composeAction.hidden = !available;
    this.refs.parentAction.hidden = !available;
    if (!available) return;
    const element = selected.element;
    const connected = element?.isConnected;
    this.refs.composeAction.disabled = !connected;
    this.refs.composeAction.title = connected
      ? `Написать комментарий к <${element.localName}>`
      : 'Элемент больше не на странице';
    const parent = connected ? element.parentElement : null;
    const canGoUp = Boolean(parent) && parent !== document.documentElement;
    this.refs.parentAction.disabled = !canGoUp;
    this.refs.parentAction.title = canGoUp
      ? `Выбрать родительский элемент <${parent.localName}>`
      : 'Выше уже некуда';
  }

  renderTaskList() {
    const panel = this.refs.taskList;
    this.updateAddTaskState();
    const all = [...this.state.tasks].sort((left, right) => right.number - left.number);
    const filtered = all.filter((task) => {
      if (this.state.taskFilter === 'closed') return task.status === 'closed';
      if (this.state.taskFilter === 'active') return task.status !== 'closed';
      return true;
    });
    this.refs.taskCount.textContent = `${String(filtered.length).padStart(2, '0')} / ${String(all.length).padStart(2, '0')}`;
    for (const button of this.refs.taskFilters) {
      button.setAttribute('aria-pressed', String(button.dataset.filter === this.state.taskFilter));
    }
    panel.replaceChildren();
    if (filtered.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'pn-empty';
      empty.textContent = all.length
        ? this.state.taskFilter === 'closed'
          ? 'Закрытых задач пока нет.'
          : 'Активных задач пока нет.'
        : 'Выберите элемент на сайте, чтобы добавить первую правку.';
      panel.append(empty);
      return;
    }
    const current = this.currentTask();
    for (const task of filtered) {
      const { total, counts } = this.taskCounts(task.id);
      const pending = counts.review;
      const accepted = this.taskFixes(task.id).filter((fix) => this.isFixAccepted(fix)).length;
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'pn-task-card';
      card.dataset.action = 'select-task';
      card.dataset.id = task.id;
      card.classList.toggle('is-current', current?.id === task.id);
      card.classList.toggle('is-viewed', this.viewedTask()?.id === task.id);

      const top = document.createElement('div');
      top.className = 'pn-task-card-top';
      const date = document.createElement('span');
      date.className = 'pn-task-date';
      date.textContent = this.taskDateLabel(task.createdAt);
      const badge = document.createElement('span');
      badge.className = `pn-badge status-${task.status}`;
      badge.textContent = task.status === 'closed' ? 'Закрыта' : task.status === 'review' ? 'На проверке' : 'В работе';
      top.append(date, badge);

      const name = document.createElement('h3');
      name.className = 'pn-task-name';
      name.textContent = this.taskTag(task);

      const description = document.createElement('p');
      description.className = 'pn-task-desc';
      description.textContent = task.description || 'Без описания';

      const bottom = document.createElement('div');
      bottom.className = 'pn-task-card-bottom';
      const meta = document.createElement('span');
      meta.textContent = `${total} ${this.plural(total, 'правка', 'правки', 'правок')}`;
      if (pending > 0) meta.textContent += ` · ${pending} к проверке`;
      else if (total > 0 && accepted === total) meta.textContent += ' · готово';
      const chev = document.createElement('span');
      chev.className = 'pn-task-chev';
      chev.setAttribute('aria-hidden', 'true');
      chev.textContent = '›';
      bottom.append(meta, chev);
      card.append(top, name, description, bottom);
      panel.append(card);
    }
  }

  renderDetail(task) {
    const fixes = this.taskFixes(task.id);
    const selected = this.selectedFix() || fixes[0] || null;
    if (selected && selected.id !== this.state.activeId) this.state.activeId = selected.id;
    const accepted = fixes.filter((fix) => this.isFixAccepted(fix)).length;
    const total = fixes.length;
    const closed = task.status === 'closed';

    this.refs.taskTitle.textContent = this.taskTag(task);
    this.refs.taskDate.textContent = this.taskDateLabel(task.createdAt);
    this.refs.taskDate.dateTime = task.createdAt || '';
    this.refs.taskStatus.textContent = closed ? 'Закрыта' : task.status === 'review' ? 'На проверке' : 'В работе';
    this.refs.taskStatus.className = `pn-badge status-${task.status}`;
    this.refs.acceptedCount.textContent = `${accepted} из ${total}`;
    this.refs.progress.setAttribute('aria-valuemax', String(total || 1));
    this.refs.progress.setAttribute('aria-valuenow', String(accepted));
    this.refs.progress.setAttribute('aria-valuetext', `${accepted} из ${total} правок принято`);
    this.refs.progressFill.style.width = `${total ? (accepted / total) * 100 : 0}%`;
    this.refs.progress.classList.toggle('is-full', total > 0 && accepted === total);

    const ready = !closed && total > 0 && accepted === total && !this.state.confirmAction;
    this.refs.acceptTask.disabled = !ready;
    this.refs.acceptTask.textContent = closed ? 'Принята' : 'Принять';
    this.refs.acceptTask.title = closed
      ? 'Задача уже принята'
      : total === 0
        ? 'В задаче нет правок'
        : accepted === total
          ? 'Принять и завершить задачу'
          : 'Сначала примите каждую правку';

    this.renderConfirm(task);
    this.renderAgentState(task);
    this.renderFixes(task, selected);
    this.refs.fixState.hidden = true;
    if (selected) {
      this.renderFixState(task, selected);
      this.renderMessages(selected);
      this.renderComposer(task, selected);
    } else {
      this.refs.messages.replaceChildren();
      const empty = document.createElement('p');
      empty.className = 'pn-empty';
      empty.textContent = 'В этой задаче пока нет правок.';
      this.refs.messages.append(empty);
      this.refs.composer.hidden = true;
      this.refs.acceptFix.disabled = true;
      this.refs.replyButton.hidden = false;
      this.refs.replyButton.disabled = true;
      if (this.refs.stopFixButton) this.refs.stopFixButton.hidden = true;
    }
    const menuOpen = Boolean(this.state.taskMenuOpen);
    this.refs.taskMenu.hidden = !menuOpen;
    this.refs.taskMenuButton.setAttribute('aria-expanded', String(menuOpen));
    this.refs.taskMenuButton.disabled = false;
    this.renderTaskAction(task);
    this.refs.footerActions.hidden =
      Boolean(this.state.confirmAction) ||
      (this.state.replyOpen && task.status !== 'closed');
    this.refs.threadTitle.textContent = selected
      ? `// ДИАЛОГ · ПРАВКА ${String(this.fixNumber(selected)).padStart(2, '0')}`
      : '// ДИАЛОГ';
    this.refs.confirm.hidden = !this.state.confirmAction;
  }

  renderConfirm(task) {
    const action = this.state.confirmAction;
    this.refs.confirm.hidden = !action;
    if (!action) return;
    this.refs.confirmLabel.textContent =
      action === 'delete'
        ? `Удалить ${this.taskTag(task)} вместе со всеми правками? Это необратимо.`
        : `Закрыть ${this.taskTag(task)}? Все её правки будут приняты.`;
    this.refs.confirmButton.textContent = action === 'delete' ? 'Удалить' : 'Принять задачу';
  }

  agentErrorMessage(message) {
    const text = String(message || '').trim();
    if (/workspace routing discovery failed/i.test(text)) {
      return 'Codex не смог определить workspace. Обнови Codex CLI, выполни «codex login» и перезапусти PinNote.';
    }
    return text;
  }

  renderAgentState(task) {
    const agent = this.agentForTask(task.id);
    const labels = {
      running: 'AGENT: работает',
      queued: 'AGENT: в очереди',
      completed: 'AGENT: завершил',
      error: 'AGENT: ошибка',
      cancelled: 'AGENT: остановлен',
    };
    const busy = agent?.status === 'running' || agent?.status === 'queued';
    const agentReady = this.agentEnabled();
    if (agent && agentReady && agent.status !== 'idle') {
      this.refs.agentActivity.hidden = false;
      this.refs.agentActivity.textContent =
        labels[agent.status] || 'AGENT';
      this.refs.agentActivity.title = [agent.sessionId ? `Сессия: ${agent.sessionId}` : '', agent.error || '']
        .filter(Boolean)
        .join(' · ');
      this.refs.agentActivity.className = `pn-agent-activity status-${agent.status}`;
    } else {
      this.refs.agentActivity.hidden = true;
      this.refs.agentActivity.textContent = '';
    }
    if (agent?.error && (agent.status === 'error' || agent.status === 'cancelled')) {
      this.refs.agentNote.hidden = false;
      this.refs.agentNote.textContent = `AGENT // ${this.agentErrorMessage(agent.error)}`;
      this.refs.agentNote.title = agent.error;
    } else {
      this.refs.agentNote.hidden = true;
      this.refs.agentNote.textContent = '';
    }
    const dispatch = this.refs.menuDispatch;
    const cancel = this.refs.menuCancel;
    const reset = this.refs.menuReset;
    if (dispatch) {
      dispatch.hidden = !agentReady;
      dispatch.disabled = task.status === 'closed' || !this.taskFixes(task.id).length || busy;
      const rejected = this.taskFixes(task.id).some((fix) => fix.status === 'rejected');
      dispatch.textContent = rejected ? 'Отправить на доработку' : 'Отправить агенту';
    }
    if (cancel) {
      cancel.hidden = !agentReady;
      cancel.disabled = !busy;
    }
    if (reset) {
      reset.hidden = !agentReady || !agent?.sessionId;
      reset.disabled = false;
    }
    if (this.refs.menuClose) {
      this.refs.menuClose.disabled = task.status === 'closed';
    }
  }

  renderFixes(task, selected) {
    const fixes = this.taskFixes(task.id);
    this.refs.fixCount.textContent = String(fixes.length);
    this.refs.fixList.replaceChildren();
    if (fixes.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'pn-empty';
      empty.textContent = 'Правок пока нет.';
      this.refs.fixList.append(empty);
      return;
    }
    for (const fix of fixes) {
      const number = this.fixNumber(fix);
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'pn-fix';
      row.dataset.action = 'select-fix';
      row.dataset.id = fix.id;
      row.setAttribute('aria-pressed', String(fix.id === selected?.id));
      const num = document.createElement('span');
      num.className = 'pn-fix-num';
      num.textContent = String(number).padStart(2, '0');
      const name = document.createElement('span');
      name.className = 'pn-fix-name';
      name.textContent = this.fixName(fix);
      const status = document.createElement('span');
      status.className = `pn-fix-status status-${fix.status || 'open'}`;
      status.textContent = this.fixStatusLabel(fix);
      row.append(num, name, status);
      this.refs.fixList.append(row);
    }
    this.refs.fixList
      .querySelector('[aria-pressed="true"]')
      ?.scrollIntoView({ block: 'nearest' });
  }

  renderFixState(task, fix) {
    const node = this.refs.fixState;
    if (!node) return;
    if (!fix) {
      node.hidden = true;
      node.textContent = '';
      node.removeAttribute('data-state');
      return;
    }
    node.hidden = false;
    node.dataset.state = fix.status || 'open';
    node.textContent = `// СОСТОЯНИЕ · ${this.fixStateLabel(task, fix)}`;
    node.title = this.fixStateLabel(task, fix);
  }

  renderMessages(comment) {
    const container = this.refs.messages;
    const editing = this.state.editingMessage;
    if (
      editing &&
      editing.commentId === comment.id &&
      !this.isAgentWorkingOnFix(comment) &&
      container.querySelector('[data-role="edit-input"]')
    ) {
      // Do not rebuild the dialogue while the customer is typing: an SSE
      // refresh or agent poll must not steal the caret or reset scroll.
      return;
    }
    const previousScroll = container.scrollTop;
    const busy = this.isAgentWorkingOnFix(comment);
    container.replaceChildren();
    container.append(
      this.renderThreadBubble(
        {
          role: 'user',
          kind: 'initial',
          text: comment.comment || '',
          at: comment.createdAt,
          editedAt: comment.editedAt,
          attachments: comment.attachments,
        },
        {
          initial: true,
          screenshot: comment.screenshot,
          editable: !busy,
          commentId: comment.id,
          messageId: null,
        }
      )
    );
    for (const message of this.commentThreadMessages(comment)) {
      container.append(
        this.renderThreadBubble(message, {
          editable: !busy && message.role === 'user' && Boolean(message.id),
          commentId: comment.id,
          messageId: message.id || null,
        })
      );
    }
    if (this.state.scrollMessages) {
      container.scrollTop = container.scrollHeight;
      this.state.scrollMessages = false;
    } else {
      container.scrollTop = previousScroll;
    }
  }

  isAgentBusy(taskId) {
    const status = this.agentForTask(taskId)?.status;
    return status === 'running' || status === 'queued';
  }

  agentWorkingFixId(taskId) {
    if (!this.isAgentBusy(taskId)) return null;
    return this.agentForTask(taskId)?.commentId || null;
  }

  isAgentWorkingOnFix(comment) {
    if (!comment) return false;
    const fixId = this.agentWorkingFixId(comment.taskId);
    return Boolean(fixId) && fixId === comment.id;
  }

  busyAgentTaskId() {
    const viewed = this.viewedTask();
    if (viewed && this.isAgentBusy(viewed.id)) return viewed.id;
    for (const [taskId, agent] of Object.entries(this.state.agents || {})) {
      if (agent?.status === 'running' || agent?.status === 'queued') return taskId;
    }
    return null;
  }

  anyAgentBusy() {
    return Boolean(this.busyAgentTaskId());
  }

  renderTaskAction(task) {
    const fixes = this.taskFixes(task.id);
    const working = fixes.filter(
      (fix) => !['review', 'approved', 'resolved', 'wontfix'].includes(fix.status)
    );
    const review = fixes.filter((fix) => fix.status === 'review');
    const accepted = fixes.filter((fix) => this.isFixAccepted(fix));
    const busyTaskId = this.busyAgentTaskId();
    const button = this.refs.taskActionButton;
    const container = this.refs.taskAction;
    if (!button || !container) return;
    container.hidden = false;
    button.disabled = false;
    container.dataset.state = 'agent';
    let label = 'Отправить всё агенту';
    let title = 'Отправить агенту все задачи с правками в работе';
    let icon = '→';

    if (busyTaskId) {
      const busyTask = this.findTask(busyTaskId);
      container.dataset.state = 'stop';
      label = 'Остановить агента';
      title =
        busyTask && busyTask.id !== task.id
          ? `Остановить агента в ${this.taskTag(busyTask)}`
          : 'Прервать работу агента';
      icon = '■';
    } else if (task.status === 'closed') {
      container.dataset.state = 'closed';
      label = 'Задача принята';
      title = 'Задача уже закрыта';
      icon = '✓';
      button.disabled = true;
    } else if (this.state.taskActionBusy) {
      container.dataset.state = 'busy';
      label = 'Принимаю правки…';
      title = 'Подождите, применяются все правки';
      icon = '…';
      button.disabled = true;
    } else if (fixes.length === 0) {
      container.dataset.state = 'disabled';
      label = 'Нет правок';
      title = 'В задаче пока нет правок';
      icon = '·';
      button.disabled = true;
    } else if (working.length > 0) {
      if (!this.agentEnabled()) {
        container.dataset.state = 'disabled';
        label = 'Агент не настроен';
        title = this.state.agentConfig?.reason || 'Запустите PinNote с настроенным AI-агентом';
        icon = '·';
        button.disabled = true;
      } else {
        container.dataset.state = 'agent';
        label = 'Отправить всё агенту';
        title = 'Отправить агенту все задачи с правками в работе';
        icon = '→';
      }
    } else if (review.length > 0) {
      container.dataset.state = 'accept';
      label = 'Принять всё';
      title = 'Принять все правки и завершить задачу';
      icon = '✓';
    } else if (fixes.length === accepted.length) {
      container.dataset.state = 'accept-task';
      label = 'Принять задачу';
      title = 'Завершить задачу — все правки уже приняты';
      icon = '✓';
    } else {
      container.dataset.state = 'disabled';
      label = 'Нет действий';
      icon = '·';
      button.disabled = true;
    }

    this.refs.taskActionLabel.textContent = label;
    this.refs.taskActionIcon.textContent = icon;
    button.title = title;
    button.setAttribute('aria-label', label);
  }

  async runTaskAction() {
    const busyTaskId = this.busyAgentTaskId();
    if (busyTaskId) {
      await this.cancelAgent(busyTaskId);
      return;
    }
    const task = this.viewedTask();
    if (!task || task.status === 'closed' || this.state.taskActionBusy) return;
    const fixes = this.taskFixes(task.id);
    const working = fixes.filter(
      (fix) => !['review', 'approved', 'resolved', 'wontfix'].includes(fix.status)
    );
    const review = fixes.filter((fix) => fix.status === 'review');

    if (working.length > 0) {
      if (!this.agentEnabled()) {
        this.toast('AI-агент не настроен — скопируйте задание через меню', 'error');
        return;
      }
      if (this.anyAgentBusy()) {
        this.toast('Агент уже выполняет задачу', 'error');
        return;
      }
      await this.dispatchAllAgentTasks(task.id);
      return;
    }

    if (review.length > 0) {
      this.state.taskActionBusy = true;
      this.renderPanel();
      try {
        for (const fix of review) {
          const saved = await this.updateComment(
            fix.id,
            { status: 'approved' },
            { toast: false, render: false }
          );
          if (!saved) {
            await this.refreshFromServer();
            return;
          }
        }
        this.state.taskActionBusy = false;
        await this.refreshFromServer();
        const fresh = this.viewedTask();
        if (fresh && this.taskAccepted(fresh)) {
          await this.acceptViewedTask(fresh);
        } else {
          this.renderAll();
        }
      } finally {
        this.state.taskActionBusy = false;
        this.renderPanel();
      }
      return;
    }

    if (fixes.length > 0 && this.taskAccepted(task)) {
      await this.acceptTask();
    }
  }

  renderComposer(task, fix) {
    const closed = task.status === 'closed';
    const fixBusy = Boolean(fix) && this.isAgentWorkingOnFix(fix);
    if (fixBusy && this.state.replyOpen) {
      this.rememberReply();
      this.state.replyOpen = false;
      this.saveUiState();
    }
    const open = this.state.replyOpen && !closed && !fixBusy && !this.state.confirmAction;
    this.refs.composer.hidden = !open;
    this.refs.replyButton.hidden = fixBusy;
    this.refs.replyButton.disabled = closed || !fix || fixBusy;
    this.refs.replyButton.setAttribute('aria-expanded', String(open));
    if (this.refs.stopFixButton) {
      this.refs.stopFixButton.hidden = !fixBusy;
      this.refs.stopFixButton.disabled = !fixBusy;
      this.refs.stopFixButton.title = fixBusy
        ? 'Прервать работу агента над этой правкой'
        : 'Агент не работает над этой правкой';
    }
    this.refs.acceptFix.disabled = closed || !fix || fix.status !== 'review';
    this.refs.acceptFix.setAttribute('aria-pressed', String(this.isFixAccepted(fix)));
    this.refs.acceptLabel.textContent = this.isFixAccepted(fix)
      ? 'Принята'
      : 'Принять правку';
    this.refs.acceptFix.title = this.isFixAccepted(fix)
      ? 'Правка принята'
      : fix.status === 'review'
        ? 'Принять выбранную правку'
        : 'Правка ещё не на проверке — принять можно после ответа агента';
    if (!open) {
      if (this.state.replyOpen) this.rememberReply();
      if (this.refs.replyInput) this.refs.replyInput.value = '';
      return;
    }
    const toAgent = this.agentEnabled();
    this.refs.replyContext.textContent =
      `// ПРАВКА ${String(this.fixNumber(fix)).padStart(2, '0')} · ${this.fixName(fix)}` +
      (toAgent ? ' · ОТВЕТ УЙДЁТ АГЕНТУ' : '');
    this.fillReply();
    this.refs.sendReply.title = toAgent ? 'Отправить агенту · ⌘ / Ctrl ↵' : 'Отправить · ⌘ / Ctrl ↵';
    this.refs.sendReply.setAttribute('aria-label', toAgent ? 'Отправить агенту' : 'Отправить реплику');
    this.refs.replyInput.placeholder = toAgent
      ? 'Что доработать? Ответ сразу уйдёт агенту'
      : 'Что уточнить или доделать?';
  }

  plural(count, one, few, many) {
    const mod10 = count % 10;
    const mod100 = count % 100;
    if (mod10 === 1 && mod100 !== 11) return one;
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
    return many;
  }

  commentThreadMessages(comment) {
    const status = comment.status || 'open';
    const messages = Array.isArray(comment.thread)
      ? comment.thread.filter((message) => message && (message.text || message.attachments?.length))
      : [];
    if (messages.length === 0) {
      if (comment.resolution && ['review', 'approved', 'resolved', 'wontfix', 'orphaned'].includes(status)) {
        messages.push({
          role: status === 'wontfix' || status === 'orphaned' ? 'system' : 'agent',
          kind: 'resolution',
          text: comment.resolution,
          at: comment.reviewedAt || comment.resolvedAt || comment.updatedAt,
        });
      }
      if (comment.rejection?.reason) {
        messages.push({
          role: 'user',
          kind: 'rejection',
          text: comment.rejection.reason,
          at: comment.rejectedAt || comment.updatedAt,
        });
      }
    }
    const hasResolution = messages.some((message) => message.kind === 'resolution');
    if (['resolved', 'wontfix', 'orphaned'].includes(status) && !hasResolution) {
      const fallback = {
        resolved: comment.resolution || 'Комментарий решён.',
        wontfix: comment.resolution || 'Решено не править.',
        orphaned: comment.resolution || 'Элемент не найден в текущем DOM.',
      };
      messages.push({
        role: 'system',
        kind: 'status',
        text: fallback[status],
        at: comment.resolvedAt || comment.updatedAt || comment.createdAt,
      });
    }
    return messages;
  }

  commentUserMessage(comment, messageId) {
    const message = (comment?.thread || []).find((item) => item?.id === messageId) || null;
    return message && message.role === 'user' ? message : null;
  }

  renderThreadBubble(
    message,
    { initial = false, screenshot = null, editable = false, commentId = '', messageId = null } = {}
  ) {
    const role = ['user', 'agent', 'system'].includes(message?.role) ? message.role : 'user';
    const bubble = document.createElement('div');
    bubble.className = `pn-bubble is-${role}`;
    if (initial) bubble.classList.add('is-initial');
    if (message?.kind === 'resolution') bubble.classList.add('is-resolution');
    if (message?.kind === 'rejection') bubble.classList.add('is-rejection');

    const head = document.createElement('div');
    head.className = 'pn-bubble-head';
    const author = document.createElement('span');
    author.className = 'pn-bubble-author';
    author.textContent =
      role === 'agent' ? 'AGENT' : role === 'system' ? 'SYSTEM' : initial ? 'ВЫ' : 'ВЫ';
    const time = document.createElement('time');
    time.className = 'pn-bubble-time';
    time.textContent = this.formatTime(message?.at);
    head.append(author);
    if (initial) {
      const kind = document.createElement('span');
      kind.className = 'pn-bubble-kind';
      kind.textContent = '// ПЕРВОЕ СООБЩЕНИЕ';
      head.append(kind);
    } else if (message?.kind === 'rejection') {
      const kind = document.createElement('span');
      kind.className = 'pn-bubble-kind';
      kind.textContent = '// ОТВЕТ ЗАКАЗЧИКА';
      head.append(kind);
    } else if (message?.kind === 'resolution') {
      const kind = document.createElement('span');
      kind.className = 'pn-bubble-kind';
      kind.textContent = role === 'agent' ? '// ОТВЕТ ИСПОЛНИТЕЛЯ' : '// РЕШЕНИЕ';
      head.append(kind);
    }
    if (time.textContent) head.append(time);
    if (message?.editedAt) {
      const edited = document.createElement('span');
      edited.className = 'pn-bubble-edited';
      edited.textContent = 'изменено';
      edited.title = `Изменено ${this.formatTime(message.editedAt)}`;
      head.append(edited);
    }
    bubble.append(head);

    const editing =
      editable &&
      commentId &&
      this.state.editingMessage &&
      this.state.editingMessage.commentId === commentId &&
      (this.state.editingMessage.messageId || null) === (messageId || null);
    if (editing) {
      bubble.append(this.renderBubbleEditor(messageId ? 5000 : 10000));
    }

    const textValue = String(message?.text || '');
    if (textValue && !editing) {
      const text = document.createElement('div');
      text.className = 'pn-bubble-text';
      text.textContent = textValue;
      bubble.append(text);
    }
    if (Array.isArray(message?.attachments) && message.attachments.length > 0) {
      bubble.append(this.renderCommentAttachments(message.attachments));
    }
    if (screenshot?.file) {
      bubble.append(this.renderCommentScreenshot(screenshot));
    }
    if (editable && commentId && !editing) {
      bubble.append(this.renderBubbleActions(commentId, messageId));
    }
    return bubble;
  }

  renderBubbleEditor(maxLength = 10000) {
    const draft = String(this.state.editingMessage?.draft || '');
    const box = document.createElement('div');
    box.className = 'pn-bubble-editor';
    const input = document.createElement('textarea');
    input.rows = 3;
    input.maxLength = maxLength;
    input.dataset.role = 'edit-input';
    input.value = draft;
    input.setAttribute('aria-label', 'Редактировать сообщение');
    const actions = document.createElement('div');
    actions.className = 'pn-bubble-editor-actions';
    const save = document.createElement('button');
    save.type = 'button';
    save.className = 'pn-inline-btn pn-inline-primary';
    save.dataset.action = 'save-message';
    save.dataset.role = 'edit-save';
    save.textContent = 'Сохранить';
    save.disabled = !draft.trim();
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'pn-inline-btn';
    cancel.dataset.action = 'cancel-edit-message';
    cancel.textContent = 'Отмена';
    actions.append(save, cancel);
    box.append(input, actions);
    return box;
  }

  renderBubbleActions(commentId, messageId) {
    const actions = document.createElement('div');
    actions.className = 'pn-bubble-actions';
    const edit = document.createElement('button');
    edit.type = 'button';
    edit.className = 'pn-bubble-edit';
    edit.dataset.action = 'edit-message';
    edit.dataset.id = commentId;
    if (messageId) edit.dataset.messageId = messageId;
    edit.title = 'Редактировать комментарий';
    edit.setAttribute('aria-label', 'Редактировать комментарий');
    edit.innerHTML =
      '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
      '<path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>' +
      '<path d="m13.5 6.5 4 4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>' +
      '</svg>';
    actions.append(edit);
    return actions;
  }

  attachmentUrl(attachment) {
    const name = String(attachment?.file || '').split('/').pop();
    const query = attachment?.name ? `?name=${encodeURIComponent(attachment.name)}` : '';
    return `${API}/attachments/${encodeURIComponent(name)}${query}`;
  }

  attachmentIsImage(attachment) {
    if (String(attachment?.type || '').startsWith('image/')) return true;
    return /\.(?:png|jpe?g|gif|webp|avif|bmp)$/i.test(String(attachment?.name || attachment?.file || ''));
  }

  renderCommentAttachments(attachments) {
    const container = document.createElement('div');
    container.className = 'pn-attachments';
    for (const attachment of attachments) {
      if (!attachment?.file) continue;
      const link = document.createElement('a');
      link.className = 'pn-attachment';
      link.href = this.attachmentUrl(attachment);
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.title = `${attachment.name || 'Файл'}${attachment.size ? ` · ${this.formatBytes(attachment.size)}` : ''}`;
      link.addEventListener('click', (event) => event.stopPropagation());
      if (this.attachmentIsImage(attachment)) {
        link.classList.add('is-image');
        const image = document.createElement('img');
        image.src = link.href;
        image.alt = attachment.name || 'Изображение';
        image.loading = 'lazy';
        image.addEventListener('error', () => link.classList.remove('is-image'));
        link.append(image);
      }
      const body = document.createElement('span');
      body.className = 'pn-attachment-body';
      const badge = document.createElement('span');
      badge.className = 'pn-attachment-badge';
      badge.textContent = this.fileBadge(attachment.name || attachment.file);
      const name = document.createElement('span');
      name.className = 'pn-attachment-title';
      name.textContent = attachment.name || attachment.file;
      const meta = document.createElement('span');
      meta.className = 'pn-attachment-meta';
      meta.textContent = [attachment.type, this.formatBytes(attachment.size)].filter(Boolean).join(' · ');
      body.append(badge, name, meta);
      link.append(body);
      container.append(link);
    }
    return container;
  }

  async sendReply({ dispatchAgent } = {}) {
    const id = this.state.activeId;
    const comment = this.findComment(id);
    const task = this.viewedTask() || (comment ? this.taskForComment(comment) : null);
    if (!comment || !task) return;
    if (task.status === 'closed') {
      this.toast('Задача закрыта — ответить нельзя', 'error');
      return;
    }
    if (this.isAgentWorkingOnFix(comment)) {
      this.toast('Агент работает над этой правкой — дождитесь завершения или остановите его', 'error');
      return;
    }
    this.rememberReply();
    const key = `${comment.taskId}/${comment.id}`;
    const text = String(
      this.refs.replyInput?.value ?? this.state.replyDrafts[key] ?? ''
    ).trim();
    if (!text) {
      this.toast('Напишите ответ', 'error');
      this.refs.replyInput?.focus();
      return;
    }
    if (this.state.replyBusy) return;
    const toAgent = this.agentEnabled() && dispatchAgent !== false;
    this.state.replyBusy = comment.id;
    this.refs.sendReply.disabled = true;
    try {
      if (this.state.server) {
        const data = await this.api(`/comments/${encodeURIComponent(comment.id)}/messages`, {
          method: 'POST',
          body: JSON.stringify({ text, dispatchAgent: toAgent }),
        });
        if (data?.agent) this.applyAgentEvent(data.agent);
        this.finishReply(key);
        this.state.scrollMessages = true;
        await this.refreshFromServer();
        this.toast(toAgent ? 'Правка отправлена агенту на рассмотрение' : 'Ответ сохранён');
        this.refs.replyButton.focus();
        this.maybeReload();
        return;
      }

      const now = new Date().toISOString();
      comment.thread = Array.isArray(comment.thread) ? comment.thread : [];
      comment.thread.push({
        id: `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
        role: 'user',
        kind: 'reply',
        text,
        at: now,
      });
      if (['review', 'approved', 'rejected'].includes(comment.status)) {
        comment.status = 'rejected';
        comment.rejection = { reason: text, at: now };
        comment.rejectedAt = now;
        comment.approvedAt = null;
      } else if (comment.status !== 'open') {
        comment.status = 'open';
        comment.resolution = '';
        comment.rejection = null;
      }
      comment.updatedAt = now;
      this.finishReply(key);
      this.state.scrollMessages = true;
      this.saveLocal();
      this.renderAll();
      this.toast('Ответ сохранён');
      this.refs.replyButton.focus();
      this.maybeReload();
    } catch (err) {
      this.toast(err.message || 'Не удалось сохранить ответ', 'error');
      this.renderPanel();
    } finally {
      this.state.replyBusy = null;
    }
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

  async handleAction(action, id, filter, color, messageId = '') {
    if (action !== 'task-menu') this.state.taskMenuOpen = false;
    switch (action) {
      case 'mode':
        this.setMode(!this.state.mode);
        break;
      case 'panel':
        this.setPanel(!this.state.panel);
        break;
      case 'compose-selection':
        this.composeSelectedElement();
        break;
      case 'select-parent':
        this.selectParentOfSelection();
        break;
      case 'close-panel':
        this.closePanel();
        break;
      case 'open-current': {
        const current = this.currentTask();
        if (current) {
          this.openTask(current.id);
        } else if (!this.state.panel) {
          this.setPanel(true);
        }
        break;
      }
      case 'task-filter':
        this.state.taskFilter = ['active', 'closed', 'all'].includes(filter) ? filter : 'active';
        this.renderPanel();
        this.schedulePins();
        this.saveUiState();
        break;
      case 'select-task':
        this.openTask(id);
        this.schedulePins();
        break;
      case 'create-task':
        await this.createTask();
        break;
      case 'select-fix':
        this.selectFix(id);
        break;
      case 'back':
        this.backToTasks();
        break;
      case 'accept-task':
        await this.acceptTask();
        break;
      case 'accept-fix':
        await this.approveSelectedFix();
        break;
      case 'reply':
        this.openReply();
        break;
      case 'cancel-reply':
        this.rememberReply();
        this.state.replyOpen = false;
        this.renderPanel();
        this.saveUiState();
        this.maybeReload();
        this.refs.replyButton.focus();
        break;
      case 'send-reply':
        await this.sendReply();
        break;
      case 'stop-fix-agent':
        await this.stopFixAgent();
        break;
      case 'edit-message':
        this.startEditMessage(id, messageId);
        break;
      case 'save-message':
        await this.saveEditedMessage();
        break;
      case 'cancel-edit-message':
        this.cancelEditMessage();
        break;
      case 'reload-site':
        this.reloadNow();
        break;
      case 'task-action':
        await this.runTaskAction();
        break;
      case 'task-menu':
        this.state.taskMenuOpen = !this.state.taskMenuOpen;
        this.renderPanel();
        if (this.state.taskMenuOpen) {
          requestAnimationFrame(() => {
            this.refs.taskMenu.querySelector('button:not(:disabled):not([hidden])')?.focus();
          });
        }
        break;
      case 'close-task':
        this.state.confirmAction = 'close';
        this.state.taskMenuOpen = false;
        this.renderPanel();
        requestAnimationFrame(() => this.refs.confirmButton.focus());
        break;
      case 'delete-task':
        this.state.confirmAction = 'delete';
        this.state.taskMenuOpen = false;
        this.renderPanel();
        requestAnimationFrame(() => this.refs.confirmButton.focus());
        break;
      case 'cancel-confirm':
        this.state.confirmAction = '';
        this.renderPanel();
        this.refs.taskMenuButton.focus();
        break;
      case 'confirm':
        if (this.state.confirmAction === 'delete') await this.deleteTask();
        else if (this.state.confirmAction === 'close') await this.closeTask();
        this.state.confirmAction = '';
        this.renderPanel();
        break;
      case 'dispatch-agent':
        await this.dispatchAgent(this.selectedTask()?.id);
        break;
      case 'cancel-agent':
        await this.cancelAgent();
        break;
      case 'reset-agent':
        await this.resetAgent();
        break;
      case 'copy-all':
        await this.copyAll();
        break;
      case 'focus':
        this.focusFix(id);
        break;
      case 'refresh':
        await this.refresh();
        break;
      case 'capture-screenshot':
        await this.captureScreenshot();
        break;
      case 'pick-files':
        this.refs.fileInput?.click();
        break;
      case 'remove-screenshot':
        this.clearScreenshot();
        break;
      case 'remove-compose-attachment':
        this.removeComposeAttachment(Number(id));
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
      default:
        break;
    }
  }

  selectFix(id) {
    const comment = this.findComment(id);
    if (!comment) return;
    this.rememberReply();
    if (this.state.editingMessage && this.state.editingMessage.commentId !== id) {
      this.state.editingMessage = null;
    }
    this.state.activeId = id;
    this.state.replyOpen = false;
    this.state.taskMenuOpen = false;
    this.state.confirmAction = '';
    this.renderPanel();
    this.saveUiState();
    this.scrollToFix(comment);
    this.schedulePins();
    this.announce(`Выбрана правка ${this.fixNumber(comment)}. ${this.fixName(comment)}.`);
  }

  focusFix(id) {
    const comment = this.findComment(id);
    if (!comment) return;
    const task = this.taskForComment(comment);
    if (task && task.status !== 'closed') this.state.currentTaskId = task.id;
    this.openTask(comment.taskId, comment.id);
    this.scrollToFix(comment);
    this.schedulePins();
  }

  scrollToFix(comment) {
    const element = this.resolveAnchor(comment.anchor);
    if (!element) return null;
    const token = this.state.revealToken + 1;
    this.state.revealToken = token;
    if (this.fixElementRendered(element)) {
      this.revealFix(element);
      return element;
    }
    // Virtualized and scroll-driven sites keep far-away sections in the DOM
    // without a layout box, so scrollIntoView cannot reach them. Restore the
    // recorded scroll position first and let the site render the anchor.
    this.restoreAnchorScroll(comment.anchor);
    this.revealFixWhenRendered(comment, token);
    return element;
  }

  restoreAnchorScroll(anchor) {
    const saved = this.savedAnchorScroll(anchor);
    if (!saved) return false;
    if (Math.abs(saved.x - scrollX) <= 4 && Math.abs(saved.y - scrollY) <= 4) return false;
    scrollTo({ left: saved.x, top: saved.y, behavior: 'auto' });
    return true;
  }

  savedAnchorScroll(anchor) {
    const x = Number(anchor?.scroll?.x);
    const y = Number(anchor?.scroll?.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return { x, y };
  }

  fixElementRendered(element) {
    if (!element?.isConnected) return false;
    if (typeof element.getClientRects === 'function' && element.getClientRects().length === 0) {
      return false;
    }
    const rect = element.getBoundingClientRect();
    return rect.width > 0 || rect.height > 0;
  }

  revealFixWhenRendered(comment, token, attempt = 0) {
    if (this.state.revealToken !== token) return;
    const element = this.resolveAnchor(comment.anchor);
    if (element && this.fixElementRendered(element)) {
      this.revealFix(element, 2000);
      return;
    }
    if (attempt >= 12) return;
    if (attempt === 3 || attempt === 7 || attempt === 11) {
      // The site may have rejected the first jump (intro screen, animation).
      this.restoreAnchorScroll(comment.anchor);
    }
    setTimeout(
      () => this.revealFixWhenRendered(comment, token, attempt + 1),
      attempt === 0 ? 60 : 120
    );
  }

  revealFix(element, duration = 1600) {
    if (!this.fixElementRendered(element)) return;
    const rect = element.getBoundingClientRect();
    if (rect.top < BAR_HEIGHT + 24 || rect.bottom > innerHeight - 24) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
    }
    this.state.flash = { element, until: Date.now() + duration };
    this.scheduleHighlight();
    setTimeout(() => this.scheduleHighlight(), duration + 100);
  }

  openReply() {
    const task = this.viewedTask();
    const fix = this.selectedFix();
    if (!task || !fix || task.status === 'closed') {
      this.toast('Ответить можно только в открытой задаче', 'error');
      return;
    }
    if (this.isAgentWorkingOnFix(fix)) {
      this.toast('Агент работает над этой правкой — дождитесь завершения или остановите его', 'error');
      return;
    }
    this.state.replyOpen = true;
    this.state.editingMessage = null;
    this.state.confirmAction = '';
    this.renderPanel();
    this.saveUiState();
    requestAnimationFrame(() => {
      this.refs.replyInput.focus();
      this.refs.replyInput.setSelectionRange(
        this.refs.replyInput.value.length,
        this.refs.replyInput.value.length
      );
    });
  }

  startEditMessage(commentId, messageId = '') {
    const comment = this.findComment(commentId);
    if (!comment) return;
    if (this.isAgentWorkingOnFix(comment)) {
      this.toast('Агент работает над этой правкой — дождитесь завершения', 'error');
      return;
    }
    const forMessage = Boolean(messageId);
    const message = forMessage ? this.commentUserMessage(comment, messageId) : null;
    if (forMessage && !message) {
      this.toast('Это сообщение нельзя редактировать', 'error');
      return;
    }
    this.rememberReply();
    this.state.replyOpen = false;
    this.state.editingMessage = {
      commentId,
      messageId: forMessage ? messageId : null,
      draft: String(forMessage ? message.text || '' : comment.comment || ''),
    };
    this.state.scrollMessages = false;
    this.renderPanel();
    this.saveUiState();
    requestAnimationFrame(() => {
      const input = this.shadow.querySelector('[data-role="edit-input"]');
      if (!input) return;
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    });
  }

  cancelEditMessage() {
    if (!this.state.editingMessage) return;
    this.state.editingMessage = null;
    this.renderPanel();
    this.saveUiState();
    this.maybeReload();
  }

  async saveEditedMessage() {
    const editing = this.state.editingMessage;
    if (!editing || this.state.busy) return;
    const comment = this.findComment(editing.commentId);
    if (!comment) return;
    if (this.isAgentWorkingOnFix(comment)) {
      this.toast('Агент работает над этой правкой — редактирование недоступно', 'error');
      return;
    }
    const input = this.shadow.querySelector('[data-role="edit-input"]');
    const nextText = String(input?.value ?? editing.draft ?? '').trim();
    if (!nextText) {
      this.toast('Комментарий не может быть пустым', 'error');
      input?.focus();
      return;
    }
    const messageId = editing.messageId || null;
    const currentText = messageId
      ? this.commentUserMessage(comment, messageId)?.text || ''
      : comment.comment || '';
    if (nextText === currentText.trim()) {
      this.state.editingMessage = null;
      this.renderPanel();
      this.saveUiState();
      this.maybeReload();
      return;
    }
    const saveButton = this.shadow.querySelector('[data-role="edit-save"]');
    this.state.busy = true;
    if (saveButton) saveButton.disabled = true;
    try {
      if (!this.state.server) {
        const now = new Date().toISOString();
        if (messageId) {
          const message = this.commentUserMessage(comment, messageId);
          if (!message) throw new Error('Сообщение не найдено');
          const previousText = message.text;
          message.text = nextText;
          message.editedAt = now;
          if (
            comment.rejection?.reason === previousText &&
            (message.kind === 'rejection' || message.kind === 'reply')
          ) {
            comment.rejection = { ...comment.rejection, reason: nextText };
          }
        } else {
          comment.comment = nextText;
          comment.editedAt = now;
        }
        comment.updatedAt = now;
        this.state.editingMessage = null;
        this.saveLocal();
        this.renderAll();
        this.toast('Комментарий изменён');
        this.maybeReload();
        return;
      }

      if (messageId) {
        await this.api(
          `/comments/${encodeURIComponent(comment.id)}/messages/${encodeURIComponent(messageId)}`,
          {
            method: 'PATCH',
            body: JSON.stringify({ text: nextText }),
          }
        );
      } else {
        const saved = await this.updateComment(
          comment.id,
          { comment: nextText, dispatchAgent: false },
          { toast: false, render: false }
        );
        if (!saved) return;
      }
      this.state.editingMessage = null;
      await this.refreshFromServer();
      this.renderAll();
      this.toast('Комментарий изменён');
      this.maybeReload();
    } catch (err) {
      this.toast(err.message || 'Не удалось изменить комментарий', 'error');
    } finally {
      this.state.busy = false;
      if (this.state.editingMessage) {
        const save = this.shadow.querySelector('[data-role="edit-save"]');
        if (save) save.disabled = !String(this.state.editingMessage.draft || '').trim();
        this.renderPanel();
      }
    }
  }

  async approveSelectedFix() {
    const task = this.viewedTask();
    const fix = this.selectedFix();
    if (!task || !fix) return;
    if (task.status === 'closed') {
      this.toast('Задача уже принята', 'error');
      return;
    }
    if (fix.status !== 'review') {
      this.toast('Принять можно правку на проверке', 'error');
      return;
    }
    const saved = await this.updateComment(fix.id, { status: 'approved' }, { toast: false });
    if (!saved) return;
    this.state.replyOpen = false;
    this.state.scrollMessages = false;
    this.renderAll();
    const fixes = this.taskFixes(task.id);
    const accepted = fixes.filter((item) => this.isFixAccepted(item)).length;
    this.toast(`Правка принята · ${accepted} из ${fixes.length}`);
    this.announce(`Правка ${this.fixNumber(fix)} принята. Принято ${accepted} из ${fixes.length}.`);
  }

  async acceptTask() {
    const task = this.viewedTask();
    if (!task || task.status === 'closed') return;
    if (!this.taskAccepted(task)) {
      this.toast('Сначала примите каждую правку', 'error');
      return;
    }
    await this.acceptViewedTask(task);
  }

  async acceptViewedTask(task) {
    this.state.replyOpen = false;
    if (this.state.server) {
      try {
        await this.api(`/tasks/${encodeURIComponent(task.id)}/accept`, {
          method: 'POST',
          body: JSON.stringify({}),
        });
        await this.refreshFromServer();
        const next = this.openTasks().find((item) => item.id !== task.id) || null;
        this.state.currentTaskId = next?.id || null;
        this.state.viewedTaskId = task.id;
        this.state.confirmAction = '';
        this.renderAll();
        this.saveUiState();
        this.toast(`${this.taskTag(task)} принята`);
      } catch (err) {
        this.refreshFromServer();
        this.toast(err.message || 'Не удалось принять задачу', 'error');
      }
      return;
    }
    const now = new Date().toISOString();
    for (const comment of this.taskFixes(task.id)) {
      comment.status = 'resolved';
      comment.resolvedAt = now;
      comment.updatedAt = now;
    }
    task.status = 'closed';
    task.closedAt = now;
    task.submittedAt = task.submittedAt || now;
    task.updatedAt = now;
    if (this.state.activeTaskId === task.id) this.state.activeTaskId = null;
    const next = this.openTasks().find((item) => item.id !== task.id) || null;
    this.state.currentTaskId = next?.id || null;
    this.state.confirmAction = '';
    this.saveLocal();
    this.renderAll();
    this.saveUiState();
    this.toast(`${this.taskTag(task)} принята`);
  }

  updateAddTaskState() {
    const button = this.refs.addTask;
    if (!button) return;
    button.disabled = this.state.taskCreateBusy;
    button.classList.toggle('is-busy', this.state.taskCreateBusy);
    button.setAttribute('aria-busy', String(this.state.taskCreateBusy));
  }

  async createTask() {
    if (this.state.taskCreateBusy) return;
    this.state.taskCreateBusy = true;
    this.updateAddTaskState();
    try {
      let task = null;
      let usedLocalFallback = false;
      if (this.state.server) {
        try {
          const data = await this.api('/tasks', {
            method: 'POST',
            body: JSON.stringify({}),
          });
          task = data?.task || null;
        } catch (err) {
          if (err instanceof ApiError && err.status >= 400 && err.status < 500) {
            this.toast(err.message || 'Не удалось добавить задачу', 'error');
            return;
          }
          this.state.server = false;
          usedLocalFallback = true;
        }
      } else {
        usedLocalFallback = true;
      }

      if (!task) {
        task = this.createLocalTask();
        usedLocalFallback = true;
        this.saveLocal();
        this.renderAll();
      } else if (!(await this.refreshFromServer())) {
        if (!this.findTask(task.id)) this.state.tasks.push(task);
        this.saveLocal();
        this.renderAll();
      }

      if (!this.findTask(task.id)) {
        this.toast('Не удалось открыть добавленную задачу', 'error');
        return;
      }
      if (this.state.taskFilter === 'closed') this.state.taskFilter = 'active';
      this.openTask(task.id);
      this.toast(
        usedLocalFallback
          ? 'Сервер недоступен — задача сохранена локально'
          : `Добавлена ${this.taskTag(task)}`,
        usedLocalFallback ? 'error' : ''
      );
    } finally {
      this.state.taskCreateBusy = false;
      this.updateAddTaskState();
    }
  }

  announce(message) {
    if (!this.refs.live) return;
    this.refs.live.textContent = '';
    requestAnimationFrame(() => {
      this.refs.live.textContent = message;
    });
  }

  async refresh() {
    if (this.state.server) {
      const ok = await this.refreshFromServer();
      this.toast(ok ? 'Данные обновлены' : 'Не удалось получить данные', ok ? '' : 'error');
    } else {
      const local = this.loadLocal();
      this.state.comments = local.comments;
      this.state.tasks = local.tasks;
      this.state.activeTaskId = local.activeTaskId;
      this.state.nextTaskNumber = local.nextTaskNumber;
      this.normalizeSelection();
      this.renderAll();
      if (this.state.panel) this.renderPanel();
      this.toast('Локальные данные обновлены');
    }
  }

  findComment(id) {
    return this.state.comments.find((comment) => comment.id === id) || null;
  }

  findTask(id) {
    return this.state.tasks.find((task) => task.id === id) || null;
  }

  latestTask() {
    return [...this.state.tasks].sort((left, right) => right.number - left.number)[0] || null;
  }

  selectedTask() {
    return this.viewedTask() || this.currentTask() || this.latestTask();
  }

  taskForComment(comment) {
    return this.findTask(comment.taskId) || null;
  }

  taskCounts(taskId) {
    const items = this.state.comments.filter((comment) => comment.taskId === taskId);
    const counts = Object.fromEntries(STATUSES.map((status) => [status, 0]));
    for (const comment of items) {
      const status = counts[comment.status] === undefined ? 'open' : comment.status;
      counts[status] += 1;
    }
    return { total: items.length, counts };
  }

  async closeTask() {
    const task = this.viewedTask();
    if (!task || task.status === 'closed') return;
    if (!this.taskAccepted(task)) {
      this.toast('Сначала примите каждую правку', 'error');
      return;
    }
    if (this.isAgentBusy(task.id)) await this.cancelAgent(task.id, { silent: true });
    this.state.replyOpen = false;
    if (this.state.server) {
      try {
        await this.api(`/tasks/${encodeURIComponent(task.id)}/close`, {
          method: 'POST',
          body: JSON.stringify({}),
        });
        await this.refreshFromServer();
        const next = this.openTasks().find((item) => item.id !== task.id) || null;
        this.state.currentTaskId = next?.id || null;
        this.state.viewedTaskId = task.id;
        this.state.confirmAction = '';
        this.renderAll();
        this.saveUiState();
        this.toast(`${this.taskTag(task)} принята`);
      } catch (err) {
        this.toast(err.message || 'Не удалось закрыть задачу', 'error');
      }
      return;
    }
    const now = new Date().toISOString();
    for (const comment of this.state.comments) {
      if (comment.taskId !== task.id) continue;
      comment.status = 'resolved';
      comment.resolvedAt = now;
      comment.rejectedAt = null;
      comment.rejection = null;
      comment.updatedAt = now;
    }
    task.status = 'closed';
    task.closedAt = now;
    task.submittedAt = task.submittedAt || now;
    task.updatedAt = now;
    if (this.state.activeTaskId === task.id) this.state.activeTaskId = null;
    const next = this.openTasks().find((item) => item.id !== task.id) || null;
    this.state.currentTaskId = next?.id || null;
    this.state.confirmAction = '';
    this.state.replyOpen = false;
    this.saveLocal();
    this.renderAll();
    this.saveUiState();
    this.toast(`${this.taskTag(task)} принята`);
  }

  async dispatchAllAgentTasks(preferredTaskId = null) {
    if (!this.state.server) {
      this.toast('AI-агент доступен только при запущенном review-сервере', 'error');
      return;
    }
    if (!this.agentEnabled()) {
      this.toast(
        this.state.agentConfig?.reason ||
          'AI-агент не настроен. Запусти PinNote с --agent dsh или --agent codex.',
        'error'
      );
      return;
    }
    try {
      const data = await this.api('/agent/dispatch', {
        method: 'POST',
        body: JSON.stringify({ taskId: preferredTaskId || null }),
      });
      const queued = Number(data?.queued) || 0;
      if (data?.agent) this.applyAgentEvent(data.agent);
      else this.renderPanel();
      if (queued > 0) {
        this.toast(
          `Агенту отправлено: ${queued} ${this.plural(queued, 'задача', 'задачи', 'задач')} — по очереди`
        );
      }
    } catch (err) {
      this.toast(err.message || 'Не удалось отправить задачи агенту', 'error');
    }
  }

  async dispatchAgent(taskId, mode = null) {
    const task = (taskId && this.findTask(taskId)) || this.selectedTask();
    if (!task) return;
    if (!this.state.server) {
      this.toast('AI-агент доступен только при запущенном review-сервере', 'error');
      return;
    }
    if (!this.agentEnabled()) {
      this.toast(
        this.state.agentConfig?.reason ||
          'AI-агент не настроен. Запусти PinNote с --agent dsh или --agent codex.',
        'error'
      );
      return;
    }
    const { counts } = this.taskCounts(task.id);
    const effectiveMode = mode || (counts.rejected > 0 ? 'rework' : 'task');
    const focusedFix = this.taskFixes(task.id).find((fix) => fix.id === this.state.activeId) || null;
    try {
      const data = await this.api(`/tasks/${encodeURIComponent(task.id)}/agent`, {
        method: 'POST',
        body: JSON.stringify({ mode: effectiveMode, commentId: focusedFix?.id || null }),
      });
      if (data?.agent) this.applyAgentEvent(data.agent);
      this.toast(
        effectiveMode === 'rework'
          ? 'Задача отправлена агенту на доработку'
          : 'Задача отправлена агенту'
      );
    } catch (err) {
      this.toast(err.message || 'Не удалось отправить задачу агенту', 'error');
    }
  }

  async stopFixAgent() {
    const task = this.viewedTask();
    const fix = this.selectedFix();
    if (!task || !fix) return;
    if (!this.isAgentWorkingOnFix(fix)) {
      this.renderPanel();
      return;
    }
    await this.cancelAgent(task.id);
  }

  async cancelAgent(taskId = null, { silent = false } = {}) {
    const targetId = taskId || this.busyAgentTaskId() || this.selectedTask()?.id;
    const task = targetId ? this.findTask(targetId) : null;
    if (!task) {
      if (!silent) this.toast('Нет запущенного агента', 'error');
      return false;
    }
    if (!this.state.server || !this.agentEnabled()) return false;
    try {
      const data = await this.api(`/tasks/${encodeURIComponent(task.id)}/agent/cancel`, {
        method: 'POST',
      });
      if (data?.agent) this.applyAgentEvent(data.agent);
      if (!silent) this.toast('Агент остановлен');
      return true;
    } catch (err) {
      if (!silent) this.toast(err.message || 'Не удалось остановить агента', 'error');
      return false;
    }
  }

  async resetAgent() {
    const task = this.selectedTask();
    if (!task) return;
    if (!this.state.server || !this.agentEnabled()) return;
    try {
      const data = await this.api(`/tasks/${encodeURIComponent(task.id)}/agent`, {
        method: 'DELETE',
      });
      if (data?.agent) this.applyAgentEvent({ ...data.agent, reset: true });
    } catch (err) {
      this.toast(err.message || 'Не удалось сбросить сессию агента', 'error');
    }
  }

  async deleteTask() {
    const task = this.viewedTask();
    if (!task) return;
    if (this.isAgentBusy(task.id)) await this.cancelAgent(task.id, { silent: true });
    this.state.replyOpen = false;
    this.state.confirmAction = '';
    if (this.state.server) {
      try {
        await this.api(`/tasks/${encodeURIComponent(task.id)}`, { method: 'DELETE' });
        this.state.viewedTaskId = null;
        this.state.activeId = null;
        await this.refreshFromServer();
        const stillCurrent = this.findTask(this.state.currentTaskId);
        if (!stillCurrent || stillCurrent.status === 'closed') {
          this.state.currentTaskId = this.openTasks()[0]?.id || null;
        }
        this.renderAll();
        this.saveUiState();
        this.toast(`${this.taskTag(task)} удалена`);
      } catch (err) {
        this.toast(err.message || 'Не удалось удалить задачу', 'error');
      }
      return;
    }
    this.state.comments = this.state.comments.filter((comment) => comment.taskId !== task.id);
    this.state.tasks = this.state.tasks.filter((item) => item.id !== task.id);
    if (this.state.activeTaskId === task.id) this.state.activeTaskId = null;
    this.state.viewedTaskId = null;
    this.state.activeId = null;
    const stillCurrent = this.findTask(this.state.currentTaskId);
    if (!stillCurrent || stillCurrent.status === 'closed') {
      this.state.currentTaskId = this.openTasks()[0]?.id || null;
    }
    this.saveLocal();
    this.renderAll();
    this.saveUiState();
    this.toast(`${this.taskTag(task)} удалена`);
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
        if (data?.agent) this.applyAgentEvent(data.agent);
      } catch (err) {
        this.toast(err.message || 'Не удалось обновить комментарий', 'error');
        return false;
      }
    } else {
      const comment = this.findComment(id);
      if (!comment) return false;
      const now = new Date().toISOString();
      const previousResolution = String(comment.resolution || '');
      let rejectionReason = '';
      if (patch.comment !== undefined) {
        comment.comment = patch.comment;
        comment.editedAt = now;
      }
      if (patch.resolution !== undefined) comment.resolution = patch.resolution;
      comment.updatedAt = now;
      if (patch.status) {
        const status = patch.status;
        if (status === 'rejected') {
          const reason = String(patch.rejectionReason || '').trim();
          if (!reason) {
            this.toast('Укажите причину отклонения', 'error');
            return false;
          }
          comment.rejection = { reason, at: now };
          comment.rejectedAt = now;
          comment.approvedAt = null;
          comment.resolvedAt = null;
          rejectionReason = reason;
        } else if (status === 'approved') {
          comment.approvedAt = now;
          comment.rejectedAt = null;
          comment.resolvedAt = null;
          comment.rejection = null;
        } else if (status === 'review') {
          comment.reviewedAt = now;
          comment.approvedAt = null;
          comment.rejectedAt = null;
          comment.resolvedAt = null;
        } else if (status === 'resolved') {
          comment.resolvedAt = now;
          comment.rejectedAt = null;
          comment.rejection = null;
        } else if (status === 'open') {
          comment.reviewedAt = null;
          comment.approvedAt = null;
          comment.rejectedAt = null;
          comment.resolvedAt = null;
          comment.rejection = null;
          if (patch.resolution === undefined) comment.resolution = '';
        } else if (status === 'wontfix' || status === 'orphaned') {
          comment.resolvedAt = null;
          comment.rejection = null;
        }
        comment.status = status;
      }
      if (!Array.isArray(comment.thread)) comment.thread = [];
      const resolutionText = String(comment.resolution || '').trim();
      if (resolutionText && ['review', 'approved', 'resolved', 'wontfix', 'orphaned'].includes(comment.status)) {
        const role = comment.status === 'wontfix' || comment.status === 'orphaned' ? 'system' : 'agent';
        const last = comment.thread.at(-1);
        if ((!last || last.role !== role || last.text !== resolutionText) && (comment.status === 'review' || resolutionText !== previousResolution)) {
          comment.thread.push({
            id: `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
            role,
            kind: 'resolution',
            text: resolutionText,
            at: now,
          });
        }
      }
      if (patch.status === 'rejected' && rejectionReason) {
        const last = comment.thread.at(-1);
        if (!last || last.role !== 'user' || last.text !== rejectionReason) {
          comment.thread.push({
            id: `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
            role: 'user',
            kind: 'rejection',
            text: rejectionReason,
            at: now,
          });
        }
      }
    }
    this.saveLocal();
    if (render) this.renderAll();
    if (toast) {
      const messages = {
        open: 'Комментарий возвращён в работу',
        review: 'Комментарий отправлен на проверку',
        approved: 'Комментарий проверен',
        rejected: 'Комментарий отклонён',
        resolved: 'Комментарий решён',
        wontfix: 'Комментарий помечен «Не правим»',
        orphaned: 'Комментарий помечен «Не найден»',
      };
      this.toast(patch.status ? messages[patch.status] || 'Статус обновлён' : 'Комментарий сохранён');
    }
    return true;
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

  dismissToast() {
    if (this.state.toastTimer) {
      clearTimeout(this.state.toastTimer);
      this.state.toastTimer = null;
    }
    if (this.refs.toast) this.refs.toast.hidden = true;
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

function isDialogElement(node) {
  return node instanceof Element && node.localName === 'dialog';
}

const HOST_LAYOUT = {
  position: 'fixed',
  inset: '0',
  'z-index': '2147483647',
  'pointer-events': 'none',
  margin: '0',
  padding: '0',
  border: '0',
  background: 'transparent',
  overflow: 'visible',
};

// Native modals live in the browser top layer: no z-index can outbid them, and
// `showModal()` makes everything outside the dialog inert. The only way to keep
// PinNote usable is to join the top layer as a manual popover and, while a
// modal is open, to live inside that dialog (an inert ancestor would otherwise
// swallow every click). Popovers also let us stay above site popovers and
// escape dialogs with transforms/clipping.
class OverlayKeeper {
  constructor(host) {
    this.host = host;
    this.home = document.documentElement || document.body;
    this.popoverSupported =
      typeof host.showPopover === 'function' && typeof host.hidePopover === 'function';
    this.dialogs = new Map();
    this.seq = 0;
    this.syncing = false;
    this.started = false;
    this.observer = null;
    this.onToggle = this.onToggle.bind(this);
    this.onClose = this.onClose.bind(this);
    this.onFullscreenChange = this.onFullscreenChange.bind(this);
    this.onMutations = this.onMutations.bind(this);
  }

  start() {
    if (this.started || !this.home) return;
    this.started = true;
    for (const [property, value] of Object.entries(HOST_LAYOUT)) {
      this.host.style.setProperty(property, value);
    }
    if (this.popoverSupported) this.host.setAttribute('popover', 'manual');
    this.adoptDialogs();
    this.sync(true);
    document.addEventListener('toggle', this.onToggle, true);
    document.addEventListener('close', this.onClose, true);
    document.addEventListener('fullscreenchange', this.onFullscreenChange, true);
    if (typeof MutationObserver === 'function') {
      this.observer = new MutationObserver(this.onMutations);
      this.observer.observe(document.documentElement, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ['open', 'popover'],
      });
    }
  }

  isModal(dialog) {
    if (!isDialogElement(dialog) || !dialog.open || !dialog.isConnected) {
      return false;
    }
    try {
      return dialog.matches(':modal');
    } catch {
      return true;
    }
  }

  adoptDialogs() {
    for (const dialog of document.querySelectorAll('dialog[open]')) {
      if (this.isModal(dialog) && !this.dialogs.has(dialog)) {
        this.dialogs.set(dialog, ++this.seq);
      }
    }
  }

  topDialog() {
    let top = null;
    let topSeq = -1;
    for (const [dialog, seq] of this.dialogs) {
      if (!this.isModal(dialog)) {
        this.dialogs.delete(dialog);
        continue;
      }
      if (seq > topSeq) {
        top = dialog;
        topSeq = seq;
      }
    }
    // Fallback for dialogs opened in a way we did not observe (e.g. before boot).
    for (const dialog of document.querySelectorAll('dialog[open]')) {
      if (!this.isModal(dialog) || this.dialogs.has(dialog)) continue;
      const seq = ++this.seq;
      this.dialogs.set(dialog, seq);
      if (seq > topSeq) {
        top = dialog;
        topSeq = seq;
      }
    }
    return top;
  }

  isOpen(target) {
    if (isDialogElement(target)) return target.open;
    try {
      return target.matches(':popover-open');
    } catch {
      return false;
    }
  }

  onToggle(event) {
    const target = event.target;
    if (!(target instanceof Element) || target === this.host) return;
    const isDialog = isDialogElement(target);
    const isPopover = !isDialog && target.hasAttribute('popover');
    if (!isDialog && !isPopover) return;
    const open = this.isOpen(target);
    if (isDialog) {
      if (open) this.dialogs.set(target, ++this.seq);
      else this.dialogs.delete(target);
    }
    if (open) this.sync(true);
    else if (!isDialog) this.sync(false);
  }

  onClose(event) {
    if (!isDialogElement(event.target)) return;
    this.dialogs.delete(event.target);
    this.sync(false);
  }

  onFullscreenChange() {
    this.sync(true);
  }

  onMutations(records) {
    let relevant = !this.host.isConnected;
    for (const record of records) {
      if (record.type === 'attributes') {
        if (
          isDialogElement(record.target) &&
          this.isModal(record.target)
        ) {
          this.dialogs.set(record.target, ++this.seq);
          relevant = true;
        }
        continue;
      }
      for (const node of record.addedNodes) {
        if (isDialogElement(node) && this.isModal(node)) {
          this.dialogs.set(node, ++this.seq);
          relevant = true;
        }
      }
    }
    if (relevant) this.sync(true);
  }

  sync(raise) {
    if (this.syncing || !this.started) return;
    this.syncing = true;
    try {
      const target = document.fullscreenElement || this.topDialog() || this.home;
      if (!target || target === this.host) return;
      if (this.host.parentNode !== target) {
        target.append(this.host);
        raise = true;
      }
      if (raise || !this.isPopoverOpen()) this.showOnTop();
    } catch (error) {
      console.warn('[pin-note] overlay guard:', error);
    } finally {
      this.syncing = false;
    }
  }

  isPopoverOpen() {
    if (!this.popoverSupported) return false;
    try {
      return this.host.matches(':popover-open');
    } catch {
      return false;
    }
  }

  showOnTop() {
    if (!this.popoverSupported) return;
    try {
      if (this.host.matches(':popover-open')) this.host.hidePopover();
    } catch {
      // Already hidden.
    }
    try {
      this.host.showPopover();
    } catch (error) {
      // Never leave the UI hidden behind `[popover]:not(:popover-open)`.
      this.disablePopover();
      console.warn('[pin-note] top layer unavailable:', error);
    }
  }

  disablePopover() {
    this.popoverSupported = false;
    this.host.removeAttribute('popover');
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
  new OverlayKeeper(host).start();
  const client = new ReviewClient(host, shadow);
  await client.boot();
}

boot().catch((err) => {
  console.error('[pin-note]', err);
});
