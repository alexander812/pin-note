// UI translations for PinNote.
//
// The Russian string is the source key: it is what the UI already contains and
// what the translator falls back to. The English catalog maps those source
// strings to English. Keeping source strings as keys makes the call sites easy
// to read and keeps the Russian UI byte-for-byte compatible.

export const SUPPORTED_LOCALES = ['ru', 'en'];
export const LANGUAGE_STORAGE_KEY = 'pin-note:lang:v1';

export const EN_MESSAGES = {
  // ---- top bar -----------------------------------------------------------
  'Панель PinNote': 'PinNote panel',
  'Комментировать': 'Comment',
  'Комментировать · Esc — выйти': 'Comment · Esc to exit',
  'Остановить комментирование': 'Stop commenting',
  'Текущая задача': 'Current task',
  'НОВАЯ ЗАДАЧА': 'NEW TASK',
  'Сайт обновился. Перезагрузить страницу': 'The site has been updated. Reload the page',
  'Обновить сайт': 'Reload site',
  'Выбрать родительский элемент': 'Select parent element',
  'Написать комментарий': 'Write a comment',
  'Открыть панель': 'Open panel',
  'Свернуть панель': 'Collapse panel',
  'Открыть': 'Open',
  'Закрыть': 'Close',
  'Свернуть': 'Collapse',
  'Закрыть панель': 'Close panel',
  'Язык интерфейса': 'Interface language',
  'Новая задача': 'New task',
  'выберите элемент на странице': 'select an element on the page',

  // ---- tasks list ---------------------------------------------------------
  'Задачи PinNote': 'PinNote tasks',
  'Все задачи': 'All tasks',
  'Задачи': 'Tasks',
  'Обновить': 'Refresh',
  'Фильтр задач': 'Task filter',
  'Активные': 'Active',
  'Закрытые': 'Closed',
  'Все': 'All',
  'Добавить задачу': 'Add task',
  'Добавлена {tag}': '{tag} added',
  'Сервер недоступен — задача сохранена локально':
    'The server is unavailable — the task was saved locally',
  'Не удалось добавить задачу': 'Could not add a task',
  'Не удалось открыть добавленную задачу': 'Could not open the added task',
  'Закрытых задач пока нет.': 'No closed tasks yet.',
  'Активных задач пока нет.': 'No active tasks yet.',
  'Выберите элемент на сайте, чтобы добавить первую правку.':
    'Select an element on the site to add your first fix.',
  'Без описания': 'No description',
  'без описания': 'no description',
  ' · готово': ' · done',
  ' · {count} к проверке': ' · {count} to review',

  // ---- task detail --------------------------------------------------------
  'Подробности задачи': 'Task details',
  'К задачам': 'Back to tasks',
  'Действия с задачей': 'Task actions',
  'Отправить агенту': 'Send to agent',
  'Отправить на доработку': 'Send for rework',
  'Остановить агента': 'Stop agent',
  'Сбросить сессию агента': 'Reset agent session',
  'Скопировать задание': 'Copy assignment',
  'Закрыть задачу': 'Close task',
  'Удалить задачу': 'Delete task',
  'Задача': 'Task',
  'Принято правок': 'Accepted fixes',
  '0 из 0': '0 of 0',
  'Принятые правки': 'Accepted fixes',
  'Принять': 'Accept',
  'Подтвердить': 'Confirm',
  'Отмена': 'Cancel',
  'Список правок': 'Fix list',
  'Правки': 'Fixes',
  'Диалог по выбранной правке': 'Thread for the selected fix',
  'Действия по выбранной правке': 'Actions for the selected fix',
  'Принять правку': 'Accept fix',
  'Ответить': 'Reply',
  'Что уточнить или доделать?': 'What should be clarified or finished?',
  'Реплика по выбранной правке': 'Reply to the selected fix',
  'Отправить реплику': 'Send reply',
  'Отправить · ⌘ / Ctrl ↵': 'Send · ⌘ / Ctrl ↵',
  'Отправить всё агенту': 'Send everything to the agent',
  'Закрыта': 'Closed',
  'На проверке': 'In review',
  'В работе': 'In progress',
  'Принята': 'Accepted',
  'Принято': 'Accepted',
  'Доработать': 'Needs work',
  'К проверке': 'To review',
  'Не правим': "Won't fix",
  'Не найден': 'Not found',
  'Решено не править': 'Decided not to fix',
  'Элемент не найден в текущем DOM': 'Element not found in the current DOM',
  'Агент работает над этой правкой': 'The agent is working on this fix',
  'Отправлена агенту — агент работает над задачей':
    'Sent to the agent — the agent is working on the task',
  'На проверке — примите правку или ответьте агенту':
    'In review — accept the fix or reply to the agent',
  'Возвращена агенту на доработку': 'Returned to the agent for rework',
  'В работе — ожидает агента': 'In progress — waiting for the agent',
  'ЗАДАЧА-{number}': 'TASK-{number}',
  'ЗАДАЧА': 'TASK',
  'Задача T-{number}': 'Task T-{number}',
  'Текущая задача · {description}': 'Current task · {description}',
  'Задача появится с первым комментарием': 'A task will be created with the first comment',
  'Первая задача': 'First task',
  '{accepted} из {total}': '{accepted} of {total}',
  '{accepted} из {total} правок принято': '{accepted} of {total} fixes accepted',
  'Задача уже принята': 'The task is already accepted',
  'Задача уже закрыта': 'The task is already closed',
  'Задача принята': 'Task accepted',
  'В задаче нет правок': 'The task has no fixes',
  'В задаче пока нет правок': 'The task has no fixes yet',
  'Принять и завершить задачу': 'Accept and complete the task',
  'Принять задачу': 'Accept task',
  'Принять всё': 'Accept all',
  'Принять все правки и завершить задачу': 'Accept all fixes and complete the task',
  'Завершить задачу — все правки уже приняты':
    'Complete the task — all fixes are already accepted',
  'Сначала примите каждую правку': 'Accept each fix first',
  'В этой задаче пока нет правок.': 'This task has no fixes yet.',
  'Правок пока нет.': 'No fixes yet.',
  'Нет правок': 'No fixes',
  'Нет действий': 'No actions',
  'Нет активных правок': 'No active fixes',
  '// ДИАЛОГ · ПРАВКА {number}': '// THREAD · FIX {number}',
  '// ДИАЛОГ': '// THREAD',
  '// СОСТОЯНИЕ · {state}': '// STATUS · {state}',
  '// ПРАВКА {number} · {name}': '// FIX {number} · {name}',
  'Удалить {tag} вместе со всеми правками? Это необратимо.':
    'Delete {tag} with all its fixes? This cannot be undone.',
  'Закрыть {tag}? Все её правки будут приняты.':
    'Close {tag}? All its fixes will be accepted.',
  'Удалить': 'Delete',
  'правка {number}': 'fix {number}',
  'Правка {number}: {name}': 'Fix {number}: {name}',
  '{count} к проверке': '{count} to review',
  '{count} в работе': '{count} in progress',
  'Открыть панель задач, {count} требуют внимания':
    'Open the task panel, {count} need attention',
  'Свернуть панель задач, {count} требуют внимания':
    'Collapse the task panel, {count} need attention',

  // ---- server / local mode notes -----------------------------------------
  '// LOCAL MODE · {project} · только localStorage':
    '// LOCAL MODE · {project} · localStorage only',
  'Review-сервер не запущен: комментарии хранятся в localStorage.':
    'The review server is not running: comments are stored in localStorage.',
  'Изменения подхватываются автоматически по SSE.':
    'Changes are picked up automatically via SSE.',

  // ---- agent --------------------------------------------------------------
  'AGENT: работает': 'AGENT: working',
  'AGENT: в очереди': 'AGENT: queued',
  'AGENT: завершил': 'AGENT: finished',
  'AGENT: ошибка': 'AGENT: error',
  'AGENT: остановлен': 'AGENT: stopped',
  'Сессия: {id}': 'Session: {id}',
  'Агент не настроен': 'Agent not configured',
  'Запустите PinNote с настроенным AI-агентом': 'Start PinNote with a configured AI agent',
  'Отправить агенту все задачи с правками в работе':
    'Send all tasks with fixes in progress to the agent',
  'Остановить агента в {tag}': 'Stop the agent on {tag}',
  'Прервать работу агента': 'Interrupt the agent',
  'Прервать работу агента над этой правкой': 'Interrupt the agent on this fix',
  'Принимаю правки…': 'Accepting fixes…',
  'Подождите, применяются все правки': 'Please wait, all fixes are being applied',
  'Агент уже выполняет задачу': 'The agent is already working on a task',
  'Агент не работает над этой правкой': 'The agent is not working on this fix',
  'AI-агент не настроен — скопируйте задание через меню':
    'The AI agent is not configured — copy the assignment from the menu',
  'AI-агент доступен только при запущенном review-сервере':
    'The AI agent is available only when the review server is running',
  'AI-агент не настроен. Запусти PinNote с --agent dsh или --agent codex.':
    'The AI agent is not configured. Start PinNote with --agent dsh or --agent codex.',
  'Агенту отправлено: {count} {tasks} — по очереди':
    'Sent to the agent: {count} {tasks} — one at a time',
  'Не удалось отправить задачи агенту': 'Could not send tasks to the agent',
  'Задача отправлена агенту на доработку': 'The task was sent to the agent for rework',
  'Задача отправлена агенту': 'The task was sent to the agent',
  'Не удалось отправить задачу агенту': 'Could not send the task to the agent',
  'Нет запущенного агента': 'No running agent',
  'Агент остановлен': 'Agent stopped',
  'Не удалось остановить агента': 'Could not stop the agent',
  'Не удалось сбросить сессию агента': 'Could not reset the agent session',
  'Агент: {error}': 'Agent: {error}',
  'ошибка выполнения': 'execution error',
  'Агент завершил работу — проверьте комментарии':
    'The agent has finished — check the comments',
  'Сессия агента сброшена': 'Agent session reset',
  'Codex не смог определить workspace. Обнови Codex CLI, выполни «codex login» и перезапусти PinNote.':
    'Codex could not determine the workspace. Update Codex CLI, run "codex login", and restart PinNote.',

  // ---- replies / thread ---------------------------------------------------
  'Правка': 'Fix',
  'Правка принята': 'Fix accepted',
  'Принять выбранную правку': 'Accept the selected fix',
  'Правка ещё не на проверке — принять можно после ответа агента':
    'The fix is not in review yet — you can accept it after the agent replies',
  'Принять можно правку на проверке':
    'You can accept a fix only while it is in review',
  ' · ОТВЕТ УЙДЁТ АГЕНТУ': ' · THE REPLY WILL GO TO THE AGENT',
  'Отправить агенту · ⌘ / Ctrl ↵': 'Send to agent · ⌘ / Ctrl ↵',
  'Что доработать? Ответ сразу уйдёт агенту':
    'What should be reworked? Your reply goes straight to the agent',
  'Комментарий решён.': 'Comment resolved.',
  'Решено не править.': 'Decided not to fix.',
  'Элемент не найден в текущем DOM.': 'Element not found in the current DOM.',
  'ВЫ': 'YOU',
  '// ПЕРВОЕ СООБЩЕНИЕ': '// FIRST MESSAGE',
  '// ОТВЕТ ЗАКАЗЧИКА': '// CUSTOMER REPLY',
  '// ОТВЕТ ИСПОЛНИТЕЛЯ': '// CONTRACTOR REPLY',
  '// РЕШЕНИЕ': '// RESOLUTION',
  'изменено': 'edited',
  'Изменено {time}': 'Edited {time}',
  'Редактировать сообщение': 'Edit message',
  'Редактировать комментарий': 'Edit comment',
  'Задача закрыта — ответить нельзя': 'The task is closed — you cannot reply',
  'Агент работает над этой правкой — дождитесь завершения или остановите его':
    'The agent is working on this fix — wait for it to finish or stop it',
  'Агент работает над этой правкой — дождитесь завершения':
    'The agent is working on this fix — wait for it to finish',
  'Агент работает над этой правкой — редактирование недоступно':
    'The agent is working on this fix — editing is unavailable',
  'Напишите ответ': 'Write a reply',
  'Правка отправлена агенту на рассмотрение':
    'The fix was sent to the agent for review',
  'Ответ сохранён': 'Reply saved',
  'Не удалось сохранить ответ': 'Could not save the reply',
  'Ответить можно только в открытой задаче': 'You can reply only in an open task',
  'Это сообщение нельзя редактировать': 'This message cannot be edited',
  'Комментарий не может быть пустым': 'The comment cannot be empty',
  'Сообщение не найдено': 'Message not found',
  'Комментарий изменён': 'Comment updated',
  'Не удалось изменить комментарий': 'Could not update the comment',
  'Выбрана правка {number}. {name}.': 'Selected fix {number}. {name}.',
  'Правка принята · {accepted} из {total}': 'Fix accepted · {accepted} of {total}',
  'Правка {number} принята. Принято {accepted} из {total}.':
    'Fix {number} accepted. {accepted} of {total} accepted.',
  'Комментарий возвращён в работу': 'Comment returned to work',
  'Комментарий отправлен на проверку': 'Comment sent for review',
  'Комментарий проверен': 'Comment reviewed',
  'Комментарий отклонён': 'Comment rejected',
  'Комментарий решён': 'Comment resolved',
  'Комментарий помечен «Не правим»': 'Comment marked "Won\'t fix"',
  'Комментарий помечен «Не найден»': 'Comment marked "Not found"',
  'Статус обновлён': 'Status updated',
  'Комментарий сохранён': 'Comment saved',
  'Комментариев пока нет': 'No comments yet',
  'Задание скопировано — вставьте его в чат агенту':
    'Assignment copied — paste it into the agent chat',
  'Скачан {filename}': 'Downloaded {filename}',
  'Не удалось обновить комментарий': 'Could not update the comment',
  'Укажите причину отклонения': 'Provide a reason for rejection',
  'Не удалось принять задачу': 'Could not accept the task',
  'Не удалось закрыть задачу': 'Could not close the task',
  '{tag} принята': '{tag} accepted',
  '{tag} удалена': '{tag} deleted',
  'Не удалось удалить задачу': 'Could not delete the task',

  // ---- composer / attachments / screenshots ------------------------------
  'Новый комментарий': 'New comment',
  'Скриншот элемента': 'Element screenshot',
  'Прикрепить картинку или другой файл': 'Attach an image or another file',
  'Загрузить файл': 'Upload file',
  'Прикреплённый скриншот': 'Attached screenshot',
  'Убрать скриншот': 'Remove screenshot',
  'Что изменить? Например: сделай заголовок крупнее и добавь отступ…':
    'What should change? For example: make the heading larger and add spacing…',
  '⌘↵ — сохранить': '⌘↵ — save',
  'Alt/Option+клик — выше по дереву': 'Alt/Option+click — go up the tree',
  'Сохранить': 'Save',
  'Аннотация скриншота': 'Screenshot annotation',
  'Нарисуй пометки на изображении': 'Draw notes on the image',
  'Цвет линии': 'Line color',
  'Цвет линии {color}': 'Line color {color}',
  'Отменить': 'Undo',
  'Очистить': 'Clear',
  'Прикрепить': 'Attach',
  'Можно прикрепить не больше {count} файлов':
    'You can attach no more than {count} files',
  'Файл больше {size} не прикреплён':
    'The file is larger than {size} and was not attached',
  'Файл прикреплён': 'File attached',
  'Прикреплено файлов: {count}': 'Files attached: {count}',
  'Убрать {name}': 'Remove {name}',
  'Убрать файл': 'Remove file',
  'Б': 'B',
  'КБ': 'KB',
  'МБ': 'MB',
  'ГБ': 'GB',
  'Скриншоты доступны только с review-сервером':
    'Screenshots are available only with the review server',
  'Файлы доступны только с review-сервером':
    'Files are available only with the review server',
  'Браузер не поддерживает захват вкладки': 'The browser does not support tab capture',
  'Не удалось получить видеопоток': 'Could not get the video stream',
  'Не удалось получить кадр': 'Could not capture a frame',
  'Не удалось прочитать видеопоток': 'Could not read the video stream',
  'Выбери вкладку с сайтом, а не окно или экран':
    'Choose the site\'s tab, not a window or screen',
  'Не удалось сделать скриншот': 'Could not take a screenshot',
  'Не удалось подготовить скриншот': 'Could not prepare the screenshot',
  'Скриншот прикреплён': 'Screenshot attached',
  'Не удалось загрузить скриншот': 'Could not upload the screenshot',
  'Не удалось загрузить файл': 'Could not upload the file',
  'Не удалось сохранить комментарий': 'Could not save the comment',
  'Сервер недоступен — комментарий сохранён локально':
    'The server is unavailable — the comment was saved locally',
  'Комментарий добавлен': 'Comment added',
  'Файл': 'File',
  'Изображение': 'Image',
  'Открыть скриншот': 'Open screenshot',
  'Скриншот к комментарию': 'Comment screenshot',
  '{name}': '{name}',

  // ---- reload notices -----------------------------------------------------
  'Сайт обновился. Ввод сохранён — перезагрузка после отправки или по кнопке «Обновить сайт».':
    'The site has been updated. Your input is saved — the page will reload after you send, or use "Reload site".',
  'Сайт обновился. Текст сохранён — перезагрузите страницу после отправки или нажмите здесь.':
    'The site has been updated. Your text is saved — reload the page after sending or click here.',
  'Сайт обновился, перезагружаю…': 'The site has been updated, reloading…',
  'Сайт обновился. Ввод сохранён — перезагрузка после отправки.':
    'The site has been updated. Your input is saved — it will reload after you send.',
  'Выше уже некуда': 'Already at the top',
  'Элемент выбран. Нажмите кнопку с карандашом в баре.':
    'Element selected. Press the pencil button in the bar.',
  'Выбран элемент {element}.': 'Selected element {element}.',
  'Элемент больше не на странице': 'The element is no longer on the page',
  'Написать комментарий к <{tag}>': 'Write a comment on <{tag}>',
  'Выбрать родительский элемент <{tag}>': 'Select the parent element <{tag}>',
  'Кликните по элементу, затем нажмите кнопку с карандашом в баре.':
    'Click an element, then press the pencil button in the bar.',
  'Кликните по элементу. Alt/Option+клик — подняться по дереву.':
    'Click an element. Alt/Option+click to go up the tree.',
  'Данные обновлены': 'Data refreshed',
  'Не удалось получить данные': 'Could not fetch data',
  'Локальные данные обновлены': 'Local data refreshed',

  // ---- server errors shown in toasts -------------------------------------
  'Слишком большой запрос': 'Request too large',
  'Ожидался JSON-объект': 'Expected a JSON object',
  'Cross-origin запросы к review API запрещены':
    'Cross-origin requests to the review API are not allowed',
  'Некорректный Origin': 'Invalid Origin',
  'Ожидался Content-Type: application/json': 'Expected Content-Type: application/json',
  'Агент не настроен для этого запуска PinNote.':
    'The agent is not configured for this PinNote run.',
  'Агент уже работает — дождитесь завершения или остановите его':
    'The agent is already running — wait for it to finish or stop it',
  'Нет задач с правками в работе': 'No tasks with fixes in progress',
  'Задача не найдена': 'Task not found',
  'В задаче нет комментариев': 'The task has no comments',
  'В задаче нет отклонённых комментариев': 'The task has no rejected comments',
  'Ожидался PNG, JPEG или WebP': 'Expected PNG, JPEG, or WebP',
  'Пустой файл': 'Empty file',
  'Неизвестный маршрут review API': 'Unknown review API route',
  'Комментарий не найден': 'Comment not found',
  'Задача комментария не найдена': 'The comment\'s task was not found',
  'Неизвестный статус': 'Unknown status',
  'Нет полей для обновления': 'No fields to update',
  'Сообщение не может быть пустым': 'The message cannot be empty',
  'Можно редактировать только сообщения заказчика':
    'Only customer messages can be edited',
  'Ответ не может быть пустым': 'The reply cannot be empty',
  'Неподдерживаемый формат скриншота': 'Unsupported screenshot format',
  'Не удалось получить блокировку comments.json':
    'Could not acquire the comments.json lock',
  'Задача закрыта': 'The task is closed',
  'Задача закрыта. Верните комментарий в текущую задачу':
    'The task is closed. Return the comment to the current task',
  'Задача на проверке. Разрешены только «Проверен», «Отклонён», отправка новой правки и повторная отправка отклонённой':
    'The task is in review. Only "Reviewed", "Rejected", submitting a new fix, and resubmitting a rejected fix are allowed',
  'Пустое задание для агента': 'Empty task for the agent',
  'AI-агент не настроен': 'The AI agent is not configured',
  'Агент выключен. Запусти PinNote с --agent dsh или --agent codex, либо создай .review/agent.json.':
    'The agent is off. Start PinNote with --agent dsh or --agent codex, or create .review/agent.json.',
  'Не задана команда агента. Укажи --agent-command или поле command в .review/agent.json.':
    'The agent command is not set. Pass --agent-command or set command in .review/agent.json.',
  'Агент не готов': 'The agent is not ready',
  'Думает': 'Thinking',
  'Завершает': 'Finishing',
  'Пишет ответ': 'Writing a reply',
  'Применил изменения': 'Applied changes',
  'Планирует': 'Planning',
  'Ошибка': 'Error',
  'файлы': 'files',
};

const SERVER_PATTERNS = [
  [/^Некорректный JSON: (.*)$/s, 'Invalid JSON: $1'],
  [/^Некорректный JSON в (.*?): (.*)$/s, 'Invalid JSON in $1: $2'],
  [/^Ожидался JSON-объект в (.*)$/s, 'Expected a JSON object in $1'],
  [/^Не удалось прочитать (.*?): (.*)$/s, 'Could not read $1: $2'],
  [/^Команда агента не найдена: (.*)$/s, 'Agent command not found: $1'],
  [/^Не удалось запустить агента: (.*)$/s, 'Could not start the agent: $1'],
  [
    /^Неизвестный провайдер агента: (.*?)\. Доступны: (.*)$/s,
    'Unknown agent provider: $1. Available: $2',
  ],
  [/^Превышено время выполнения агента \((.*?)\)$/s, 'Agent execution timed out ($1)'],
  [/^таймаут (.*)$/s, 'timeout $1'],
  [/^код (.*)$/s, 'code $1'],
  [/^сигнал (.*)$/s, 'signal $1'],
  [
    /^Нельзя отправить задачу: осталось неразобранных комментариев — (\d+)$/s,
    'Cannot submit the task: $1 comments are still unresolved',
  ],
  [
    /^Нельзя принять задачу: осталось непринятых правок — (\d+)$/s,
    'Cannot accept the task: $1 fixes are still pending',
  ],
  [
    /^Нельзя закрыть задачу: осталось неразобранных комментариев — (\d+)$/s,
    'Cannot close the task: $1 comments are still unresolved',
  ],
  [/^Выполнил: (.*)$/s, 'Ran: $1'],
  [/^Выполняет: (.*)$/s, 'Running: $1'],
  [/^Читает: (.*)$/s, 'Reading: $1'],
  [/^Правит: файлы$/s, 'Editing: files'],
  [/^Правит: (.*)$/s, 'Editing: $1'],
  [/^Ищет: (.*)$/s, 'Searching: $1'],
  [/^Смотрит файлы: (.*)$/s, 'Listing files: $1'],
  [/^Вызывает: (.*)$/s, 'Calling: $1'],
  [/^Файл слишком большой$/s, 'File is too large'],
  [/^Скриншот слишком большой$/s, 'Screenshot is too large'],
  [/^Агент завершился с ошибкой(.*)$/s, 'The agent finished with an error$1'],
];

export function normalizeLocale(value) {
  const tag = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/_/g, '-');
  if (!tag) return '';
  if (tag === 'ru' || tag.startsWith('ru-')) return 'ru';
  if (tag === 'en' || tag.startsWith('en-')) return 'en';
  return '';
}

export function detectBrowserLocale(nav) {
  const list =
    Array.isArray(nav?.languages) && nav.languages.length > 0
      ? nav.languages
      : [nav?.language];
  for (const language of list) {
    const locale = normalizeLocale(language);
    if (locale) return locale;
  }
  return 'en';
}

export function readStoredLocale(storage) {
  try {
    return normalizeLocale(storage?.getItem(LANGUAGE_STORAGE_KEY));
  } catch {
    return '';
  }
}

export function storeLocale(storage, locale) {
  const value = normalizeLocale(locale);
  if (!storage || !value) return false;
  try {
    storage.setItem(LANGUAGE_STORAGE_KEY, value);
    return true;
  } catch {
    return false;
  }
}

export function localeTag(locale) {
  return normalizeLocale(locale) === 'ru' ? 'ru-RU' : 'en-US';
}

export function interpolate(text, vars) {
  if (!vars) return String(text);
  return String(text).replace(/\{(\w+)\}/g, (match, name) => {
    if (!Object.prototype.hasOwnProperty.call(vars, name)) return match;
    const value = vars[name];
    return value === null || value === undefined ? '' : String(value);
  });
}

export function createTranslator(locale) {
  const active = normalizeLocale(locale) || 'en';
  return function translate(source, vars) {
    const text = active === 'en' ? EN_MESSAGES[source] ?? source : source;
    return vars ? interpolate(text, vars) : text;
  };
}

export function translateServerMessage(message, locale) {
  const text = String(message ?? '').trim();
  if (!text || normalizeLocale(locale) !== 'en') return text;
  if (EN_MESSAGES[text]) return EN_MESSAGES[text];
  for (const [pattern, replacement] of SERVER_PATTERNS) {
    const match = pattern.exec(text);
    if (!match) continue;
    return replacement.replace(/\$(\d+)/g, (_, index) => match[Number(index)] ?? '');
  }
  return text;
}

export function pluralForm(locale, count, forms) {
  const value = Math.abs(Number(count) || 0);
  if (normalizeLocale(locale) === 'en') return value === 1 ? forms.enOne : forms.enMany;
  const mod10 = value % 10;
  const mod100 = value % 100;
  if (mod10 === 1 && mod100 !== 11) return forms.ruOne;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return forms.ruFew;
  return forms.ruMany;
}
