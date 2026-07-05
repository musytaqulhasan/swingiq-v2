# SwingIQ v2 — API Documentation

## POST /api/analyze

Main analysis endpoint. Upload a golf swing video and receive complete analysis.

### Request

```
Content-Type: multipart/form-data

Fields:
  video: File (MP4/MOV, max 100MB)
  club: string ("iron" | "driver")
  view: string ("dtl" | "face-on")
```

### Response

```json
{
  "status": "success",
  "video": {
    "duration": 2.07,
    "frameCount": 90,
    "frameTimestamps": [0.023, 0.046, ...]
  },
  "phases": {
    "P1": { "frame": 4,  "timestamp": 0.114, "name": "Setup/Address", "imageBase64": "..." },
    "P2": { "frame": 16, "timestamp": 0.386, "name": "Takeaway", "imageBase64": "..." },
    "P3": { "frame": 28, "timestamp": 0.659, "name": "Backswing", "imageBase64": "..." },
    "P4": { "frame": 40, "timestamp": 0.931, "name": "Top of Backswing", "imageBase64": "..." },
    "P5": { "frame": 48, "timestamp": 1.113, "name": "Downswing", "imageBase64": "..." },
    "P6": { "frame": 52, "timestamp": 1.204, "name": "Impact", "imageBase64": "..." },
    "P7": { "frame": 60, "timestamp": 1.385, "name": "Follow Through", "imageBase64": "..." },
    "P8": { "frame": 76, "timestamp": 1.749, "name": "Finish", "imageBase64": "..." }
  },
  "biomechanics": { ... },
  "coaching": {
    "overall_score": 78,
    "coach_insight": "...",
    "phases": [ ... ],
    "angle_analysis": [ ... ],
    "strengths": [ ... ],
    "improvements": [ ... ]
  },
  "debug": {
    "requestId": "a1b2c3d4",
    "extractionMethod": "ffmpeg",
    "processingTime": "8.2"
  }
}
```

### Error Response

```json
{
  "error": "Error message",
  "requestId": "a1b2c3d4"
}
```

## GET /api/health

Health check endpoint.

```json
{
  "status": "ok",
  "version": "2.0.0",
  "ffmpeg": true
}
```

## Pipeline Flow

```
1. Video upload (multipart)
2. FFmpeg extract 90 frames + timestamps (deterministic)
3. GPT-4o Pass 1: detect P1, P4, P8 (20 sampled frames)
4. Backend: interpolate P2, P3, P5, P7
5. GPT-4o Impact Refine: refine P6 (P6±5 window)
6. MediaPipe: biomechanics on 8 phase frames
7. GPT-4o Coaching: 1 grid image (2x4) + biomechanics → analysis JSON
8. Return complete response
```
