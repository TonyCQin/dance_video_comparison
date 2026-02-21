import numpy as np
from dtw import dtw
from models import FramePose, ComparisonResult, SegmentScore

# Use only major body joints for position similarity
POS_LANDMARKS = [
    "LEFT_SHOULDER", "RIGHT_SHOULDER",
    "LEFT_ELBOW", "RIGHT_ELBOW",
    "LEFT_WRIST", "RIGHT_WRIST",
    "LEFT_INDEX", "RIGHT_INDEX",
    "LEFT_HIP", "RIGHT_HIP",
    "LEFT_KNEE", "RIGHT_KNEE",
    "LEFT_ANKLE", "RIGHT_ANKLE",
]

# Per-position weights: wrists/hands weighted higher for expressiveness
POS_WEIGHTS = np.array([
    1.5,  # LEFT_SHOULDER
    1.5,  # RIGHT_SHOULDER
    2.0,  # LEFT_ELBOW
    2.0,  # RIGHT_ELBOW
    3.0,  # LEFT_WRIST
    3.0,  # RIGHT_WRIST
    2.5,  # LEFT_INDEX
    2.5,  # RIGHT_INDEX
    1.0,  # LEFT_HIP
    1.0,  # RIGHT_HIP
    1.5,  # LEFT_KNEE
    1.5,  # RIGHT_KNEE
    1.5,  # LEFT_ANKLE
    1.5,  # RIGHT_ANKLE
])

def _normalize_landmarks(landmarks):
    # Normalize by subtracting hip center and dividing by shoulder-hip distance (torso size)
    left_hip = np.array([landmarks[_NAME_TO_IDX["LEFT_HIP"]].x, landmarks[_NAME_TO_IDX["LEFT_HIP"]].y, landmarks[_NAME_TO_IDX["LEFT_HIP"]].z])
    right_hip = np.array([landmarks[_NAME_TO_IDX["RIGHT_HIP"]].x, landmarks[_NAME_TO_IDX["RIGHT_HIP"]].y, landmarks[_NAME_TO_IDX["RIGHT_HIP"]].z])
    left_shoulder = np.array([landmarks[_NAME_TO_IDX["LEFT_SHOULDER"]].x, landmarks[_NAME_TO_IDX["LEFT_SHOULDER"]].y, landmarks[_NAME_TO_IDX["LEFT_SHOULDER"]].z])
    right_shoulder = np.array([landmarks[_NAME_TO_IDX["RIGHT_SHOULDER"]].x, landmarks[_NAME_TO_IDX["RIGHT_SHOULDER"]].y, landmarks[_NAME_TO_IDX["RIGHT_SHOULDER"]].z])
    hip_center = (left_hip + right_hip) / 2
    shoulder_center = (left_shoulder + right_shoulder) / 2
    torso_size = np.linalg.norm(shoulder_center - hip_center) + 1e-8
    # Only use selected landmarks
    normed = [(np.array([landmarks[_NAME_TO_IDX[name]].x, landmarks[_NAME_TO_IDX[name]].y, landmarks[_NAME_TO_IDX[name]].z]) - hip_center) / torso_size for name in POS_LANDMARKS]
    return np.stack(normed)

# Joint triplets for angle computation: (parent, joint, child)
ANGLE_JOINTS = [
    ("LEFT_SHOULDER", "LEFT_ELBOW", "LEFT_WRIST"),
    ("RIGHT_SHOULDER", "RIGHT_ELBOW", "RIGHT_WRIST"),
    ("LEFT_ELBOW", "LEFT_WRIST", "LEFT_INDEX"),  # Wrist angle
    ("RIGHT_ELBOW", "RIGHT_WRIST", "RIGHT_INDEX"),  # Wrist angle
    ("LEFT_HIP", "LEFT_SHOULDER", "LEFT_ELBOW"),
    ("RIGHT_HIP", "RIGHT_SHOULDER", "RIGHT_ELBOW"),
    ("LEFT_HIP", "LEFT_KNEE", "LEFT_ANKLE"),
    ("RIGHT_HIP", "RIGHT_KNEE", "RIGHT_ANKLE"),
    ("LEFT_SHOULDER", "LEFT_HIP", "LEFT_KNEE"),
    ("RIGHT_SHOULDER", "RIGHT_HIP", "RIGHT_KNEE"),
    ("LEFT_SHOULDER", "RIGHT_SHOULDER", "RIGHT_HIP"),  # Torso angle
    ("RIGHT_SHOULDER", "LEFT_SHOULDER", "LEFT_HIP"),  # Torso angle
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

# Per-angle weights: elbows/knees/shoulders weighted higher
ANGLE_WEIGHTS = np.array([
    2.5,  # LEFT_ELBOW
    2.5,  # RIGHT_ELBOW
    2.0,  # LEFT_WRIST
    2.0,  # RIGHT_WRIST
    3.0,  # LEFT_SHOULDER
    3.0,  # RIGHT_SHOULDER
    3.5,  # LEFT_KNEE
    3.5,  # RIGHT_KNEE
    1.0,  # LEFT_HIP
    1.0,  # RIGHT_HIP
    1.5,  # RIGHT_SHOULDER (torso)
    1.5,  # LEFT_SHOULDER (torso)
])


def _cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    dot = np.dot(a, b)
    norm = np.linalg.norm(a) * np.linalg.norm(b) + 1e-8
    return float(np.clip(dot / norm, -1, 1))


def _body_level_score(landmarks: list) -> float:
    """Calculate body compactness (0 = extended/standing, 1 = compact/floor) based on body span."""
    # Get extremes
    left_shoulder_y = landmarks[_NAME_TO_IDX["LEFT_SHOULDER"]].y
    right_shoulder_y = landmarks[_NAME_TO_IDX["RIGHT_SHOULDER"]].y
    left_ankle_y = landmarks[_NAME_TO_IDX["LEFT_ANKLE"]].y
    right_ankle_y = landmarks[_NAME_TO_IDX["RIGHT_ANKLE"]].y
    left_wrist_y = landmarks[_NAME_TO_IDX["LEFT_WRIST"]].y
    right_wrist_y = landmarks[_NAME_TO_IDX["RIGHT_WRIST"]].y
    
    shoulder_y = (left_shoulder_y + right_shoulder_y) / 2
    ankle_y = (left_ankle_y + right_ankle_y) / 2
    wrist_y = (left_wrist_y + right_wrist_y) / 2
    
    # Vertical span from highest to lowest point
    min_y = min(shoulder_y, ankle_y, wrist_y)
    max_y = max(shoulder_y, ankle_y, wrist_y)
    vertical_span = max_y - min_y
    
    # Standing = large span (~0.5-0.7), Floor = small span (~0.2-0.4)
    return float(vertical_span)


def _knee_hip_distance(landmarks: list) -> float:
    """Calculate average vertical distance from knees to hips. Small value = kneeling/floor."""
    left_hip_y = landmarks[_NAME_TO_IDX["LEFT_HIP"]].y
    right_hip_y = landmarks[_NAME_TO_IDX["RIGHT_HIP"]].y
    left_knee_y = landmarks[_NAME_TO_IDX["LEFT_KNEE"]].y
    right_knee_y = landmarks[_NAME_TO_IDX["RIGHT_KNEE"]].y
    
    hip_y = (left_hip_y + right_hip_y) / 2
    knee_y = (left_knee_y + right_knee_y) / 2
    
    # Distance (positive = knees below hips = standing/normal)
    distance = knee_y - hip_y
    return float(distance)


def _wrist_hip_distance(landmarks: list) -> float:
    """Calculate average vertical distance from wrists to hips. Negative = hands on floor."""
    left_hip_y = landmarks[_NAME_TO_IDX["LEFT_HIP"]].y
    right_hip_y = landmarks[_NAME_TO_IDX["RIGHT_HIP"]].y
    left_wrist_y = landmarks[_NAME_TO_IDX["LEFT_WRIST"]].y
    right_wrist_y = landmarks[_NAME_TO_IDX["RIGHT_WRIST"]].y
    
    hip_y = (left_hip_y + right_hip_y) / 2
    wrist_y = (left_wrist_y + right_wrist_y) / 2
    
    # Distance (positive = wrists below hips, negative = wrists above/on floor near hips)
    distance = wrist_y - hip_y
    return float(distance)


def _motion_magnitude(landmarks1: list, landmarks2: list) -> float:
    """Calculate total motion between two frames by measuring landmark displacement."""
    # Key points for motion tracking
    key_points = ["LEFT_WRIST", "RIGHT_WRIST", "LEFT_ELBOW", "RIGHT_ELBOW",
                  "LEFT_KNEE", "RIGHT_KNEE", "LEFT_ANKLE", "RIGHT_ANKLE"]
    
    total_displacement = 0.0
    for point in key_points:
        idx = _NAME_TO_IDX[point]
        x1, y1 = landmarks1[idx].x, landmarks1[idx].y
        x2, y2 = landmarks2[idx].x, landmarks2[idx].y
        displacement = np.sqrt((x2 - x1)**2 + (y2 - y1)**2)
        total_displacement += displacement
    
    return float(total_displacement / len(key_points))  # Average displacement


def _spine_angle_to_vertical(landmarks: list) -> float:
    """Calculate the angle of the spine relative to vertical (gravity).
    
    Returns angle in degrees where:
    - 0° = perfectly upright (standing)
    - 90° = horizontal (laying down/floor work)
    - 180° = upside down (handstand)
    """
    # Shoulder midpoint
    left_shoulder = landmarks[_NAME_TO_IDX["LEFT_SHOULDER"]]
    right_shoulder = landmarks[_NAME_TO_IDX["RIGHT_SHOULDER"]]
    mid_shoulder_x = (left_shoulder.x + right_shoulder.x) / 2
    mid_shoulder_y = (left_shoulder.y + right_shoulder.y) / 2
    
    # Hip midpoint
    left_hip = landmarks[_NAME_TO_IDX["LEFT_HIP"]]
    right_hip = landmarks[_NAME_TO_IDX["RIGHT_HIP"]]
    mid_hip_x = (left_hip.x + right_hip.x) / 2
    mid_hip_y = (left_hip.y + right_hip.y) / 2
    
    # Spine vector (from hip to shoulder)
    spine_x = mid_shoulder_x - mid_hip_x
    spine_y = mid_shoulder_y - mid_hip_y
    
    # Vertical reference vector (pointing up in image coordinates, Y decreases upward)
    # In MediaPipe, Y increases downward, so upward is negative Y direction
    vertical_x = 0
    vertical_y = -1
    
    # Calculate angle using dot product
    dot_product = spine_x * vertical_x + spine_y * vertical_y
    spine_magnitude = np.sqrt(spine_x**2 + spine_y**2)
    vertical_magnitude = 1.0  # Unit vector
    
    # Avoid division by zero
    if spine_magnitude < 1e-6:
        return 0.0
    
    # Cosine of angle
    cos_angle = dot_product / (spine_magnitude * vertical_magnitude)
    cos_angle = np.clip(cos_angle, -1.0, 1.0)  # Clamp to valid range
    
    # Convert to degrees
    angle_rad = np.arccos(cos_angle)
    angle_deg = np.degrees(angle_rad)
    
    return float(angle_deg)


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
    weights = {'angle': 0.40, 'position': 0.25, 'spine': 0.20, 'motion': 0.15}  # Total = 1.0
    angle_similarities_raw = []
    angle_similarities_scaled = []
    pos_similarities_raw = []
    pos_similarities_scaled = []
    spine_similarities_raw = []
    spine_similarities_scaled = []
    motion_similarities_raw = []
    motion_similarities_scaled = []
    for ri, ui in path:
        # Angle similarity (weighted)
        ref_vec = ref_angles[ri].reshape(len(ANGLE_WEIGHTS), 2)
        user_vec = user_angles[ui].reshape(len(ANGLE_WEIGHTS), 2)
        per_angle_sims = np.array([_cosine_similarity(ref_vec[i], user_vec[i]) for i in range(len(ANGLE_WEIGHTS))])
        per_angle_sims_01 = np.clip((per_angle_sims + 1) / 2, 0, 1)
        weighted_angle_sim_raw = np.average(per_angle_sims_01, weights=ANGLE_WEIGHTS)
        # Harsh scaling: 94%+ stays as is, below 94% drops harshly
        if weighted_angle_sim_raw >= 0.94:
            weighted_angle_sim = weighted_angle_sim_raw
        else:
            # Very harsh penalty below 94% (90% → ~40%)
            weighted_angle_sim = weighted_angle_sim_raw ** 6
        # Position similarity (normalized keypoints with weighting)
        ref_norm = _normalize_landmarks(ref_poses[ri].landmarks)
        user_norm = _normalize_landmarks(user_poses[ui].landmarks)
        per_landmark_errors = np.sum((ref_norm - user_norm) ** 2, axis=1)  # Error per landmark
        weighted_mse = np.average(per_landmark_errors, weights=POS_WEIGHTS)
        sim_pos_01 = 1 / (1 + np.exp(5 * (weighted_mse - 2.5)))  # Sigmoid: high for mse < 2.5, gentler drop after
        
        # Spine angle similarity (global orientation relative to gravity)
        ref_spine_angle = _spine_angle_to_vertical(ref_poses[ri].landmarks)
        user_spine_angle = _spine_angle_to_vertical(user_poses[ui].landmarks)
        spine_angle_diff = abs(ref_spine_angle - user_spine_angle)  # Difference in degrees
        # Small differences (<1°) are essentially identical (floating point precision)
        if spine_angle_diff < 1.0:
            spine_sim_raw = 1.0
        else:
            spine_sim_raw = 1 / (1 + np.exp(0.1 * (spine_angle_diff - 20)))  # Sigmoid: 20° threshold
        # Note: Penalty will be applied after checking overall alignment ratio
        
        # Motion similarity (compare movement magnitude)
        # Calculate motion for both videos if not first frame
        if ri > 0 and ui > 0:
            ref_motion = _motion_magnitude(ref_poses[ri-1].landmarks, ref_poses[ri].landmarks)
            user_motion = _motion_magnitude(user_poses[ui-1].landmarks, user_poses[ui].landmarks)
            motion_diff = abs(ref_motion - user_motion)
            motion_sim_raw = 1 / (1 + np.exp(100 * (motion_diff - 0.05)))  # Sigmoid: 0.05 threshold
        else:
            motion_sim_raw = 1.0  # First frame has no motion to compare
        
        # Apply harsh penalty below 85% threshold
        if motion_sim_raw >= 0.85:
            motion_sim = motion_sim_raw
        else:
            motion_sim = motion_sim_raw ** 4
        
        # Store raw similarities (scaled versions computed after alignment check)
        angle_similarities_raw.append(weighted_angle_sim_raw)
        angle_similarities_scaled.append(weighted_angle_sim)
        pos_similarities_raw.append(weighted_mse)
        pos_similarities_scaled.append(sim_pos_01)
        spine_similarities_raw.append(spine_sim_raw)
        motion_similarities_raw.append(motion_sim_raw)
        motion_similarities_scaled.append(motion_sim)

    overall_score = float(np.mean(pair_scores))
    
    # Check overall spine alignment: if average raw >70%, give full 15% credit
    avg_spine_raw = float(np.mean(spine_similarities_raw)) if spine_similarities_raw else 0
    
    if avg_spine_raw >= 0.70:
        # Good overall spine alignment - give full weight contribution (15 points out of 100)
        spine_weight_contribution = weights['spine'] * 100  # 15 points
        spine_similarities_scaled = [1.0] * len(spine_similarities_raw)
    else:
        # Poor spine alignment - use actual scaled values (apply penalties)
        spine_weight_contribution = None  # Will be calculated from actual scores
        spine_similarities_scaled = []
        for spine_sim_raw in spine_similarities_raw:
            if spine_sim_raw >= 0.85:
                spine_similarities_scaled.append(spine_sim_raw)
            else:
                spine_similarities_scaled.append(spine_sim_raw ** 4)
    
    # Check overall motion alignment: if average raw >90%, give full 10% credit
    avg_motion_raw = float(np.mean(motion_similarities_raw)) if motion_similarities_raw else 0
    
    if avg_motion_raw >= 0.90:
        # Good overall motion match - give full weight contribution (10 points out of 100)
        motion_weight_contribution = weights['motion'] * 100  # 10 points
        motion_similarities_scaled = [1.0] * len(motion_similarities_raw)
    else:
        # Poor motion match - use actual scaled values (already computed with penalties)
        motion_weight_contribution = None  # Will be calculated from actual scores
        # motion_similarities_scaled already has penalties applied
    
    # Recalculate pair scores with adjusted spine and motion scaling
    pair_scores = []
    for i in range(len(angle_similarities_scaled)):
        # Calculate component contributions
        angle_contrib = weights['angle'] * angle_similarities_scaled[i]
        pos_contrib = weights['position'] * pos_similarities_scaled[i]
        
        # Use override if threshold met, otherwise use actual score
        if spine_weight_contribution is not None:
            spine_contrib = spine_weight_contribution / 100  # Convert back to 0-1 scale
        else:
            spine_contrib = weights['spine'] * spine_similarities_scaled[i]
            
        if motion_weight_contribution is not None:
            motion_contrib = motion_weight_contribution / 100  # Convert back to 0-1 scale
        else:
            motion_contrib = weights['motion'] * motion_similarities_scaled[i]
        
        sim_final = angle_contrib + pos_contrib + spine_contrib + motion_contrib
        pair_scores.append(sim_final * 100)
    
    overall_score = float(np.mean(pair_scores))
    
    # For debug: per-segment angle/pos/spine/motion similarity (raw and scaled)
    segment_angle_sims_raw = []
    segment_angle_sims_scaled = []
    segment_pos_sims_raw = []
    segment_pos_sims_scaled = []
    segment_spine_sims_raw = []
    segment_spine_sims_scaled = []
    segment_motion_sims_raw = []
    segment_motion_sims_scaled = []
    

    # Find worst 5 moments globally (lowest joint similarity across all DTW pairs)
    def find_worst_moments(ref_poses, user_poses, path, n=5):
        moments = []
        for idx, (ri, ui) in enumerate(path):
            ref_lm = ref_poses[ri].landmarks
            usr_lm = user_poses[ui].landmarks
            worst_joint = None
            worst_score = 100.0
            for triplet in ANGLE_JOINTS:
                ref_a = _angle_vector(ref_lm, triplet)
                usr_a = _angle_vector(usr_lm, triplet)
                sim = _cosine_similarity(ref_a, usr_a)
                score = max(0, (sim + 1) / 2) * 100
                if score < worst_score:
                    worst_score = score
                    worst_joint = triplet[1]
            moments.append({
                'joint': worst_joint,
                'score': round(worst_score, 1),
                'ref_frame': ri,
                'user_frame': ui,
                'timestamp': ref_poses[ri].timestamp
            })
        # Sort by score ascending, pick worst n
        moments_sorted = sorted(moments, key=lambda m: m['score'])[:n]
        return moments_sorted

    worst_moments = find_worst_moments(ref_poses, user_poses, path, n=5)

    # Extended list: all moments with error below threshold (score < 95%)
    def find_extended_moments(ref_poses, user_poses, path, threshold=95.0):
        moments = []
        for idx, (ri, ui) in enumerate(path):
            ref_lm = ref_poses[ri].landmarks
            usr_lm = user_poses[ui].landmarks
            worst_joint = None
            worst_score = 100.0
            for triplet in ANGLE_JOINTS:
                ref_a = _angle_vector(ref_lm, triplet)
                usr_a = _angle_vector(usr_lm, triplet)
                sim = _cosine_similarity(ref_a, usr_a)
                score = max(0, (sim + 1) / 2) * 100
                if score < worst_score:
                    worst_score = score
                    worst_joint = triplet[1]
            if worst_score < threshold:
                moments.append({
                    'joint': worst_joint,
                    'score': round(worst_score, 1),
                    'ref_frame': ri,
                    'user_frame': ui,
                    'timestamp': ref_poses[ri].timestamp
                })
        return moments

    extended_moments = find_extended_moments(ref_poses, user_poses, path, threshold=70.0)

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
<<<<<<< Updated upstream

            # Find matching timestamps in user video
            user_indices = [ui for _, _, ui in seg_pairs]
            u_start = user_poses[min(user_indices)].timestamp
            u_end = user_poses[max(user_indices)].timestamp
            
            print(f"DEBUG: Segment {seg_start:.2f}s-{seg_end:.2f}s aligned to user video at {u_start:.2f}s-{u_end:.2f}s")

            # Find problem joints for this segment
=======
            seg_angle_raw = float(np.mean([angle_similarities_raw[i] for i, _, _ in seg_pairs]))
            seg_pos_raw = float(np.mean([pos_similarities_raw[i] for i, _, _ in seg_pairs]))
            seg_spine_raw = float(np.mean([spine_similarities_raw[i] for i, _, _ in seg_pairs]))
            seg_spine_scaled = float(np.mean([spine_similarities_scaled[i] for i, _, _ in seg_pairs]))
            seg_motion_raw = float(np.mean([motion_similarities_raw[i] for i, _, _ in seg_pairs]))
            if seg_angle_raw >= 0.94:
                seg_angle_scaled = seg_angle_raw
            else:
                seg_angle_scaled = seg_angle_raw ** 6
            seg_pos_scaled = 1 / (1 + np.exp(5 * (seg_pos_raw - 2.5)))
            if seg_motion_raw >= 0.85:
                seg_motion_scaled = seg_motion_raw
            else:
                seg_motion_scaled = seg_motion_raw ** 4
            segment_angle_sims_raw.append(seg_angle_raw)
            segment_angle_sims_scaled.append(seg_angle_scaled)
            segment_pos_sims_raw.append(seg_pos_raw)
            segment_pos_sims_scaled.append(seg_pos_scaled)
            segment_spine_sims_raw.append(seg_spine_raw)
            segment_spine_sims_scaled.append(seg_spine_scaled)
            segment_motion_sims_raw.append(seg_motion_raw)
            segment_motion_sims_scaled.append(seg_motion_scaled)
>>>>>>> Stashed changes
            problem_joints = _find_problem_joints(
                ref_poses, user_poses, seg_pairs, threshold=70
            )
        else:
            seg_score = 0.0
            u_start = 0.0
            u_end = 0.0
            problem_joints = []
            segment_angle_sims_raw.append(0.0)
            segment_angle_sims_scaled.append(0.0)
            segment_pos_sims_raw.append(0.0)
            segment_pos_sims_scaled.append(0.0)
            segment_spine_sims_raw.append(0.0)
            segment_spine_sims_scaled.append(0.0)
            segment_motion_sims_raw.append(0.0)
            segment_motion_sims_scaled.append(0.0)

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

    # Attach debug info for frontend
    debug = {
        'segment_angle_sims_raw': segment_angle_sims_raw,
        'segment_angle_sims_scaled': segment_angle_sims_scaled,
        'segment_pos_sims_raw': segment_pos_sims_raw,
        'segment_pos_sims_scaled': segment_pos_sims_scaled,
        'segment_spine_sims_raw': segment_spine_sims_raw,
        'segment_spine_sims_scaled': segment_spine_sims_scaled,
        'segment_motion_sims_raw': segment_motion_sims_raw,
        'segment_motion_sims_scaled': segment_motion_sims_scaled,
    }
    return ComparisonResult(
        overall_score=round(overall_score, 1),
        segment_scores=segment_scores,
        ref_keypoints=ref_kp,
        user_keypoints=user_kp,
        dtw_path=path,
        ref_fps=ref_fps,
        user_fps=user_fps,
        debug=debug,
        worst_moments=worst_moments,
        extended_moments=extended_moments,
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

    # Find the N most offset joints (lowest average similarity)
    joint_means = {joint: np.mean(scores) if scores else 100.0 for joint, scores in joint_errors.items()}
    sorted_joints = sorted(joint_means.items(), key=lambda x: x[1])
    # Output top 3 most offset joints
    result = []
    for joint, mean in sorted_joints[:3]:
        scores = joint_errors[joint]
        if scores:
            min_score = min(scores)
            min_idx = scores.index(min_score)
            if min_idx < len(seg_pairs):
                seg_pair = seg_pairs[min_idx]
                ref_frame = seg_pair[1]
            else:
                ref_frame = None
            result.append({
                'joint': joint,
                'mean': round(mean, 1),
                'min_score': round(min_score, 1),
                'ref_frame': ref_frame
            })
    # Optionally, check for paired joints (e.g., both elbows, both knees)
    pairs = [("LEFT_ELBOW", "RIGHT_ELBOW"), ("LEFT_KNEE", "RIGHT_KNEE"), ("LEFT_WRIST", "RIGHT_WRIST")]
    for j1, j2 in pairs:
        if j1 in joint_means and j2 in joint_means:
            if joint_means[j1] < 80 and joint_means[j2] < 80:
                result.append({
                    'joint': f'{j1},{j2}',
                    'mean': (round(joint_means[j1], 1), round(joint_means[j2], 1)),
                    'min_score': (round(min(joint_errors[j1]), 1), round(min(joint_errors[j2]), 1)),
                    'ref_frame': (seg_pairs[joint_errors[j1].index(min(joint_errors[j1]))][1], seg_pairs[joint_errors[j2].index(min(joint_errors[j2]))][1])
                })
    return result
