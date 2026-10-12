import { useCallback, useEffect, useState } from 'react'
import { Award, BadgeCheck, Download, LoaderCircle } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { Card, PageHeading } from '../components/ui'
import { courses } from '../data/demo'
import { getStudentAchievements, getStudentCertificates, issueCourseCertificate } from '../services/data'
import type { CertificateRow } from '../types/database'

export default function AchievementsPage() {
  const { client, user } = useAuth()
  const [awards, setAwards] = useState<{ achievement: { id: string; title: string; description: string }; award: { id: string; awarded_at: string } }[]>([])
  const [certificates, setCertificates] = useState<CertificateRow[]>([])
  const [courseSlug, setCourseSlug] = useState(courses[0].id)
  const [loading, setLoading] = useState(false)
  const [requesting, setRequesting] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const refresh = useCallback(async () => {
    if (!client || !user) { setAwards([]); setCertificates([]); return }
    setLoading(true)
    try {
      const [badgeResult, certificateResult] = await Promise.all([getStudentAchievements(client,user.id),getStudentCertificates(client,user.id)])
      setAwards(badgeResult.data ?? [])
      setCertificates(certificateResult.data ?? [])
      if (badgeResult.error || certificateResult.error) setError(badgeResult.error ?? certificateResult.error ?? '')
    } catch { setError('Supabase could not be reached. Your awards are not available right now.') }
    finally { setLoading(false) }
  },[client,user])
  useEffect(() => { void refresh() },[refresh])
  async function requestCertificate() {
    if (!client || !user) { setError('Sign in to check your certificate eligibility.'); return }
    setError(''); setMessage(''); setRequesting(true)
    try {
      const result = await issueCourseCertificate(client,courseSlug)
      if (result.data) { setMessage(`Certificate ${result.data.certificate_id} issued for ${result.data.course_name}. Verification code: ${result.data.verification_code}`); await refresh() }
      else setError(result.error ?? 'Certificate eligibility could not be confirmed.')
    } catch { setError('Supabase could not be reached. No certificate was issued.') }
    finally { setRequesting(false) }
  }
  return <><PageHeading eyebrow="Recognition from verified activity" title="Achievements & certificates" description="Badges are recorded from database events. Certificate eligibility is checked by PostgreSQL against lesson and graded assessment records."/><p className="no-print mb-5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-950">These database-backed actions require the Phase 2 migration to be applied to your Supabase project. Certificate print/export uses your browser’s print dialog; choose “Save as PDF”.</p>
    {!user && <Card className="mb-5 text-sm text-slate-600">Sign in to see account awards or request a certificate. This page does not invent demo awards.</Card>}
    <Card><div className="flex items-center justify-between"><div><h2 className="font-semibold">Your badges</h2><p className="mt-1 text-sm text-slate-500">Awarded by database rules from completed lessons and graded assessments.</p></div><Award className="text-amber-500" size={21}/></div>{loading ? <p className="mt-5 flex items-center gap-2 text-sm text-slate-500"><LoaderCircle size={16} className="animate-spin"/>Loading your awards…</p> : awards.length ? <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{awards.map(({achievement,award}) => <div key={award.id} className="rounded-xl border border-amber-100 bg-amber-50/60 p-4"><BadgeCheck size={19} className="text-amber-600"/><h3 className="mt-2 text-sm font-semibold text-slate-800">{achievement.title}</h3><p className="mt-1 text-xs leading-5 text-slate-600">{achievement.description}</p><p className="mt-2 text-[10px] text-slate-400">Awarded {new Date(award.awarded_at).toLocaleDateString()}</p></div>)}</div> : <p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-500">{user ? 'No badges yet. Complete a published lesson or pass a graded assessment to become eligible.' : 'Sign in to load your account badges.'}</p>}</Card>
    <Card className="no-print mt-6"><h2 className="font-semibold">Check course certificate eligibility</h2><p className="mt-1 text-sm leading-6 text-slate-500">The database requires all published lessons completed and at least three graded course assessments averaging 70% or higher.</p><div className="mt-4 flex flex-wrap gap-3"><select value={courseSlug} onChange={(event)=>setCourseSlug(event.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">{courses.map((course)=><option key={course.id} value={course.id}>{course.title}</option>)}</select><button disabled={!user||requesting} onClick={()=>void requestCertificate()} className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{requesting?'Checking…':'Check and issue if eligible'}</button></div>{message&&<p role="status" className="mt-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">{message}</p>}{error&&<p role="alert" className="mt-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}</Card>
    {certificates.length>0&&<div className="mt-6 grid gap-4 md:grid-cols-2">{certificates.map((certificate)=><Card className="certificate-preview" key={certificate.id}><div className="border border-indigo-200 p-7 text-center"><Award className="mx-auto text-indigo-600" size={30}/><p className="mt-3 text-[10px] font-bold uppercase tracking-[.2em] text-indigo-700">Nexora certificate of completion</p><p className="mt-5 text-xs text-slate-500">Presented to</p><h2 className="mt-1 text-2xl font-semibold">{certificate.student_name_snapshot}</h2><p className="mt-3 text-xs text-slate-500">for completing</p><p className="mt-1 text-lg font-semibold text-slate-800">{certificate.course_name_snapshot}</p><p className="mt-5 text-xs text-slate-500">Issued {new Date(certificate.issued_at).toLocaleDateString()} · {certificate.certificate_id}</p><p className="mt-2 break-all text-[10px] text-slate-400">Verification code: {certificate.verification_code}</p></div><button onClick={()=>window.print()} className="no-print mt-4 inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700"><Download size={15}/>Print or save PDF</button></Card>)}</div>}
  </>
}
