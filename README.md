# AI Lesson — бэкенд (Next.js + Supabase + Gemini)

Бэкенд MVP платформы для уроков: учитель создаёт урок, Gemini генерирует материалы, ученики заходят по ссылке/QR,
этапы и таймеры живут на сервере. Фронтенд подключается следующим шагом.

## Запуск за 5 шагов

1. **Установка**
   ```bash
   npm install
   cp .env.example .env.local
   ```
2. **Supabase**: создайте проект на supabase.com → *SQL Editor* → вставьте весь файл
   `supabase/migrations/001_init.sql` → *Run*. Он создаёт таблицы, RLS, закрытые бакеты `submissions` и `materials` и Realtime.
3. **Ключи** в `.env.local`: `NEXT_PUBLIC_SUPABASE_URL` (**без** `/rest/v1/`), `NEXT_PUBLIC_SUPABASE_ANON_KEY` (`sb_publishable_…`), `SUPABASE_SERVICE_ROLE_KEY` (`sb_secret_…`)
   (*Project Settings → API*) и `GEMINI_API_KEY` (aistudio.google.com/apikey).
   `SERVICE_ROLE` и `GEMINI_API_KEY` — только серверные, префикс `NEXT_PUBLIC_` им не давать.
3a. **Вторая миграция**: тем же способом выполните `supabase/migrations/002_features.sql` (предмет, пожелания для ИИ, время этапов, фото формул).
4. **Аккаунты учителей создаёт администратор** (регистрации на сайте нет):
   ```bash
   npm run create-teacher -- teacher@school.kg Пароль123 "Иванов Иван Иванович"
   ```
   Имя (`full_name`) показывается в кабинете и у учеников. Повторный запуск с той же почтой обновляет пароль и имя.
   Демо для жюри: при `DEMO_ENABLED=true` на странице `/teacher` есть кнопки демо-входа (после показа поставьте `false`).
5. **Запуск**: `npm run dev` → откройте http://localhost:3000/api/health — должно быть `"ok": true`; если нет — в поле `hints` написано, что исправить.

Для телефонов жюри нужен публичный адрес: задеплойте на Vercel (добавьте те же переменные) и поставьте
`NEXT_PUBLIC_APP_URL=https://ваш-проект.vercel.app`. Иначе QR будет вести на localhost.

## Как работает защита

- Учитель: токен Supabase Auth в заголовке `Authorization: Bearer <access_token>`; каждый маршрут проверяет, что урок/класс принадлежит ему.
- Ученик: регистрации нет. `POST /api/join` выдаёт секретный токен (в базе только его SHA-256), клиент шлёт его в `x-participant-token`.
- RLS включён на всех таблицах: учитель только **читает** свои данные (нужно для Realtime), все записи идут через сервер.
  Ученики напрямую в базу и Storage не попадают.
- Правильные ответы теста клиенту не отдаются до окончания теста; проверка вариантов — на сервере.
- Таймер считает сервер (`stage_started_at`, пауза, продление). Ответы после окончания времени (+3 с допуск) отклоняются.
- Повторные отправки безопасны: тест блокируется после «Сдать», фото и очередь не дублируются, переходы этапов защищены от гонки.
- Фото решений и материалы лежат в закрытых бакетах; учитель видит их по подписанным ссылкам на 1 час. ИИ фото не проверяет.

## API

Учитель (`Authorization: Bearer ...`):

| Метод и путь | Назначение |
|---|---|
| `GET/POST /api/classes` | классы |
| `GET/POST /api/classes/:id/students` | ученики класса (`{"names": "ФИО\nФИО"}`) |
| `GET/POST /api/lessons` | список / создание урока (`title`, `topic`, `grade`, `class_id`) |
| `GET/PATCH /api/lessons/:id` | урок / правка материалов до запуска |
| `POST /api/lessons/:id/material-upload` | подписанная ссылка для PDF/PPTX (`{"ext":"pdf"}`) |
| `POST /api/lessons/:id/generate` | Gemini создаёт материалы (`topic` и/или `material_path`) |
| `GET /api/lessons/:id/qr` | ссылка входа и QR (data URL) |
| `POST /api/lessons/:id/control` | `start`, `pause`, `resume`, `next`, `extend` |
| `GET /api/lessons/:id/state` | панель: кто в сети, кто сдал тест, фото, очередь |
| `GET /api/lessons/:id/submissions` | ответы и фото решений |
| `POST /api/lessons/:id/queue` | вызвать ученика / отметить ответ |
| `GET/PUT /api/lessons/:id/grades` | оценки учителя (1–5) |
| `GET /api/lessons/:id/analytics` | итоги: авто-тест отдельно от оценок учителя |

Ученик (`x-participant-token`, код урока в пути):

| Метод и путь | Назначение |
|---|---|
| `POST /api/join` | вход по коду и имени |
| `GET /api/play/:code/state` | текущий этап, таймер, контент (опрос раз в 2–3 с) |
| `POST /api/play/:code/answers` | автосохранение / сдача теста |
| `POST /api/play/:code/ask` | вопрос ИИ по теме урока (лимит 15 за 10 мин) |
| `POST /api/play/:code/upload-url` → `upload-confirm` | загрузка фото решения |
| `POST /api/play/:code/queue` | встать в очередь к доске |

Realtime: панель учителя подписывается через supabase-js на `lessons`, `lesson_participants`, `test_submissions`,
`task_submissions`, `speak_queue` (RLS применяется). Ученики используют опрос `/state` — это надёжнее на школьном Wi-Fi.

## Быстрая проверка через curl

```bash
# получить токен учителя
curl -s "$SUPABASE_URL/auth/v1/token?grant_type=password" -H "apikey: $ANON" -H "content-type: application/json" \
  -d '{"email":"t@t.com","password":"..."}'          # → access_token
T=<access_token>
curl -s localhost:3000/api/lessons -H "Authorization: Bearer $T" -H "content-type: application/json" \
  -d '{"title":"Фотосинтез","topic":"Фотосинтез у растений","grade":"7 класс"}'   # → id, join_code
curl -s -X POST localhost:3000/api/lessons/<id>/generate -H "Authorization: Bearer $T" -H "content-type: application/json" -d '{}'
curl -s -X POST localhost:3000/api/lessons/<id>/control -H "Authorization: Bearer $T" -H "content-type: application/json" -d '{"action":"start"}'
curl -s -X POST localhost:3000/api/join -H "content-type: application/json" -d '{"code":"<join_code>","name":"Айбек К."}'
```

## Ограничения

- Интернет-поиска нет: доп. материалы строятся только по теме и загруженному файлу, об этом честно сказано в `extra_note`.
- Лимиты Gemini считаются на проект. Включите Cloud Billing: на бесплатном тарифе данные могут использоваться Google для обучения.
  Модель меняется переменной `GEMINI_MODEL`, провайдер — заменой файла `src/lib/gemini.ts`.
- Состояние «в сети» считается по последнему запросу ученика (порог 15 с).
