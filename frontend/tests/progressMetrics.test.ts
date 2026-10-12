import assert from 'node:assert/strict'
import test from 'node:test'
import { buildScoreDimensions, buildWeeklyActivity } from '../src/utils/progressMetrics.ts'

test('weekly activity counts only saved events within the seven-day window', () => {
  const today = new Date(2026, 9, 11, 12)
  const todayIso = new Date(2026, 9, 11, 9).toISOString()
  const oldIso = new Date(2026, 9, 3, 9).toISOString()
  const activity = buildWeeklyActivity([{ completedAt: todayIso }, { completedAt: oldIso }], [{ assessment_type: 'core', score: 90, submitted_at: todayIso }], today)
  assert.equal(activity.length, 7)
  assert.equal(activity[6].lessons, 1)
  assert.equal(activity[6].assessments, 1)
  assert.equal(activity.reduce((sum, day) => sum + day.lessons, 0), 1)
})

test('technical English and subject scores stay independent and average only their own records', () => {
  const dimensions = buildScoreDimensions(
    [{ dimension: 'english', score: 60 }, { dimension: 'core', score: 90 }],
    [{ assessment_type: 'english', score: 80, submitted_at: '' }, { assessment_type: 'core', score: 70, submitted_at: '' }],
  )
  assert.deepEqual(dimensions, [
    { name: 'Technical knowledge', score: 80, attempts: 2 },
    { name: 'Technical English', score: 70, attempts: 2 },
  ])
})

test('empty score dimensions remain unavailable rather than appearing as zero', () => {
  assert.deepEqual(buildScoreDimensions([], []), [
    { name: 'Technical knowledge', score: null, attempts: 0 },
    { name: 'Technical English', score: null, attempts: 0 },
  ])
})
