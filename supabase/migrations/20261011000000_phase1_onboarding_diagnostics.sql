-- Nexora Phase 1: academic onboarding and independently graded diagnostics.
-- Apply after 20261009000000_phase3_supabase_schema.sql. This migration is additive.
begin;

do $$
begin
  if to_regclass('public.student_profiles') is null then
    raise exception 'Apply 20261009000000_phase3_supabase_schema.sql before this migration.';
  end if;
end;
$$;

create table if not exists public.departments (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null unique check (char_length(name) between 1 and 120),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.academic_programs (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments (id) on delete restrict,
  name text not null check (char_length(name) between 1 and 140),
  degree_level text not null default 'Undergraduate' check (degree_level in ('Diploma', 'Undergraduate', 'Postgraduate', 'Other')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (department_id, name, degree_level)
);

alter table public.student_profiles
  add column if not exists college_name text check (college_name is null or char_length(college_name) <= 160),
  add column if not exists department_id uuid references public.departments (id) on delete set null,
  add column if not exists academic_program_id uuid references public.academic_programs (id) on delete set null,
  add column if not exists academic_year smallint check (academic_year is null or academic_year between 1 and 10),
  add column if not exists semester smallint check (semester is null or semester between 1 and 20),
  add column if not exists technical_interests text[] not null default '{}' check (cardinality(technical_interests) <= 12),
  add column if not exists learning_goals text[] not null default '{}' check (cardinality(learning_goals) <= 8),
  add column if not exists learning_pace text not null default 'steady' check (learning_pace in ('relaxed', 'steady', 'intensive')),
  add column if not exists onboarding_completed_at timestamptz;

create table if not exists private.diagnostic_question_bank (
  question_id text primary key,
  dimension text not null check (dimension in ('english', 'core')),
  subject text not null,
  prompt text not null,
  options jsonb not null check (jsonb_typeof(options) = 'array' and jsonb_array_length(options) >= 2),
  correct_option smallint not null check (correct_option >= 0 and correct_option < jsonb_array_length(options)),
  explanation text not null,
  sort_order smallint not null check (sort_order > 0),
  unique (dimension, subject, sort_order)
);
revoke all on table private.diagnostic_question_bank from public, anon, authenticated;
alter table private.diagnostic_question_bank enable row level security;

create table if not exists public.diagnostic_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  dimension text not null check (dimension in ('english', 'core')),
  subject text not null check (char_length(subject) between 1 and 80),
  score numeric(5,2) not null check (score between 0 and 100),
  assigned_level text not null check (assigned_level in ('beginner', 'intermediate', 'advanced')),
  correct_answers smallint not null check (correct_answers >= 0),
  total_questions smallint not null check (total_questions > 0 and correct_answers <= total_questions),
  answers jsonb not null check (jsonb_typeof(answers) = 'array'),
  submitted_at timestamptz not null default now()
);

create index if not exists academic_programs_department_idx on public.academic_programs (department_id, active, name);
create index if not exists student_profiles_department_idx on public.student_profiles (department_id) where department_id is not null;
create index if not exists student_profiles_program_idx on public.student_profiles (academic_program_id) where academic_program_id is not null;
create index if not exists diagnostic_attempts_user_history_idx on public.diagnostic_attempts (user_id, dimension, submitted_at desc);

insert into public.departments (slug, name) values
  ('information-technology', 'Information Technology'),
  ('computer-science-engineering', 'Computer Science and Engineering'),
  ('electronics-communication-engineering', 'Electronics and Communication Engineering'),
  ('electrical-electronics-engineering', 'Electrical and Electronics Engineering'),
  ('mechanical-engineering', 'Mechanical Engineering'),
  ('civil-engineering', 'Civil Engineering'),
  ('other', 'Other')
on conflict (slug) do nothing;

insert into public.academic_programs (department_id, name, degree_level)
select d.id, p.name, p.degree_level
from public.departments d
cross join (values ('Bachelor of Engineering', 'Undergraduate'), ('Bachelor of Technology', 'Undergraduate'), ('Other', 'Other')) as p(name, degree_level)
on conflict (department_id, name, degree_level) do nothing;

-- These are clearly identified starter diagnostics. Correct answers remain in the private schema.
insert into private.diagnostic_question_bank (question_id, dimension, subject, prompt, options, correct_option, explanation, sort_order) values
('en-01', 'english', 'technical-english', 'Choose the clearest technical sentence.', '["The system do processing input data.", "Processing data is system input.", "The system processes the input data.", "Input system processed data doing."]'::jsonb, 2, 'A clear sentence uses a subject, a correctly inflected verb, and an object.', 1),
('en-02', 'english', 'technical-english', 'In a technical report, what does “reliable” most nearly mean?', '["Uses the newest colors", "Works consistently as expected", "Has many buttons", "Is difficult to access"]'::jsonb, 1, 'A reliable system performs its intended function consistently.', 2),
('en-03', 'english', 'technical-english', 'Complete the sentence: “The database stores records ___ a table.”', '["at", "in", "by", "from"]'::jsonb, 1, '“In a table” is the natural preposition for describing where records are stored.', 3),
('en-04', 'english', 'technical-english', 'Which phrase is most appropriate for a project presentation?', '["Our results is saying speed is much better.", "We did the thing and it was fast.", "Our results indicate that the approach reduced response time.", "Speed was made by the system somehow."]'::jsonb, 2, 'This phrasing states an evidence-based result in a professional, precise way.', 4),
('core-dsa-01', 'core', 'dsa', 'What is the typical time complexity of accessing an array element by index?', '["O(log n)", "O(n)", "O(1)", "O(n²)"]'::jsonb, 2, 'An array index can be translated directly to an address, so access is constant time.', 1),
('core-dsa-02', 'core', 'dsa', 'Which data structure follows the last-in, first-out principle?', '["Queue", "Stack", "Graph", "Hash table"]'::jsonb, 1, 'A stack removes the most recently added item first.', 2),
('core-dsa-03', 'core', 'dsa', 'Binary search requires the searched sequence to be:', '["Circular", "Sorted", "Stored on disk", "A linked list"]'::jsonb, 1, 'Binary search eliminates half the remaining range at each step, which requires sorted order.', 3),
('core-dbms-01', 'core', 'dbms', 'Which SQL clause filters rows before they are returned?', '["ORDER BY", "WHERE", "GROUP BY", "SELECT"]'::jsonb, 1, 'WHERE applies a condition to rows selected from a table.', 1),
('core-dbms-02', 'core', 'dbms', 'What is the main purpose of a primary key?', '["Sort every query automatically", "Uniquely identify each row", "Encrypt a table", "Store duplicate records"]'::jsonb, 1, 'A primary key uniquely identifies a row and cannot be null.', 2),
('core-dbms-03', 'core', 'dbms', 'A foreign key is used primarily to:', '["Compress a database", "Rename a column", "Reference a row in another table", "Count all rows"]'::jsonb, 2, 'A foreign key enforces a relationship to a key in another table.', 3),
('core-os-01', 'core', 'os', 'A process is best described as:', '["A file that cannot run", "A program that is currently executing", "A hardware cable", "A database query"]'::jsonb, 1, 'A process is a running instance of a program with execution state and resources.', 1),
('core-os-02', 'core', 'os', 'Which component chooses a ready process to run on a CPU?', '["Compiler", "Web browser", "Scheduler", "File extension"]'::jsonb, 2, 'The operating-system scheduler selects a process from the ready queue.', 2),
('core-os-03', 'core', 'os', 'Virtual memory allows a system to:', '["Remove the need for a CPU", "Use disk space to extend the apparent memory available to processes", "Guarantee every process runs at once", "Store passwords in source code"]'::jsonb, 1, 'Virtual memory maps process address spaces to physical memory and may use disk-backed pages.', 3),
('core-net-01', 'core', 'networks', 'What is the primary role of an IP address?', '["Encrypt every file on a computer", "Identify a network interface for packet delivery", "Choose a programming language", "Store a web page"]'::jsonb, 1, 'IP addresses identify interfaces so packets can be routed to a destination.', 1),
('core-net-02', 'core', 'networks', 'Which protocol commonly provides reliable, ordered byte delivery?', '["ARP", "DNS", "TCP", "ICMP"]'::jsonb, 2, 'TCP provides reliable, ordered delivery through acknowledgements and retransmission.', 2),
('core-net-03', 'core', 'networks', 'DNS is used to:', '["Encrypt database rows", "Translate domain names to IP addresses", "Assign CPU time", "Compile source code"]'::jsonb, 1, 'DNS resolves domain names to records such as IP addresses.', 3),
('core-ml-01', 'core', 'ml', 'In supervised learning, a model learns from:', '["Only unlabeled images", "Examples that include target labels", "Random guesses without data", "Network cables"]'::jsonb, 1, 'Supervised training examples pair input features with known targets.', 1),
('core-ml-02', 'core', 'ml', 'In a regression task, the target is usually:', '["A file name", "A network protocol", "A continuous numeric value", "A database index"]'::jsonb, 2, 'Regression predicts numeric quantities such as temperature or price.', 2),
('core-ml-03', 'core', 'ml', 'What does overfitting mean?', '["The model has no parameters", "The model fits training data well but generalizes poorly", "The data has no target", "The training set is always too small to load"]'::jsonb, 1, 'An overfit model captures noise or details in training data that do not generalize.', 3)
on conflict (question_id) do nothing;

alter table public.departments enable row level security;
alter table public.academic_programs enable row level security;
alter table public.diagnostic_attempts enable row level security;
revoke all on public.departments, public.academic_programs, public.diagnostic_attempts from public, anon, authenticated;
grant select on public.departments, public.academic_programs to authenticated;
grant insert, update, delete on public.departments, public.academic_programs to authenticated;
grant select on public.diagnostic_attempts to authenticated;

drop policy if exists "Authenticated users read active departments" on public.departments;
create policy "Authenticated users read active departments" on public.departments for select to authenticated using (active or (select private.is_admin()));
drop policy if exists "Admins manage departments" on public.departments;
create policy "Admins manage departments" on public.departments for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
drop policy if exists "Authenticated users read active programs" on public.academic_programs;
create policy "Authenticated users read active programs" on public.academic_programs for select to authenticated using (active or (select private.is_admin()));
drop policy if exists "Admins manage programs" on public.academic_programs;
create policy "Admins manage programs" on public.academic_programs for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
drop policy if exists "Students read their diagnostic history" on public.diagnostic_attempts;
create policy "Students read their diagnostic history" on public.diagnostic_attempts for select to authenticated using ((select auth.uid()) = user_id);

create or replace function public.get_diagnostic_questions(p_dimension text, p_subject text)
returns table (question_id text, dimension text, subject text, prompt text, options jsonb, sort_order smallint)
language sql stable security definer set search_path = ''
as $$
  select q.question_id, q.dimension, q.subject, q.prompt, q.options, q.sort_order
  from private.diagnostic_question_bank q
  where (select auth.uid()) is not null
    and q.dimension = p_dimension
    and q.subject = p_subject
  order by q.sort_order;
$$;
revoke all on function public.get_diagnostic_questions(text, text) from public, anon;
grant execute on function public.get_diagnostic_questions(text, text) to authenticated;

create or replace function public.submit_diagnostic_assessment(p_dimension text, p_subject text, p_answers jsonb)
returns table (attempt_id uuid, score numeric, correct_answers smallint, total_questions smallint, assigned_level text, submitted_at timestamptz)
language plpgsql security definer set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_total integer;
  v_submitted integer;
  v_distinct integer;
  v_correct integer;
  v_score numeric(5,2);
  v_level text;
  v_attempt_id uuid;
  v_submitted_at timestamptz;
  v_review jsonb;
begin
  if v_user_id is null then raise exception 'Authentication is required.' using errcode = '42501'; end if;
  if p_dimension not in ('english', 'core') then raise exception 'Unknown diagnostic dimension.' using errcode = '22023'; end if;
  if p_subject is null or char_length(p_subject) not between 1 and 80 then raise exception 'Invalid diagnostic subject.' using errcode = '22023'; end if;
  if jsonb_typeof(p_answers) <> 'array' then raise exception 'Answers must be a JSON array.' using errcode = '22023'; end if;
  if exists (select 1 from jsonb_array_elements(p_answers) a(value)
      where jsonb_typeof(a.value) <> 'object' or coalesce(a.value->>'selected_option', '') !~ '^[0-3]$') then
    raise exception 'Each answer must contain a valid option index.' using errcode = '22023';
  end if;

  select count(*) into v_total from private.diagnostic_question_bank q where q.dimension = p_dimension and q.subject = p_subject;
  if v_total = 0 then raise exception 'No diagnostic is configured for this subject.' using errcode = '22023'; end if;
  select count(*), count(distinct a.value->>'question_id') into v_submitted, v_distinct
  from jsonb_array_elements(p_answers) as a(value);
  if v_submitted <> v_total or v_distinct <> v_total then raise exception 'Answer every diagnostic question exactly once.' using errcode = '22023'; end if;

  select count(*) filter (where
    (case when (a.value->>'selected_option') ~ '^[0-9]+$' then (a.value->>'selected_option')::integer else -1 end) = q.correct_option
  ) into v_correct
  from jsonb_array_elements(p_answers) as a(value)
  join private.diagnostic_question_bank q
    on q.question_id = a.value->>'question_id' and q.dimension = p_dimension and q.subject = p_subject;
  if (select count(*) from jsonb_array_elements(p_answers) a(value)
      join private.diagnostic_question_bank q on q.question_id = a.value->>'question_id' and q.dimension = p_dimension and q.subject = p_subject) <> v_total then
    raise exception 'One or more diagnostic question identifiers are invalid.' using errcode = '22023';
  end if;

  v_score := round((v_correct::numeric / v_total) * 100, 2);
  v_level := case when v_score < 50 then 'beginner' when v_score < 80 then 'intermediate' else 'advanced' end;
  select jsonb_agg(jsonb_build_object(
    'question_id', q.question_id,
    'selected_option', (a.value->>'selected_option')::integer,
    'correct_option', q.correct_option,
    'explanation', q.explanation
  ) order by q.sort_order) into v_review
  from jsonb_array_elements(p_answers) a(value)
  join private.diagnostic_question_bank q on q.question_id = a.value->>'question_id' and q.dimension = p_dimension and q.subject = p_subject;

  insert into public.diagnostic_attempts (user_id, dimension, subject, score, assigned_level, correct_answers, total_questions, answers)
  values (v_user_id, p_dimension, p_subject, v_score, v_level, v_correct, v_total, v_review)
  returning id, public.diagnostic_attempts.submitted_at into v_attempt_id, v_submitted_at;
  return query select v_attempt_id, v_score, v_correct::smallint, v_total::smallint, v_level, v_submitted_at;
end;
$$;
revoke all on function public.submit_diagnostic_assessment(text, text, jsonb) from public, anon;
grant execute on function public.submit_diagnostic_assessment(text, text, jsonb) to authenticated;

commit;
