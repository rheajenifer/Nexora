-- Phase 2: server-graded practice and cautious, independent level progression.
-- Apply after the three existing Nexora migrations. No existing content is replaced.
begin;

do $$
begin
  if to_regclass('public.assessments') is null
     or to_regclass('public.assessment_questions') is null
     or to_regclass('public.assessment_attempts') is null
     or to_regclass('public.student_level_history') is null then
    raise exception 'Apply the existing Nexora migrations before this Phase 2 migration.';
  end if;
end;
$$;

-- Prevent clients from forging scores that would influence adaptive progression.
-- The SECURITY DEFINER grading function below remains the controlled insert path.
revoke insert on public.assessment_attempts from authenticated;

create table if not exists private.adaptive_assessment_records (
  attempt_id uuid primary key references public.assessment_attempts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  assessment_id uuid not null references public.assessments(id) on delete cascade,
  score numeric(5,2) not null check (score between 0 and 100),
  submitted_at timestamptz not null default now()
);
alter table private.adaptive_assessment_records enable row level security;
revoke all on private.adaptive_assessment_records from public, anon, authenticated;
create index if not exists adaptive_attempts_user_assessment_idx on private.adaptive_assessment_records(user_id,assessment_id,submitted_at desc);

-- Starter questions are explicitly demo learning content and can be edited by an authorized admin.
insert into public.assessments (slug, title, description, dimension, course_id, difficulty, published)
select 'adaptive-core-' || c.slug, c.title || ' knowledge check', 'Sample topic questions for adaptive practice.', 'core', c.id, 'beginner', true
from public.courses c where c.slug in ('dsa', 'dbms', 'os', 'networks', 'ml')
on conflict (slug) do nothing;
insert into public.assessments (slug, title, description, dimension, difficulty, published)
values ('adaptive-technical-english', 'Technical English practice', 'Sample technical vocabulary and professional communication questions.', 'english', 'beginner', true)
on conflict (slug) do nothing;

with seed(slug, question_no, prompt, choices, answer, explanation) as (
  values
  ('dsa',1,'What is the typical time complexity of accessing an array element by index?','["O(1)","O(n)","O(log n)","O(n²)"]'::jsonb,0,'Direct index calculation gives constant-time access.'),
  ('dsa',2,'Which structure follows last-in, first-out order?','["Queue","Stack","Graph","Tree"]'::jsonb,1,'A stack removes the most recently added item first.'),
  ('dsa',3,'Binary search requires the input sequence to be:','["Sorted","Circular","Random","Duplicated"]'::jsonb,0,'Binary search depends on sorted order to discard half the search range.'),
  ('dbms',1,'Which SQL clause filters rows?','["ORDER BY","WHERE","GROUP BY","FROM"]'::jsonb,1,'WHERE applies conditions to rows.'),
  ('dbms',2,'What does a primary key do?','["Uniquely identifies a row","Encrypts a table","Sorts all queries","Duplicates values"]'::jsonb,0,'A primary key uniquely identifies each row.'),
  ('dbms',3,'A foreign key mainly helps to:','["Reference a related row","Compress a table","Rename a column","Sort records"]'::jsonb,0,'A foreign key enforces a relationship between tables.'),
  ('os',1,'A process is:','["A running program","A source file only","A network address","A database row"]'::jsonb,0,'A process is an executing instance of a program.'),
  ('os',2,'Which component selects a ready process for CPU time?','["Scheduler","Compiler","File system","Router"]'::jsonb,0,'The scheduler selects work from the ready queue.'),
  ('os',3,'A thread is commonly described as:','["An execution path within a process","A storage device","A SQL statement","A network packet"]'::jsonb,0,'Threads are execution units that belong to a process.'),
  ('networks',1,'What is a key purpose of an IP address?','["Identify an interface for packet delivery","Encrypt every file","Assign CPU time","Compile code"]'::jsonb,0,'IP addressing helps deliver packets to network interfaces.'),
  ('networks',2,'Which protocol provides reliable ordered byte delivery?','["TCP","DNS","ARP","ICMP"]'::jsonb,0,'TCP provides reliable, ordered transport.'),
  ('networks',3,'DNS is used to:','["Resolve names to records such as IP addresses","Schedule processes","Store passwords","Compress packets"]'::jsonb,0,'DNS resolves domain names to DNS records.'),
  ('ml',1,'A regression model usually predicts:','["A numeric value","A network route","A table key","A file system"]'::jsonb,0,'Regression predicts continuous numeric targets.'),
  ('ml',2,'A feature is:','["An input variable used for prediction","The model output only","A database constraint","A network protocol"]'::jsonb,0,'Features are model inputs.'),
  ('ml',3,'Overfitting means a model:','["Fits training data but generalizes poorly","Has no training data","Always predicts zero","Uses only numeric features"]'::jsonb,0,'Overfitting captures training detail that does not generalize.'),
  ('english',1,'Choose the clearest technical sentence.','["The server process requests efficiently.","The server processes requests efficiently.","Requests the server processing.","The server do processing."]'::jsonb,1,'The sentence uses a clear subject and correctly inflected verb.'),
  ('english',2,'What does “latency” describe?','["Response delay","Storage size","Data duplication","Code style"]'::jsonb,0,'Latency is the delay between an action and its response.'),
  ('english',3,'Which phrase introduces a specific example?','["For instance,","In contrast,","As a result,","Nevertheless,"]'::jsonb,0,'“For instance” introduces an example.')
), mapped as (
  select s.slug, s.question_no, s.prompt, s.choices, s.answer, s.explanation,
         case when s.slug='english' then 'adaptive-technical-english' else 'adaptive-core-'||s.slug end assessment_slug
  from seed s
)
insert into public.assessment_questions (assessment_id, question_type, marks, difficulty, prompt, choices, sort_order, published)
select a.id, 'multiple_choice', 1, 'beginner', m.prompt, m.choices, m.question_no, true
from mapped m join public.assessments a on a.slug=m.assessment_slug
where not exists (select 1 from public.assessment_questions q where q.assessment_id=a.id and q.sort_order=m.question_no)
on conflict (assessment_id, sort_order) do nothing;

with seed(slug, question_no, answer, explanation) as (values
 ('dsa',1,'0'::jsonb,'Direct index calculation gives constant-time access.'),('dsa',2,'1'::jsonb,'A stack removes the most recently added item first.'),('dsa',3,'0'::jsonb,'Binary search depends on sorted order.'),
 ('dbms',1,'1'::jsonb,'WHERE applies conditions to rows.'),('dbms',2,'0'::jsonb,'A primary key uniquely identifies each row.'),('dbms',3,'0'::jsonb,'A foreign key enforces a relationship between tables.'),
 ('os',1,'0'::jsonb,'A process is an executing instance of a program.'),('os',2,'0'::jsonb,'The scheduler selects work from the ready queue.'),('os',3,'0'::jsonb,'Threads are execution units that belong to a process.'),
 ('networks',1,'0'::jsonb,'IP addressing helps deliver packets to interfaces.'),('networks',2,'0'::jsonb,'TCP provides reliable, ordered transport.'),('networks',3,'0'::jsonb,'DNS resolves domain names to DNS records.'),
 ('ml',1,'0'::jsonb,'Regression predicts numeric targets.'),('ml',2,'0'::jsonb,'Features are model inputs.'),('ml',3,'0'::jsonb,'Overfitting captures training detail that does not generalize.'),
 ('english',1,'1'::jsonb,'The sentence uses a clear subject and correctly inflected verb.'),('english',2,'0'::jsonb,'Latency is the delay between an action and its response.'),('english',3,'0'::jsonb,'“For instance” introduces an example.')
)
insert into private.assessment_answer_keys (question_id, correct_answer, explanation)
select q.id, s.answer, s.explanation
from seed s
join public.assessments a on a.slug=case when s.slug='english' then 'adaptive-technical-english' else 'adaptive-core-'||s.slug end
join public.assessment_questions q on q.assessment_id=a.id and q.sort_order=s.question_no
on conflict (question_id) do nothing;

insert into public.practical_challenges (topic_id,slug,title,instructions,requirements,starter_code,validation_spec,difficulty,published)
select t.id,'array-temperature-summary','Summarize temperature readings',
  'Write a function that receives a list of daily temperatures and returns the minimum, maximum, and arithmetic mean. Then explain your approach in clear technical English.',
  '["Return the smallest value","Return the largest value","Calculate the arithmetic mean","Explain how the solution behaves for an empty list"]'::jsonb,
  'def summarize(values):\n    # Return a dictionary with min, max, and mean\n    pass',
  '{"execution":"disabled","review":"manual_or_future_isolated_runner"}'::jsonb,'beginner',true
from public.topics t join public.subjects s on s.id=t.subject_id
where s.slug='dsa' and t.slug='arrays'
on conflict (slug) do nothing;

insert into public.interview_questions (subject_id,topic_id,role_name,question_type,difficulty,prompt,model_answer,follow_up_questions,source_label,published)
select s.id,t.id,'Entry-level software engineering','technical','beginner',
  'How would you explain why array index access is usually constant time?',
  'An array stores elements in indexed positions. The runtime can calculate an element address from the base address and index, so it does not need to scan earlier elements.',
  '["What changes when inserting in the middle?","How would you compare this with a linked list?"]'::jsonb,
  'Nexora starter practice question · not a verified company interview question',true
from public.subjects s join public.topics t on t.subject_id=s.id and t.slug='arrays'
where s.slug='dsa'
and not exists (select 1 from public.interview_questions q where q.subject_id=s.id and q.prompt='How would you explain why array index access is usually constant time?');

create table if not exists public.interview_practice_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  question_id uuid not null references public.interview_questions(id) on delete cascade,
  response text not null check (char_length(response) between 1 and 12000),
  created_at timestamptz not null default now()
);
alter table public.interview_practice_attempts enable row level security;
revoke all on public.interview_practice_attempts from public, anon, authenticated;
grant select, insert on public.interview_practice_attempts to authenticated;
drop policy if exists "Students read their interview practice" on public.interview_practice_attempts;
create policy "Students read their interview practice" on public.interview_practice_attempts for select to authenticated using ((select auth.uid())=user_id);
drop policy if exists "Students save their interview practice" on public.interview_practice_attempts;
create policy "Students save their interview practice" on public.interview_practice_attempts for insert to authenticated with check ((select auth.uid())=user_id and exists(select 1 from public.interview_questions q where q.id=question_id and q.published));
create index if not exists interview_attempts_user_history_idx on public.interview_practice_attempts(user_id,created_at desc);

create or replace function public.get_adaptive_assessment(p_slug text)
returns table (assessment_id uuid, assessment_slug text, title text, dimension text, course_slug text, question_id uuid, prompt text, choices jsonb, sort_order integer)
language sql stable security definer set search_path = ''
as $$
  select a.id, a.slug, a.title, a.dimension, c.slug, q.id, q.prompt, q.choices, q.sort_order
  from public.assessments a
  join public.assessment_questions q on q.assessment_id=a.id and q.published and q.question_type='multiple_choice'
  join private.assessment_answer_keys k on k.question_id=q.id
  left join public.courses c on c.id=a.course_id
  where a.slug=p_slug and a.published and (select auth.uid()) is not null
  order by q.sort_order;
$$;
revoke all on function public.get_adaptive_assessment(text) from public, anon;
grant execute on function public.get_adaptive_assessment(text) to authenticated;

create or replace function public.submit_adaptive_assessment(p_slug text, p_answers jsonb)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid()); v_assessment public.assessments%rowtype;
  v_total integer; v_answered integer; v_correct integer; v_score numeric(5,2);
  v_review jsonb; v_attempt uuid; v_dimension text; v_course_slug text;
  v_subject_id uuid; v_old text; v_new text; v_streak integer; v_average numeric;
begin
  if v_user is null then raise exception 'Sign in to submit an assessment.' using errcode='42501'; end if;
  if p_answers is null or jsonb_typeof(p_answers) is distinct from 'array' or jsonb_array_length(p_answers) > 50 then raise exception 'Invalid assessment answers.' using errcode='22023'; end if;
  select * into v_assessment from public.assessments where slug=p_slug and published;
  if not found then raise exception 'This assessment is unavailable.' using errcode='22023'; end if;
  select count(*) into v_total from public.assessment_questions q join private.assessment_answer_keys k on k.question_id=q.id where q.assessment_id=v_assessment.id and q.published and q.question_type='multiple_choice';
  if v_total=0 then raise exception 'No published questions are configured for this assessment.' using errcode='22023'; end if;
  select count(*), count(distinct value->>'question_id') into v_answered, v_streak from jsonb_array_elements(p_answers);
  if v_answered <> v_total or v_streak <> v_total then raise exception 'Answer every question exactly once.' using errcode='22023'; end if;
  if exists (select 1 from jsonb_array_elements(p_answers) a(value) where coalesce(a.value->>'selected_option','') !~ '^[0-9]{1,2}$') then raise exception 'A selected option is invalid.' using errcode='22023'; end if;
  if exists (select 1 from jsonb_array_elements(p_answers) a(value) left join public.assessment_questions q on q.id=(a.value->>'question_id')::uuid and q.assessment_id=v_assessment.id and q.published where q.id is null) then raise exception 'An assessment question is invalid.' using errcode='22023'; end if;
  if exists (select 1 from jsonb_array_elements(p_answers) a(value) join public.assessment_questions q on q.id=(a.value->>'question_id')::uuid where (a.value->>'selected_option')::integer >= jsonb_array_length(q.choices)) then raise exception 'A selected option is out of range.' using errcode='22023'; end if;
  select count(*) into v_answered from jsonb_array_elements(p_answers) a(value)
  join public.assessment_questions q on q.id=(a.value->>'question_id')::uuid and q.assessment_id=v_assessment.id and q.published and q.question_type='multiple_choice'
  join private.assessment_answer_keys k on k.question_id=q.id;
  if v_answered<>v_total then raise exception 'Answers do not match this graded assessment.' using errcode='22023'; end if;
  select count(*) filter (where (a.value->>'selected_option')::integer=(k.correct_answer #>> '{}')::integer)
  into v_correct from jsonb_array_elements(p_answers) a(value)
  join public.assessment_questions q on q.id=(a.value->>'question_id')::uuid and q.assessment_id=v_assessment.id
  join private.assessment_answer_keys k on k.question_id=q.id;
  if v_correct is null or v_correct>v_total then raise exception 'Assessment answer keys are unavailable.' using errcode='22023'; end if;
  v_score := round(v_correct::numeric / v_total * 100, 2);
  select jsonb_agg(jsonb_build_object('question_id',q.id,'selected_option',(a.value->>'selected_option')::integer,'correct_option',(k.correct_answer #>> '{}')::integer,'explanation',k.explanation) order by q.sort_order)
  into v_review from jsonb_array_elements(p_answers) a(value)
  join public.assessment_questions q on q.id=(a.value->>'question_id')::uuid
  join private.assessment_answer_keys k on k.question_id=q.id;
  insert into public.assessment_attempts(user_id,assessment_key,assessment_type,score,total_questions,correct_answers,answers,assessment_id)
  values(v_user,v_assessment.slug,case when v_assessment.dimension='english' then 'english' else 'technical' end,v_score,v_total,v_correct,v_review,v_assessment.id)
  returning id into v_attempt;
  insert into private.adaptive_assessment_records(attempt_id,user_id,assessment_id,score)
  values(v_attempt,v_user,v_assessment.id,v_score);
  if v_score >= 70 then
    insert into public.student_achievements(user_id,achievement_id,evidence)
    select v_user,d.id,jsonb_build_object('attempt_id',v_attempt,'assessment_slug',v_assessment.slug,'score',v_score)
    from public.achievement_definitions d where d.slug='quiz-achiever' and d.active
    on conflict (user_id,achievement_id) do nothing;
  end if;

  if v_assessment.dimension='core' then
    select slug into v_course_slug from public.courses where id=v_assessment.course_id;
    select id into v_subject_id from public.subjects where course_id=v_assessment.course_id;
    select assigned_level into v_old from public.student_level_history where user_id=v_user and dimension='core' and subject_id=v_subject_id order by created_at desc limit 1;
    if v_old is null then select assigned_level into v_old from public.diagnostic_attempts where user_id=v_user and dimension='core' and subject=v_course_slug order by submitted_at desc limit 1; end if;
  else
    select assigned_level into v_old from public.student_level_history where user_id=v_user and dimension='english' and subject_id is null order by created_at desc limit 1;
    if v_old is null then select assigned_level into v_old from public.diagnostic_attempts where user_id=v_user and dimension='english' order by submitted_at desc limit 1; end if;
  end if;
  v_old := coalesce(v_old,'beginner'); v_new := v_old;
  -- Require three consecutive high or low results; a single lucky answer cannot change a level.
  with recent as (select score from private.adaptive_assessment_records where user_id=v_user and assessment_id=v_assessment.id order by submitted_at desc limit 3)
  select count(*), avg(score) into v_streak,v_average from recent;
  if v_streak=3 and v_average>=80 and (select min(score) from (select score from private.adaptive_assessment_records where user_id=v_user and assessment_id=v_assessment.id order by submitted_at desc limit 3) s)>=60 then
    v_new := case v_old when 'beginner' then 'intermediate' when 'intermediate' then 'advanced' else 'advanced' end;
  elsif v_streak=3 and v_average<50 and (select max(score) from (select score from private.adaptive_assessment_records where user_id=v_user and assessment_id=v_assessment.id order by submitted_at desc limit 3) s)<50 then
    v_new := case v_old when 'advanced' then 'intermediate' when 'intermediate' then 'beginner' else 'beginner' end;
  end if;
  if v_new<>v_old then
    insert into public.student_level_history(user_id,dimension,subject_id,previous_level,assigned_level,reason,evidence)
    values(v_user,v_assessment.dimension,v_subject_id,v_old,v_new,'Three consecutive assessment attempts met the configured progression threshold.',jsonb_build_object('assessment_slug',v_assessment.slug,'recent_attempts',v_streak,'average_score',v_average,'latest_attempt_id',v_attempt));
  end if;
  return jsonb_build_object('attempt_id',v_attempt,'score',v_score,'correct_answers',v_correct,'total_questions',v_total,'review',v_review,'dimension',v_assessment.dimension,'previous_level',v_old,'assigned_level',v_new,'level_changed',v_new<>v_old,'progression_rule','A level moves only after three consecutive high or low attempts.');
end;
$$;
revoke all on function public.submit_adaptive_assessment(text,jsonb) from public, anon;
grant execute on function public.submit_adaptive_assessment(text,jsonb) to authenticated;

create or replace function private.award_first_lesson_badge()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if exists (select 1 from public.lessons l join public.courses c on c.id=l.course_id where l.id=new.lesson_id and l.published and c.published) then
    insert into public.student_achievements(user_id,achievement_id,evidence)
    select new.user_id,d.id,jsonb_build_object('lesson_id',new.lesson_id,'completed_at',new.completed_at)
    from public.achievement_definitions d where d.slug='first-lesson' and d.active
    on conflict (user_id,achievement_id) do nothing;
  end if;
  return new;
end;
$$;
revoke all on function private.award_first_lesson_badge() from public, anon, authenticated;
drop trigger if exists award_first_lesson_badge on public.lesson_progress;
create trigger award_first_lesson_badge after insert on public.lesson_progress for each row execute function private.award_first_lesson_badge();

create unique index if not exists certificates_user_course_unique on public.certificates(user_id,course_id);

create or replace function public.issue_course_certificate(p_course_slug text)
returns table(certificate_id text, verification_code text, course_name text, issued_at timestamptz)
language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid()); v_course public.courses%rowtype; v_total integer; v_completed integer; v_attempts integer; v_average numeric;
  v_name text; v_certificate public.certificates%rowtype;
begin
  if v_user is null then raise exception 'Sign in to check certificate eligibility.' using errcode='42501'; end if;
  select * into v_course from public.courses where slug=p_course_slug and published;
  if not found then raise exception 'This course is unavailable.' using errcode='22023'; end if;
  select count(*) into v_total from public.lessons where course_id=v_course.id and published;
  select count(*) into v_completed from public.lesson_progress p join public.lessons l on l.id=p.lesson_id where p.user_id=v_user and l.course_id=v_course.id and l.published;
  select count(*),avg(r.score) into v_attempts,v_average
  from private.adaptive_assessment_records r join public.assessments a on a.id=r.assessment_id
  where r.user_id=v_user and a.dimension='core' and a.course_id=v_course.id;
  if v_total=0 or v_completed<v_total or v_attempts<3 or v_average<70 then
    raise exception 'Complete every published lesson and achieve a 70%% average across at least three graded course assessments before requesting a certificate.' using errcode='22023';
  end if;
  select display_name into v_name from public.student_profiles where user_id=v_user;
  v_name := coalesce(nullif(v_name,''),'Nexora learner');
  select * into v_certificate from public.certificates c where c.user_id=v_user and c.course_id=v_course.id limit 1;
  if not found then
    insert into public.certificates(certificate_id,verification_code,user_id,course_id,student_name_snapshot,course_name_snapshot)
    values('NXR-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,12)),replace(gen_random_uuid()::text,'-',''),v_user,v_course.id,v_name,v_course.title)
    returning * into v_certificate;
  end if;
  return query select v_certificate.certificate_id,v_certificate.verification_code,v_certificate.course_name_snapshot,v_certificate.issued_at;
end;
$$;
revoke all on function public.issue_course_certificate(text) from public, anon;
grant execute on function public.issue_course_certificate(text) to authenticated;

create or replace function public.verify_course_certificate(p_code text)
returns table(certificate_id text, student_name text, course_name text, issued_at timestamptz, is_valid boolean)
language sql stable security definer set search_path = ''
as $$
  select c.certificate_id,c.student_name_snapshot,c.course_name_snapshot,c.issued_at,(c.revoked_at is null)
  from public.certificates c where c.verification_code=p_code and char_length(p_code)=32;
$$;
revoke all on function public.verify_course_certificate(text) from public;
grant execute on function public.verify_course_certificate(text) to anon, authenticated;

commit;
