import { useEffect, useState, type FormEvent } from 'react'
import { CheckCircle2, CodeXml, LoaderCircle, Send } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { Card, PageHeading } from '../components/ui'
import { getPracticalChallenges, savePracticalSubmission } from '../services/data'
import type { PracticalChallengeRow } from '../types/database'

const demoChallenge = {
  title: 'Summarize temperature readings',
  instructions: 'Write a function that receives a list of daily temperatures and returns the minimum, maximum, and arithmetic mean. Then explain your approach in clear technical English.',
  requirements: ['Return the smallest value', 'Return the largest value', 'Calculate the arithmetic mean', 'Explain how the solution behaves for an empty list'],
  starter_code: 'def summarize(values):\n    # Return a dictionary with min, max, and mean\n    pass',
}

export default function ChallengesPage() {
  const { client, user } = useAuth()
  const [challenge, setChallenge] = useState<PracticalChallengeRow | null>(null)
  const [code, setCode] = useState(demoChallenge.starter_code)
  const [explanation, setExplanation] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    if (!client || !user) { setLoading(false); return }
    void getPracticalChallenges(client).then((result) => {
      if (!active) return
      if (result.data?.[0]) {
        const item = result.data[0]
        setChallenge(item)
        setCode(item.starter_code ?? '')
      } else if (result.error) setError(`${result.error} Showing the sample challenge instead.`)
      setLoading(false)
    }).catch(() => { if (active) { setError('Supabase could not be reached. Showing the sample challenge.'); setLoading(false) } })
    return () => { active = false }
  }, [client, user])

  async function submit(event: FormEvent) {
    event.preventDefault(); setError(''); setMessage('')
    if (!code.trim() || !explanation.trim()) { setError('Add your code and a short explanation before submitting.'); return }
    if (!client || !user || !challenge) {
      setMessage('This is a local demo draft. Sign in and apply the Phase 2 migration to save a published challenge submission.')
      return
    }
    setSaving(true)
    try {
      const result = await savePracticalSubmission(client, user.id, challenge.id, code, explanation)
      if (result.data) setMessage('Submission saved to your account. It has not been executed or evaluated.')
      else setError(result.error ?? 'Submission could not be saved.')
    } catch { setError('Supabase could not be reached. Your submission was not saved.') }
    finally { setSaving(false) }
  }

  const title = challenge?.title ?? demoChallenge.title
  const instructions = challenge?.instructions ?? demoChallenge.instructions
  const requirements = challenge?.requirements && Array.isArray(challenge.requirements) ? challenge.requirements.filter((item): item is string => typeof item === 'string') : demoChallenge.requirements
  return <><PageHeading eyebrow="Build and explain" title="Practical challenges" description="Submit a solution and explain your reasoning in English. Nexora stores submissions when the database is available; code execution is disabled."/>
    <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-950"><strong>Safety and evaluation:</strong> Submitted code is stored as text only. Nexora does not execute it or claim automatic grading. A future isolated code runner requires separate infrastructure.</div>
    <div className="grid gap-6 xl:grid-cols-[.8fr_1.2fr]">
      <Card><div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-indigo-50 text-indigo-700"><CodeXml size={19}/></span><div><h2 className="font-semibold">{title}</h2><p className="text-xs text-slate-500">Beginner · sample challenge</p></div></div><p className="mt-4 text-sm leading-6 text-slate-600">{instructions}</p><h3 className="mt-5 text-sm font-semibold">Requirements</h3><ul className="mt-2 space-y-2">{requirements.map((requirement) => <li key={requirement} className="flex gap-2 text-sm text-slate-600"><CheckCircle2 size={16} className="mt-0.5 shrink-0 text-indigo-500"/>{requirement}</li>)}</ul><p className="mt-5 rounded-lg bg-slate-50 p-3 text-xs leading-5 text-slate-500">{loading ? <span className="inline-flex items-center gap-2"><LoaderCircle size={14} className="animate-spin"/>Checking published challenge…</span> : challenge ? 'Published from Supabase.' : 'Demo challenge content · not yet loaded from the database.'}</p></Card>
      <Card><h2 className="font-semibold">Your solution</h2><form onSubmit={(event) => void submit(event)} className="mt-4 space-y-4"><label className="block text-sm font-medium text-slate-700">Code or pseudocode<textarea value={code} onChange={(event) => setCode(event.target.value)} maxLength={100000} rows={12} spellCheck={false} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-950 p-4 font-mono text-sm leading-6 text-slate-100 outline-none focus:border-indigo-400"/></label><label className="block text-sm font-medium text-slate-700">Explain your approach in English<textarea value={explanation} onChange={(event) => setExplanation(event.target.value)} maxLength={12000} rows={5} className="mt-2 w-full rounded-xl border border-slate-200 p-3 text-sm leading-6 outline-none focus:border-indigo-400" placeholder="Describe the main steps and how you handle an empty input…"/></label><button disabled={saving || loading} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50">{saving ? <><LoaderCircle size={16} className="animate-spin"/>Saving…</> : <><Send size={15}/>Submit solution</>}</button></form>{message && <p role="status" className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{message}</p>}{error && <p role="alert" className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}</Card>
    </div>
  </>
}
