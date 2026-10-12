import { lazy, Suspense } from 'react'
import { BrowserRouter, Link, Route, Routes } from 'react-router-dom'
import AppLayout from './components/AppLayout'
import { AuthProvider } from './auth/AuthContext'
import ProtectedRoute from './auth/ProtectedRoute'
import { LoginPage, RecoveryPage, RegisterPage, ResetPasswordPage } from './auth/AuthPages'
const DashboardPage = lazy(() => import('./pages/DashboardPage'))
const CoursesPage = lazy(() => import('./pages/CoursesPage'))
const LessonPage = lazy(() => import('./pages/LessonPage'))
const VocabularyPage = lazy(() => import('./pages/VocabularyPage'))
const TutorPage = lazy(() => import('./pages/TutorPage'))
const CommunicationPage = lazy(() => import('./pages/CommunicationPage'))
const AssessmentsPage = lazy(() => import('./pages/AssessmentsPage'))
const ChallengesPage = lazy(() => import('./pages/ChallengesPage'))
const InterviewPage = lazy(() => import('./pages/InterviewPage'))
const ResumePage = lazy(() => import('./pages/ResumePage'))
const AchievementsPage = lazy(() => import('./pages/AchievementsPage'))
const ProgressPage = lazy(() => import('./pages/ProgressPage'))
const ProfilePage = lazy(() => import('./pages/ProfilePage'))
const OnboardingPage = lazy(() => import('./pages/OnboardingPage'))
const AdminPage = lazy(() => import('./pages/AdminPage'))

function NotFound(){return <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center"><p className="text-sm font-semibold text-indigo-600">404 · Page not found</p><h1 className="mt-2 text-2xl font-semibold">This page isn’t in the workspace.</h1><Link className="mt-5 inline-block rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white" to="/">Return to dashboard</Link></div>}

export default function App(){return <AuthProvider><BrowserRouter><Suspense fallback={<div className="rounded-2xl border border-slate-200 bg-white p-8 text-sm text-slate-500">Loading this page…</div>}><Routes><Route path="/login" element={<LoginPage/>}/><Route path="/register" element={<RegisterPage/>}/><Route path="/forgot-password" element={<RecoveryPage/>}/><Route path="/reset-password" element={<ResetPasswordPage/>}/><Route element={<AppLayout/>}><Route index element={<DashboardPage/>}/><Route path="courses" element={<CoursesPage/>}/><Route path="lessons/:lessonId" element={<LessonPage/>}/><Route path="vocabulary" element={<VocabularyPage/>}/><Route path="tutor" element={<TutorPage/>}/><Route path="communication" element={<CommunicationPage/>}/><Route path="assessments" element={<AssessmentsPage/>}/><Route path="challenges" element={<ChallengesPage/>}/><Route path="interview" element={<InterviewPage/>}/><Route path="resume" element={<ResumePage/>}/><Route path="achievements" element={<AchievementsPage/>}/><Route path="progress" element={<ProgressPage/>}/><Route element={<ProtectedRoute/>}><Route path="onboarding" element={<OnboardingPage/>}/><Route path="profile" element={<ProfilePage/>}/></Route><Route path="admin" element={<AdminPage/>}/><Route path="*" element={<NotFound/>}/></Route></Routes></Suspense></BrowserRouter></AuthProvider>}
