-- Новые возможности: предмет урока, пожелания для ИИ, время этапов, фото формул/слайдов.
-- Выполнить целиком в Supabase -> SQL Editor (после 001_init.sql). Безопасно запускать повторно.
alter table public.lessons add column if not exists subject text;
alter table public.lessons add column if not exists instructions text;
alter table public.lessons add column if not exists stage_durations jsonb;
alter table public.lessons add column if not exists images jsonb not null default '[]'::jsonb;

-- Как задать имя учителю вручную (вместо скрипта):
-- update auth.users set raw_user_meta_data = coalesce(raw_user_meta_data,'{}'::jsonb) || '{"full_name":"Иванов Иван"}'::jsonb where email = 'teacher@school.kg';
