import os
import cv2
import mediapipe as mp
import numpy as np
from models import FramePose, Landmark

MODEL_PATH = os.path.join(os.path.dirname(__file__), "pose_landmarker_lite.task")

PoseLandmarker = mp.tasks.vision.PoseLandmarker
PoseLandmarkerOptions = mp.tasks.vision.PoseLandmarkerOptions
RunningMode = mp.tasks.vision.RunningMode
BaseOptions = mp.tasks.BaseOptions


def extract_poses(video_path: str) -> tuple[list[FramePose], float]:
    """Extract pose landmarks from every frame of a video.

    Returns (list of FramePose, fps).
    """
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise ValueError(f"Cannot open video: {video_path}")

    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    frame_poses: list[FramePose] = []

    options = PoseLandmarkerOptions(
        base_options=BaseOptions(model_asset_path=MODEL_PATH),
        running_mode=RunningMode.VIDEO,
        num_poses=1,
        min_pose_detection_confidence=0.5,
        min_tracking_confidence=0.5,
    )

    with PoseLandmarker.create_from_options(options) as landmarker:
        frame_num = 0
        while True:
            ret, frame = cap.read()
            if not ret:
                break

            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
            timestamp_ms = int(frame_num * 1000 / fps)

            result = landmarker.detect_for_video(mp_image, timestamp_ms)

            if result.pose_landmarks and len(result.pose_landmarks) > 0:
                raw = result.pose_landmarks[0]  # first person
                landmarks = _normalize_landmarks(raw)
                frame_poses.append(
                    FramePose(
                        frame_num=frame_num,
                        timestamp=frame_num / fps,
                        landmarks=landmarks,
                    )
                )

            frame_num += 1

    cap.release()
    return frame_poses, fps


def _normalize_landmarks(raw_landmarks) -> list[Landmark]:
    """Normalize landmarks relative to the hip midpoint."""
    # MediaPipe Tasks API: landmarks are NormalizedLandmark with x, y, z, visibility
    left_hip_idx = 23
    right_hip_idx = 24
    left_hip = raw_landmarks[left_hip_idx]
    right_hip = raw_landmarks[right_hip_idx]
    # mid_x = (left_hip.x + right_hip.x) / 2
    # mid_y = (left_hip.y + right_hip.y) / 2
    # mid_z = (left_hip.z + right_hip.z) / 2

    landmarks = []
    for lm in raw_landmarks:
        landmarks.append(
            Landmark(
                # x=lm.x - mid_x,
                # y=lm.y - mid_y,
                # z=lm.z - mid_z,
                x=lm.x,
                y=lm.y,
                z=lm.z,
                visibility=getattr(lm, 'visibility', 1.0) or 1.0,
            )
        )
    return landmarks
