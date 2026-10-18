from __future__ import annotations

import os
import sys
from dataclasses import dataclass
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent


def _load_env_file(path: Path) -> None:
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if line.startswith("export "):
            line = line[7:].strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        if key and key not in os.environ:
            os.environ[key] = value.strip().strip('"').strip("'")


def _load_local_env() -> None:
    """Load developer-only values without ever requiring a dotenv dependency.

    `.env.local` first; then any files named in EAT_WHAT_ENV_FILES (os.pathsep-separated), so keys kept in
    another project's env file are read in place instead of being copied here. Earlier values win; nothing
    is ever printed."""
    local = ROOT / ".env.local"
    if local.is_file():
        _load_env_file(local)
    # Read after .env.local, which may itself name the shared files.
    for name in os.getenv("EAT_WHAT_ENV_FILES", "").split(os.pathsep):
        path = Path(name.strip()).expanduser()
        if name.strip() and path.is_file():
            _load_env_file(path)


_load_local_env()

# Keep all newly downloaded models, temporary files and caches on the project drive.
RUNTIME = ROOT / "runtime"
for key, relative in {
    "HF_HOME": "cache/huggingface", "HF_HUB_CACHE": "cache/huggingface/hub",
    "TORCH_HOME": "cache/torch", "XDG_CACHE_HOME": "cache/xdg",
    "PIP_CACHE_DIR": "cache/pip", "TEMP": "tmp", "TMP": "tmp",
    "OLLAMA_MODELS": "models/ollama",
}.items():
    directory = RUNTIME / relative
    directory.mkdir(parents=True, exist_ok=True)
    os.environ[key] = str(directory)


@dataclass(frozen=True)
class Settings:
    app_name: str = "今晚吃啥"
    data_path: Path = ROOT / "data" / "restaurants.json"
    database_path: Path = ROOT / "data" / "sessions.sqlite3"
    livekit_url: str = os.getenv("LIVEKIT_URL", "").strip()
    livekit_api_key: str = os.getenv("LIVEKIT_API_KEY", "").strip()
    livekit_api_secret: str = os.getenv("LIVEKIT_API_SECRET", "").strip()
    livekit_agent_name: str = os.getenv("LIVEKIT_AGENT_NAME", "restaurant-host").strip()
    llm_base_url: str = os.getenv("LLM_BASE_URL", "").strip().rstrip("/")
    llm_api_key: str = os.getenv("LLM_API_KEY", "").strip()
    llm_model: str = os.getenv("LLM_MODEL", "deepseek-pro").strip()
    llm_timeout_seconds: float = float(os.getenv("LLM_TIMEOUT_SECONDS", "22"))
    public_base_url: str = os.getenv("PUBLIC_BASE_URL", "").strip().rstrip("/")
    # Windows: SAPI voices; macOS: system voices (CosyVoice 3 on Apple's GPU is slower than real time); others: CosyVoice.
    tts_provider: str = os.getenv("TTS_PROVIDER", "windows" if os.name == "nt" else "macos" if sys.platform == "darwin" else "cosyvoice").strip()
    whisper_model: str = os.getenv("WHISPER_MODEL", str(RUNTIME / "models" / "faster-whisper-small"))
    whisper_device: str = os.getenv("WHISPER_DEVICE", "cpu")
    whisper_compute_type: str = os.getenv("WHISPER_COMPUTE_TYPE", "int8")
    # faster-whisper (CUDA or CPU, the delivered path) or transformers (Apple GPU via MPS, or CPU).
    whisper_backend: str = os.getenv("WHISPER_BACKEND", "faster-whisper").strip()
    # The merchant CSV snapshot the realtime console reads; relative paths are under the project root.
    console_data_dir: Path = ROOT / os.getenv("CONSOLE_DATA_DIR", "data/latest")
    # How long a finished turn waits for the frontend's playback receipt. A stage that pauses between
    # lines (the phone's pause button, a hidden tab) needs longer than the console's 12 s.
    playback_ack_timeout: float = float(os.getenv("PLAYBACK_ACK_TIMEOUT_SECONDS", "12"))
    # Seconds of TTS audio the backend may send ahead of real time, and the least the page should hold before a
    # sentence starts playing (realtime_console.turn): with synthesis near real time, they turn stutter into pauses.
    tts_send_ahead: float = float(os.getenv("TTS_SEND_AHEAD_SECONDS", "15"))
    tts_prebuffer: float = float(os.getenv("TTS_PREBUFFER_SECONDS", "1.2"))
    # OpenAI-compatible providers that think by default (Gemini) spend max_tokens on thinking; "none" turns it off.
    llm_reasoning_effort: str = os.getenv("LLM_REASONING_EFFORT", "").strip()
    # A backup OpenAI-compatible provider, used when the primary LLM_* provider fails (see providers/llm.py).
    llm_fallback_base_url: str = os.getenv("LLM_FALLBACK_BASE_URL", "").strip().rstrip("/")
    llm_fallback_api_key: str = os.getenv("LLM_FALLBACK_API_KEY", "").strip()
    llm_fallback_model: str = os.getenv("LLM_FALLBACK_MODEL", "").strip()
    llm_fallback_reasoning_effort: str = os.getenv("LLM_FALLBACK_REASONING_EFFORT", "").strip()
    llm_fallback_cooldown: float = float(os.getenv("LLM_FALLBACK_COOLDOWN_SECONDS", "300"))

    @property
    def livekit_ready(self) -> bool:
        return bool(self.livekit_url and self.livekit_api_key and self.livekit_api_secret)

    @property
    def llm_ready(self) -> bool:
        return bool(self.llm_base_url and self.llm_model) or self.llm_fallback_ready

    @property
    def llm_fallback_ready(self) -> bool:
        return bool(self.llm_fallback_base_url and self.llm_fallback_model)


settings = Settings()

