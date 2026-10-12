import { useEffect, useMemo, useState } from 'react'
import { Award, CheckCircle2, Circle, LoaderCircle, RotateCcw } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { courses, englishQuiz, technicalQuiz } from '../data/demo'
import { getAdaptiveAssessment, submitAdaptiveAssessment } from '../services/data'
import type { QuizQuestion } from '../types'
import type { AdaptiveAssessmentResult, AdaptiveQuestion } from '../types/database'
import { Card, PageHeading } from '../components/ui'

type DisplayQuestion = { id: string; question: string; options: string[]; answer?: number; explanation?: string }
type PanelProps = { title: string; description: string; dimension: 'core' | 'english'; courseSlug?: string; sample: QuizQuestion[] }

function AssessmentPanel({ title, description, dimension, courseSlug, sample }: PanelProps) {
  const { client, user } = useAuth()
  const slug = dimension === 'english' ? 'adaptive-technical-english' : `adaptive-core-${courseSlug}`
  const [questions, setQuestions] = useState<DisplayQuestion[]>(sample.map((q, i) => ({ id: `sample-${i}`, question: q.question, options: q.options, answer: q.answer, explanation: q.explanation })))
  const [remote, setRemote] = useState(false)
  const [loadingQuestions, setLoadingQuestions] = useState(false)
  const [setupMessage, setSetupMessage] = useState('Sample questions · this result is not saved or used to change a learning level.')
  const [answers, setAnswers] = useState<number[]>(Array(sample.length).fill(-1))
  const [result, setResult] = useState<AdaptiveAssessmentResult | null>(null)
  const [demoSubmitted, setDemoSubmitted] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const done = Boolean(result) || demoSubmitted
  const score = result?.correct_answers ?? answers.reduce((sum, answer, i) => sum + (answer === questions[i]?.answer ? 1 : 0), 0)

  useEffect(() => {
    let active = true
    setResult(null); setDemoSubmitted(false); setError('')
    if (!client || !user) { setRemote(false); return }
    setLoadingQuestions(true)
    void getAdaptiveAssessment(client, slug).then((loaded) => {
      if (!active) return
      if (loaded.data?.length) {
        const ordered: AdaptiveQuestion[] = loaded.data
        setQuestions(ordered.map((q) => ({ id: q.question_id, question: q.prompt, options: q.choices })))
        setAnswers(Array(ordered.length).fill(-1)); setRemote(true)
        setSetupMessage('Published assessment · graded in Supabase; results belong to your account.')
      } else {
        setQuestions(sample.map((q, i) => ({ id: `sample-${i}`, question: q.question, options: q.options, answer: q.answer, explanation: q.explanation })))
        setAnswers(Array(sample.length).fill(-1)); setRemote(false)
        setSetupMessage(`${loaded.error ?? 'No published assessment is available yet.'} Sample questions are shown; results are not saved.`)
      }
      setLoadingQuestions(false)
    }).catch(() => {
      if (active) { setRemote(false); setSetupMessage('Supabase could not be reached. Sample questions are shown; results are not saved.'); setLoadingQuestions(false) }
    })
    return () => { active = false }
  }, [client, user, slug, sample])

  async function submit() {
    if (answers.includes(-1)) return
    setError('')
    if (!remote || !client || !user) { setDemoSubmitted(true); return }
    setSaving(true)
    try {
      const saved = await submitAdaptiveAssessment(client, slug, questions.map((q, i) => ({ question_id: q.id, selected_option: answers[i] })))
      if (saved.data) setResult(saved.data)
      else setError(saved.error ?? 'Assessment could not be graded.')
    } catch { setError('Supabase could not be reached. Your assessment was not saved. Please retry.') }
    finally { setSaving(false) }
  }
  function retry() { setAnswers(Array(questions.length).fill(-1)); setResult(null); setDemoSubmitted(false); setError('') }

  return <Card>
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold">{title}</h2><p className="mt-1 text-sm text-slate-500">{description}</p></div><span className={`rounded-full px-2.5 py-1 text-[10px] font-medium ${remote ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'}`}>{remote ? 'Published assessment' : 'Sample questions'}</span></div>
    <p role="status" className="mt-3 rounded-lg bg-slate-50 p-3 text-xs leading-5 text-slate-600">{setupMessage}</p>
    {loadingQuestions ? <p className="mt-5 flex items-center gap-2 text-sm text-slate-500"><LoaderCircle size={16} className="animate-spin"/>Loading published questions…</p> : <div className="mt-5 space-y-5">{questions.map((q, qi) => {
      const review = result?.review.find((item) => item.question_id === q.id)
      return <fieldset key={q.id}><legend className="text-sm font-medium leading-6 text-slate-800">{qi + 1}. {q.question}</legend><div className="mt-2 grid gap-2 sm:grid-cols-2">{q.options.map((option, oi) => {
        const selected = answers[qi] === oi, correct = remote ? review?.correct_option === oi : q.answer === oi
        return <button type="button" key={option} disabled={done || saving} onClick={() => setAnswers((current) => current.map((value, i) => i === qi ? oi : value))} className={`flex items-center gap-2 rounded-xl border p-3 text-left text-sm transition disabled:cursor-default ${done && correct ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : done && selected ? 'border-rose-200 bg-rose-50 text-rose-900' : selected ? 'border-indigo-300 bg-indigo-50 text-indigo-900' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>{done && correct ? <CheckCircle2 size={16}/> : <Circle size={16} className={selected ? 'text-indigo-600' : 'text-slate-300'}/>}<span>{option}</span></button>
      })}</div>{done && <p className="mt-2 rounded-lg bg-slate-50 p-3 text-xs leading-5 text-slate-600">{review?.explanation ?? q.explanation}</p>}</fieldset>
    })}</div>}
    <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">{done ? <p className="inline-flex items-center gap-2 text-sm font-medium"><Award size={18} className="text-amber-500"/>Your score: {score}/{questions.length} ({result?.score ?? Math.round(score / questions.length * 100)}%)</p> : <p className="text-xs text-slate-500">Select one answer for each question.</p>}{done ? <button disabled={saving} onClick={retry} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-600 disabled:opacity-50"><RotateCcw size={15}/>Try again</button> : <button disabled={answers.includes(-1) || saving || loadingQuestions} onClick={() => void submit()} className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50">{saving ? <><LoaderCircle size={15} className="mr-2 inline animate-spin"/>Grading and saving…</> : remote ? 'Submit for grading' : 'Check sample answers'}</button>}</div>
    {result && <div role="status" className="mt-3 rounded-lg border border-indigo-100 bg-indigo-50 p-3 text-sm text-indigo-900">{result.level_changed ? `Your ${dimension === 'english' ? 'English' : 'core subject'} level moved from ${result.previous_level} to ${result.assigned_level}.` : `Current ${dimension === 'english' ? 'English' : 'core subject'} level: ${result.assigned_level}.`} {result.progression_rule}</div>}
    {error && <p role="alert" className="mt-3 rounded-lg bg-rose-50 p-3 text-xs text-rose-800">{error}</p>}
  </Card>
}

export default function AssessmentsPage() {
  const [courseSlug, setCourseSlug] = useState(courses[0].id)
  const selectedCourse = useMemo(() => courses.find((course) => course.id === courseSlug) ?? courses[0], [courseSlug])
  return <><PageHeading eyebrow="Practice and build evidence" title="Assessments" description="Sample questions are available to everyone. Signed-in students can use published, server-graded assessments to build independent subject and English evidence."/><div className="mb-5 max-w-sm"><label className="text-sm font-medium text-slate-700">Core subject<select value={courseSlug} onChange={(e) => setCourseSlug(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm">{courses.map((course) => <option key={course.id} value={course.id}>{course.title}</option>)}</select></label></div><div className="grid gap-6 xl:grid-cols-2"><AssessmentPanel key={`core-${courseSlug}`} title={`${selectedCourse.title} practice`} description="A short core knowledge check. Level movement uses repeated results, not one attempt." dimension="core" courseSlug={courseSlug} sample={technicalQuiz}/><AssessmentPanel title="Technical English practice" description="Vocabulary and clear professional communication." dimension="english" sample={englishQuiz}/></div></>
}
