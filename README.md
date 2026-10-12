# Nexora — learning workspace

Nexora helps engineering students learn technical subjects while building technical English and communication skills. The frontend uses React, TypeScript, Vite, Tailwind CSS and Supabase Auth/PostgreSQL. FastAPI provides the backend API and the AI Tutor uses OpenAI's Responses API when its server-side key is configured.

## Requirements

- Node.js 20.19+ or 22.12+
- Python 3.12
- Windows PowerShell

## Run the frontend

In PowerShell, from the project root:

```powershell
cd frontend
npm install
npm run dev
```

Open the local URL printed by Vite (usually `http://localhost:5173`). The Vite development server proxies `/api` requests to the backend at `http://127.0.0.1:8000`.

## Run the backend

Open a second PowerShell window at the project root. Create the environment and install the backend packages the first time:

```powershell
cd backend
$python312Path = Join-Path $env:LOCALAPPDATA 'Programs\Python\Python312\python.exe'
if (-not (Test-Path $python312Path)) { throw 'Install Python 3.12 or update $python312Path to its python.exe location.' }
& $python312Path -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python -m uvicorn main:app --reload
```

The previously reported Pydantic import failure was not reproducible in the inspected Python 3.12 environment: `pydantic_core.ArgsKwargs` and the FastAPI app imported successfully, and `pip check` found no broken requirements. Backend requirements now declare compatible FastAPI, Pydantic 2, and Uvicorn ranges so a fresh environment cannot select Pydantic 1. Recreate an old or partially installed environment using the commands above; do not install `pydantic-core` separately because Pydantic pins its compatible core version.

The API is available at `http://127.0.0.1:8000`. Check `http://127.0.0.1:8000/api/health` for `{ "status": "ok" }` and `http://127.0.0.1:8000/docs` for interactive API docs.

### Configure the AI Tutor

The AI Tutor sends conversation messages to the Nexora FastAPI backend, which calls OpenAI's Responses API. The OpenAI API key must stay on the backend; do not put it in a `VITE_` variable, frontend file, or source code.

In PowerShell from the project root, create a private backend environment file if one does not already exist, then open it for editing:

```powershell
if (-not (Test-Path backend\.env)) { Copy-Item backend\.env.example backend\.env }
notepad backend\.env
```

Set `OPENAI_API_KEY` to an API key from your OpenAI API account. `OPENAI_MODEL` defaults to `gpt-5.4-mini` and can be changed to a model available to your account. Save the file, close the editor, and restart the backend. The root `.gitignore` ignores `.env` files; commit only the example template, never `backend/.env`.

The Tutor status banner reports when the server has no key configured. The backend also returns a setup error instead of sending a model request when the key is missing. No LLM API requests are made by health or status checks.

The chat endpoint validates message roles, message lengths, and conversation size; limits each model response; uses a 30-second timeout; and does not automatically retry provider requests. Keep this endpoint behind appropriate authentication and rate limiting before deploying it publicly. The current FastAPI service is a local development backend and does not authenticate chat requests.

If you need to recreate the backend environment later, run these commands from the project root:

```powershell
cd backend
$python312Path = Join-Path $env:LOCALAPPDATA 'Programs\Python\Python312\python.exe'
if (-not (Test-Path $python312Path)) { throw 'Install Python 3.12 or update $python312Path to its python.exe location.' }
& $python312Path -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
```

## Checks

From the project root, build the frontend with:

```powershell
cd frontend
npm run build
npm test
```

`npm test` runs the progress-metric unit tests with Node.js built-in test runner and type stripping; Node.js 22.13+ is required for that command.

The backend can be syntax-checked with the active virtual environment:

```powershell
cd backend
python -m compileall main.py
```

Backend API tests (mocked; no OpenAI requests) can be run from the project root:

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
python -m unittest discover -s tests -v
```

## Phase 3: Supabase setup

### Environment variables

The Vite frontend reads these variables from `frontend/.env.local`:

```dotenv
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-supabase-publishable-key
```

The configured project URL and publishable key are safe for browser use when the database has the RLS policies in the migration. Never put a Supabase secret/service-role key in a `VITE_` variable or frontend file. `frontend/.env.local` is excluded by the root and frontend ignore rules. Restart Vite after changing it.

### Apply the migration

1. Open the Supabase Dashboard for your project and select **SQL Editor**.
2. Run [`supabase/migrations/20261009000000_phase3_supabase_schema.sql`](supabase/migrations/20261009000000_phase3_supabase_schema.sql) first. It creates the profile, published course, lesson, progress and assessment tables, their RLS policies, a private admin table, the profile-on-signup trigger, and starter catalog data.
3. Run [`supabase/migrations/20261011000000_phase1_onboarding_diagnostics.sql`](supabase/migrations/20261011000000_phase1_onboarding_diagnostics.sql) second. It adds academic department/program options, profile fields, a private diagnostic answer bank, and database functions that return questions without answers and grade/store student attempts.
4. Run [`supabase/migrations/20261011010000_phase1_learning_data_model.sql`](supabase/migrations/20261011010000_phase1_learning_data_model.sql) third. It adds linked subjects/topics, assessment question/answer-key separation, practical challenges/submissions, level history, achievements, certificates, interview questions, resume versions, and private student AI conversation records. It associates existing courses/lessons with the new subject/topic model without deleting or replacing them.
5. For Phase 2, also apply [`supabase/migrations/20261011020000_phase2_adaptive_assessments.sql`](supabase/migrations/20261011020000_phase2_adaptive_assessments.sql). It adds grading/progression functions, protected score evidence, sample assessments and a challenge, interview response storage, and certificate eligibility/verification functions. Confirm `private.adaptive_assessment_records` and `public.interview_practice_attempts` exist; keep answer/evidence tables private.

In **Authentication → URL Configuration**, set the local Site URL to `http://localhost:5173` and add these Redirect URLs:

- `http://localhost:5173/**`
- `http://127.0.0.1:5173/**`

These URLs are used for email confirmation and password recovery. If your Vite server chooses another port, add that origin too.

### Create an administrator

Administrators are assigned only by a trusted project owner in the Supabase SQL Editor. After the user has registered, replace the example email below with that account’s email and run:

```sql
insert into private.admin_users (user_id)
select id from auth.users where lower(email) = lower('admin@example.com')
on conflict (user_id) do nothing;
```

The private role table has no client grants or student policies. Do not add an admin flag to user-editable profile metadata. The Admin page in the frontend remains a local prototype; content changes there are not persisted.

### Test the setup

Start the frontend with the command in **Run the frontend**, then:

1. Register a new account from **Sign in → Create an account**. If email confirmation is enabled, follow the link before signing in.
2. Sign in. Nexora opens **Learning baseline**. Save optional academic profile information, then complete separate Technical English and selected core-subject diagnostics. Scores and assigned levels are stored independently. The starter score thresholds are under 50% Beginner, 50–79.99% Intermediate, and 80% or higher Advanced. Correct answers stay in the private database schema; grading is handled by a security-definer database function using `auth.uid()`.
3. Open **Profile & settings**, update the display name or learning preferences, save, then reload the page. A successful profile save is labelled as synced to Supabase.
4. Open a published lesson and mark it complete. The page reports whether the completion synced to Supabase. Sign out and sign in again to verify it remains complete.
5. Complete either sample quiz. The score appears immediately; signed-in users also see a save confirmation or a clear database/setup error. These sample practice quizzes are separate from the initial diagnostics.
6. Use **Sign out**, sign in again, and confirm the protected Profile and Learning baseline routes send signed-out users to the login page. Use **Forgot password?** to test the recovery email and reset page.
7. For an RLS check, register a second test account. In the SQL Editor, obtain the two test user IDs, then run the following for the *other* user’s UUID while signed in as a project owner:

   ```sql
   begin;
   set local role authenticated;
   select set_config('request.jwt.claim.sub', 'OTHER-USER-UUID', true);
   select user_id from public.student_profiles;
   select user_id, lesson_id from public.lesson_progress;
   select user_id, assessment_key from public.assessment_attempts;
   select user_id, dimension, subject from public.diagnostic_attempts;
   select user_id, challenge_id from public.practical_submissions;
   select user_id, achievement_id from public.student_achievements;
   select user_id, course_id from public.certificates;
   select user_id from public.student_resumes;
   select user_id from public.ai_conversations;
   rollback;
   ```

   Each query should return only rows belonging to `OTHER-USER-UUID` (and no other student’s rows). The published catalog is readable by authenticated users. A normal student must not be able to insert into `private.admin_users` or manage course/lesson rows; only a project owner can provision an administrator through the SQL Editor.

The migration and client code are prepared, but database persistence is not considered verified until you apply the migration and see the success confirmations against your project. If tables are absent or the network is unavailable, Nexora keeps its sample catalog and local lesson-progress fallback and shows a setup/error message.

## Frontend implementation

Supabase configuration lives in `frontend/src/lib/supabase.ts`; session state and auth forms live under `frontend/src/auth/`; profile, catalog, lesson-progress and assessment-attempt queries live in `frontend/src/services/data.ts`. Authentication uses the publishable key with RLS; the frontend never needs an admin/service-role secret.

## Phase 2 learning features

Apply [`supabase/migrations/20261011020000_phase2_adaptive_assessments.sql`](supabase/migrations/20261011020000_phase2_adaptive_assessments.sql) after the three migrations above. It adds clearly identified starter multiple-choice assessments and one practical challenge, keeps assessment answer keys in the private schema, and provides authenticated database functions to retrieve published questions and grade attempts. Direct client inserts to assessment attempts are revoked so fabricated scores cannot influence level progression. An independent English or subject level changes only after three consecutive qualifying attempts (promotion: average at least 80% and every result at least 60%; revision: every result below 50%). Initial level evidence comes from the separate onboarding diagnostics. These thresholds are defined in the migration and are not yet configurable in the app.

The Assessments page can use either locally labelled sample questions or the authenticated server-graded sample assessments. Assessment review is returned by PostgreSQL; the browser does not receive the answer key before submission. Only database-graded attempts enter private adaptive evidence. Database rules award the first lesson and passing quiz badges. Certificate issuance checks completion of all published lessons and at least three graded course attempts averaging 70%; the Achievements page can request an eligible certificate, show its verification code, and print/save it through the browser. The AI Tutor sends the selected subject and available assessed English/core levels to FastAPI; the backend applies the two dimensions independently and allows up to 20 requests per client IP in 10 minutes per process. This in-memory development safeguard is not shared between multiple backend workers and is not a production distributed quota. Practical challenge submissions and interview practice responses can be saved for authenticated users. Submitted code is stored as text and is never executed or automatically evaluated. Interview starter questions are not presented as verified company questions. The Resume Builder saves versioned resume content to Supabase for signed-in users and has a browser print/PDF flow. Local drafts and fallback quiz scores are not saved. Browser speech synthesis in Technical English plays terms and example sentences only; it is not pronunciation evaluation. The Progress page derives course completion, seven-day lesson/assessment activity and separate English/core score averages from Supabase records when available; it does not measure study minutes or streaks, and assessment history is limited to the latest 20 attempts. Browser-only lesson counts remain explicitly labelled and do not feed account charts. Broad question-bank coverage and truly adaptive lesson content paths remain unfinished.

After applying the migration, sign in, select **Assessments**, and complete a published subject or English assessment. Database grading and attempt history should be visible; level movement occurs only after three qualifying results for the same assessment. In **Practical challenges**, submit code plus an explanation; the page should say the record is saved and has not been evaluated. In **Interview practice**, save a response and reload to confirm the account record. In **Resume builder**, save an edit, reload to confirm a new version, and use **Export PDF** to open the browser print dialog. Complete all published lessons and at least three course assessment attempts averaging 70% before selecting **Achievements** and checking certificate eligibility. The AI Tutor requires the server-side `OPENAI_API_KEY` documented below; no live provider call was used for development checks.

## Phase 1 onboarding and local startup

Phase 1 adds an academic onboarding form and separate Technical English/core-subject diagnostics. Diagnostic questions are starter content in the migration. The frontend receives no answer key and does not calculate the score; PostgreSQL grades each attempt and stores it for the signed-in student. Phase 2 adds limited repeated-evidence adaptive progression for the seeded practice assessments; it does not yet adapt the full lesson catalogue or depth of stored lesson content.

For a clean local Windows PowerShell setup, open two PowerShell windows at the project root. Copy the safe frontend template and set your own Supabase URL and publishable key locally (never paste credential values into source files or chat):

```powershell
if (-not (Test-Path frontend/.env.local)) { Copy-Item .env.example frontend/.env.local }
notepad frontend/.env.local
```

Apply the three Phase 1 SQL migrations, followed by the Phase 2 migration, in order in the Supabase SQL Editor as shown above. Then start the frontend in one window:

```powershell
cd frontend
npm install
npm run dev
```

Start FastAPI in the second window:

```powershell
cd backend
$python312Path = Join-Path $env:LOCALAPPDATA 'Programs\Python\Python312\python.exe'
if (-not (Test-Path $python312Path)) { throw 'Install Python 3.12 or update $python312Path to its python.exe location.' }
& $python312Path -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python -m uvicorn main:app --reload
```

Open the local URL printed by Vite. It proxies `/api` requests to FastAPI at `http://127.0.0.1:8000`; verify it at `http://127.0.0.1:8000/api/health`. The current virtual environment was checked with Python 3.12.10, FastAPI 0.143.0, Pydantic 2.14.0, Pydantic Core 2.50.0, the `ArgsKwargs` import, and the backend app import. Supabase persistence still requires applying the migrations to your project and verifying the flows there.
