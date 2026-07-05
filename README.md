# SwingIQ v2 — Backend-Heavy Architecture

AI-Powered Golf Swing Analysis with server-side frame extraction.

## Architecture

```
Mobile/Web (any browser)
    │
    ▼ Upload video
Backend (Node.js + FFmpeg)
    │
    ├── FFmpeg: Extract 90 frames + timestamps
    ├── GPT-4o: Detect P1-P8 phases
    ├── GPT-4o: Refine P6 (impact)
    ├── MediaPipe: Biomechanics (8 frames)
    ├── GPT-4o: Coaching analysis (1 grid image)
    └── Return JSON
    │
    ▼
Frontend displays results
```

## Why v2?

v1 (`swingiq-video`) extracted frames in the browser using HTML5 Canvas.
Different browsers (Safari vs Chrome) produced different frames from the same video,
causing inconsistent phase detection. v2 moves frame extraction to backend FFmpeg,
making results **100% deterministic** across all devices.

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Backend | Node.js + Express |
| Frame Extraction | FFmpeg |
| Phase Detection | GPT-4o Vision |
| Biomechanics | MediaPipe (server-side) |
| Coaching | GPT-4o |
| Storage | Firebase / GCS |
| Hosting | GCP Cloud Run (Docker) |
| Frontend | Static HTML/JS (upload + display) |

## Quick Start

```bash
# Development
cd backend
npm install
npm run dev

# Docker
docker-compose up --build
```

## API

```
POST /api/analyze
  Body: multipart/form-data { video, club, view }
  Response: { phases, biomechanics, coaching }
```

See [docs/API.md](docs/API.md) for full API documentation.

## Previous Version

v1 (browser-based): [swingiq-video](https://github.com/musytaqulhasan/swingiq-video)
