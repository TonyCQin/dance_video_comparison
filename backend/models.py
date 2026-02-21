from pydantic import BaseModel


class Landmark(BaseModel):
    x: float
    y: float
    z: float
    visibility: float


class FramePose(BaseModel):
    frame_num: int
    timestamp: float
    landmarks: list[Landmark]


class JointScore(BaseModel):
    joint_name: str
    score: float


class SegmentScore(BaseModel):
    start_time: float
    end_time: float
    user_start_time: float  # Added for DTW alignment
    user_end_time: float    # Added for DTW alignment
    score: float
    problem_joints: list[str]


class ComparisonResult(BaseModel):
    overall_score: float
    segment_scores: list[SegmentScore]
    ref_keypoints: list[list[list[float]]]   # [frame][landmark][x,y,z]
    user_keypoints: list[list[list[float]]]   # [frame][landmark][x,y,z]
    dtw_path: list[list[int]]                 # [[ref_idx, user_idx], ...]
    ref_fps: float
    user_fps: float


class JobStatus(BaseModel):
    job_id: str
    status: str  # pending, processing, complete, error
    message: str = ""
