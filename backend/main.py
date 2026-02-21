import os
import uuid
import tempfile
import threading

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from models import JobStatus, ComparisonResult
from pose_extractor import extract_poses
from comparator import compare_dances

app = FastAPI(title="DanceCompare API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory job store
jobs: dict[str, dict] = {}


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/compare")
async def compare(
    reference: UploadFile = File(...),
    attempt: UploadFile = File(...),
):
    job_id = str(uuid.uuid4())
    jobs[job_id] = {"status": "pending", "message": "Queued", "result": None}

    # Save uploads to temp files
    tmp_dir = tempfile.mkdtemp()
    ref_path = os.path.join(tmp_dir, f"ref_{reference.filename}")
    att_path = os.path.join(tmp_dir, f"att_{attempt.filename}")

    with open(ref_path, "wb") as f:
        f.write(await reference.read())
    with open(att_path, "wb") as f:
        f.write(await attempt.read())

    # Process in background thread
    thread = threading.Thread(
        target=_process_job, args=(job_id, ref_path, att_path)
    )
    thread.start()

    return {"job_id": job_id}


def _process_job(job_id: str, ref_path: str, att_path: str):
    try:
        jobs[job_id]["status"] = "processing"
        jobs[job_id]["message"] = "Extracting poses from reference video..."

        ref_poses, ref_fps = extract_poses(ref_path)
        if not ref_poses:
            raise ValueError("No person detected in reference video")

        jobs[job_id]["message"] = "Extracting poses from attempt video..."
        user_poses, user_fps = extract_poses(att_path)
        if not user_poses:
            raise ValueError("No person detected in attempt video")

        jobs[job_id]["message"] = "Comparing dances..."
        result = compare_dances(ref_poses, user_poses, ref_fps, user_fps)

        jobs[job_id]["status"] = "complete"
        jobs[job_id]["message"] = "Done"
        jobs[job_id]["result"] = result
    except Exception as e:
        jobs[job_id]["status"] = "error"
        jobs[job_id]["message"] = str(e)
    finally:
        # Clean up temp files
        for p in (ref_path, att_path):
            try:
                os.remove(p)
            except OSError:
                pass


@app.get("/api/status/{job_id}")
def get_status(job_id: str):
    if job_id not in jobs:
        raise HTTPException(status_code=404, detail="Job not found")
    job = jobs[job_id]
    return JobStatus(job_id=job_id, status=job["status"], message=job["message"])


@app.get("/api/results/{job_id}")
def get_results(job_id: str):
    if job_id not in jobs:
        raise HTTPException(status_code=404, detail="Job not found")
    job = jobs[job_id]
    if job["status"] != "complete":
        raise HTTPException(status_code=400, detail=f"Job not complete: {job['status']}")
    return job["result"]
