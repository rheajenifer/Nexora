-- Nexora Phase 1: relational foundations for learning, assessment and career records.
-- Apply after the existing schema and Phase 1 onboarding migrations. Additive and idempotent.
begin;

do $$
begin
  if to_regclass('public.student_profiles') is null
     or to_regclass('public.departments') is null
     or to_regprocedure('private.is_admin()') is null then
    raise exception 'Apply the earlier Nexora schema and onboarding migrations before this migration.';
  end if;
end;
$$;

create table if not exists public.subjects (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null check (char_length(name) between 1 and 160),
  description text not null default '',
  department_id uuid not null references public.departments(id) on delete restrict,
  academic_program_id uuid references public.academic_programs(id) on delete set null,
  course_id uuid unique references public.courses(id) on delete set null,
  active boolean not null default true,
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.topics (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references public.subjects(id) on delete cascade,
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title text not null check (char_length(title) between 1 and 180),
  summary text not null default '',
  sort_order integer not null default 1 check (sort_order > 0),
  expected_core_level text not null default 'beginner' check (expected_core_level in ('beginner', 'intermediate', 'advanced')),
  prerequisite_topic_id uuid references public.topics(id) on delete set null,
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (subject_id, slug),
  unique (subject_id, sort_order)
);

alter table public.lessons add column if not exists topic_id uuid references public.topics(id) on delete set null;

-- Associate the existing published sample courses and lessons without replacing them.
insert into public.subjects (slug, name, description, department_id, course_id, active, published)
select c.slug, c.title, c.description, d.id, c.id, true, c.published
from public.courses c
join public.departments d on d.slug = 'computer-science-engineering'
on conflict (slug) do nothing;

insert into public.topics (subject_id, slug, title, summary, sort_order, published)
select s.id, l.slug, l.title, l.summary, l.sort_order, l.published
from public.lessons l
join public.subjects s on s.course_id = l.course_id
on conflict (subject_id, slug) do nothing;

update public.lessons l set topic_id = t.id
from public.topics t
join public.subjects s on s.id = t.subject_id
where s.course_id = l.course_id and t.slug = l.slug and l.topic_id is null;

create table if not exists public.assessments (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title text not null check (char_length(title) between 1 and 180),
  description text not null default '',
  dimension text not null check (dimension in ('core', 'english')),
  course_id uuid references public.courses(id) on delete cascade,
  topic_id uuid references public.topics(id) on delete set null,
  difficulty text not null default 'beginner' check (difficulty in ('beginner', 'intermediate', 'advanced')),
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (topic_id is null or course_id is not null)
);

create table if not exists public.assessment_questions (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.assessments(id) on delete cascade,
  topic_id uuid references public.topics(id) on delete set null,
  question_type text not null check (question_type in ('multiple_choice', 'true_false', 'fill_blank', 'short_answer', 'technical_explanation', 'code_output', 'debugging')),
  marks numeric(6,2) not null default 1 check (marks > 0),
  difficulty text not null default 'beginner' check (difficulty in ('beginner', 'intermediate', 'advanced')),
  prompt text not null check (char_length(prompt) between 1 and 8000),
  choices jsonb check (choices is null or jsonb_typeof(choices) = 'array'),
  source_url text,
  sort_order integer not null default 1 check (sort_order > 0),
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (assessment_id, sort_order)
);

create table if not exists private.assessment_answer_keys (
  question_id uuid primary key references public.assessment_questions(id) on delete cascade,
  correct_answer jsonb not null,
  explanation text not null default '',
  grading_rubric jsonb,
  updated_at timestamptz not null default now()
);
alter table private.assessment_answer_keys enable row level security;
revoke all on table private.assessment_answer_keys from public, anon, authenticated;

alter table public.assessment_attempts add column if not exists assessment_id uuid references public.assessments(id) on delete set null;
create index if not exists assessment_attempts_assessment_idx on public.assessment_attempts (assessment_id, submitted_at desc) where assessment_id is not null;

create table if not exists public.practical_challenges (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid not null references public.topics(id) on delete cascade,
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title text not null check (char_length(title) between 1 and 180),
  instructions text not null default '',
  requirements jsonb not null default '[]'::jsonb check (jsonb_typeof(requirements) = 'array'),
  starter_code text,
  validation_spec jsonb not null default '{}'::jsonb check (jsonb_typeof(validation_spec) = 'object'),
  difficulty text not null default 'beginner' check (difficulty in ('beginner', 'intermediate', 'advanced')),
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.practical_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  challenge_id uuid not null references public.practical_challenges(id) on delete cascade,
  submitted_code text not null check (char_length(submitted_code) <= 100000),
  explanation text check (explanation is null or char_length(explanation) <= 12000),
  status text not null default 'submitted' check (status in ('submitted', 'queued', 'evaluated', 'needs_revision')),
  evaluation jsonb,
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.student_level_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  dimension text not null check (dimension in ('english', 'core')),
  subject_id uuid references public.subjects(id) on delete set null,
  topic_id uuid references public.topics(id) on delete set null,
  previous_level text check (previous_level is null or previous_level in ('beginner', 'intermediate', 'advanced')),
  assigned_level text not null check (assigned_level in ('beginner', 'intermediate', 'advanced')),
  reason text not null,
  evidence jsonb not null default '{}'::jsonb check (jsonb_typeof(evidence) = 'object'),
  created_at timestamptz not null default now()
);

create table if not exists public.achievement_definitions (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title text not null check (char_length(title) between 1 and 120),
  description text not null default '',
  criteria jsonb not null default '{}'::jsonb check (jsonb_typeof(criteria) = 'object'),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.student_achievements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  achievement_id uuid not null references public.achievement_definitions(id) on delete restrict,
  evidence jsonb not null default '{}'::jsonb check (jsonb_typeof(evidence) = 'object'),
  awarded_at timestamptz not null default now(),
  unique (user_id, achievement_id)
);

create table if not exists public.certificates (
  id uuid primary key default gen_random_uuid(),
  certificate_id text not null unique,
  verification_code text not null unique,
  user_id uuid not null references auth.users(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete restrict,
  student_name_snapshot text not null,
  course_name_snapshot text not null,
  issued_at timestamptz not null default now(),
  revoked_at timestamptz,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object')
);

create table if not exists public.interview_questions (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid references public.subjects(id) on delete set null,
  topic_id uuid references public.topics(id) on delete set null,
  role_name text,
  question_type text not null check (question_type in ('technical', 'coding', 'problem_solving', 'hr')),
  difficulty text not null default 'beginner' check (difficulty in ('beginner', 'intermediate', 'advanced')),
  prompt text not null check (char_length(prompt) between 1 and 8000),
  model_answer text,
  follow_up_questions jsonb not null default '[]'::jsonb check (jsonb_typeof(follow_up_questions) = 'array'),
  source_url text,
  source_label text,
  source_date date,
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.student_resumes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Untitled resume' check (char_length(title) between 1 and 160),
  template_key text not null default 'classic',
  current_version integer not null default 1 check (current_version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.resume_versions (
  id uuid primary key default gen_random_uuid(),
  resume_id uuid not null references public.student_resumes(id) on delete cascade,
  version_number integer not null check (version_number > 0),
  content jsonb not null check (jsonb_typeof(content) = 'object'),
  created_at timestamptz not null default now(),
  unique (resume_id, version_number)
);

create table if not exists public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Tutor conversation' check (char_length(title) between 1 and 160),
  subject_id uuid references public.subjects(id) on delete set null,
  topic_id uuid references public.topics(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.ai_conversations(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null check (char_length(content) between 1 and 16000),
  created_at timestamptz not null default now()
);

create index if not exists subjects_department_idx on public.subjects (department_id, active, published);
create index if not exists topics_subject_order_idx on public.topics (subject_id, published, sort_order);
create index if not exists assessments_topic_idx on public.assessments (topic_id, published) where topic_id is not null;
create index if not exists questions_assessment_idx on public.assessment_questions (assessment_id, published, sort_order);
create index if not exists challenges_topic_idx on public.practical_challenges (topic_id, published);
create index if not exists submissions_user_history_idx on public.practical_submissions (user_id, submitted_at desc);
create index if not exists level_history_user_idx on public.student_level_history (user_id, dimension, created_at desc);
create index if not exists student_achievements_user_idx on public.student_achievements (user_id, awarded_at desc);
create index if not exists certificates_user_idx on public.certificates (user_id, issued_at desc);
create index if not exists interview_questions_lookup_idx on public.interview_questions (subject_id, topic_id, difficulty, published);
create index if not exists resumes_user_idx on public.student_resumes (user_id, updated_at desc);
create index if not exists ai_conversations_user_idx on public.ai_conversations (user_id, updated_at desc);
create index if not exists ai_messages_conversation_idx on public.ai_messages (conversation_id, created_at);

insert into public.achievement_definitions (slug, title, description, criteria) values
  ('first-lesson', 'First Lesson Completed', 'Complete your first published lesson.', '{"event":"lesson_completed","minimum":1}'::jsonb),
  ('vocabulary-explorer', 'Vocabulary Explorer', 'Study ten technical vocabulary items.', '{"event":"vocabulary_studied","minimum":10}'::jsonb),
  ('quiz-achiever', 'Quiz Achiever', 'Pass a published assessment.', '{"event":"assessment_passed","minimum_score":70}'::jsonb),
  ('practical-builder', 'Practical Builder', 'Complete a practical challenge.', '{"event":"challenge_evaluated","minimum":1}'::jsonb),
  ('course-complete', 'Course Completed', 'Meet the verified course completion criteria.', '{"event":"course_completed"}'::jsonb)
on conflict (slug) do nothing;

alter table public.subjects enable row level security;
alter table public.topics enable row level security;
alter table public.assessments enable row level security;
alter table public.assessment_questions enable row level security;
alter table public.practical_challenges enable row level security;
alter table public.practical_submissions enable row level security;
alter table public.student_level_history enable row level security;
alter table public.achievement_definitions enable row level security;
alter table public.student_achievements enable row level security;
alter table public.certificates enable row level security;
alter table public.interview_questions enable row level security;
alter table public.student_resumes enable row level security;
alter table public.resume_versions enable row level security;
alter table public.ai_conversations enable row level security;
alter table public.ai_messages enable row level security;

revoke all on public.subjects, public.topics, public.assessments, public.assessment_questions, public.practical_challenges,
  public.practical_submissions, public.student_level_history, public.achievement_definitions, public.student_achievements,
  public.certificates, public.interview_questions, public.student_resumes, public.resume_versions,
  public.ai_conversations, public.ai_messages from public, anon, authenticated;

grant select on public.subjects, public.topics, public.assessments, public.assessment_questions,
  public.practical_challenges, public.achievement_definitions, public.interview_questions to authenticated;
grant insert, update, delete on public.subjects, public.topics, public.assessments, public.assessment_questions,
  public.practical_challenges, public.achievement_definitions, public.interview_questions to authenticated;
grant select on public.practical_submissions, public.student_level_history, public.student_achievements,
  public.certificates, public.student_resumes, public.resume_versions, public.ai_conversations, public.ai_messages to authenticated;
grant insert (user_id, challenge_id, submitted_code, explanation) on public.practical_submissions to authenticated;
grant update (submitted_code, explanation) on public.practical_submissions to authenticated;
grant insert, update, delete on public.student_resumes to authenticated;
grant insert, update, delete on public.resume_versions to authenticated;
grant insert, update, delete on public.ai_conversations to authenticated;
grant insert, update, delete on public.ai_messages to authenticated;

drop policy if exists "Users read published subjects" on public.subjects;
create policy "Users read published subjects" on public.subjects for select to authenticated using ((published and active) or (select private.is_admin()));
drop policy if exists "Admins manage subjects" on public.subjects;
create policy "Admins manage subjects" on public.subjects for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
drop policy if exists "Users read published topics" on public.topics;
create policy "Users read published topics" on public.topics for select to authenticated using ((published and exists (select 1 from public.subjects s where s.id = subject_id and s.published and s.active)) or (select private.is_admin()));
drop policy if exists "Admins manage topics" on public.topics;
create policy "Admins manage topics" on public.topics for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
drop policy if exists "Users read published assessments" on public.assessments;
create policy "Users read published assessments" on public.assessments for select to authenticated using ((published and (course_id is null or exists (select 1 from public.courses c where c.id = course_id and c.published))) or (select private.is_admin()));
drop policy if exists "Admins manage assessments" on public.assessments;
create policy "Admins manage assessments" on public.assessments for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
drop policy if exists "Users read published assessment questions" on public.assessment_questions;
create policy "Users read published assessment questions" on public.assessment_questions for select to authenticated using ((published and exists (select 1 from public.assessments a where a.id = assessment_id and a.published)) or (select private.is_admin()));
drop policy if exists "Admins manage assessment questions" on public.assessment_questions;
create policy "Admins manage assessment questions" on public.assessment_questions for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
drop policy if exists "Users read published practical challenges" on public.practical_challenges;
create policy "Users read published practical challenges" on public.practical_challenges for select to authenticated using ((published and exists (select 1 from public.topics t where t.id = topic_id and t.published)) or (select private.is_admin()));
drop policy if exists "Admins manage practical challenges" on public.practical_challenges;
create policy "Admins manage practical challenges" on public.practical_challenges for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));

drop policy if exists "Students read their practical submissions" on public.practical_submissions;
create policy "Students read their practical submissions" on public.practical_submissions for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "Students create their practical submissions" on public.practical_submissions;
create policy "Students create their practical submissions" on public.practical_submissions for insert to authenticated with check ((select auth.uid()) = user_id and status = 'submitted' and evaluation is null);
drop policy if exists "Students update their own draft submission" on public.practical_submissions;
create policy "Students update their own draft submission" on public.practical_submissions for update to authenticated using ((select auth.uid()) = user_id and status in ('submitted', 'needs_revision')) with check ((select auth.uid()) = user_id and status in ('submitted', 'needs_revision'));

drop policy if exists "Students read their level history" on public.student_level_history;
create policy "Students read their level history" on public.student_level_history for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "Authenticated users read active achievement definitions" on public.achievement_definitions;
create policy "Authenticated users read active achievement definitions" on public.achievement_definitions for select to authenticated using (active or (select private.is_admin()));
drop policy if exists "Admins manage achievement definitions" on public.achievement_definitions;
create policy "Admins manage achievement definitions" on public.achievement_definitions for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
drop policy if exists "Students read their own achievements" on public.student_achievements;
create policy "Students read their own achievements" on public.student_achievements for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "Students read their own certificates" on public.certificates;
create policy "Students read their own certificates" on public.certificates for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "Users read published interview questions" on public.interview_questions;
create policy "Users read published interview questions" on public.interview_questions for select to authenticated using (published or (select private.is_admin()));
drop policy if exists "Admins manage interview questions" on public.interview_questions;
create policy "Admins manage interview questions" on public.interview_questions for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));

drop policy if exists "Students manage their resumes" on public.student_resumes;
create policy "Students manage their resumes" on public.student_resumes for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "Students manage versions of their resumes" on public.resume_versions;
create policy "Students manage versions of their resumes" on public.resume_versions for all to authenticated
using (exists (select 1 from public.student_resumes r where r.id = resume_id and r.user_id = (select auth.uid())))
with check (exists (select 1 from public.student_resumes r where r.id = resume_id and r.user_id = (select auth.uid())));

drop policy if exists "Students manage their AI conversations" on public.ai_conversations;
create policy "Students manage their AI conversations" on public.ai_conversations for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "Students manage messages in their AI conversations" on public.ai_messages;
create policy "Students manage messages in their AI conversations" on public.ai_messages for all to authenticated
using (exists (select 1 from public.ai_conversations c where c.id = conversation_id and c.user_id = (select auth.uid())))
with check (exists (select 1 from public.ai_conversations c where c.id = conversation_id and c.user_id = (select auth.uid())));

drop trigger if exists subjects_touch_updated_at on public.subjects;
create trigger subjects_touch_updated_at before update on public.subjects for each row execute function private.touch_updated_at();
drop trigger if exists topics_touch_updated_at on public.topics;
create trigger topics_touch_updated_at before update on public.topics for each row execute function private.touch_updated_at();
drop trigger if exists assessments_touch_updated_at on public.assessments;
create trigger assessments_touch_updated_at before update on public.assessments for each row execute function private.touch_updated_at();
drop trigger if exists assessment_questions_touch_updated_at on public.assessment_questions;
create trigger assessment_questions_touch_updated_at before update on public.assessment_questions for each row execute function private.touch_updated_at();
drop trigger if exists practical_challenges_touch_updated_at on public.practical_challenges;
create trigger practical_challenges_touch_updated_at before update on public.practical_challenges for each row execute function private.touch_updated_at();
drop trigger if exists practical_submissions_touch_updated_at on public.practical_submissions;
create trigger practical_submissions_touch_updated_at before update on public.practical_submissions for each row execute function private.touch_updated_at();
drop trigger if exists student_resumes_touch_updated_at on public.student_resumes;
create trigger student_resumes_touch_updated_at before update on public.student_resumes for each row execute function private.touch_updated_at();
drop trigger if exists ai_conversations_touch_updated_at on public.ai_conversations;
create trigger ai_conversations_touch_updated_at before update on public.ai_conversations for each row execute function private.touch_updated_at();

commit;
