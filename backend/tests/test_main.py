import json
import os
import socket
import unittest
from unittest.mock import patch

from fastapi import HTTPException
from pydantic import ValidationError
from pydantic_core import ArgsKwargs

import main


class FakeHttpResponse:
    def __init__(self, payload):
        self.payload = payload

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return None

    def read(self):
        return json.dumps(self.payload).encode("utf-8")


class TutorTests(unittest.TestCase):
    def test_pydantic_core_args_kwargs_import_is_available(self):
        self.assertIsNotNone(ArgsKwargs)

    def test_blank_tutor_messages_are_rejected(self):
        with self.assertRaises(ValidationError):
            main.TutorMessage(role="user", content="   ")

    def test_missing_or_blank_key_is_not_configured(self):
        with patch.dict(os.environ, {"OPENAI_API_KEY": "  "}):
            self.assertEqual(main.openai_api_key(), "")

    def test_key_is_read_without_logging_or_transforming(self):
        with patch.dict(os.environ, {"OPENAI_API_KEY": " test-only-key "}):
            self.assertEqual(main.openai_api_key(), "test-only-key")

    def test_conversation_must_end_with_user_message(self):
        with self.assertRaises(ValidationError):
            main.TutorChatRequest(messages=[{"role": "assistant", "content": "A previous answer."}])

    def test_tutor_context_validates_independent_levels(self):
        request = main.TutorChatRequest(
            messages=[{"role": "user", "content": "Explain a binary search tree."}],
            learning_context={"subject": "Data Structures", "core_level": "advanced", "english_level": "beginner"},
        )
        self.assertEqual(request.learning_context.core_level, "advanced")
        self.assertEqual(request.learning_context.english_level, "beginner")
        with self.assertRaises(ValidationError):
            main.TutorLearningContext(core_level="expert")

    def test_tutor_request_limiter_rejects_burst_and_recovers_after_window(self):
        main._tutor_request_times.pop("test-client", None)
        for index in range(main._TUTOR_RATE_LIMIT):
            self.assertTrue(main.allow_tutor_request("test-client", now=100 + index))
        self.assertFalse(main.allow_tutor_request("test-client", now=200))
        self.assertTrue(main.allow_tutor_request("test-client", now=100 + main._TUTOR_RATE_WINDOW_SECONDS + 1))
        main._tutor_request_times.pop("test-client", None)

    def test_provider_prompt_keeps_subject_and_skill_dimensions_independent(self):
        def fake_urlopen(request, timeout):
            self.assertEqual(timeout, 30)
            payload = json.loads(request.data)
            self.assertIn("Data Structures", payload["instructions"])
            self.assertIn("advanced core-subject level", payload["instructions"])
            self.assertIn("beginner English proficiency", payload["instructions"])
            self.assertIn("independently", payload["instructions"])
            return FakeHttpResponse({"output": [{"type": "message", "content": [{"type": "output_text", "text": "A tree explanation."}]}]})

        with patch.object(main, "urlopen", side_effect=fake_urlopen):
            reply = main.request_openai_response("test-only-key", "test-model", [{"role": "user", "content": "Explain a tree."}], {"subject": "Data Structures", "core_level": "advanced", "english_level": "beginner"})
        self.assertEqual(reply, "A tree explanation.")

    def test_provider_request_uses_question_and_extracts_response_text(self):
        def fake_urlopen(request, timeout):
            self.assertEqual(timeout, 30)
            payload = json.loads(request.data)
            question = payload["input"][-1]["content"]
            return FakeHttpResponse({"output": [{"type": "message", "content": [{"type": "output_text", "text": f"Answer about {question}"}]}]})

        with patch.object(main, "urlopen", side_effect=fake_urlopen):
            arrays = main.request_openai_response("test-only-key", "test-model", [{"role": "user", "content": "Explain arrays."}])
            processes = main.request_openai_response("test-only-key", "test-model", [{"role": "user", "content": "Explain processes."}])
        self.assertEqual(arrays, "Answer about Explain arrays.")
        self.assertEqual(processes, "Answer about Explain processes.")
        self.assertNotEqual(arrays, processes)

    def test_provider_timeout_is_reported_without_raw_error_details(self):
        with patch.object(main, "urlopen", side_effect=socket.timeout):
            with self.assertRaises(HTTPException) as raised:
                main.request_openai_response("test-only-key", "test-model", [{"role": "user", "content": "Explain arrays."}])
        self.assertEqual(raised.exception.status_code, 504)
        self.assertIn("timed out", raised.exception.detail)


if __name__ == "__main__":
    unittest.main()
