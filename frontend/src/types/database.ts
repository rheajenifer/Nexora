import type { Course, Lesson } from './index'

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type StudentProfileRow = {
  user_id: string
  display_name: string
  program: string | null
  learning_language: string
  daily_goal_minutes: number
  college_name: string | null
  department_id: string | null
  academic_program_id: string | null
  academic_year: number | null
  semester: number | null
  technical_interests: string[]
  learning_goals: string[]
  learning_pace: 'relaxed' | 'steady' | 'intensive'
  onboarding_completed_at: string | null
  created_at: string
  updated_at: string
}
export type DepartmentRow = { id: string; slug: string; name: string; active: boolean; created_at: string }
export type AcademicProgramRow = { id: string; department_id: string; name: string; degree_level: 'Diploma' | 'Undergraduate' | 'Postgraduate' | 'Other'; active: boolean; created_at: string }
export type DiagnosticAttemptRow = { id: string; user_id: string; dimension: 'english' | 'core'; subject: string; score: number; assigned_level: 'beginner' | 'intermediate' | 'advanced'; correct_answers: number; total_questions: number; answers: Json; submitted_at: string }
export type DiagnosticQuestion = { question_id: string; dimension: 'english' | 'core'; subject: string; prompt: string; options: string[]; sort_order: number }
export type DiagnosticResult = { attempt_id: string; score: number; correct_answers: number; total_questions: number; assigned_level: 'beginner' | 'intermediate' | 'advanced'; submitted_at: string }
export type AdaptiveQuestion = { assessment_id: string; assessment_slug: string; title: string; dimension: 'core' | 'english'; course_slug: string | null; question_id: string; prompt: string; choices: string[]; sort_order: number }
export type AdaptiveAssessmentResult = { attempt_id: string; score: number; correct_answers: number; total_questions: number; review: { question_id: string; selected_option: number; correct_option: number; explanation: string }[]; dimension: 'core' | 'english'; previous_level: 'beginner' | 'intermediate' | 'advanced'; assigned_level: 'beginner' | 'intermediate' | 'advanced'; level_changed: boolean; progression_rule: string }
export type PracticalChallengeRow = { id: string; topic_id: string; slug: string; title: string; instructions: string; requirements: Json; starter_code: string | null; validation_spec: Json; difficulty: 'beginner' | 'intermediate' | 'advanced'; published: boolean; created_at: string; updated_at: string }
export type PracticalSubmissionRow = { id: string; user_id: string; challenge_id: string; submitted_code: string; explanation: string | null; status: 'submitted' | 'queued' | 'evaluated' | 'needs_revision'; evaluation: Json | null; submitted_at: string; updated_at: string }
export type AchievementDefinitionRow = { id: string; slug: string; title: string; description: string; criteria: Json; active: boolean; created_at: string }
export type StudentAchievementRow = { id: string; user_id: string; achievement_id: string; evidence: Json; awarded_at: string }
export type CertificateRow = { id: string; certificate_id: string; verification_code: string; user_id: string; course_id: string; student_name_snapshot: string; course_name_snapshot: string; issued_at: string; revoked_at: string | null; metadata: Json }
export type InterviewQuestionRow = { id: string; subject_id: string | null; topic_id: string | null; role_name: string | null; question_type: 'technical' | 'coding' | 'problem_solving' | 'hr'; difficulty: 'beginner' | 'intermediate' | 'advanced'; prompt: string; model_answer: string | null; follow_up_questions: Json; source_url: string | null; source_label: string | null; source_date: string | null; published: boolean; created_at: string; updated_at: string }
export type InterviewPracticeAttemptRow = { id: string; user_id: string; question_id: string; response: string; created_at: string }
export type StudentResumeRow = { id: string; user_id: string; title: string; template_key: string; current_version: number; created_at: string; updated_at: string }
export type ResumeVersionRow = { id: string; resume_id: string; version_number: number; content: Json; created_at: string }
export type CourseRow = {
  id: string
  slug: string
  title: string
  category: string
  description: string
  estimated_weeks: number
  published: boolean
  created_at: string
  updated_at: string
}
export type LessonRow = {
  id: string
  course_id: string
  slug: string
  title: string
  summary: string
  content: string
  example: string
  objectives: Json
  vocabulary: Json
  sort_order: number
  estimated_minutes: number
  published: boolean
  created_at: string
  updated_at: string
}
export type LessonProgressRow = { user_id: string; lesson_id: string; completed_at: string; created_at: string }
export type AssessmentAttemptRow = { id: string; user_id: string; assessment_key: string; assessment_type: string; score: number; total_questions: number; correct_answers: number; answers: Json; submitted_at: string }

type Table<Row, Insert, Update> = { Row: Row; Insert: Insert; Update: Update; Relationships: [] }

export interface Database {
  public: {
    Tables: {
      student_profiles: Table<StudentProfileRow, Pick<StudentProfileRow, 'user_id'> & Partial<Omit<StudentProfileRow, 'user_id' | 'created_at' | 'updated_at'>>, Partial<Omit<StudentProfileRow, 'user_id' | 'created_at'>>>
      courses: Table<CourseRow, Omit<CourseRow, 'id' | 'created_at' | 'updated_at'> & Partial<Pick<CourseRow, 'id'>>, Partial<Omit<CourseRow, 'id' | 'created_at'>>>
      lessons: Table<LessonRow, Omit<LessonRow, 'id' | 'created_at' | 'updated_at'> & Partial<Pick<LessonRow, 'id'>>, Partial<Omit<LessonRow, 'id' | 'created_at'>>>
      lesson_progress: Table<LessonProgressRow, Pick<LessonProgressRow, 'user_id' | 'lesson_id'>, Partial<Pick<LessonProgressRow, 'completed_at'>>>
      assessment_attempts: Table<AssessmentAttemptRow, Pick<AssessmentAttemptRow, 'user_id' | 'assessment_key' | 'assessment_type' | 'score' | 'total_questions' | 'correct_answers'> & Partial<Pick<AssessmentAttemptRow, 'answers'>>, never>
      departments: Table<DepartmentRow, Pick<DepartmentRow, 'slug' | 'name'> & Partial<Pick<DepartmentRow, 'id' | 'active'>>, Partial<Pick<DepartmentRow, 'name' | 'active'>>>
      academic_programs: Table<AcademicProgramRow, Pick<AcademicProgramRow, 'department_id' | 'name'> & Partial<Pick<AcademicProgramRow, 'id' | 'degree_level' | 'active'>>, Partial<Pick<AcademicProgramRow, 'name' | 'degree_level' | 'active'>>>
      diagnostic_attempts: Table<DiagnosticAttemptRow, never, never>
      practical_challenges: Table<PracticalChallengeRow, never, never>
      practical_submissions: Table<PracticalSubmissionRow, Pick<PracticalSubmissionRow, 'user_id' | 'challenge_id' | 'submitted_code'> & Partial<Pick<PracticalSubmissionRow, 'explanation'>>, Partial<Pick<PracticalSubmissionRow, 'submitted_code' | 'explanation'>>>
      student_achievements: Table<StudentAchievementRow, never, never>
      achievement_definitions: Table<AchievementDefinitionRow, never, never>
      certificates: Table<CertificateRow, never, never>
      interview_questions: Table<InterviewQuestionRow, never, never>
      interview_practice_attempts: Table<InterviewPracticeAttemptRow, Pick<InterviewPracticeAttemptRow, 'user_id' | 'question_id' | 'response'>, never>
      student_resumes: Table<StudentResumeRow, Pick<StudentResumeRow, 'user_id'> & Partial<Pick<StudentResumeRow, 'title' | 'template_key' | 'current_version'>>, Partial<Pick<StudentResumeRow, 'title' | 'template_key' | 'current_version'>>>
      resume_versions: Table<ResumeVersionRow, Pick<ResumeVersionRow, 'resume_id' | 'version_number' | 'content'>, never>
    }
    Views: Record<never, never>
    Functions: {
      get_adaptive_assessment: { Args: { p_slug: string }; Returns: AdaptiveQuestion[] }
      submit_adaptive_assessment: { Args: { p_slug: string; p_answers: Json }; Returns: AdaptiveAssessmentResult }
      issue_course_certificate: { Args: { p_course_slug: string }; Returns: { certificate_id: string; verification_code: string; course_name: string; issued_at: string }[] }
      verify_course_certificate: { Args: { p_code: string }; Returns: { certificate_id: string; student_name: string; course_name: string; issued_at: string; is_valid: boolean }[] }
      get_diagnostic_questions: { Args: { p_dimension: string; p_subject: string }; Returns: DiagnosticQuestion[] }
      submit_diagnostic_assessment: { Args: { p_dimension: string; p_subject: string; p_answers: Json }; Returns: DiagnosticResult[] }
    }
    Enums: Record<never, never>
    CompositeTypes: Record<never, never>
  }
}

export type PublishedCourse = Course & { id: string; slug: string }
export type PublishedLesson = Lesson & { id: string; courseSlug: string }
