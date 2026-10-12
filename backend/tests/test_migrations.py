from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[2]


class MigrationSafetyTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.onboarding = (ROOT / "supabase/migrations/20261011000000_phase1_onboarding_diagnostics.sql").read_text(encoding="utf-8").lower()
        cls.learning = (ROOT / "supabase/migrations/20261011010000_phase1_learning_data_model.sql").read_text(encoding="utf-8").lower()
        cls.phase2 = (ROOT / "supabase/migrations/20261011020000_phase2_adaptive_assessments.sql").read_text(encoding="utf-8").lower()

    def test_onboarding_migration_is_additive_and_requires_existing_schema(self):
        self.assertIn("apply 20261009000000_phase3_supabase_schema.sql", self.onboarding)
        self.assertIn("add column if not exists", self.onboarding)
        self.assertNotIn("drop table", self.onboarding)

    def test_diagnostic_answers_are_private_and_student_scoring_uses_auth_uid(self):
        self.assertIn("private.diagnostic_question_bank", self.onboarding)
        self.assertIn("revoke all on table private.diagnostic_question_bank", self.onboarding)
        self.assertIn("create or replace function public.submit_diagnostic_assessment", self.onboarding)
        self.assertIn("auth.uid()", self.onboarding)
        self.assertIn("alter table public.diagnostic_attempts enable row level security", self.onboarding)
        self.assertIn("grant select on public.diagnostic_attempts", self.onboarding)
        self.assertNotIn("grant insert on public.diagnostic_attempts", self.onboarding)
        self.assertIn("when v_score < 50 then 'beginner'", self.onboarding)
        self.assertIn("when v_score < 80 then 'intermediate'", self.onboarding)
        self.assertIn("('english', 'core')", self.onboarding)

    def test_learning_data_migration_applies_rls_to_student_records(self):
        for table in (
            "practical_submissions", "student_level_history", "student_achievements", "certificates",
            "student_resumes", "resume_versions", "ai_conversations", "ai_messages",
        ):
            self.assertIn(f"alter table public.{table} enable row level security", self.learning)
        self.assertIn("revoke all on public.subjects", self.learning)
        self.assertIn("private.is_admin()", self.learning)
        self.assertNotIn("drop table", self.learning)
        self.assertIn("private.assessment_answer_keys", self.learning)
        self.assertIn("public.practical_submissions, public.student_level_history", self.learning)

    def test_phase2_assessment_answer_keys_remain_private_and_grading_uses_auth_uid(self):
        self.assertIn("private.assessment_answer_keys", self.phase2)
        self.assertIn("revoke all on function public.get_adaptive_assessment(text) from public, anon", self.phase2)
        self.assertIn("create or replace function public.submit_adaptive_assessment", self.phase2)
        self.assertIn("revoke insert on public.assessment_attempts from authenticated", self.phase2)
        self.assertIn("auth.uid()", self.phase2)
        self.assertIn("three consecutive", self.phase2)
        self.assertIn("insert into public.student_level_history", self.phase2)
        self.assertIn("create table if not exists private.adaptive_assessment_records", self.phase2)
        self.assertIn("create or replace function public.issue_course_certificate", self.phase2)
        self.assertIn("v_completed<v_total or v_attempts<3 or v_average<70", self.phase2)
        self.assertIn("award_first_lesson_badge", self.phase2)
        self.assertIn("create policy \"students save their interview practice\"", self.phase2)
        self.assertNotIn("drop table", self.phase2)


if __name__ == "__main__":
    unittest.main()
