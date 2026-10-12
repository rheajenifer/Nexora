import { useEffect, useState, type FormEvent } from 'react'
import { Download, LoaderCircle, Save } from 'lucide-react'
import { useAuth, getDisplayName } from '../auth/AuthContext'
import { Card, PageHeading } from '../components/ui'
import { loadStudentResume, saveStudentResume } from '../services/data'
import type { Json } from '../types/database'

type ResumeContent = { name: string; email: string; headline: string; summary: string; education: string; skills: string; projects: string }
const empty: ResumeContent = { name: '', email: '', headline: '', summary: '', education: '', skills: '', projects: '' }
function fromJson(value: Json): ResumeContent {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return empty
  return Object.fromEntries(Object.keys(empty).map((key) => [key, typeof value[key] === 'string' ? value[key] : ''])) as unknown as ResumeContent
}

export default function ResumePage() {
  const { client, user } = useAuth()
  const [content, setContent] = useState<ResumeContent>(() => ({ ...empty, name: user ? getDisplayName(user) : '', email: user?.email ?? '' }))
  const [template, setTemplate] = useState('classic')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    if (!client || !user) return
    setLoading(true)
    void loadStudentResume(client, user.id).then((result) => {
      if (!active) return
      if (result.data) { setContent(fromJson(result.data.version.content)); setTemplate(result.data.resume.template_key); setStatus(`Loaded saved version ${result.data.version.version_number}.`) }
      else if (result.error) setError(result.error)
      setLoading(false)
    }).catch(() => { if (active) { setError('Supabase could not be reached. Resume edits remain in this page until saved.'); setLoading(false) } })
    return () => { active = false }
  }, [client, user])
  function change(field: keyof ResumeContent, value: string) { setContent((current) => ({ ...current, [field]: value })); setStatus('') }
  async function save(event: FormEvent) {
    event.preventDefault(); setError(''); setStatus('')
    if (!content.name.trim() || !content.email.trim() || !content.education.trim() || !content.skills.trim()) { setError('Add your name, contact email, education and skills before saving.'); return }
    if (!client || !user) { setError('Sign in to save your resume to your account. This demo draft is not persisted.'); return }
    setSaving(true)
    try {
      const result = await saveStudentResume(client, user.id, `${content.name.trim()} — Resume`, template, content as unknown as Json)
      if (result.data) setStatus(`Version ${result.data.version.version_number} saved to your account.`)
      else setError(result.error ?? 'Resume could not be saved.')
    } catch { setError('Supabase could not be reached. Your changes were not saved.') }
    finally { setSaving(false) }
  }
  return <><PageHeading eyebrow="Career toolkit" title="Resume builder" description="Draft a concise engineering resume from your real education, skills and projects. Nexora does not invent experience or credentials."/><div className="no-print mb-5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-950"><strong>Accuracy reminder:</strong> Use only skills, work and achievements you can explain and verify. Export uses your browser’s print dialog; choose “Save as PDF”.</div><div className="grid gap-6 xl:grid-cols-[.9fr_1.1fr]"><Card className="no-print"><h2 className="font-semibold">Resume details</h2>{loading && <p className="mt-2 flex items-center gap-2 text-xs text-slate-500"><LoaderCircle size={14} className="animate-spin"/>Loading your saved version…</p>}<form onSubmit={(event) => void save(event)} className="mt-4 space-y-3">{([['name','Full name'],['email','Contact email'],['headline','Professional headline'],['summary','Profile summary'],['education','Education'],['skills','Technical skills'],['projects','Projects and outcomes']] as const).map(([field,label]) => <label key={field} className="block text-xs font-medium text-slate-600">{label}<textarea rows={field === 'summary' || field === 'projects' ? 3 : 1} maxLength={field === 'projects' ? 8000 : 4000} value={content[field]} onChange={(event) => change(field,event.target.value)} className="mt-1.5 w-full resize-y rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal outline-none focus:border-indigo-400"/></label>)}<label className="block text-xs font-medium text-slate-600">Layout<select value={template} onChange={(event) => setTemplate(event.target.value)} className="mt-1.5 block rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"><option value="classic">Classic</option><option value="modern">Modern</option></select></label><div className="flex flex-wrap gap-2"><button disabled={saving || loading} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"><Save size={15}/>{saving ? 'Saving…' : 'Save version'}</button><button type="button" onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700"><Download size={15}/>Export PDF</button></div></form>{status && <p role="status" className="mt-3 text-xs text-emerald-700">{status}</p>}{error && <p role="alert" className="mt-3 rounded-lg bg-rose-50 p-3 text-xs text-rose-800">{error}</p>}</Card><Card className={`resume-preview min-h-[720px] ${template==='modern'?'border-t-4 border-t-indigo-500':''}`}><div className="border-b border-slate-200 pb-5"><h2 className="text-3xl font-bold tracking-tight text-slate-900">{content.name || 'Your name'}</h2><p className="mt-1 text-indigo-700">{content.headline || 'Engineering student'}</p>{content.email && <p className="mt-2 text-xs text-slate-500">{content.email}</p>}</div>{([['Profile',content.summary],['Education',content.education],['Technical skills',content.skills],['Projects',content.projects]] as const).map(([heading,text]) => <section key={heading} className="border-b border-slate-100 py-5"><h3 className="text-xs font-bold uppercase tracking-[.14em] text-slate-500">{heading}</h3><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{text || `Add your ${heading.toLowerCase()} details in the editor.`}</p></section>)}<p className="mt-5 text-[10px] text-slate-400">Preview only · confirm every statement before sharing.</p></Card></div></>
}
