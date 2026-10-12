import { useEffect, useMemo, useState } from 'react'
import { BriefcaseBusiness, LoaderCircle, Save, Search } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { Card, EmptyState, PageHeading } from '../components/ui'
import { getInterviewQuestions, saveInterviewPractice } from '../services/data'
import type { InterviewQuestionRow } from '../types/database'

const localQuestion = { id: 'demo-interview-array', role_name: 'Entry-level software engineering', question_type: 'technical', difficulty: 'beginner', prompt: 'How would you explain why array index access is usually constant time?', model_answer: 'An array stores elements in indexed positions. The runtime can calculate an element address from the base address and index, so it does not need to scan earlier elements.', follow_up_questions: ['What changes when inserting in the middle?', 'How would you compare this with a linked list?'], source_label: 'Nexora starter practice question · not a verified company interview question' } as const

export default function InterviewPage() {
  const { client, user } = useAuth()
  const [questions, setQuestions] = useState<InterviewQuestionRow[]>([])
  const [selected, setSelected] = useState<string>(localQuestion.id)
  const [response, setResponse] = useState('')
  const [search, setSearch] = useState('')
  const [showAnswer, setShowAnswer] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    if (!client || !user) { setLoading(false); return }
    void getInterviewQuestions(client).then((result) => {
      if (!active) return
      if (result.data?.length) { setQuestions(result.data); setSelected(result.data[0].id) }
      else if (result.error) setError(`${result.error} Using the labelled local sample.`)
      setLoading(false)
    }).catch(() => { if (active) { setError('Supabase could not be reached. Using the labelled local sample.'); setLoading(false) } })
    return () => { active = false }
  }, [client, user])
  const items = useMemo(() => questions.length ? questions : [localQuestion], [questions])
  const filtered = items.filter((item) => `${item.prompt} ${item.role_name ?? ''} ${item.question_type}`.toLowerCase().includes(search.toLowerCase()))
  const active = items.find((item) => item.id === selected) ?? filtered[0] ?? items[0]
  const followUps = Array.isArray(active.follow_up_questions) ? active.follow_up_questions.filter((part): part is string => typeof part === 'string') : []
  const modelAnswer = active.model_answer

  async function save() {
    setError(''); setMessage('')
    if (!response.trim()) { setError('Write a response before saving your practice.'); return }
    if (!client || !user || active.id.startsWith('demo-')) { setMessage('This response is a local practice draft and was not saved to an account.'); return }
    setSaving(true)
    try {
      const result = await saveInterviewPractice(client, user.id, active.id, response.trim())
      if (result.data) setMessage('Practice response saved to your account. No automated evaluation was performed.')
      else setError(result.error ?? 'Practice response could not be saved.')
    } catch { setError('Supabase could not be reached. The response was not saved.') }
    finally { setSaving(false) }
  }

  return <><PageHeading eyebrow="Explain your engineering thinking" title="Interview practice" description="Practice technical answers and compare them with a sample explanation. These prompts are for practice and are not represented as recent or company-verified questions."/><div className="mb-5 rounded-xl border border-indigo-100 bg-indigo-50 p-3 text-sm leading-6 text-indigo-950">Try a clear structure: define the concept, give a concrete example, then explain a trade-off. Sample answers are reference material, not a score.</div><div className="grid gap-6 xl:grid-cols-[.8fr_1.2fr]"><Card><label className="relative block"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/><input value={search} onChange={(event) => setSearch(event.target.value)} className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-indigo-400" placeholder="Find a practice prompt" aria-label="Search interview questions"/></label><div className="mt-4 space-y-2">{filtered.map((item) => <button key={item.id} onClick={() => { setSelected(item.id); setShowAnswer(false); setMessage('') }} className={`w-full rounded-xl border p-3 text-left ${item.id === active.id ? 'border-indigo-200 bg-indigo-50' : 'border-slate-200 hover:bg-slate-50'}`}><span className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-wide text-slate-400"><BriefcaseBusiness size={13}/>{item.role_name ?? 'Engineering'} · {item.difficulty}</span><span className="mt-2 block text-sm font-medium leading-5 text-slate-800">{item.prompt}</span></button>)}{!filtered.length && <EmptyState title="No matching questions" detail="Try a different search term."/>}</div>{loading && <p className="mt-4 flex items-center gap-2 text-xs text-slate-500"><LoaderCircle size={14} className="animate-spin"/>Loading published practice questions…</p>}</Card><div className="space-y-5"><Card><span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-medium text-slate-600">{active.source_label ?? 'Practice prompt'}</span><h2 className="mt-4 font-semibold">Prompt</h2><p className="mt-2 text-sm leading-6 text-slate-700">{active.prompt}</p>{followUps.length > 0 && <div className="mt-4"><p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Follow-up practice</p><ul className="mt-2 list-inside list-disc space-y-1 text-sm text-slate-600">{followUps.map((item) => <li key={item}>{item}</li>)}</ul></div>}{modelAnswer && <div className="mt-4"><button onClick={() => setShowAnswer((value) => !value)} className="text-sm font-medium text-indigo-700">{showAnswer ? 'Hide' : 'Show'} sample answer</button>{showAnswer && <p className="mt-2 rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate-700">{modelAnswer}</p>}</div>}</Card><Card><h2 className="font-semibold">Draft your answer</h2><textarea value={response} onChange={(event) => setResponse(event.target.value)} maxLength={12000} rows={8} className="mt-4 w-full rounded-xl border border-slate-200 p-4 text-sm leading-6 outline-none focus:border-indigo-400" placeholder="Explain the idea as if you were speaking in an interview…"/><button disabled={saving} onClick={() => void save()} className="mt-3 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"><Save size={15}/>{saving ? 'Saving…' : 'Save practice'}</button>{message && <p role="status" className="mt-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">{message}</p>}{error && <p role="alert" className="mt-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}</Card></div></div></>
}
