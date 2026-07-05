# SwingIQ v2 — Architecture

## Why v2?

v1 extracted frames in the browser using HTML5 Canvas + `video.currentTime`.
This caused different browsers to produce different frames from the same video:

| Browser | Duration | P6 Frame | P6 Timestamp |
|---------|----------|----------|-------------|
| Edge (Windows) | 2.07s | 52 | 1.204s |
| Safari (iPhone) | 2.04s | 51 | 1.168s |

Same video, different results. Root cause: browser video decoders differ.

## v2 Solution

Move frame extraction to backend FFmpeg. Single source of truth.

```
v1: Browser Canvas → different frames per device
v2: FFmpeg backend → identical frames for all devices
```

## Pipeline

```
┌──────────────────────────────────────────┐
│  Any Device / Any Browser                │
│  Upload video → POST /api/analyze        │
└──────────────┬───────────────────────────┘
               │
┌──────────────▼───────────────────────────┐
│  Backend (Node.js + Docker)              │
│                                          │
│  1. FFmpeg: 90 frames + timestamps       │
│     └─ Deterministic, same on all runs   │
│                                          │
│  2. GPT-4o Pass 1: P1, P4, P8           │
│     └─ 20 sampled frames, 3 anchors     │
│                                          │
│  3. Interpolate: P2, P3, P5, P7         │
│     └─ P2=35%, P3=70%, P5=50%, P7=25%   │
│                                          │
│  4. GPT-4o Refine: P6 (Impact)          │
│     └─ P6±5 window, 11 frames           │
│                                          │
│  5. MediaPipe: Biomechanics (8 frames)   │
│     └─ Server-side, same JPEG as GPT     │
│                                          │
│  6. GPT-4o Coaching: 1 grid image        │
│     └─ 2x4 labeled, ~60% cost saving    │
│                                          │
│  → Return JSON                           │
└──────────────────────────────────────────┘
```

## AI Responsibility Split

| AI | Role | Input |
|----|------|-------|
| **Gemini** (future) | Phase detection | Batch frames |
| **GPT-4o** | Anchor detection + Coaching | Sampled frames / Grid image |
| **MediaPipe** | Biomechanics measurement | Same JPEGs as GPT |

## Key Principle

> GPT and MediaPipe must see the exact same images.
> FFmpeg is the single source of truth for frame extraction.

## Deployment

- **Docker** container with FFmpeg pre-installed
- **GCP Cloud Run** for auto-scaling
- Environment: `OPENAI_API_KEY`
