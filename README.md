# DanceCompare

Compare your dance moves against a reference video using AI pose estimation. Upload two videos, get a similarity score with per-segment feedback showing which joints need work.

## Quick Start

**Prerequisites:** Python 3.10+, Node.js 18+

### 1. Clone the repo

```bash
git clone https://github.com/TonyCQin/dance_video_comparison.git
cd dance_video_comparison
```

### 2. Backend setup

```bash
cd backend
python3 -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

Download the MediaPipe pose model (one-time, ~5.6 MB):

```bash
curl -L -o pose_landmarker_lite.task \
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task"
```

Start the backend:

```bash
uvicorn main:app --reload --port 8000
```

### 3. Frontend setup

Open a **new terminal**:

```bash
cd frontend
npm install
npm run dev
```

### 4. Use it

Open http://localhost:5173 in your browser. Drop in a reference dance video and your attempt, click **Compare Dances**, and wait for results.

## Project Structure

```
backend/
  main.py              # FastAPI endpoints (/api/compare, /api/status, /api/results)
  pose_extractor.py    # MediaPipe pose extraction (33 keypoints per frame)
  comparator.py        # DTW alignment + joint angle cosine similarity
  models.py            # Pydantic response schemas

frontend/src/
  App.jsx              # Main app — switches between upload and results views
  components/
    UploadPage.jsx     # Drag-and-drop video upload + polling
    ResultsPage.jsx    # Composes all result views
    VideoPlayer.jsx    # Side-by-side video playback with skeleton overlay
    ScoreDisplay.jsx   # Overall similarity score (0-100)
    TimelineHeatmap.jsx# Color-coded timeline with clickable segments
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/compare` | Upload two videos (multipart: `reference` + `attempt`), returns `{ job_id }` |
| GET | `/api/status/{job_id}` | Poll processing status: `pending`, `processing`, `complete`, `error` |
| GET | `/api/results/{job_id}` | Fetch comparison results (scores, keypoints, DTW path) |

## How It Works

1. **Pose extraction** — MediaPipe PoseLandmarker extracts 33 body keypoints per frame from each video
2. **Normalization** — Keypoints are centered relative to the hip midpoint
3. **Joint angles** — Converts keypoints to angles at 8 joints (elbows, shoulders, knees, hips)
4. **DTW alignment** — Dynamic Time Warping aligns the two sequences even if they're different speeds
5. **Scoring** — Cosine similarity of joint angle vectors, aggregated into an overall score (0-100) and per-segment scores

## Tech Stack

- **Frontend:** React 19 + Vite
- **Backend:** Python + FastAPI
- **Pose Estimation:** MediaPipe PoseLandmarker (CPU, 33 keypoints)
- **Comparison:** dtw-python + NumPy

## Team

Built for Hackalytics 2026 at Georgia Tech.
