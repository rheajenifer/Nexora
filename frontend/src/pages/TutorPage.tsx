import { useEffect, useRef, useState } from 'react'
import { Bot, CircleAlert, Send, Sparkles, UserRound } from 'lucide-react'
import { getDisplayName, useAuth } from '../auth/AuthContext'
import { Card, PageHeading } from '../components/ui'
import { courses } from '../data/demo'
import { getDiagnosticAttempts } from '../services/data'
import type { DiagnosticAttemptRow } from '../types/database'

type Message = { role: 'user' | 'assistant'; text: string }
type TutorStatus = 'checking' | 'configured' | 'unconfigured' | 'unavailable'

const suggestions = ['Can you explain array indexing?', 'What does O(n) mean?', 'How can I describe an algorithm clearly?']
const MAX_CONTEXT_MESSAGES = 24

export default function TutorPage() {
  const { client, user } = useAuth()
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState<TutorStatus>('checking')
  const [courseSlug, setCourseSlug] = useState('dsa')
  const [diagnostics, setDiagnostics] = useState<DiagnosticAttemptRow[]>([])
  const requestInFlight = useRef(false)
  const welcomeMessage: Message = {
    role: 'assistant',
    text: `Hi ${user ? getDisplayName(user) : 'there'}! I’m the Nexora technical tutor. What concept would you like to explore?`,
  }
  const visibleMessages = messages.length ? messages : [welcomeMessage]

  useEffect(() => {
    let active = true
    void fetch('/api/tutor/status')
      .then(async (response) => {
        if (!response.ok) throw new Error('Tutor status request failed')
        return response.json() as Promise<{ configured?: boolean }>
      })
      .then((result) => {
        if (active) setStatus(result.configured ? 'configured' : 'unconfigured')
      })
      .catch(() => {
        if (active) setStatus('unavailable')
      })
    return () => { active = false }
  }, [])

  useEffect(() => {
    let active = true
    if (!client || !user) { setDiagnostics([]); return }
    void getDiagnosticAttempts(client, user.id).then((response) => {
      if (active && response.data) setDiagnostics(response.data)
    }).catch(() => { if (active) setDiagnostics([]) })
    return () => { active = false }
  }, [client, user])

  const englishLevel = diagnostics.find((attempt) => attempt.dimension === 'english')?.assigned_level
  const coreLevel = diagnostics.find((attempt) => attempt.dimension === 'core' && attempt.subject === courseSlug)?.assigned_level
  const selectedCourse = courses.find((course) => course.id === courseSlug) ?? courses[0]

  async function send(text = input) {
    const trimmed = text.trim()
    if (!trimmed || requestInFlight.current) return
    requestInFlight.current = true
    setLoading(true)
    setError('')
    const userMessage: Message = { role: 'user', text: trimmed }
    const conversation = [...(messages.length ? messages : [welcomeMessage]), userMessage].slice(-MAX_CONTEXT_MESSAGES)
    setMessages(conversation)
    setInput('')

    try {
      const response = await fetch('/api/tutor/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: conversation.map(({ role, text: content }) => ({ role, content })),
          learning_context: { subject: selectedCourse.title, core_level: coreLevel ?? null, english_level: englishLevel ?? null },
        }),
      })
      const result = await response.json().catch(() => ({})) as { reply?: string; detail?: string }
      if (!response.ok) throw new Error(result.detail || 'The tutor could not answer. Please try again.')
      if (!result.reply?.trim()) throw new Error('The tutor returned an empty response. Please try again.')
      setMessages((current) => [...current, { role: 'assistant', text: result.reply!.trim() }])
    } catch (requestError) {
      setError(requestError instanceof TypeError
        ? 'Could not reach the Nexora backend. Start FastAPI and try again.'
        : requestError instanceof Error ? requestError.message : 'The tutor could not answer. Please try again.')
    } finally {
      requestInFlight.current = false
      setLoading(false)
    }
  }

  const statusMessage = {
    checking: 'Checking AI Tutor setup…',
    configured: 'An OpenAI API key is present on the backend. Chat requests use OpenAI; provider errors will be shown if the key or account cannot make the request.',
    unconfigured: 'AI Tutor is not configured. Add OPENAI_API_KEY to backend/.env and restart FastAPI.',
    unavailable: 'Tutor setup could not be checked. Make sure the FastAPI backend is running.',
  }[status]

  return <><PageHeading eyebrow="Guided learning" title="AI Tutor" description="Ask a question about a technical idea or how to explain it clearly."/><div role="status" className={`mb-5 flex items-center gap-2 rounded-xl border p-3 text-sm ${status === 'configured' ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-amber-200 bg-amber-50 text-amber-900'}`}><Sparkles size={17}/><span>{statusMessage}</span></div><Card className="mb-4 max-w-4xl"><label className="text-sm font-medium text-slate-700">Current subject<select value={courseSlug} onChange={e=>setCourseSlug(e.target.value)} className="ml-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">{courses.map(course=><option key={course.id} value={course.id}>{course.title}</option>)}</select></label><p className="mt-2 text-xs text-slate-500">Tutor context uses separate assessed levels: Core {coreLevel ?? 'not assessed'} · English {englishLevel ?? 'not assessed'}. Missing diagnostics use introductory guidance.</p></Card><Card className="mx-auto flex h-[min(68vh,680px)] w-full max-w-4xl min-w-0 flex-col p-0"><div className="flex items-center gap-3 border-b border-slate-200 px-5 py-4"><span className="grid size-10 place-items-center rounded-xl bg-indigo-50 text-indigo-600"><Bot size={20}/></span><div><p className="text-sm font-semibold">Nexora learning assistant</p><p className="text-xs text-slate-500">{selectedCourse.title} · independent subject and English adaptation</p></div><span className={`ml-auto rounded-full px-2.5 py-1 text-[10px] font-medium ${status === 'configured' ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'}`}>{status === 'configured' ? 'OpenAI' : status === 'checking' ? 'Checking' : 'Setup'}</span></div><div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">{visibleMessages.map((message,i)=><div key={i} className={`flex min-w-0 gap-3 ${message.role==='user'?'justify-end':''}`}>{message.role==='assistant'&&<span className="grid size-8 shrink-0 place-items-center rounded-full bg-indigo-100 text-indigo-700"><Bot size={16}/></span>}<div className={`max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-4 py-3 text-sm leading-6 ${message.role==='user'?'rounded-tr-sm bg-indigo-600 text-white':'rounded-tl-sm bg-slate-100 text-slate-700'}`}>{message.text}</div>{message.role==='user'&&<span className="grid size-8 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-600"><UserRound size={16}/></span>}</div>)}{loading&&<div role="status" className="flex items-center gap-3 text-xs text-slate-500"><span className="size-2 animate-pulse rounded-full bg-indigo-500"/>Nexora is thinking…</div>}{error&&<p role="alert" className="ml-11 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}</div><div className="border-t border-slate-100 px-4 py-3"><p className="mb-2 text-[11px] font-medium text-slate-400">TRY ASKING</p><div className="flex gap-2 overflow-x-auto pb-2">{suggestions.map(s=><button key={s} disabled={loading} onClick={()=>void send(s)} className="whitespace-nowrap rounded-full border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:border-indigo-300 hover:text-indigo-700 disabled:opacity-50">{s}</button>)}</div><form onSubmit={e=>{e.preventDefault();void send()}} className="flex gap-2"><input disabled={loading} value={input} onChange={e=>setInput(e.target.value)} aria-label="Message tutor" placeholder="Write a question…" className="min-w-0 flex-1 rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 disabled:bg-slate-50"/><button disabled={!input.trim()||loading} className="grid size-11 shrink-0 place-items-center rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50" aria-label="Send message"><Send size={17}/></button></form><p className="mt-2 flex items-center gap-1 text-[10px] text-slate-400"><CircleAlert size={12}/>When configured, chat messages go through Nexora’s backend to OpenAI. The API key stays server-side.</p></div></Card></>
}
