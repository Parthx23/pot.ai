import math
import numpy as np
from typing import List, Dict, Optional, Tuple
from shared.models import NormalizedDetection, BoundingBox

def calculate_iou(boxA: BoundingBox, boxB: BoundingBox) -> float:
    xA = max(boxA.x1, boxB.x1)
    yA = max(boxA.y1, boxB.y1)
    xB = min(boxA.x2, boxB.x2)
    yB = min(boxA.y2, boxB.y2)

    interWidth = max(0.0, xB - xA)
    interHeight = max(0.0, yB - yA)
    interArea = interWidth * interHeight

    areaA = boxA.area
    areaB = boxB.area
    unionArea = areaA + areaB - interArea

    if unionArea <= 0:
        return 0.0
    return interArea / unionArea


class ActiveTrack:
    def __init__(self, initial_det: NormalizedDetection, frame_index: int):
        self.track_id = f"trk_{initial_det.id}"
        self.type = initial_det.type
        self.detections: List[NormalizedDetection] = [initial_det]
        self.start_frame = frame_index
        self.last_frame = frame_index
        self.best_detection: NormalizedDetection = initial_det
        self.current_bbox = initial_det.bbox

    def update(self, det: NormalizedDetection, frame_index: int):
        self.detections.append(det)
        self.last_frame = frame_index
        self.current_bbox = det.bbox
        # Pick the detection with the highest confidence as the best evidence frame
        if det.confidence > self.best_detection.confidence:
            self.best_detection = det

    @property
    def frame_count(self) -> int:
        return len(self.detections)


class TemporalFrameTracker:
    """
    Prevents 20 consecutive frames of the same defect from generating 20 separate issues.
    Tracks objects frame-by-frame using IoU and temporal persistence,
    consolidating them into a single canonical detection event.
    """
    def __init__(self, iou_threshold: float = 0.25, max_age_frames: int = 15):
        self.iou_threshold = iou_threshold
        self.max_age_frames = max_age_frames
        self.active_tracks: List[ActiveTrack] = []
        self.completed_tracks: List[ActiveTrack] = []

    def update(
        self,
        frame_detections: List[NormalizedDetection],
        frame_index: int
    ) -> List[NormalizedDetection]:
        """
        Updates active tracks with detections from the current frame.
        Returns any finalized detections that have exited the camera frame.
        """
        matched_tracks = set()
        matched_dets = set()

        # Match current detections with active tracks
        for d_idx, det in enumerate(frame_detections):
            best_iou = 0.0
            best_track_idx = -1

            for t_idx, track in enumerate(self.active_tracks):
                if t_idx in matched_tracks:
                    continue
                # Only match if same defect type category
                if track.type == det.type:
                    iou = calculate_iou(det.bbox, track.current_bbox)
                    if iou > self.iou_threshold and iou > best_iou:
                        best_iou = iou
                        best_track_idx = t_idx

            if best_track_idx >= 0:
                self.active_tracks[best_track_idx].update(det, frame_index)
                matched_tracks.add(best_track_idx)
                matched_dets.add(d_idx)

        # Unmatched detections start new tracks
        for d_idx, det in enumerate(frame_detections):
            if d_idx not in matched_dets:
                new_track = ActiveTrack(det, frame_index)
                self.active_tracks.append(new_track)

        # Check for expired tracks (object moved out of frame)
        finalized_detections: List[NormalizedDetection] = []
        surviving_tracks: List[ActiveTrack] = []

        for track in self.active_tracks:
            if (frame_index - track.last_frame) > self.max_age_frames:
                # Track is finished! Consolidate and emit canonical detection
                finalized_det = track.best_detection
                finalized_det.metadata["temporal_frame_count"] = track.frame_count
                finalized_det.metadata["temporal_span"] = f"Frames {track.start_frame}-{track.last_frame}"
                finalized_detections.append(finalized_det)
                self.completed_tracks.append(track)
            else:
                surviving_tracks.append(track)

        self.active_tracks = surviving_tracks
        return finalized_detections

    def finalize_all(self) -> List[NormalizedDetection]:
        """
        Flushes all remaining active tracks when the video ends.
        """
        finalized: List[NormalizedDetection] = []
        for track in self.active_tracks:
            finalized_det = track.best_detection
            finalized_det.metadata["temporal_frame_count"] = track.frame_count
            finalized_det.metadata["temporal_span"] = f"Frames {track.start_frame}-{track.last_frame}"
            finalized.append(finalized_det)
            self.completed_tracks.append(track)
        self.active_tracks.clear()
        return finalized
