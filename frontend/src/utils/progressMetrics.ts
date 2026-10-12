type CompletionRecord = { completedAt: string }
type AssessmentRecord = { assessment_type: string; score: number | string; submitted_at: string }
type DiagnosticRecord = { dimension: 'english' | 'core'; score: number | string }

export type ActivityDay = { key: string; day: string; lessons: number; assessments: number }
export type DimensionAverage = { name: 'Technical knowledge' | 'Technical English'; score: number | null; attempts: number }

function localDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function buildWeeklyActivity(completions: CompletionRecord[], assessments: AssessmentRecord[], today = new Date()): ActivityDay[] {
  const days = Array.from({ length: 7 }, (_, offset) => {
    const date = new Date(today)
    date.setDate(today.getDate() - (6 - offset))
    return { key: localDateKey(date), day: date.toLocaleDateString(undefined, { weekday: 'short' }), lessons: 0, assessments: 0 }
  })
  const byDate = new Map(days.map((day) => [day.key, day]))
  completions.forEach((item) => {
    const date = new Date(item.completedAt)
    if (!Number.isNaN(date.valueOf())) {
      const day = byDate.get(localDateKey(date))
      if (day) day.lessons += 1
    }
  })
  assessments.forEach((item) => {
    const date = new Date(item.submitted_at)
    if (!Number.isNaN(date.valueOf())) {
      const day = byDate.get(localDateKey(date))
      if (day) day.assessments += 1
    }
  })
  return days
}

export function buildScoreDimensions(diagnostics: DiagnosticRecord[], assessments: AssessmentRecord[]): DimensionAverage[] {
  const values: Record<DimensionAverage['name'], number[]> = { 'Technical knowledge': [], 'Technical English': [] }
  diagnostics.forEach((attempt) => values[attempt.dimension === 'english' ? 'Technical English' : 'Technical knowledge'].push(Number(attempt.score)))
  assessments.forEach((attempt) => {
    const dimension = attempt.assessment_type.toLowerCase().includes('english') ? 'Technical English' : 'Technical knowledge'
    values[dimension].push(Number(attempt.score))
  })
  return (Object.entries(values) as [DimensionAverage['name'], number[]][]).map(([name, scores]) => ({
    name,
    score: scores.length ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length) : null,
    attempts: scores.length,
  }))
}
