-- Nexora Phase 3: authenticated profiles, published learning content, progress and attempts.
-- Project owners provision administrators through the Supabase SQL Editor; users cannot self-promote.

begin;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

create table if not exists private.admin_users (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table private.admin_users enable row level security;
revoke all on table private.admin_users from public, anon, authenticated;

create or replace function private.is_admin()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from private.admin_users where user_id = (select auth.uid()));
$$;
revoke all on function private.is_admin() from public, anon;
grant execute on function private.is_admin() to authenticated;

create or replace function private.touch_updated_at()
returns trigger language plpgsql set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function private.touch_updated_at() from public, anon, authenticated;
grant execute on function private.touch_updated_at() to authenticated;

create table if not exists public.student_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 80),
  program text check (program is null or char_length(program) <= 120),
  learning_language text not null default 'English' check (char_length(learning_language) between 1 and 40),
  daily_goal_minutes integer not null default 30 check (daily_goal_minutes between 10 and 240),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.courses (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title text not null check (char_length(title) between 1 and 160),
  category text not null check (char_length(category) between 1 and 80),
  description text not null default '',
  estimated_weeks integer not null default 1 check (estimated_weeks between 1 and 104),
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.lessons (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title text not null check (char_length(title) between 1 and 180),
  summary text not null default '',
  content text not null default '',
  example text not null default '',
  objectives jsonb not null default '[]'::jsonb check (jsonb_typeof(objectives) = 'array'),
  vocabulary jsonb not null default '[]'::jsonb check (jsonb_typeof(vocabulary) = 'array'),
  sort_order integer not null default 1 check (sort_order > 0),
  estimated_minutes integer not null default 10 check (estimated_minutes between 1 and 600),
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (course_id, sort_order)
);

create table if not exists public.lesson_progress (
  user_id uuid not null references auth.users (id) on delete cascade,
  lesson_id uuid not null references public.lessons (id) on delete cascade,
  completed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  primary key (user_id, lesson_id)
);

create table if not exists public.assessment_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  assessment_key text not null check (char_length(assessment_key) between 1 and 120),
  assessment_type text not null check (assessment_type in ('technical', 'english')),
  score numeric(5,2) not null check (score between 0 and 100),
  total_questions integer not null check (total_questions > 0),
  correct_answers integer not null check (correct_answers between 0 and total_questions),
  answers jsonb not null default '[]'::jsonb check (jsonb_typeof(answers) = 'array'),
  submitted_at timestamptz not null default now()
);

create index if not exists courses_published_title_idx on public.courses (published, title);
create index if not exists lessons_course_published_order_idx on public.lessons (course_id, published, sort_order);
create index if not exists lesson_progress_user_completed_idx on public.lesson_progress (user_id, completed_at desc);
create index if not exists assessment_attempts_user_submitted_idx on public.assessment_attempts (user_id, submitted_at desc);

drop trigger if exists student_profiles_touch_updated_at on public.student_profiles;
create trigger student_profiles_touch_updated_at before update on public.student_profiles for each row execute function private.touch_updated_at();
drop trigger if exists courses_touch_updated_at on public.courses;
create trigger courses_touch_updated_at before update on public.courses for each row execute function private.touch_updated_at();
drop trigger if exists lessons_touch_updated_at on public.lessons;
create trigger lessons_touch_updated_at before update on public.lessons for each row execute function private.touch_updated_at();

create or replace function public.handle_new_user_profile()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.student_profiles (user_id, display_name)
  values (new.id, left(coalesce(new.raw_user_meta_data ->> 'display_name', ''), 80))
  on conflict (user_id) do nothing;
  return new;
end;
$$;
revoke all on function public.handle_new_user_profile() from public, anon, authenticated;
drop trigger if exists on_auth_user_created_nexora_profile on auth.users;
create trigger on_auth_user_created_nexora_profile after insert on auth.users
for each row execute function public.handle_new_user_profile();

alter table public.student_profiles enable row level security;
alter table public.courses enable row level security;
alter table public.lessons enable row level security;
alter table public.lesson_progress enable row level security;
alter table public.assessment_attempts enable row level security;

revoke all on public.student_profiles, public.courses, public.lessons, public.lesson_progress, public.assessment_attempts from anon;
grant select, insert, update on public.student_profiles to authenticated;
grant select, insert, update, delete on public.courses, public.lessons, public.lesson_progress to authenticated;
grant select, insert on public.assessment_attempts to authenticated;

drop policy if exists "Students read their own profile" on public.student_profiles;
drop policy if exists "Students create their own profile" on public.student_profiles;
drop policy if exists "Students update their own profile" on public.student_profiles;
drop policy if exists "Authenticated users read published courses" on public.courses;
drop policy if exists "Admins insert courses" on public.courses;
drop policy if exists "Admins update courses" on public.courses;
drop policy if exists "Admins delete courses" on public.courses;
drop policy if exists "Authenticated users read published lessons" on public.lessons;
drop policy if exists "Admins insert lessons" on public.lessons;
drop policy if exists "Admins update lessons" on public.lessons;
drop policy if exists "Admins delete lessons" on public.lessons;
drop policy if exists "Students read their own lesson progress" on public.lesson_progress;
drop policy if exists "Students add their own lesson progress" on public.lesson_progress;
drop policy if exists "Students update their own lesson progress" on public.lesson_progress;
drop policy if exists "Students delete their own lesson progress" on public.lesson_progress;
drop policy if exists "Students read their own assessment attempts" on public.assessment_attempts;
drop policy if exists "Students insert their own assessment attempts" on public.assessment_attempts;

create policy "Students read their own profile" on public.student_profiles for select to authenticated using ((select auth.uid()) = user_id);
create policy "Students create their own profile" on public.student_profiles for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Students update their own profile" on public.student_profiles for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "Authenticated users read published courses" on public.courses for select to authenticated
using (published or (select private.is_admin()));
create policy "Admins insert courses" on public.courses for insert to authenticated with check ((select private.is_admin()));
create policy "Admins update courses" on public.courses for update to authenticated
using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "Admins delete courses" on public.courses for delete to authenticated using ((select private.is_admin()));

create policy "Authenticated users read published lessons" on public.lessons for select to authenticated
using (
  (published and exists (select 1 from public.courses c where c.id = course_id and c.published))
  or (select private.is_admin())
);
create policy "Admins insert lessons" on public.lessons for insert to authenticated with check ((select private.is_admin()));
create policy "Admins update lessons" on public.lessons for update to authenticated
using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "Admins delete lessons" on public.lessons for delete to authenticated using ((select private.is_admin()));

create policy "Students read their own lesson progress" on public.lesson_progress for select to authenticated using ((select auth.uid()) = user_id);
create policy "Students add their own lesson progress" on public.lesson_progress for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Students update their own lesson progress" on public.lesson_progress for update to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Students delete their own lesson progress" on public.lesson_progress for delete to authenticated using ((select auth.uid()) = user_id);

create policy "Students read their own assessment attempts" on public.assessment_attempts for select to authenticated using ((select auth.uid()) = user_id);
create policy "Students insert their own assessment attempts" on public.assessment_attempts for insert to authenticated with check ((select auth.uid()) = user_id);

-- Published starter catalog. The frontend keeps its local sample course experience until this migration is applied.
insert into public.courses (slug, title, category, description, estimated_weeks, published) values
  ('dsa', 'Data Structures & Algorithms', 'Computer Science', 'Build a strong foundation in the structures and strategies behind efficient software.', 6, true),
  ('dbms', 'Database Management Systems', 'Computer Science', 'Design, query and reason about reliable data systems.', 5, true),
  ('os', 'Operating Systems', 'Systems', 'Explore how operating systems manage processes, memory and resources.', 7, true),
  ('networks', 'Computer Networks', 'Systems', 'Understand the protocols and architecture that connect devices.', 5, true),
  ('ml', 'Machine Learning', 'Emerging Tech', 'Learn the core ideas behind models that discover patterns in data.', 8, true)
on conflict (slug) do nothing;

insert into public.lessons (course_id, slug, title, summary, content, example, objectives, vocabulary, sort_order, estimated_minutes, published)
select c.id, 'arrays', 'Arrays: storing data in sequence',
  'Learn how arrays organize related values in contiguous memory and support efficient access.',
  'An array is a collection of elements stored in a continuous block of memory. Each value has an index, which identifies its position. Because elements are laid out in order, a computer can calculate where an item lives directly from its index. This makes reading an item fast, although inserting in the middle may require shifting later elements.',
  'In a zero-indexed array temperatures = [18, 21, 24], temperatures[1] returns 21. The index is the position offset from the beginning of the collection.',
  '["Describe an array and its index", "Explain constant-time element access", "Compare access and insertion costs"]'::jsonb,
  '[{"term":"Contiguous","definition":"Arranged next to each other without gaps.","sentence":"The array stores its elements in contiguous memory locations."},{"term":"Index","definition":"A number that identifies an element’s position.","sentence":"Use index 1 to access the second element in a zero-indexed array."}]'::jsonb,
  1, 12, true from public.courses c where c.slug = 'dsa'
on conflict (slug) do nothing;

insert into public.lessons (course_id, slug, title, summary, content, example, objectives, vocabulary, sort_order, estimated_minutes, published)
select c.id, 'sql-select', 'Retrieving rows with SELECT',
  'Use a basic SQL query to select columns and filter records.',
  'A SELECT statement retrieves data from a table. Name the columns after SELECT and the table after FROM. Add a WHERE clause when you only need rows that meet a condition.',
  'SELECT name, department FROM students WHERE year = 2; returns names and departments for second-year students.',
  '["Recognize SELECT and FROM", "Choose columns to return", "Filter rows with WHERE"]'::jsonb,
  '[{"term":"Query","definition":"A request to retrieve or change information in a database.","sentence":"This query returns the students in year two."},{"term":"Row","definition":"A single record in a database table.","sentence":"Each row represents one student."}]'::jsonb,
  1, 10, true from public.courses c where c.slug = 'dbms'
on conflict (slug) do nothing;

insert into public.lessons (course_id, slug, title, summary, content, example, objectives, vocabulary, sort_order, estimated_minutes, published)
select c.id, 'processes', 'Processes and programs',
  'Understand how an operating system runs a program as a process.',
  'A program is a set of instructions stored on a device. When it runs, the operating system creates a process with its own state and resources. A process may be ready, running or waiting, and the operating system coordinates transitions between these states.',
  'A text editor stored on disk is a program. When you open it, the operating system starts a process to execute its instructions.',
  '["Distinguish a program from a process", "Name basic process states", "Describe the role of the operating system"]'::jsonb,
  '[{"term":"Process","definition":"A running instance of a program with its own state.","sentence":"The operating system scheduled the process to run."}]'::jsonb,
  1, 13, true from public.courses c where c.slug = 'os'
on conflict (slug) do nothing;

insert into public.lessons (course_id, slug, title, summary, content, example, objectives, vocabulary, sort_order, estimated_minutes, published)
select c.id, 'ip-addressing', 'An introduction to IP addresses',
  'Learn how IP addresses identify devices on a network.',
  'An Internet Protocol address identifies a device interface so network traffic can be delivered to the right destination. An IPv4 address has four numbers separated by dots. A prefix indicates which portion identifies the network.',
  'In 192.168.1.25/24, the /24 prefix marks the network portion, while the full address identifies one interface on that network.',
  '["Explain the purpose of an IP address", "Recognize IPv4 notation", "Describe a network prefix"]'::jsonb,
  '[{"term":"Address","definition":"An identifier used to locate a device or interface on a network.","sentence":"The router forwarded the packet to its destination address."}]'::jsonb,
  1, 11, true from public.courses c where c.slug = 'networks'
on conflict (slug) do nothing;

insert into public.lessons (course_id, slug, title, summary, content, example, objectives, vocabulary, sort_order, estimated_minutes, published)
select c.id, 'regression', 'Predicting a number with regression',
  'See how a regression model estimates a continuous value from input features.',
  'Regression is a supervised learning task that predicts a numeric value. A model learns a relationship between input features and a target from example data. It can then estimate the target for new inputs.',
  'A house-price model may use floor area, location and age as features to estimate a sale price.',
  '["Identify a regression task", "Distinguish features from a target", "Interpret a predicted value"]'::jsonb,
  '[{"term":"Feature","definition":"An input variable used by a model to make a prediction.","sentence":"The model used floor area as a feature."},{"term":"Target","definition":"The value a supervised model is trained to predict.","sentence":"The sale price was the target in this regression task."}]'::jsonb,
  1, 14, true from public.courses c where c.slug = 'ml'
on conflict (slug) do nothing;

commit;
