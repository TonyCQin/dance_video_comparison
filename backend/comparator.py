import numpy as np
from dtw import dtw
from models import FramePose, ComparisonResult, SegmentScore

# Joint triplets for angle computation: (parent, joint, child)
ANGLE_JOINTS = [
    ("LEFT_SHOULDER", "LEFT_ELBOW", "LEFT_WRIST"),
    ("RIGHT_SHOULDER", "RIGHT_ELBOW", "RIGHT_WRIST"),
    ("LEFT_HIP", "LEFT_SHOULDER", "LEFT_ELBOW"),
    ("RIGHT_HIP", "RIGHT_SHOULDER", "RIGHT_ELBOW"),
    ("LEFT_HIP", "LEFT_KNEE", "LEFT_ANKLE"),
    ("RIGHT_HIP", "RIGHT_KNEE", "RIGHT_ANKLE"),
    ("LEFT_SHOULDER", "LEFT_HIP", "LEFT_KNEE"),
    ("RIGHT_SHOULDER", "RIGHT_HIP", "RIGHT_KNEE"),
]

# MediaPipe Pose landmark indices
LANDMARK_NAMES = [
    "NOSE", "LEFT_EYE_INNER", "LEFT_EYE", "LEFT_EYE_OUTER",
    "RIGHT_EYE_INNER", "RIGHT_EYE", "RIGHT_EYE_OUTER",
    "LEFT_EAR", "RIGHT_EAR", "MOUTH_LEFT", "MOUTH_RIGHT",
    "LEFT_SHOULDER", "RIGHT_SHOULDER", "LEFT_ELBOW", "RIGHT_ELBOW",
    "LEFT_WRIST", "RIGHT_WRIST", "LEFT_PINKY", "RIGHT_PINKY",
    "LEFT_INDEX", "RIGHT_INDEX", "LEFT_THUMB", "RIGHT_THUMB",
    "LEFT_HIP", "RIGHT_HIP", "LEFT_KNEE", "RIGHT_KNEE",
    "LEFT_ANKLE", "RIGHT_ANKLE", "LEFT_HEEL", "RIGHT_HEEL",
    "LEFT_FOOT_INDEX", "RIGHT_FOOT_INDEX",
]

_NAME_TO_IDX = {name: i for i, name in enumerate(LANDMARK_NAMES)}


def _angle_vector(landmarks: list, triplet: tuple[str, str, str]) -> np.ndarray:
    """Compute the angle at the middle joint of a triplet, returned as [cos, sin]."""
    a = np.array([landmarks[_NAME_TO_IDX[triplet[0]]].x,
                   landmarks[_NAME_TO_IDX[triplet[0]]].y,
                   landmarks[_NAME_TO_IDX[triplet[0]]].z])
    b = np.array([landmarks[_NAME_TO_IDX[triplet[1]]].x,
                   landmarks[_NAME_TO_IDX[triplet[1]]].y,
                   landmarks[_NAME_TO_IDX[triplet[1]]].z])
    c = np.array([landmarks[_NAME_TO_IDX[triplet[2]]].x,
                   landmarks[_NAME_TO_IDX[triplet[2]]].y,
                   landmarks[_NAME_TO_IDX[triplet[2]]].z])
    ba = a - b
    bc = c - b
    cos_angle = np.dot(ba, bc) / (np.linalg.norm(ba) * np.linalg.norm(bc) + 1e-8)
    cos_angle = np.clip(cos_angle, -1, 1)
    sin_angle = np.sqrt(1 - cos_angle ** 2)
    return np.array([cos_angle, sin_angle])


def _frame_to_angle_vector(landmarks: list) -> np.ndarray:
    """Convert one frame's landmarks into a concatenated angle vector."""
    angles = []
    for triplet in ANGLE_JOINTS:
        angles.append(_angle_vector(landmarks, triplet))
    return np.concatenate(angles)


def _cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    dot = np.dot(a, b)
    norm = np.linalg.norm(a) * np.linalg.norm(b) + 1e-8
    return float(np.clip(dot / norm, -1, 1))


def compare_dances(
    ref_poses: list[FramePose],
    user_poses: list[FramePose],
    ref_fps: float,
    user_fps: float,
    segment_duration: float = 2.5,
) -> ComparisonResult:
    """Compare two dance sequences using DTW + joint angle cosine similarity."""

    # Build angle matrices
    ref_angles = np.array([_frame_to_angle_vector(fp.landmarks) for fp in ref_poses])
    user_angles = np.array([_frame_to_angle_vector(fp.landmarks) for fp in user_poses])

    # DTW alignment
    alignment = dtw(ref_angles, user_angles, dist_method="cosine")
    path = list(zip(alignment.index1.tolist(), alignment.index2.tolist()))

    # Per-aligned-pair similarity
    pair_scores = []
    for ri, ui in path:
        sim = _cosine_similarity(ref_angles[ri], user_angles[ui])
        score = max(0, (sim + 1) / 2) * 100  # map [-1,1] → [0,100]
        pair_scores.append(score)

    overall_score = float(np.mean(pair_scores))

    # Per-segment scores based on reference timestamps
    ref_duration = ref_poses[-1].timestamp if ref_poses else 0
    segment_scores: list[SegmentScore] = []
    seg_start = 0.0

    while seg_start < ref_duration:
        seg_end = min(seg_start + segment_duration, ref_duration)
        seg_pairs = [
            (i, ri, ui)
            for i, (ri, ui) in enumerate(path)
            if seg_start <= ref_poses[ri].timestamp < seg_end
        ]

        if seg_pairs:
            seg_pair_scores = [pair_scores[i] for i, _, _ in seg_pairs]
            seg_score = float(np.mean(seg_pair_scores))

            # Find matching timestamps in user video
            user_indices = [ui for _, _, ui in seg_pairs]
            u_start = user_poses[min(user_indices)].timestamp
            u_end = user_poses[max(user_indices)].timestamp
            
            print(f"DEBUG: Segment {seg_start:.2f}s-{seg_end:.2f}s aligned to user video at {u_start:.2f}s-{u_end:.2f}s")

            # Find problem joints for this segment
            problem_joints = _find_problem_joints(
                ref_poses, user_poses, seg_pairs, threshold=70
            )
        else:
            seg_score = 0.0
            u_start = 0.0
            u_end = 0.0
            problem_joints = []

        segment_scores.append(
            SegmentScore(
                start_time=seg_start,
                end_time=seg_end,
                user_start_time=u_start,
                user_end_time=u_end,
                score=round(seg_score, 1),
                problem_joints=problem_joints,
            )
        )
        seg_start = seg_end

    # Flatten keypoints for JSON transfer
    ref_kp = [
        [[lm.x, lm.y, lm.z] for lm in fp.landmarks] for fp in ref_poses
    ]
    user_kp = [
        [[lm.x, lm.y, lm.z] for lm in fp.landmarks] for fp in user_poses
    ]

    return ComparisonResult(
        overall_score=round(overall_score, 1),
        segment_scores=segment_scores,
        ref_keypoints=ref_kp,
        user_keypoints=user_kp,
        dtw_path=path,
        ref_fps=ref_fps,
        user_fps=user_fps,
    )


def _find_problem_joints(
    ref_poses, user_poses, seg_pairs, threshold=70
) -> list[str]:
    """Identify joints with high deviation in a segment."""
    joint_errors: dict[str, list[float]] = {
        triplet[1]: [] for triplet in ANGLE_JOINTS
    }

    for _, ri, ui in seg_pairs:
        ref_lm = ref_poses[ri].landmarks
        usr_lm = user_poses[ui].landmarks
        for triplet in ANGLE_JOINTS:
            ref_a = _angle_vector(ref_lm, triplet)
            usr_a = _angle_vector(usr_lm, triplet)
            sim = _cosine_similarity(ref_a, usr_a)
            score = max(0, (sim + 1) / 2) * 100
            joint_errors[triplet[1]].append(score)

    problems = []
    for joint, scores in joint_errors.items():
        if scores and np.mean(scores) < threshold:
            problems.append(joint)
    return problems
