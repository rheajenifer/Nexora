import { useEffect, useMemo, useState } from 'react'
import { Award, BookOpen, CheckCircle2, ClipboardCheck, RotateCcw } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { Card, PageHeading, SectionHeading } from '../components/ui'
import { getProgressSnapshot, type ProgressSnapshot } from '../services/data'
import { getCompletedLessons } from '../utils/storage'
import { buildScoreDimensions, buildWeeklyActivity } from '../utils/progressMetrics'

export default function ProgressPage() {
  const { client, user } = useAuth()
  const [snapshot, setSnapshot] = useState<ProgressSnapshot | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [localCompletedCount, setLocalCompletedCount] = useState(0)

  useEffect(() => {
    let active = true
    setSnapshot(null)
    setError('')
    setLocalCompletedCount(getCompletedLessons().length)
    if (!client || !user) return () => { active = false }
    setLoading(true)
    void getProgressSnapshot(client, user.id).then((result) => {
      if (!active) return
      if (result.data) setSnapshot(result.data)
      else setError(result.error ?? 'Progress data could not be loaded.')
    }).catch(() => {
      if (active) setError('Supabase could not be reached. Check the connection and try again.')
    }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [client, user])

  const activity = useMemo(() => snapshot ? buildWeeklyActivity(snapshot.completedLessons, snapshot.assessmentAttempts) : [], [snapshot])
  const dimensions = useMemo(() => snapshot ? buildScoreDimensions(snapshot.diagnosticAttempts, snapshot.assessmentAttempts) : [], [snapshot])
  const totalLessons = snapshot?.courses.reduce((sum, course) => sum + course.total, 0) ?? 0
  const completedCount = snapshot?.completedLessons.length ?? localCompletedCount
  const overallCompletion = totalLessons ? Math.round(Math.min(completedCount, totalLessons) / totalLessons * 100) : 0
  const revision = dimensions.filter((dimension) => dimension.score !== null).sort((a, b) => (a.score ?? 0) - (b.score ?? 0))[0]

  return <>
    <PageHeading eyebrow="Your learning journey" title="Progress" description="Review course completion, recent study activity and results from your saved assessments." />
    <div role="status" className={`mb-5 rounded-xl border p-3 text-sm ${error ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-indigo-100 bg-indigo-50 text-indigo-900'}`}>
      {loading ? 'Loading your account progress…' : error ? `${error} Account charts are unavailable until the data can be loaded.` : snapshot ? 'Account progress · lesson completion and assessment records loaded from Supabase.' : user ? 'No account progress loaded yet. Apply the documented Supabase migrations and refresh to view saved records.' : 'Guest view · showing browser-only lesson completion. Sign in and apply the migrations to see account charts.'}
    </div>

    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      <Card className="p-4"><div className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-xl bg-indigo-50 text-indigo-600"><BookOpen size={18} /></span><span className="text-sm text-slate-500">Published course completion</span></div><p className="mt-3 text-2xl font-semibold">{snapshot ? `${overallCompletion}%` : '—'}</p><p className="mt-1 text-xs text-slate-500">{snapshot ? `${Math.min(completedCount, totalLessons)} of ${totalLessons} published lessons` : 'Available with account data'}</p></Card>
      <Card className="p-4"><div className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-xl bg-emerald-50 text-emerald-600"><CheckCircle2 size={18} /></span><span className="text-sm text-slate-500">Lessons completed</span></div><p className="mt-3 text-2xl font-semibold">{completedCount}</p><p className="mt-1 text-xs text-slate-500">{snapshot ? 'Saved completion records' : 'Local demo count; not synced'}</p></Card>
      <Card className="p-4"><div className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-xl bg-violet-50 text-violet-600"><ClipboardCheck size={18} /></span><span className="text-sm text-slate-500">Assessment attempts</span></div><p className="mt-3 text-2xl font-semibold">{snapshot ? snapshot.assessmentAttempts.length : '—'}</p><p className="mt-1 text-xs text-slate-500">{snapshot ? 'Most recent 20 saved attempts' : 'Available with account data'}</p></Card>
    </div>

    <div className="mt-6 grid gap-6 xl:grid-cols-2">
      <Card><SectionHeading title="Weekly learning activity" subtitle="Completed lessons and submitted assessments · last 7 days" />
        {snapshot && activity.length ? <div className="h-[270px]" role="img" aria-label="Bar chart of lessons and assessments completed each day over the past seven days"><ResponsiveContainer width="100%" height="100%"><BarChart data={activity} margin={{ top: 12, right: 12, left: -18, bottom: 0 }}><CartesianGrid stroke="#eef0f5" vertical={false} /><XAxis dataKey="day" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#64748b' }} /><YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#64748b' }} /><Tooltip contentStyle={{ borderRadius: 12, borderColor: '#e2e8f0', fontSize: 12 }} /><Bar dataKey="lessons" name="Lessons completed" fill="#6366f1" radius={[5, 5, 0, 0]} /><Bar dataKey="assessments" name="Assessments submitted" fill="#14b8a6" radius={[5, 5, 0, 0]} /></BarChart></ResponsiveContainer></div> : <p className="rounded-xl bg-slate-50 p-5 text-sm text-slate-500">{snapshot ? 'No lesson or assessment activity is recorded for this week.' : 'Weekly activity appears after account progress loads.'}</p>}
      </Card>
      <Card><SectionHeading title="Independent skill dimensions" subtitle="Averages from saved diagnostics and graded assessment attempts" />
        {snapshot && dimensions.some((item) => item.score !== null) ? <div className="space-y-6 py-2">{dimensions.map((item, index) => <div key={item.name}><div className="mb-2 flex items-center justify-between gap-3 text-sm"><span className="font-medium text-slate-700">{item.name}</span><span className="text-slate-500">{item.score}% · {item.attempts} records</span></div><div className="h-2.5 rounded-full bg-slate-100"><div className={`h-full rounded-full ${index === 0 ? 'bg-indigo-500' : 'bg-teal-500'}`} style={{ width: `${item.score}%` }} /></div></div>)}</div> : <p className="rounded-xl bg-slate-50 p-5 text-sm text-slate-500">No graded records yet. Complete a diagnostic or database-graded assessment to establish each dimension separately.</p>}
      </Card>
    </div>

    <div className="mt-6 grid gap-6 xl:grid-cols-[1.15fr_.85fr]">
      <Card><SectionHeading title="Course completion" subtitle="Based on published lessons and your saved completion records" />
        {snapshot?.courses.length ? <div className="space-y-5">{snapshot.courses.map((course) => { const percent = course.total ? Math.round(course.completed / course.total * 100) : 0; return <div key={course.slug}><div className="mb-2 flex justify-between gap-4 text-sm"><Link to="/courses" className="font-medium hover:text-indigo-600">{course.title}</Link><span className="shrink-0 text-slate-500">{course.completed}/{course.total} · {percent}%</span></div><div className="h-2 rounded-full bg-slate-100"><div className="h-full rounded-full bg-indigo-500" style={{ width: `${percent}%` }} /></div></div> })}</div> : <p className="rounded-xl bg-slate-50 p-5 text-sm text-slate-500">{snapshot ? 'There are no published courses yet.' : 'Course completion is shown when Supabase progress is available.'}</p>}
      </Card>
      <Card><SectionHeading title="Suggested revision" subtitle="Based on your lowest recorded skill dimension" />
        {revision ? <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 p-4"><p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">Review focus</p><p className="mt-2 font-semibold text-slate-800">{revision.name}</p><p className="mt-1 text-sm text-slate-600">Current saved average: {revision.score}%. Try a targeted assessment and review its explanations.</p><Link to="/assessments" className="mt-4 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700"><RotateCcw size={15} />Practice now</Link></div> : <p className="rounded-xl bg-slate-50 p-5 text-sm text-slate-500">Complete a graded diagnostic or assessment to get a data-based revision suggestion.</p>}
      </Card>
    </div>

    <Card className="mt-6"><SectionHeading title="Assessment history" subtitle={snapshot ? 'Saved results · most recent 20 account attempts' : 'Account history is not available'} />
      {snapshot?.assessmentAttempts.length ? <div className="grid gap-3 sm:grid-cols-2">{snapshot.assessmentAttempts.map((attempt) => <div key={attempt.id} className="flex items-center gap-3 rounded-xl border border-slate-100 p-3"><span className="grid size-9 place-items-center rounded-lg bg-emerald-50 text-emerald-600"><Award size={17} /></span><span className="min-w-0 flex-1 text-sm font-medium">{attempt.assessment_type === 'english' ? 'Technical English' : 'Technical knowledge'}<span className="mt-0.5 block truncate text-xs text-slate-500">{attempt.assessment_key}</span><span className="mt-0.5 block text-[11px] text-slate-400">{new Date(attempt.submitted_at).toLocaleString()}</span></span><span className="text-sm font-semibold text-slate-700">{Math.round(Number(attempt.score))}%</span></div>)}</div> : <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">{snapshot ? 'No saved graded assessments yet. Start with an assessment to build your history.' : 'Sign in and load account progress to see saved results.'}</p>}
    </Card>
  </>
}
