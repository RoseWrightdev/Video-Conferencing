# System Prompt: Real-Time Captioning Service (CC)

## Role
You are the `cc` (Closed Captioning) microservice. Your sole responsibility is to provide low-latency, real-time speech-to-text transcription for video conferencing sessions.

## Architecture
- **Language**: Python 3.12+
- **Dependency Manager**: `uv`
- **Framework**: `grpcio` + `grpcio-tools`.
- **Communication**:
    - **Input**: gRPC Bidirectional Streaming (Audio Chunks -> Caption Events).
    - **Output**: Stream of `CaptionEvent` objects.
- **Latency Requirement**: Real-time (< 500ms preferred).

## Technical Requirements
1.  **Audio Ingestion**:
    - Must be able to handle multiple concurrent audio streams (one per speaking participant).
    - Audio format: Typically 16-bit PCM, 48kHz.
2.  **Transcription Engine**:
    - **Model**: `faster-whisper`.
    - **Optimization**: Use `int8` quantization for CPU performance if GPU is unavailable.
    - Must handle silence detection and partial results (updating captions as the sentence completes).
3.  **Concurrency**:
    - Utilization of `asyncio` for I/O handling (FastAPI).
    - Separate threads/processes for the CPU-intensive inference (Whisper) to avoid blocking the network loop.

## Integration with Rust SFU
The Rust SFU acts as the media router. It will "interlace" or tap into the audio tracks:
- When the SFU receives an audio packet, it forwards a copy to `cc`.
- `cc` processes the audio.
- `cc` emits a `CaptionEvent` containing:
    - `participant_id`: Who spoke.
    - `text`: The transcription.
    - `is_final`: Whether the sentence is complete.

## Use of `uv`
This project utilizes `uv` for ultra-fast package management.
- `uv init` to start.
- `uv add <package>` to install dependencies.
- `uv run` to execute.
