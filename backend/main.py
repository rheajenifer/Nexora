import asyncio
import json
import os
import socket
import time
from urllib.error import HTTPError, URLError
from urllib.request import Request as UrlRequest, urlopen
from pathlib import Path
from typing import Literal

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, field_validator, model_validator


BACKEND_DIR = Path(__file__).resolve().parent
load_dotenv(BACKEND_DIR / ".env", override=False)

app = FastAPI(title="Nexora API", version="0.2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_TUTOR_RATE_LIMIT = 20
_TUTOR_RATE_WINDOW_SECONDS = 600
_tutor_request_times: dict[str, list[float]] = {}


def allow_tutor_request(client_key: str, now: float | None = None) -> bool:
    current = time.monotonic() if now is None else now
    recent = [timestamp for timestamp in _tutor_request_times.get(client_key, []) if current - timestamp < _TUTOR_RATE_WINDOW_SECONDS]
    if len(recent) >= _TUTOR_RATE_LIMIT:
        _tutor_request_times[client_key] = recent
        return False
    recent.append(current)
    _tutor_request_times[client_key] = recent
    if len(_tutor_request_times) > 4096:
        expired = [key for key, timestamps in _tutor_request_times.items() if not timestamps or current - timestamps[-1] >= _TUTOR_RATE_WINDOW_SECONDS]
        for key in expired:
            _tutor_request_times.pop(key, None)
    return True


class TutorMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=4_000)

    @field_validator("content")
    @classmethod
    def content_must_not_be_blank(cls, value: str) -> str:
        content = value.strip()
        if not content:
            raise ValueError("Message content cannot be blank.")
        return content


class TutorLearningContext(BaseModel):
    subject: str = Field(default="engineering concepts", min_length=1, max_length=80)
    core_level: Literal["beginner", "intermediate", "advanced"] | None = None
    english_level: Literal["beginner", "intermediate", "advanced"] | None = None


class TutorChatRequest(BaseModel):
    messages: list[TutorMessage] = Field(min_length=1, max_length=24)
    learning_context: TutorLearningContext | None = None

    @model_validator(mode="after")
    def validate_conversation(self):
        if self.messages[-1].role != "user":
            raise ValueError("The latest conversation message must be from the user.")
        if sum(len(message.content) for message in self.messages) > 16_000:
            raise ValueError("Conversation is too long. Start a new chat or shorten the messages.")
        return self


@app.get("/api/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/tutor/status")
async def tutor_status() -> dict[str, bool | str]:
    return {
        "provider": "OpenAI",
        "configured": bool(openai_api_key()),
    }


@app.post("/api/tutor/chat")
async def tutor_chat(request: TutorChatRequest, http_request: Request) -> dict[str, str]:
    api_key = openai_api_key()
    if not api_key:
        raise HTTPException(
            status_code=503,
            detail="AI Tutor is not configured on this server. Set OPENAI_API_KEY in backend/.env and restart the backend.",
        )

    client_key = http_request.client.host if http_request.client else "unknown"
    if not allow_tutor_request(client_key):
        raise HTTPException(status_code=429, detail="The tutor request limit was reached. Wait a few minutes before trying again.")

    model = os.getenv("OPENAI_MODEL", "gpt-5.4-mini").strip() or "gpt-5.4-mini"
    try:
        reply = await asyncio.to_thread(
            request_openai_response,
            api_key,
            model,
            [{"role": message.role, "content": message.content} for message in request.messages],
            request.learning_context.model_dump() if request.learning_context else None,
        )
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=502, detail="The AI Tutor could not complete this request. Please try again later.") from None

    if not reply:
        raise HTTPException(status_code=502, detail="The AI provider returned an empty response. Please try again.")
    return {"reply": reply}


def openai_api_key() -> str:
    return os.getenv("OPENAI_API_KEY", "").strip()


def request_openai_response(api_key: str, model: str, messages: list[dict[str, str]], learning_context: dict[str, str | None] | None = None) -> str:
    context_instructions = ""
    if learning_context:
        subject = learning_context.get("subject") or "engineering concepts"
        core_level = learning_context.get("core_level")
        english_level = learning_context.get("english_level")
        context_instructions = (
            f" The selected subject is {subject}. "
            + (f"Explain technical depth at the student's {core_level} core-subject level. " if core_level else "Use an introductory technical depth because no assessed core level is available. ")
            + (f"Write English at the student's {english_level} English proficiency. " if english_level else "Use clear, accessible English because no assessed English level is available. ")
            + "Adapt technical depth and English complexity independently; never assume they are the same."
        )
    payload = {
        "model": model,
        "instructions": (
            "You are Nexora's technical learning tutor for engineering students. "
            "Answer the student's actual question directly, adapt to the conversation, "
            "explain technical ideas in clear steps, and support field-specific English "
            "with concise definitions or example phrasing when useful. If a question is "
            "ambiguous, ask a brief clarifying question. Do not claim to access course "
            "materials that were not provided." + context_instructions
        ),
        "input": messages,
        "max_output_tokens": 800,
        "store": False,
    }
    api_request = UrlRequest(
        "https://api.openai.com/v1/responses",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    try:
        with urlopen(api_request, timeout=30) as response:
            result = json.loads(response.read().decode("utf-8"))
    except HTTPError as error:
        if error.code == 429:
            raise HTTPException(status_code=503, detail="The AI provider is temporarily rate limited. Please try again later.") from None
        if error.code in (401, 403):
            raise HTTPException(status_code=502, detail="The AI provider rejected the server credentials. Check backend configuration.") from None
        raise HTTPException(status_code=502, detail="The AI provider could not complete this request. Please try again later.") from None
    except (TimeoutError, socket.timeout):
        raise HTTPException(status_code=504, detail="The AI Tutor response timed out. Please try again.") from None
    except URLError as error:
        if isinstance(error.reason, (TimeoutError, socket.timeout)):
            raise HTTPException(status_code=504, detail="The AI Tutor response timed out. Please try again.") from None
        raise HTTPException(status_code=502, detail="The AI provider could not be reached. Please try again later.") from None
    except (UnicodeDecodeError, json.JSONDecodeError):
        raise HTTPException(status_code=502, detail="The AI provider returned an invalid response. Please try again later.") from None

    text = [
        item.get("text", "")
        for output_item in result.get("output", [])
        if output_item.get("type") == "message"
        for item in output_item.get("content", [])
        if item.get("type") == "output_text"
    ]
    return "\n".join(part for part in text if isinstance(part, str)).strip()
