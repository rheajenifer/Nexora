const DONE_KEY = 'nexora-demo-completed-lessons'
export function getCompletedLessons(): string[] {
  try { return JSON.parse(localStorage.getItem(DONE_KEY) ?? '[]') as string[] } catch { return [] }
}
export function setLessonCompleted(id: string, completed: boolean) {
  const current = getCompletedLessons()
  const next = completed ? [...new Set([...current, id])] : current.filter((item) => item !== id)
  localStorage.setItem(DONE_KEY, JSON.stringify(next))
}
export function getPreference(key: string, fallback: string) {
  try { return localStorage.getItem(`nexora-demo-${key}`) ?? fallback } catch { return fallback }
}
export function setPreference(key: string, value: string) { localStorage.setItem(`nexora-demo-${key}`, value) }
