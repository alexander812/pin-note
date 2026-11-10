# PinNote

> Pin feedback to the page. Hand it to the agent.

PinNote — локальный review-режим для сайтов, которые генерирует AI. Вы открываете страницу, кликаете по элементам и оставляете комментарии. Инструмент складывает их в `.review/comments.json` вместе с DOM-контекстом, а агент в репозитории читает файл и вносит правки.

Основная идея: **не скриншот с координатами, а структурированный якорь**. У каждого комментария есть селектор, XPath, текст, HTML, вычисленные стили, размеры и подсказки по исходникам.

## Быстрый старт

```bash
cd ~/p/pin-note
npm start -- ~/p/portfolio-deepsick
```

Откроется `http://127.0.0.1:4174`. В правом нижнем углу появится кнопка «Комментировать». Панель можно перетащить за ручку `⠿`, если она мешает интерфейсу сайта.

Если браузер не нужен:

```bash
node bin/pin-note.mjs ~/p/portfolio-deepsick --no-open
```

Демо-страница:

```bash
npm run demo
```

## Как это работает

1. `npm start -- <папка>` поднимает Node-сервер и раздаёт статический сайт из указанной папки.
2. Перед `</body>` сервер на лету вставляет `client.js`. Сам `index.html` не меняется.
3. Клик по элементу открывает поповер. Комментарий уходит на `POST /__review/comments`.
4. Сервер пишет `.review/comments.json` и генерирует `.review/feedback.md`.
5. Агент читает `comments.json` или `feedback.md`, правит `src/*`, собирает сайт.
6. Сервер замечает изменение HTML/CSS/JS и перезагружает вкладку по SSE.
7. Агент обновляет `status` и `resolution` в `comments.json`; браузер подхватывает изменения.

## Что умеет

- Hover-подсветка элемента и клик для комментария.
- `Alt+клик` — выбрать родительский элемент.
- Пины на странице, панель со списком, фильтры.
- Статусы `open`, `resolved`, `wontfix`, `orphaned`.
- Сохранение в `.review/comments.json` и генерация `.review/feedback.md`.
- Копирование Markdown для вставки в чат агенту.
- Автообновление комментариев и страницы через SSE.
- Fallback: если API перестал отвечать после загрузки страницы, клиент продолжает работать с `localStorage` и кнопкой «Скопировать для агента».
- Подсказки по исходникам: сервер ищет текст, id и классы по `src/*`, `app/*`, `pages/*` и соседним файлам.

## Что пока не входит

- Скриншоты элементов и областей.
- Отдельный режим для canvas/WebGL: сейчас клик по canvas сохраняет селектор canvas и относительную точку клика, но не область и не кадр.
- Комментарии внутри iframe.
- Обход жёсткого CSP, который запрещает same-origin-скрипты.
- Сайты с активным service worker: он может перехватывать `/__review/*`; для review-сессии его лучше отключить.
- Пауза анимаций.
- Расширение Chrome и работа с чужими сайтами.
- Reverse proxy к Vite/Next dev-серверу. Сейчас раздаётся статическая папка; для `dist`/`build` это подходит, для dev-сервера нужен прокси.
- Авторизация и шаринг. Сервер слушает `127.0.0.1` и не предназначен для публикации.

Это следующие шаги, если базовый цикл окажется удобным.

## Формат комментария

```json
{
  "id": "c_m3k2_9f1a2b",
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
  "resolution": "",
  "createdAt": "2026-11-10T14:00:00.000Z",
  "updatedAt": "2026-11-10T14:00:00.000Z"
}
```

`sourceHints` — эвристика, а не гарантия. Агент должен проверить совпадение по селектору, тексту и HTML.

`feedback.md` — человекочитаемая версия того же набора. Он генерируется сервером; редактировать его вручную не нужно. Источник правды — `comments.json`.

Добавь `.review/` в `.gitignore` целевого проекта, если не хочешь коммитить отзывы вместе с кодом.

## Протокол для агента

В `.review/AGENT.md` сервер создаёт памятку. Кратко:

```text
Прочитай .review/comments.json.
Для каждого комментария со статусом open найди исходник по anchor.selector,
anchor.text, anchor.html и sourceHints. Внеси минимальную правку.
После проверки поставь status: "resolved" и добавь resolution.
Если элемент не найден — status: "orphaned" и объяснение в resolution.
Не удаляй комментарии и не меняй несвязанные поля.
```

Можно попросить агента:

```text
Разбери открытые комментарии из .review/comments.json.
После правок сделай npm run build и обнови статусы в JSON.
```

Сервер сам обновит `feedback.md` и пришлёт изменения в открытую вкладку.

## CLI

```text
pin-note [directory] [options]

  directory           Папка со статическим сайтом (по умолчанию текущая)
  -p, --port <port>   Порт review-сервера (по умолчанию 4174)
      --host <host>   Хост (по умолчанию 127.0.0.1)
      --data-dir <dir> Каталог для comments.json и feedback.md (относительно текущей папки)
      --source-dir <dir> Где искать исходники для подсказок (по умолчанию <directory>)
      --spa           Отдавать index.html для неизвестных HTML-маршрутов
      --no-open       Не открывать браузер
      --no-watch      Не следить за файлами
  -h, --help
  -v, --version
```

Пример с отдельным каталогом данных:

```bash
node bin/pin-note.mjs ~/p/site/dist --source-dir ~/p/site --data-dir ~/p/site/.review
```

## API

| Метод | Путь | Назначение |
| --- | --- | --- |
| `GET` | `/__review/config` | Имя проекта, пути к файлам, возможности |
| `GET` | `/__review/comments` | Весь store |
| `POST` | `/__review/comments` | Создать комментарий |
| `PATCH` | `/__review/comments/:id` | Обновить `status`, `comment`, `resolution` |
| `DELETE` | `/__review/comments/:id` | Удалить комментарий |
| `GET` | `/__review/export.md` | Markdown; `?status=open` для фильтра |
| `GET` | `/__review/events` | SSE: `comments`, `reload` |
| `GET` | `/__review/client.js` | Клиент review-режима |
| `GET` | `/__review/client.css` | Стили в Shadow DOM |

Мутации принимают только `application/json` и same-origin запросы. API не отдаёт CORS-заголовки.

## Структура

```text
bin/pin-note.mjs        CLI
src/server.mjs          статический сервер, инъекция клиента, API, SSE, watcher
src/store.mjs           чтение/запись comments.json, feedback.md, валидация
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
- Не выставляйте сервер в сеть без аутентификации: комментарии и DOM-контекст могут содержать чувствительные данные.
