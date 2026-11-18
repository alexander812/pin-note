# PinNote

> Pin feedback to the page. Hand it to the agent.

PinNote — локальный review-режим для сайтов, которые генерирует AI. Вы открываете страницу, кликаете по элементам и оставляете комментарии. Инструмент складывает их в `.review/comments.json` вместе с DOM-контекстом, а агент в репозитории читает файл и вносит правки.

Основная идея: **не скриншот с координатами, а структурированный якорь**. У каждого комментария есть селектор, XPath, текст, HTML, вычисленные стили, размеры и подсказки по исходникам. Скриншот с пометками — дополнительный слой, а не замена якоря.

## Быстрый старт

```bash
cd ~/p/pin-note
npm start -- ~/p/portfolio-deepsick
```

Откроется `http://127.0.0.1:4174`. В правом нижнем углу появится кнопка «Комментировать». Панель можно перетащить за ручку `⠿`, если она мешает интерфейсу сайта.

Если в проекте уже запущен dev-сервер, PinNote найдёт его сам по папке проекта. Собирать сайт в этом случае не нужно. Адрес можно указать и явно:

```bash
cd ~/p/pin-note
npm start -- ~/p/my-app --target http://localhost:5173
```

`~/p/my-app` здесь — корень проекта: оттуда берутся подсказки по исходникам и туда пишутся `.review/comments.json`. Открывать нужно адрес PinNote (`http://127.0.0.1:4174`), а не dev-сервера. Без `--target` PinNote попробует найти запущенный dev-сервер сам.

Не запускай `pin-note . --target ...` из папки самого PinNote: тогда `.review` всех проектов будет общим. Если ты уже в PinNote, передай путь к проекту явно.

Если браузер не нужен:

```bash
node bin/pin-note.mjs ~/p/portfolio-deepsick --no-open
```

Демо-страница:

```bash
npm run demo
```

Подробная инструкция для любого проекта — со сборками Vite/Next/Astro, автоопределением dev-сервера, `--target`, `--spa`, отдельным `--data-dir` и циклом работы с агентом: [USAGE.md](USAGE.md).

## Как это работает

1. `npm start -- <папка>` поднимает Node-сервер и раздаёт статический сайт из указанной папки. Если в этой папке запущен dev-сервер, PinNote находит его сам и проксирует; `--target <url>` задаёт адрес явно, `--no-detect` отключает поиск.
2. Перед `</body>` сервер на лету вставляет `client.js` — и в статический HTML, и в HTML, полученный от dev-сервера. Сам `index.html` не меняется.
3. Клик по элементу открывает поповер. Можно прикрепить скриншот элемента с пометками; комментарий уходит на `POST /__review/comments` и попадает в активную задачу.
4. Сервер пишет `.review/comments.json`, сохраняет скриншоты в `.review/screenshots` и генерирует `.review/feedback.md` для текущей задачи.
5. Агент читает задачу через `pin-note tasks current`, правит `src/*`, собирает сайт.
6. В статическом режиме сервер замечает изменение HTML/CSS/JS и перезагружает вкладку по SSE. В режиме прокси перезагрузкой и HMR занимается dev-сервер; WebSocket-соединения тоже проксируются.
7. Агент обновляет `status` и `resolution` комментариев, затем выполняет `pin-note tasks submit`. Задача переходит в «На проверке»; человек проверяет результат и закрывает её кнопкой в панели.

## Что умеет

- Hover-подсветка элемента и клик для комментария.
- `Alt/Option+клик` — подниматься по дереву элементов; повторный клик выбирает родителя выше.
- Пины на странице, панель со списком, фильтры. Фильтр «Открытые»/«Решённые» применяется и к списку, и к пинам на странице.
- Статусы `open`, `resolved`, `wontfix`, `orphaned`.
- Задачи: номер, дата `dd.mm.yy`, короткое описание, статусы «В работе», «На проверке», «Закрыта». Новые комментарии попадают в активную задачу, после `tasks submit` — в следующую.
- Список задач, возврат комментариев в текущую задачу и удаление переписки задачи.
- Сохранение в `.review/comments.json` и генерация `.review/feedback.md`.
- Копирование Markdown для вставки в чат агенту.
- Автообновление комментариев и страницы через SSE.
- Fallback: если API перестал отвечать после загрузки страницы, клиент продолжает работать с `localStorage` и кнопкой «Скопировать для агента».
- Подсказки по исходникам: сервер ищет текст, id и классы по `src/*`, `app/*`, `pages/*` и соседним файлам.
- Режим `--target`: reverse proxy к Vite/Next/Astro dev-серверу, инъекция клиента в проксируемый HTML и проброс WebSocket/HMR.
- Автоопределение запущенного dev-сервера по папке проекта на macOS и Linux.
- Разделение проектов: свой `.review` по умолчанию, `projectId` в конфиге и отдельное пространство комментариев в localStorage.
- Скриншот выбранного элемента: захват вкладки, обрезка по элементу, рисование линий семью цветами, сохранение PNG и привязка к комментарию.

## Что пока не входит

- Скриншоты всей страницы и произвольной области: сейчас захватывается выбранный элемент (видимая часть).
- Отдельный режим для canvas/WebGL: сейчас клик по canvas сохраняет селектор canvas и относительную точку клика, но не область и не кадр.
- Комментарии внутри iframe.
- Обход жёсткого CSP, который запрещает same-origin-скрипты.
- Сайты с активным service worker: он может перехватывать `/__review/*`; для review-сессии его лучше отключить.
- Автоопределение dev-сервера за пределами macOS/Linux (Windows, Docker/WSL): там адрес нужно передавать через `--target`.
- Пауза анимаций.
- Расширение Chrome и работа с чужими сайтами.
- Авторизация и шаринг. Сервер слушает `127.0.0.1` и не предназначен для публикации.

Это следующие шаги, если базовый цикл окажется удобным.

## Формат комментария

```json
{
  "id": "c_m3k2_9f1a2b",
  "taskId": "t_m3k2_1a2b",
  "status": "open",
  "comment": "Заголовок слишком близко к графику, добавь 24px",
  "url": "http://127.0.0.1:4174/#2015",
  "anchor": {
    "selector": "#chapter-2015 h2",
    "xpath": "/html[1]/body[1]/main[1]/section[3]/h2[1]",
    "tag": "h2",
    "text": "2015",
    "html": "<h2 class=\"chapter__title\">2015</h2>",
    "ancestors": ["section#chapter-2015.chapter", "main#stage"],
    "attributes": { "class": "chapter__title" },
    "rect": { "x": 120, "y": 340, "width": 210, "height": 48 },
    "point": { "x": 0.5, "y": 0.5 },
    "viewport": { "width": 1440, "height": 900, "dpr": 2 },
    "scroll": { "x": 0, "y": 1210 },
    "styles": { "font-size": "64px", "margin-bottom": "8px" }
  },
  "sourceHints": [
    { "file": "src/app.js", "line": 123, "match": "text" }
  ],
  "screenshot": {
    "file": "screenshots/s_m3k2_9f1a2b.png",
    "width": 640,
    "height": 480
  },
  "resolution": "",
  "createdAt": "2026-11-10T14:00:00.000Z",
  "updatedAt": "2026-11-10T14:00:00.000Z"
}
```

`sourceHints` — эвристика, а не гарантия. Агент должен проверить совпадение по селектору, тексту и HTML. Если у комментария есть `screenshot.file`, файл лежит относительно `.review`; на изображении могут быть цветные пометки.

`feedback.md` — человекочитаемая версия текущей (или последней) задачи. Он генерируется сервером; редактировать его вручную не нужно. Источник правды — `comments.json`.

Добавь `.review/` в `.gitignore` целевого проекта, если не хочешь коммитить отзывы вместе с кодом.

## Протокол для агента

В `.review/AGENT.md` сервер создаёт памятку. Кратко:

```text
1. Посмотри текущую задачу: pin-note tasks current --json.
2. Возьми открытые комментарии: pin-note comments list --task current --status open --json.
3. Найди исходник по anchor.selector, anchor.text, anchor.html и sourceHints.
   Если есть screenshot.file, открой изображение относительно .review.
4. Внеси минимальную правку.
5. Отметь результат: pin-note comments resolve <id> --resolution "...".
6. Когда все комментарии разобраны — pin-note tasks submit.
   Не закрывай задачу: это делает человек.
```

Можно попросить агента:

```text
Разбери открытые комментарии текущей задачи PinNote.
После правок сделай npm run build и выполни pin-note tasks submit.
```

Сервер сам обновит `feedback.md` и пришлёт изменения в открытую вкладку. Задача
переходит в «На проверке»: новые комментарии уже попадают в следующую задачу,
а закрытие остаётся за человеком.

## CLI

```text
pin-note [directory] [options]

  directory           Папка со статическим сайтом или корень проекта
                      (по умолчанию текущая; в ней ищется dev-сервер)
  -p, --port <port>   Порт review-сервера (по умолчанию 4174)
      --host <host>   Хост (по умолчанию 127.0.0.1)
      --target <url>  Явно указать адрес dev-сервера (например http://localhost:5173)
      --no-detect     Не искать dev-сервер автоматически
      --data-dir <dir> Каталог для comments.json, feedback.md и AGENT.md (относительно текущей папки)
      --source-dir <dir> Где искать исходники для подсказок (по умолчанию <directory>)
      --spa           Отдавать index.html для неизвестных HTML-маршрутов (статический режим)
      --no-open       Не открывать браузер
      --no-watch      Не следить за файлами
  -h, --help
  -v, --version
```

Команды задач и комментариев (работают без запущенного сервера):

```text
pin-note tasks list [--json]
pin-note tasks current [--json]
pin-note tasks show T-1 [--json]
pin-note tasks submit [T-1]        # агент отправляет задачу на проверку
pin-note tasks close T-1 --confirm # закрывает человек
pin-note tasks update T-1 --description "Короткое описание"
pin-note tasks delete T-1 --confirm

pin-note comments list [--task current|all|T-1] [--status open] [--json]
pin-note comments show <id> [--json]
pin-note comments resolve <id> --resolution "..."
pin-note comments set-status <id> --status orphaned|wontfix --resolution "..."
pin-note comments reopen <id>
```

Если `pin-note` не установлен в `PATH`, используй
`node ~/p/pin-note/bin/pin-note.mjs ...` или выполни `npm link` в папке PinNote.

Пример с отдельным каталогом данных:

```bash
node bin/pin-note.mjs ~/p/site/dist --source-dir ~/p/site --data-dir ~/p/site/.review
```

Пример с запущенным dev-сервером (адрес ищется автоматически):

```bash
node bin/pin-note.mjs ~/p/my-app
```

Если dev-сервер не найден или нужен конкретный адрес:

```bash
node bin/pin-note.mjs ~/p/my-app --target http://localhost:5173
```

## API

| Метод | Путь | Назначение |
| --- | --- | --- |
| `GET` | `/__review/config` | Имя проекта, пути к файлам, текущая задача, возможности |
| `GET` | `/__review/state` | Задачи и комментарии |
| `GET` | `/__review/tasks` | Список задач со сводкой |
| `GET` | `/__review/tasks/:ref` | Задача и её комментарии |
| `PATCH` | `/__review/tasks/:ref` | Изменить `description` |
| `POST` | `/__review/tasks/:ref/submit` | Отправить задачу на проверку |
| `POST` | `/__review/tasks/:ref/close` | Закрыть задачу |
| `DELETE` | `/__review/tasks/:ref` | Удалить задачу и её комментарии |
| `GET` | `/__review/comments` | Весь store |
| `POST` | `/__review/comments` | Создать комментарий |
| `PATCH` | `/__review/comments/:id` | Обновить `status`, `comment`, `resolution` |
| `POST` | `/__review/comments/:id/reopen` | Вернуть комментарий в текущую задачу |
| `DELETE` | `/__review/comments/:id` | Удалить комментарий |
| `GET` | `/__review/export.md` | Markdown; `?status=open&task=current` для фильтра |
| `POST` | `/__review/screenshots` | Загрузить PNG/JPEG/WebP скриншот |
| `GET` | `/__review/screenshots/:name` | Отдать скриншот |
| `GET` | `/__review/events` | SSE: `comments`, `reload` |
| `GET` | `/__review/client.js` | Клиент review-режима |
| `GET` | `/__review/client.css` | Стили в Shadow DOM |

Мутации принимают только `application/json` и same-origin запросы. API не отдаёт CORS-заголовки.

## Структура

```text
bin/pin-note.mjs        CLI
src/server.mjs          статический сервер и прокси, инъекция клиента, API, SSE, watcher
src/proxy.mjs           reverse proxy для dev-сервера, HTML и WebSocket
src/dev-server.mjs      поиск запущенного dev-сервера по папке проекта
src/store.mjs           чтение/запись comments.json, задачи, feedback.md, валидация
src/source-hints.mjs    эвристический поиск исходников
src/shared.mjs          формат Markdown и статусы
src/client.js           Shadow DOM UI
src/client.css          стили UI
examples/demo/          демо-страница
test/                   тесты сервера
```

## Разработка

```bash
npm test
node --check src/client.js
```

Зависимостей нет: только Node.js 20+.

## Безопасность

- По умолчанию сервер слушает только `127.0.0.1`.
- Каталог `.review` не отдаётся статикой.
- API проверяет `Origin` для мутаций и требует JSON.
- В режиме прокси трафик идёт только на локальный dev-сервер — явно указанный или найденный по папке проекта; не направляйте PinNote на недоверенные сайты.
- Скриншоты сохраняются в `.review/screenshots` и могут содержать данные страницы; они не отдаются статикой, только через review API.
- Не выставляйте сервер в сеть без аутентификации: комментарии и DOM-контекст могут содержать чувствительные данные.
