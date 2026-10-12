import type { SupabaseClient, User } from '@supabase/supabase-js'
import type { AcademicProgramRow, AchievementDefinitionRow, AdaptiveAssessmentResult, AdaptiveQuestion, AssessmentAttemptRow, CertificateRow, CourseRow, Database, DepartmentRow, DiagnosticAttemptRow, DiagnosticQuestion, DiagnosticResult, InterviewPracticeAttemptRow, InterviewQuestionRow, Json, LessonRow, PracticalChallengeRow, PracticalSubmissionRow, ResumeVersionRow, StudentAchievementRow, StudentProfileRow, StudentResumeRow } from '../types/database'
import type { Lesson } from '../types'

export type ServiceResult<T> = { data: T | null; error: string | null; databaseReady: boolean }
const ok = <T,>(data: T): ServiceResult<T> => ({ data, error: null, databaseReady: true })
const failed = <T,>(message: string, databaseReady = true): ServiceResult<T> => ({ data: null, error: message, databaseReady })
type DataError = { code?: string; message?: string; status?: number }
function missingTable(error: DataError) {
  return error.code === '42P01' || error.code === 'PGRST205'
}
function permissionDenied(error: DataError) {
  return error.code === '42501' || error.status === 401 || error.status === 403 || /row-level security|permission denied|insufficient privilege|not authorized/i.test(error.message ?? '')
}
function networkFailure(error: DataError) {
  return /failed to fetch|fetch failed|network|connection (?:refused|reset|closed)|timed? ?out|load failed/i.test(error.message ?? '')
}
function serviceError(message: string, error: DataError): ServiceResult<never> {
  if (missingTable(error)) return failed(`${message} The required table is missing from the Supabase API schema. Apply the SQL migration in supabase/migrations, then refresh the page.`, false)
  if (error.code === 'PGRST202' || error.code === '42883') return failed(`${message} A required database function is missing. Apply the SQL migration in supabase/migrations, then refresh the page.`, false)
  if (permissionDenied(error)) return failed(`${message} Supabase denied access. Check the signed-in account and the existing Row Level Security policy.`, true)
  if (networkFailure(error) || error.status === 0) return failed(`${message} Supabase could not be reached. Check your connection and project URL.`, true)
  return failed(`${message} Supabase returned a database error. Check the table schema and Supabase logs.`, true)
}

export async function getOrCreateProfile(client: SupabaseClient<Database>, user: User): Promise<ServiceResult<StudentProfileRow>> {
  const selected = await client.from('student_profiles').select('*').eq('user_id', user.id).maybeSingle()
  if (selected.error) return serviceError('Profile data is not available yet.', selected.error)
  if (selected.data) return ok(selected.data)
  const metaName = user.user_metadata?.display_name
  const displayName = typeof metaName === 'string' ? metaName.trim() : ''
  const inserted = await client.from('student_profiles').insert({ user_id: user.id, display_name: displayName }).select('*').single()
  if (inserted.error) return serviceError('Your profile could not be created.', inserted.error)
  return ok(inserted.data)
}

export type StudentProfileUpdate = Partial<Pick<StudentProfileRow, 'display_name' | 'program' | 'learning_language' | 'daily_goal_minutes' | 'college_name' | 'department_id' | 'academic_program_id' | 'academic_year' | 'semester' | 'technical_interests' | 'learning_goals' | 'learning_pace' | 'onboarding_completed_at'>>
export async function updateStudentProfile(client: SupabaseClient<Database>, userId: string, profile: StudentProfileUpdate): Promise<ServiceResult<StudentProfileRow>> {
  const { data, error } = await client.from('student_profiles').update(profile).eq('user_id', userId).select('*').single()
  if (error) return serviceError('Your profile could not be saved.', error)
  return ok(data)
}

export async function getDepartments(client: SupabaseClient<Database>): Promise<ServiceResult<DepartmentRow[]>> {
  const { data, error } = await client.from('departments').select('*').eq('active', true).order('name')
  if (error) return serviceError('Academic departments could not be loaded.', error)
  return ok(data)
}

export async function getAcademicPrograms(client: SupabaseClient<Database>, departmentId: string): Promise<ServiceResult<AcademicProgramRow[]>> {
  const { data, error } = await client.from('academic_programs').select('*').eq('department_id', departmentId).eq('active', true).order('name')
  if (error) return serviceError('Academic programs could not be loaded.', error)
  return ok(data)
}

export async function getDiagnosticQuestions(client: SupabaseClient<Database>, dimension: 'english' | 'core', subject: string): Promise<ServiceResult<DiagnosticQuestion[]>> {
  const { data, error } = await client.rpc('get_diagnostic_questions', { p_dimension: dimension, p_subject: subject })
  if (error) return serviceError('Diagnostic questions could not be loaded.', error)
  return ok(data)
}

export async function submitDiagnostic(client: SupabaseClient<Database>, dimension: 'english' | 'core', subject: string, answers: { question_id: string; selected_option: number }[]): Promise<ServiceResult<DiagnosticResult>> {
  const { data, error } = await client.rpc('submit_diagnostic_assessment', { p_dimension: dimension, p_subject: subject, p_answers: answers as Json })
  if (error) return serviceError('Your diagnostic result could not be saved.', error)
  const result = data[0]
  if (!result) return failed('The diagnostic did not return a result.')
  return ok(result)
}

export async function getDiagnosticAttempts(client: SupabaseClient<Database>, userId: string): Promise<ServiceResult<DiagnosticAttemptRow[]>> {
  const { data, error } = await client.from('diagnostic_attempts').select('*').eq('user_id', userId).order('submitted_at', { ascending: false })
  if (error) return serviceError('Diagnostic history could not be loaded.', error)
  return ok(data)
}

function textArray(value: Json): string[] {
  return Array.isArray(value) ? value.filter((part): part is string => typeof part === 'string') : []
}
function vocabularyArray(value: Json): Lesson['vocabulary'] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return []
    const record = item as Record<string, Json | undefined>
    if (typeof record.term !== 'string' || typeof record.definition !== 'string' || typeof record.sentence !== 'string') return []
    return [{ term: record.term, definition: record.definition, sentence: record.sentence }]
  })
}
function categoryStyle(category: string, slug: string) {
  const bySlug: Record<string, { icon: string; color: string }> = { dsa: { icon: 'Code2', color: 'blue' }, dbms: { icon: 'Database', color: 'violet' }, os: { icon: 'Cpu', color: 'amber' }, networks: { icon: 'Network', color: 'emerald' }, ml: { icon: 'BrainCircuit', color: 'rose' } }
  return bySlug[slug] ?? (category.toLowerCase().includes('system') ? bySlug.os : { icon: 'BookOpen', color: 'blue' })
}

export type CatalogCourse = { row: CourseRow; lessons: LessonRow[] }
export async function getPublishedCatalog(client: SupabaseClient<Database>): Promise<ServiceResult<CatalogCourse[]>> {
  const courseResult = await client.from('courses').select('*').eq('published', true).order('title')
  if (courseResult.error) return serviceError('Published courses could not be loaded.', courseResult.error)
  const rows = courseResult.data
  if (rows.length === 0) return ok([])
  const lessonsResult = await client.from('lessons').select('*').in('course_id', rows.map((row) => row.id)).eq('published', true).order('sort_order')
  if (lessonsResult.error) return serviceError('Course lessons could not be loaded.', lessonsResult.error)
  return ok(rows.map((row) => ({ row, lessons: lessonsResult.data.filter((lesson) => lesson.course_id === row.id) })))
}

export function catalogCourseToDemo(course: CatalogCourse) {
  const style = categoryStyle(course.row.category, course.row.slug)
  return { id: course.row.slug, title: course.row.title, category: course.row.category, description: course.row.description, progress: 0, lessons: course.lessons.length, duration: `${course.row.estimated_weeks} weeks`, color: style.color, icon: style.icon, topics: course.lessons.slice(0, 5).map((lesson) => lesson.title) }
}
export type CatalogLesson = Lesson & { id: string; slug: string; courseSlug: string; courseTitle: string; courseCategory: string }
export function catalogLessonToDemo(course: Pick<CourseRow, 'id' | 'slug' | 'title' | 'category'>, row: LessonRow): CatalogLesson {
  return { id: row.id, slug: row.slug, courseId: course.slug, courseSlug: course.slug, courseTitle: course.title, courseCategory: course.category, title: row.title, duration: `${row.estimated_minutes} min`, summary: row.summary, objectives: textArray(row.objectives), explanation: row.content, example: row.example, vocabulary: vocabularyArray(row.vocabulary) }
}

export async function getPublishedLesson(client: SupabaseClient<Database>, slug: string): Promise<ServiceResult<CatalogLesson>> {
  const { data: lesson, error } = await client.from('lessons').select('*, courses!inner(id, slug, title, category, published)').eq('slug', slug).eq('published', true).eq('courses.published', true).maybeSingle()
  if (error) return serviceError('This lesson could not be loaded from Supabase.', error)
  if (!lesson) return failed('This lesson is not published in Supabase yet.')
  const course = (lesson as unknown as LessonRow & { courses: Pick<CourseRow, 'id' | 'slug' | 'title' | 'category' | 'published'> }).courses
  return ok(catalogLessonToDemo(course, lesson))
}

export async function getLessonCompletion(client: SupabaseClient<Database>, userId: string, lessonId: string): Promise<ServiceResult<boolean>> {
  const { data, error } = await client.from('lesson_progress').select('lesson_id').eq('user_id', userId).eq('lesson_id', lessonId).maybeSingle()
  if (error) return serviceError('Lesson progress could not be loaded.', error)
  return ok(Boolean(data))
}
export async function getCompletedLessonIds(client: SupabaseClient<Database>, userId: string): Promise<ServiceResult<string[]>> {
  const { data, error } = await client.from('lesson_progress').select('lesson_id').eq('user_id', userId).order('completed_at', { ascending: false })
  if (error) return serviceError('Lesson progress could not be loaded.', error)
  return ok(data.map((row) => row.lesson_id))
}
export async function setLessonCompletion(client: SupabaseClient<Database>, userId: string, lessonId: string, completed: boolean): Promise<ServiceResult<boolean>> {
  if (completed) {
    const { error } = await client.from('lesson_progress').upsert({ user_id: userId, lesson_id: lessonId }, { onConflict: 'user_id,lesson_id' })
    if (error) return serviceError('Lesson completion could not be saved.', error)
  } else {
    const { error } = await client.from('lesson_progress').delete().eq('user_id', userId).eq('lesson_id', lessonId)
    if (error) return serviceError('Lesson completion could not be changed.', error)
  }
  return ok(completed)
}

export async function getAssessmentAttempts(client: SupabaseClient<Database>, userId: string): Promise<ServiceResult<AssessmentAttemptRow[]>> {
  const { data, error } = await client.from('assessment_attempts').select('*').eq('user_id', userId).order('submitted_at', { ascending: false }).limit(20)
  if (error) return serviceError('Assessment history could not be loaded.', error)
  return ok(data)
}

export type ProgressSnapshot = {
  courses: { slug: string; title: string; completed: number; total: number }[]
  completedLessons: { lessonId: string; completedAt: string }[]
  assessmentAttempts: AssessmentAttemptRow[]
  diagnosticAttempts: DiagnosticAttemptRow[]
}

/** Loads only the signed-in student's own progress. RLS remains the security boundary. */
export async function getProgressSnapshot(client: SupabaseClient<Database>, userId: string): Promise<ServiceResult<ProgressSnapshot>> {
  const [catalog, completions, assessments, diagnostics] = await Promise.all([
    getPublishedCatalog(client),
    client.from('lesson_progress').select('lesson_id, completed_at').eq('user_id', userId).order('completed_at', { ascending: false }),
    getAssessmentAttempts(client, userId),
    getDiagnosticAttempts(client, userId),
  ])
  if (!catalog.data) return failed(catalog.error ?? 'Published courses could not be loaded.')
  if (completions.error) return serviceError('Lesson activity could not be loaded.', completions.error)
  if (!assessments.data) return failed(assessments.error ?? 'Assessment history could not be loaded.')
  if (!diagnostics.data) return failed(diagnostics.error ?? 'Diagnostic history could not be loaded.')

  const completedIds = new Set(completions.data.map((item) => item.lesson_id))
  return ok({
    courses: catalog.data.map(({ row, lessons }) => ({
      slug: row.slug,
      title: row.title,
      total: lessons.length,
      completed: lessons.filter((lesson) => completedIds.has(lesson.id)).length,
    })),
    completedLessons: completions.data.map((item) => ({ lessonId: item.lesson_id, completedAt: item.completed_at })),
    assessmentAttempts: assessments.data,
    diagnosticAttempts: diagnostics.data,
  })
}

export async function getAdaptiveAssessment(client: SupabaseClient<Database>, slug: string): Promise<ServiceResult<AdaptiveQuestion[]>> {
  const { data, error } = await client.rpc('get_adaptive_assessment', { p_slug: slug })
  if (error) return serviceError('Adaptive assessment questions could not be loaded.', error)
  return ok(data.map((question) => ({ ...question, choices: Array.isArray(question.choices) ? question.choices.filter((choice): choice is string => typeof choice === 'string') : [] })))
}

export async function submitAdaptiveAssessment(client: SupabaseClient<Database>, slug: string, answers: { question_id: string; selected_option: number }[]): Promise<ServiceResult<AdaptiveAssessmentResult>> {
  const { data, error } = await client.rpc('submit_adaptive_assessment', { p_slug: slug, p_answers: answers as Json })
  if (error) return serviceError('Adaptive assessment could not be graded and saved.', error)
  return ok(data)
}

export async function getPracticalChallenges(client: SupabaseClient<Database>): Promise<ServiceResult<PracticalChallengeRow[]>> {
  const { data, error } = await client.from('practical_challenges').select('*').eq('published', true).order('created_at')
  if (error) return serviceError('Published practical challenges could not be loaded.', error)
  return ok(data)
}

export async function savePracticalSubmission(client: SupabaseClient<Database>, userId: string, challengeId: string, code: string, explanation: string): Promise<ServiceResult<PracticalSubmissionRow>> {
  const { data, error } = await client.from('practical_submissions').insert({ user_id: userId, challenge_id: challengeId, submitted_code: code, explanation }).select('*').single()
  if (error) return serviceError('Your practical submission could not be saved.', error)
  return ok(data)
}

export async function getStudentAchievements(client: SupabaseClient<Database>, userId: string): Promise<ServiceResult<{ achievement: AchievementDefinitionRow; award: StudentAchievementRow }[]>> {
  const awards = await client.from('student_achievements').select('*').eq('user_id', userId).order('awarded_at', { ascending: false })
  if (awards.error) return serviceError('Your achievements could not be loaded.', awards.error)
  if (!awards.data.length) return ok([])
  const definitions = await client.from('achievement_definitions').select('*').in('id', awards.data.map((award) => award.achievement_id))
  if (definitions.error) return serviceError('Achievement details could not be loaded.', definitions.error)
  return ok(awards.data.flatMap((award) => { const achievement = definitions.data.find((item) => item.id === award.achievement_id); return achievement ? [{ award, achievement }] : [] }))
}

export async function getStudentCertificates(client: SupabaseClient<Database>, userId: string): Promise<ServiceResult<CertificateRow[]>> {
  const { data, error } = await client.from('certificates').select('*').eq('user_id', userId).order('issued_at', { ascending: false })
  if (error) return serviceError('Your certificates could not be loaded.', error)
  return ok(data)
}

export async function issueCourseCertificate(client: SupabaseClient<Database>, courseSlug: string): Promise<ServiceResult<{ certificate_id: string; verification_code: string; course_name: string; issued_at: string }>> {
  const { data, error } = await client.rpc('issue_course_certificate', { p_course_slug: courseSlug })
  if (error) return serviceError('Certificate eligibility could not be verified.', error)
  if (!data[0]) return failed('No certificate was issued.')
  return ok(data[0])
}

export async function getInterviewQuestions(client: SupabaseClient<Database>): Promise<ServiceResult<InterviewQuestionRow[]>> {
  const { data, error } = await client.from('interview_questions').select('*').eq('published', true).order('difficulty').order('created_at')
  if (error) return serviceError('Interview practice questions could not be loaded.', error)
  return ok(data)
}

export async function saveInterviewPractice(client: SupabaseClient<Database>, userId: string, questionId: string, response: string): Promise<ServiceResult<InterviewPracticeAttemptRow>> {
  const { data, error } = await client.from('interview_practice_attempts').insert({ user_id: userId, question_id: questionId, response }).select('*').single()
  if (error) return serviceError('Interview practice response could not be saved.', error)
  return ok(data)
}

export async function loadStudentResume(client: SupabaseClient<Database>, userId: string): Promise<ServiceResult<{ resume: StudentResumeRow; version: ResumeVersionRow } | null>> {
  const { data: resume, error } = await client.from('student_resumes').select('*').eq('user_id', userId).order('updated_at', { ascending: false }).limit(1).maybeSingle()
  if (error) return serviceError('Your resume could not be loaded.', error)
  if (!resume) return ok(null)
  const { data: version, error: versionError } = await client.from('resume_versions').select('*').eq('resume_id', resume.id).order('version_number', { ascending: false }).limit(1).maybeSingle()
  if (versionError) return serviceError('Your latest resume version could not be loaded.', versionError)
  return version ? ok({ resume, version }) : failed('A resume record exists but has no saved version yet.')
}

export async function saveStudentResume(client: SupabaseClient<Database>, userId: string, title: string, template: string, content: Json): Promise<ServiceResult<{ resume: StudentResumeRow; version: ResumeVersionRow }>> {
  let { data: resume, error } = await client.from('student_resumes').select('*').eq('user_id', userId).order('updated_at', { ascending: false }).limit(1).maybeSingle()
  if (error) return serviceError('Your resume could not be prepared for saving.', error)
  if (!resume) {
    const created = await client.from('student_resumes').insert({ user_id: userId, title, template_key: template, current_version: 1 }).select('*').single()
    if (created.error) return serviceError('Your resume could not be created.', created.error)
    resume = created.data
  }
  const { data: latest, error: latestError } = await client.from('resume_versions').select('version_number').eq('resume_id', resume.id).order('version_number', { ascending: false }).limit(1).maybeSingle()
  if (latestError) return serviceError('Your resume version history could not be loaded.', latestError)
  const nextVersion = (latest?.version_number ?? 0) + 1
  const inserted = await client.from('resume_versions').insert({ resume_id: resume.id, version_number: nextVersion, content }).select('*').single()
  if (inserted.error) return serviceError('Your resume draft could not be saved.', inserted.error)
  const updated = await client.from('student_resumes').update({ title, template_key: template, current_version: nextVersion }).eq('id', resume.id).select('*').single()
  if (updated.error) return serviceError('The resume content was saved, but its version summary could not be updated.', updated.error)
  return ok({ resume: updated.data, version: inserted.data })
}

