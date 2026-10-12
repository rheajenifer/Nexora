import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, BookOpen, SearchX } from 'lucide-react'

export function PageHeading({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: ReactNode }) {
  return <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div>{eyebrow && <p className="mb-2 text-xs font-semibold uppercase tracking-[.16em] text-indigo-600">{eyebrow}</p>}<h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">{title}</h1>{description && <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">{description}</p>}</div>{action}</div>
}
export function Card({ children, className = '' }: { children: ReactNode; className?: string }) { return <section className={`min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6 ${className}`}>{children}</section> }
export function SectionHeading({ title, subtitle, to, linkText = 'View all' }: { title: string; subtitle?: string; to?: string; linkText?: string }) { return <div className="mb-4 flex items-end justify-between gap-3"><div><h2 className="font-semibold text-slate-900">{title}</h2>{subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}</div>{to && <Link className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-indigo-600 hover:text-indigo-700" to={to}>{linkText}<ArrowRight size={15}/></Link>}</div> }
export function Button({ children, className = '', variant = 'primary', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'quiet' }) {
  const styles = { primary: 'bg-indigo-600 text-white hover:bg-indigo-700', secondary: 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50', quiet: 'text-slate-600 hover:bg-slate-100' }
  return <button className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${styles[variant]} ${className}`} {...props}>{children}</button>
}
export function EmptyState({ title, detail }: { title: string; detail: string }) { return <div className="rounded-2xl border border-dashed border-slate-200 px-6 py-12 text-center"><SearchX className="mx-auto text-slate-400"/><h3 className="mt-3 font-medium text-slate-800">{title}</h3><p className="mt-1 text-sm text-slate-500">{detail}</p></div> }
const colorStyles: Record<string, string> = { blue: 'bg-blue-50 text-blue-600', violet: 'bg-violet-50 text-violet-600', amber: 'bg-amber-50 text-amber-600', emerald: 'bg-emerald-50 text-emerald-600', rose: 'bg-rose-50 text-rose-600' }
export function CourseIcon({ icon: Icon, color }: { icon: React.ComponentType<{ size?: number; className?: string }>; color: string }) { return <span className={`grid size-11 shrink-0 place-items-center rounded-xl ${colorStyles[color] ?? colorStyles.blue}`}><Icon size={21}/></span> }
export function LessonLink({ lessonId, children }: { lessonId: string; children: ReactNode }) { return <Link className="group inline-flex items-center gap-2 text-sm font-medium text-indigo-600 hover:text-indigo-700" to={`/lessons/${lessonId}`}><BookOpen size={16}/>{children}<ArrowRight size={14} className="transition group-hover:translate-x-0.5"/></Link> }
