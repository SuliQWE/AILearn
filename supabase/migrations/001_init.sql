-- AI Lesson MVP: схема, RLS, Storage, Realtime
-- Выполнить целиком в Supabase -> SQL Editor.
-- Модель доступа:
--   * Учитель входит через Supabase Auth и может ЧИТАТЬ только свои данные (RLS) — этого достаточно для Realtime.
--   * ВСЕ записи и весь доступ учеников идут через серверные API (service role) с проверкой прав в коде.
--   * Ученики не имеют прямого доступа к таблицам и Storage (RLS без политик для anon).

create extension if not exists pgcrypto;

-- ---------- Классы ----------
create table if not exists public.classes (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  created_at timestamptz not null default now()
);

create table if not exists public.class_students (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  full_name text not null check (char_length(full_name) between 1 and 80),
  created_at timestamptz not null default now(),
  unique (class_id, full_name)
);

-- ---------- Уроки ----------
create table if not exists public.lessons (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references auth.users(id) on delete cascade,
  class_id uuid references public.classes(id) on delete set null,
  title text not null check (char_length(title) between 1 and 160),
  topic text,
  grade text,
  join_code text not null unique,
  status text not null default 'draft' check (status in ('draft','ready','live','finished')),
  stage text not null default 'explain' check (stage in ('explain','test','tasks','retell','board','review','done')),
  stage_started_at timestamptz,
  paused_at timestamptz,
  paused_total_ms bigint not null default 0,
  stage_extra_sec integer not null default 0,
  content jsonb,
  simplified_explanation text,
  created_at timestamptz not null default now()
);
create index if not exists lessons_teacher_idx on public.lessons(teacher_id, created_at desc);

-- ---------- Участники (ученики по ссылке) ----------
create table if not exists public.lesson_participants (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 60),
  token_hash text not null,
  joined_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create unique index if not exists participants_name_uq on public.lesson_participants(lesson_id, lower(name));
create index if not exists participants_lesson_idx on public.lesson_participants(lesson_id);

-- ---------- Тест ----------
create table if not exists public.test_answers (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  participant_id uuid not null references public.lesson_participants(id) on delete cascade,
  question_idx integer not null check (question_idx between 0 and 7),
  kind text not null check (kind in ('mc','open')),
  choice integer check (choice between 0 and 3),
  text_answer text check (char_length(text_answer) <= 4000),
  is_correct boolean,            -- только для mc, считает сервер
  updated_at timestamptz not null default now(),
  unique (participant_id, question_idx)
);
create index if not exists test_answers_lesson_idx on public.test_answers(lesson_id);

create table if not exists public.test_submissions (
  participant_id uuid primary key references public.lesson_participants(id) on delete cascade,
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  submitted_at timestamptz not null default now()
);

-- ---------- Фото решений ----------
create table if not exists public.task_submissions (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  participant_id uuid not null references public.lesson_participants(id) on delete cascade,
  task_idx integer not null check (task_idx between 0 and 1),
  storage_path text not null unique,
  created_at timestamptz not null default now()
);
create index if not exists task_sub_lesson_idx on public.task_submissions(lesson_id);

-- ---------- Очередь к доске ----------
create table if not exists public.speak_queue (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  participant_id uuid not null references public.lesson_participants(id) on delete cascade,
  status text not null default 'waiting' check (status in ('waiting','called','done','skipped')),
  created_at timestamptz not null default now(),
  unique (lesson_id, participant_id)
);

-- ---------- Оценки учителя (отдельно от авто-результатов теста) ----------
create table if not exists public.teacher_grades (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  participant_id uuid not null references public.lesson_participants(id) on delete cascade,
  kind text not null check (kind in ('written','oral','open_q')),
  score numeric(3,1) not null check (score between 1 and 5),
  comment text check (char_length(comment) <= 1000),
  updated_at timestamptz not null default now(),
  unique (lesson_id, participant_id, kind)
);

-- ---------- RLS ----------
alter table public.classes enable row level security;
alter table public.class_students enable row level security;
alter table public.lessons enable row level security;
alter table public.lesson_participants enable row level security;
alter table public.test_answers enable row level security;
alter table public.test_submissions enable row level security;
alter table public.task_submissions enable row level security;
alter table public.speak_queue enable row level security;
alter table public.teacher_grades enable row level security;

drop policy if exists "teacher reads own classes" on public.classes;
create policy "teacher reads own classes" on public.classes for select to authenticated
  using (teacher_id = auth.uid());

drop policy if exists "teacher reads own class students" on public.class_students;
create policy "teacher reads own class students" on public.class_students for select to authenticated
  using (exists (select 1 from public.classes c where c.id = class_id and c.teacher_id = auth.uid()));

drop policy if exists "teacher reads own lessons" on public.lessons;
create policy "teacher reads own lessons" on public.lessons for select to authenticated
  using (teacher_id = auth.uid());

do $$
declare t text;
begin
  foreach t in array array['lesson_participants','test_answers','test_submissions','task_submissions','speak_queue','teacher_grades']
  loop
    execute format('drop policy if exists "teacher reads own lesson data" on public.%I', t);
    execute format(
      'create policy "teacher reads own lesson data" on public.%I for select to authenticated using (exists (select 1 from public.lessons l where l.id = lesson_id and l.teacher_id = auth.uid()))',
      t);
  end loop;
end $$;

-- Записи (insert/update/delete) для anon/authenticated политик НЕТ: всё идёт через сервер (service role обходит RLS).

-- ---------- Storage (закрытые бакеты, без публичных политик) ----------
insert into storage.buckets (id, name, public, file_size_limit)
values ('submissions', 'submissions', false, 10485760)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public, file_size_limit)
values ('materials', 'materials', false, 15728640)
on conflict (id) do nothing;

-- ---------- Realtime (учитель подписывается на изменения своих данных; RLS применяется) ----------
do $$
declare t text;
begin
  foreach t in array array['lessons','lesson_participants','test_submissions','task_submissions','speak_queue']
  loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;
