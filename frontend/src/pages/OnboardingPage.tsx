import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { ArrowRight, BookOpenCheck, CheckCircle2, LoaderCircle, Save } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { Card, PageHeading } from '../components/ui'
import { getAcademicPrograms, getDiagnosticAttempts, getDiagnosticQuestions, getDepartments, getOrCreateProfile, submitDiagnostic, updateStudentProfile } from '../services/data'
import type { AcademicProgramRow, DepartmentRow, DiagnosticAttemptRow, DiagnosticQuestion, StudentProfileRow } from '../types/database'

const subjects = [
  { id: 'dsa', name: 'Data Structures & Algorithms' },
  { id: 'dbms', name: 'Database Management Systems' },
  { id: 'os', name: 'Operating Systems' },
  { id: 'networks', name: 'Computer Networks' },
  { id: 'ml', name: 'Machine Learning' },
]
const goals = ['Strengthen core concepts', 'Improve technical English', 'Prepare for interviews', 'Build practical projects']
type Dimension = 'english' | 'core'

export default function OnboardingPage() {
  const { client, user } = useAuth()
  const navigate = useNavigate()
  const [profile, setProfile] = useState<StudentProfileRow | null>(null)
  const [departments, setDepartments] = useState<DepartmentRow[]>([])
  const [programs, setPrograms] = useState<AcademicProgramRow[]>([])
  const [attempts, setAttempts] = useState<DiagnosticAttemptRow[]>([])
  const [questions, setQuestions] = useState<Record<Dimension, DiagnosticQuestion[]>>({ english: [], core: [] })
  const [answers, setAnswers] = useState<Record<Dimension, Record<string, number>>>({ english: {}, core: {} })
  const [subject, setSubject] = useState('dsa')
  const [loading, setLoading] = useState(true)
  const [savingProfile, setSavingProfile] = useState(false)
  const [submitting, setSubmitting] = useState<Dimension | null>(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    async function load() {
      if (!client || !user) { setLoading(false); return }
      try {
        const [profileResult, departmentResult, attemptResult] = await Promise.all([
          getOrCreateProfile(client, user), getDepartments(client), getDiagnosticAttempts(client, user.id),
        ])
        if (!active) return
        if (profileResult.data) {
          setProfile(profileResult.data)
          if (profileResult.data.department_id) {
            const programResult = await getAcademicPrograms(client, profileResult.data.department_id)
            if (active && programResult.data) setPrograms(programResult.data)
          }
        } else setError(profileResult.error ?? 'Your student profile could not be loaded.')
        if (departmentResult.data) setDepartments(departmentResult.data)
        else setError(departmentResult.error ?? 'Academic options could not be loaded.')
        if (attemptResult.data) setAttempts(attemptResult.data)
        else setError(attemptResult.error ?? 'Diagnostic history could not be loaded.')
      } catch {
        if (active) setError('Nexora could not reach Supabase. Check your connection and database setup.')
      } finally { if (active) setLoading(false) }
    }
    void load()
    return () => { active = false }
  }, [client, user])

  useEffect(() => {
    let active = true
    async function loadQuestions() {
      if (!client) return
      const [englishResult, coreResult] = await Promise.all([
        getDiagnosticQuestions(client, 'english', 'technical-english'),
        getDiagnosticQuestions(client, 'core', subject),
      ])
      if (!active) return
      if (englishResult.data && coreResult.data) setQuestions({ english: englishResult.data, core: coreResult.data })
      else setError(englishResult.error ?? coreResult.error ?? 'Diagnostic questions are unavailable.')
    }
    void loadQuestions().catch(() => { if (active) setError('Diagnostic questions could not be loaded. Check your connection and database setup.') })
    return () => { active = false }
  }, [client, subject])

  const latestByDimension = useMemo(() => {
    const latest: Partial<Record<Dimension, DiagnosticAttemptRow>> = {}
    for (const attempt of attempts) {
      if (attempt.dimension === 'english' && !latest.english) latest.english = attempt
      if (attempt.dimension === 'core' && attempt.subject === subject && !latest.core) latest.core = attempt
    }
    return latest
  }, [attempts, subject])

  async function chooseDepartment(id: string) {
    setProfile((current) => current ? { ...current, department_id: id || null, academic_program_id: null } : current)
    if (!client || !id) { setPrograms([]); return }
    const result = await getAcademicPrograms(client, id)
    if (result.data) setPrograms(result.data)
    else setError(result.error ?? 'Programs could not be loaded.')
  }

  async function saveAcademicProfile(event: FormEvent) {
    event.preventDefault()
    if (!client || !user || !profile) return
    setSavingProfile(true); setError(''); setMessage('')
    try {
      const completed = Boolean(latestByDimension.english && latestByDimension.core)
      const result = await updateStudentProfile(client, user.id, {
        college_name: profile.college_name?.trim() || null,
        department_id: profile.department_id,
        academic_program_id: profile.academic_program_id,
        academic_year: profile.academic_year,
        semester: profile.semester,
        technical_interests: profile.technical_interests,
        learning_goals: profile.learning_goals,
        learning_pace: profile.learning_pace,
        onboarding_completed_at: completed ? new Date().toISOString() : null,
      })
      if (result.data) { setProfile(result.data); setMessage('Academic profile saved to Supabase.') }
      else setError(result.error ?? 'Academic profile could not be saved.')
    } catch { setError('Supabase could not be reached. Your academic profile was not saved.') }
    finally { setSavingProfile(false) }
  }

  async function submitAssessment(dimension: Dimension) {
    if (!client) return
    const list = questions[dimension]
    if (!list.length || list.some((question) => answers[dimension][question.question_id] === undefined)) return
    setSubmitting(dimension); setError(''); setMessage('')
    try {
      const result = await submitDiagnostic(client, dimension, dimension === 'english' ? 'technical-english' : subject,
        list.map((question) => ({ question_id: question.question_id, selected_option: answers[dimension][question.question_id] })))
      if (!result.data) { setError(result.error ?? 'Your diagnostic could not be saved.'); return }
      setAttempts((current) => [{
        id: result.data!.attempt_id, user_id: user!.id, dimension, subject: dimension === 'english' ? 'technical-english' : subject,
        score: result.data!.score, assigned_level: result.data!.assigned_level, correct_answers: result.data!.correct_answers,
        total_questions: result.data!.total_questions, answers: [], submitted_at: result.data!.submitted_at,
      }, ...current])
      setMessage(`${dimension === 'english' ? 'Technical English' : 'Core subject'} diagnostic saved. Your initial level is ${result.data.assigned_level}.`)
    } catch { setError('Supabase could not be reached. Your diagnostic result was not saved.') }
    finally { setSubmitting(null) }
  }

  const allDiagnosticsComplete = Boolean(latestByDimension.english && latestByDimension.core)
  if (loading) return <Card className="flex items-center gap-2 text-sm text-slate-500"><LoaderCircle size={17} className="animate-spin"/>Loading your onboarding…</Card>

  return <>
    <PageHeading eyebrow="Start with a learning baseline" title="Your learning profile" description="Tell Nexora a little about your studies, then take two short independent diagnostics. Your subject knowledge and technical English receive separate starting levels."/>
    {!client || !user ? <Card><p className="text-sm text-slate-600">Sign in to save onboarding information and diagnostic results.</p><Link to="/login" className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-indigo-700">Sign in <ArrowRight size={16}/></Link></Card> : <>
      {error && <p role="alert" className="mb-5 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}{error.toLowerCase().includes('migration') && <span> Apply the migrations in order as described in the README, then reload this page.</span>}</p>}
      {message && <p role="status" className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}
      <form onSubmit={saveAcademicProfile} className="space-y-6">
        <Card><div className="flex items-start gap-3"><span className="grid size-10 place-items-center rounded-xl bg-indigo-50 text-indigo-700"><BookOpenCheck size={19}/></span><div><h2 className="font-semibold">Academic background</h2><p className="mt-1 text-sm text-slate-500">Optional details help Nexora organize your learning path.</p></div></div>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium text-slate-700">College or institution<input maxLength={160} value={profile?.college_name ?? ''} onChange={(e) => setProfile((p) => p ? { ...p, college_name: e.target.value } : p)} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" placeholder="Your college (optional)"/></label>
            <label className="text-sm font-medium text-slate-700">Department<select value={profile?.department_id ?? ''} onChange={(e) => void chooseDepartment(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 font-normal"><option value="">Select a department</option>{departments.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <label className="text-sm font-medium text-slate-700">Academic program<select value={profile?.academic_program_id ?? ''} onChange={(e) => setProfile((p) => p ? { ...p, academic_program_id: e.target.value || null } : p)} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 font-normal"><option value="">Select a program</option>{programs.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.degree_level}</option>)}</select></label>
            <div className="grid grid-cols-2 gap-3"><label className="text-sm font-medium text-slate-700">Year<input type="number" min="1" max="10" value={profile?.academic_year ?? ''} onChange={(e) => setProfile((p) => p ? { ...p, academic_year: e.target.value ? Number(e.target.value) : null } : p)} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" placeholder="1"/></label><label className="text-sm font-medium text-slate-700">Semester<input type="number" min="1" max="20" value={profile?.semester ?? ''} onChange={(e) => setProfile((p) => p ? { ...p, semester: e.target.value ? Number(e.target.value) : null } : p)} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" placeholder="1"/></label></div>
            <label className="text-sm font-medium text-slate-700">Learning pace<select value={profile?.learning_pace ?? 'steady'} onChange={(e) => setProfile((p) => p ? { ...p, learning_pace: e.target.value as StudentProfileRow['learning_pace'] } : p)} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 font-normal"><option value="relaxed">Relaxed</option><option value="steady">Steady</option><option value="intensive">Intensive</option></select></label>
            <label className="text-sm font-medium text-slate-700">Technical interests<input value={(profile?.technical_interests ?? []).join(', ')} onChange={(e) => setProfile((p) => p ? { ...p, technical_interests: e.target.value.split(',').map((x) => x.trim()).filter(Boolean).slice(0, 12) } : p)} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" placeholder="e.g. web systems, networks"/></label>
          </div>
          <fieldset className="mt-5"><legend className="text-sm font-medium text-slate-700">Learning goals</legend><div className="mt-3 flex flex-wrap gap-2">{goals.map((goal) => { const selected = (profile?.learning_goals ?? []).includes(goal); return <button key={goal} type="button" aria-pressed={selected} onClick={() => setProfile((p) => p ? { ...p, learning_goals: selected ? p.learning_goals.filter((x) => x !== goal) : [...p.learning_goals, goal] } : p)} className={`rounded-full border px-3 py-2 text-xs ${selected ? 'border-indigo-300 bg-indigo-50 text-indigo-800' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>{goal}</button> })}</div></fieldset>
          <button disabled={!profile || savingProfile} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"><Save size={16}/>{savingProfile ? 'Saving…' : 'Save academic profile'}</button>
        </Card>
      </form>
      <div className="mt-6 grid gap-6 xl:grid-cols-2">{(['english', 'core'] as const).map((dimension) => {
        const list = questions[dimension]; const current = latestByDimension[dimension]
        return <Card key={dimension}>
          <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wider text-indigo-600">Independent diagnostic</p><h2 className="mt-1 font-semibold">{dimension === 'english' ? 'Technical English' : 'Core subject knowledge'}</h2><p className="mt-1 text-sm text-slate-500">{dimension === 'english' ? 'Vocabulary and clear technical communication.' : 'Choose one subject for your initial baseline.'}</p><span className="mt-2 inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-medium text-slate-600">Starter diagnostic questions</span></div>{current && <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium capitalize text-emerald-800">Current level: {current.assigned_level}</span>}</div>
          {dimension === 'core' && <label className="mt-4 block text-sm font-medium text-slate-700">Diagnostic subject<select value={subject} onChange={(e) => { setSubject(e.target.value); setAnswers((a) => ({ ...a, core: {} })) }} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5">{subjects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
          {list.length === 0 ? <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Diagnostic questions are unavailable. Apply the Phase 1 database migrations in order and reload.</p> : <div className="mt-5 space-y-5">{list.map((question, index) => <fieldset key={question.question_id}><legend className="text-sm font-medium leading-6 text-slate-800">{index + 1}. {question.prompt}</legend><div className="mt-2 space-y-2">{question.options.map((option, optionIndex) => <label key={option} className="flex cursor-pointer items-start gap-2 rounded-xl border border-slate-200 p-3 text-sm text-slate-700 hover:bg-slate-50"><input type="radio" name={`${dimension}-${question.question_id}`} checked={answers[dimension][question.question_id] === optionIndex} onChange={() => setAnswers((a) => ({ ...a, [dimension]: { ...a[dimension], [question.question_id]: optionIndex } }))} className="mt-0.5 accent-indigo-600"/><span>{option}</span></label>)}</div></fieldset>)}</div>}
          {list.length > 0 && <><button type="button" disabled={submitting !== null || list.some((q) => answers[dimension][q.question_id] === undefined)} onClick={() => void submitAssessment(dimension)} className="mt-5 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{submitting === dimension ? 'Scoring and saving…' : `Submit ${dimension === 'english' ? 'English' : 'subject'} diagnostic`}</button>{current && <p className="mt-3 text-xs text-slate-500">Latest result: {current.correct_answers}/{current.total_questions} correct · {current.score}% · {new Date(current.submitted_at).toLocaleDateString()}</p>}</>}
        </Card>
      })}</div>
      {allDiagnosticsComplete && <Card className="mt-6 flex flex-wrap items-center justify-between gap-4 border-emerald-200 bg-emerald-50"><div><p className="flex items-center gap-2 font-semibold text-emerald-900"><CheckCircle2 size={18}/>Initial learning baseline complete</p><p className="mt-1 text-sm text-emerald-800">Technical English: <strong className="capitalize">{latestByDimension.english?.assigned_level}</strong> · {subjects.find((x) => x.id === subject)?.name}: <strong className="capitalize">{latestByDimension.core?.assigned_level}</strong></p><p className="mt-1 text-xs text-emerald-800">Levels are stored separately and based on the diagnostic question scores.</p></div><button type="button" onClick={() => navigate('/')} className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white">Continue to Nexora <ArrowRight size={16}/></button></Card>}
    </>}
  </>
}
