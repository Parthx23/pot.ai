import cv2
import numpy as np
import os
import math

def generate_road_frame(
    width: int,
    height: int,
    frame_idx: int,
    total_frames: int,
    defect_present: bool = True,
    defect_severity: str = "HIGH",
    is_repaired: bool = False
) -> np.ndarray:
    """
    Renders a realistic road driving perspective frame with asphalt texture,
    lane markings, horizon, and defect or asphalt patch.
    """
    frame = np.zeros((height, width, 3), dtype=np.uint8)

    # 1. Sky (gradient from light blue to pale horizon)
    horizon_y = int(height * 0.42)
    for y in range(horizon_y):
        t = y / horizon_y
        b = int(220 - 40 * t)
        g = int(180 - 30 * t)
        r = int(140 - 20 * t)
        frame[y, :] = [b, g, r]

    # 2. Road surface (perspective trapezoid)
    for y in range(horizon_y, height):
        progress = (y - horizon_y) / (height - horizon_y)
        # Asphalt dark grey texture with subtle noise
        base_gray = int(55 + 20 * progress)
        frame[y, :] = [base_gray, base_gray, base_gray]

    # Add realistic asphalt road grain
    noise = np.random.randint(-8, 9, (height - horizon_y, width, 3), dtype=np.int16)
    road_area = frame[horizon_y:, :].astype(np.int16) + noise
    frame[horizon_y:, :] = np.clip(road_area, 0, 255).astype(np.uint8)

    # 3. Road perspective curbs & shoulder
    vanish_x = width // 2
    road_top_left = vanish_x - int(width * 0.12)
    road_top_right = vanish_x + int(width * 0.12)
    road_bot_left = int(width * 0.08)
    road_bot_right = int(width * 0.92)

    # Left & right grass / roadside
    pts_left_grass = np.array([[0, horizon_y], [road_top_left, horizon_y], [road_bot_left, height], [0, height]])
    cv2.fillPoly(frame, [pts_left_grass], (34, 75, 45))
    pts_right_grass = np.array([[road_top_right, horizon_y], [width, horizon_y], [width, height], [road_bot_right, height]])
    cv2.fillPoly(frame, [pts_right_grass], (34, 75, 45))

    # White edge lines
    cv2.line(frame, (road_top_left, horizon_y), (road_bot_left, height), (220, 220, 220), 4)
    cv2.line(frame, (road_top_right, horizon_y), (road_bot_right, height), (220, 220, 220), 4)

    # Dashed center lane line moving towards camera
    speed_factor = 28
    dash_offset = (frame_idx * speed_factor) % 120
    for y in range(horizon_y + 20, height, 80):
        actual_y = y + dash_offset
        if actual_y < height:
            t = (actual_y - horizon_y) / (height - horizon_y)
            dash_len = int(20 + 40 * t)
            dash_w = max(2, int(6 * t))
            cv2.line(frame, (vanish_x, actual_y), (vanish_x, min(height, actual_y + dash_len)), (0, 215, 255), dash_w)

    # 4. Defect or Repair Patch approaching camera
    # Defect appears in the middle frames (e.g. frame 20 to 60)
    appear_start = int(total_frames * 0.25)
    appear_end = int(total_frames * 0.75)

    if appear_start <= frame_idx <= appear_end:
        norm_progress = (frame_idx - appear_start) / (appear_end - appear_start)
        # Approaches from near horizon down into vehicle lane
        obj_y = int(horizon_y + (height - horizon_y) * (0.15 + 0.70 * norm_progress))
        scale = 0.2 + 0.8 * norm_progress
        obj_x = int(vanish_x + int(width * 0.16 * scale))

        if defect_present and not is_repaired:
            # Draw realistic road damage (pothole / asphalt cracking)
            pw = int(120 * scale)
            ph = int(55 * scale)
            
            # Dark cavity of pothole
            cv2.ellipse(frame, (obj_x, obj_y), (pw, ph), 15, 0, 360, (20, 20, 22), -1)
            # Rough rim / fracture edge
            cv2.ellipse(frame, (obj_x, obj_y), (pw + 4, ph + 3), 15, 0, 360, (75, 75, 80), 2)
            # Internal cracks
            cv2.line(frame, (obj_x - int(pw*0.6), obj_y - int(ph*0.2)), (obj_x + int(pw*0.5), obj_y + int(ph*0.3)), (12, 12, 12), 2)
            cv2.line(frame, (obj_x - int(pw*0.3), obj_y + int(ph*0.5)), (obj_x + int(pw*0.7), obj_y - int(ph*0.1)), (15, 15, 15), 2)
            # Crack branches
            cv2.line(frame, (obj_x + int(pw*0.5), obj_y + int(ph*0.3)), (obj_x + int(pw*0.9), obj_y + int(ph*0.6)), (10, 10, 10), 1)

        elif is_repaired:
            # Clean dark bitumen maintenance repair patch
            pw = int(130 * scale)
            ph = int(60 * scale)
            cv2.ellipse(frame, (obj_x, obj_y), (pw, ph), 15, 0, 360, (35, 35, 38), -1)
            cv2.ellipse(frame, (obj_x, obj_y), (pw, ph), 15, 0, 360, (48, 48, 52), 2)
            # Fresh sealant line
            cv2.ellipse(frame, (obj_x, obj_y), (pw + 3, ph + 2), 15, 0, 360, (28, 28, 30), 1)

    return frame


def create_demo_videos(output_dir: str):
    os.makedirs(output_dir, exist_ok=True)
    width, height = 960, 540
    fps = 20
    total_frames = 70
    fourcc = cv2.VideoWriter_fourcc(*'mp4v')

    sequences = [
        ("pass_1_initial_detection.mp4", True, "HIGH", False, "Pass 1: First detection of road edge fracture"),
        ("pass_2_repeat_pass.mp4", True, "HIGH", False, "Pass 2: Day 2 re-inspection showing persistent defect"),
        ("pass_3_escalation_pass.mp4", True, "HIGH", False, "Pass 3: Day 4 re-inspection triggering persistent escalation"),
        ("pass_4_repaired_recheck.mp4", False, "NONE", True, "Pass 4: Post-maintenance inspection verifying repair"),
    ]

    for fname, defect_present, severity, is_repaired, desc in sequences:
        out_path = os.path.join(output_dir, fname)
        if os.path.exists(out_path) and os.path.getsize(out_path) > 10000:
            print(f"[VideoGen] Reusing existing video: {fname}")
            continue

        print(f"[VideoGen] Generating {fname} ({desc})...")
        writer = cv2.VideoWriter(out_path, fourcc, fps, (width, height))
        for i in range(total_frames):
            frame = generate_road_frame(
                width=width,
                height=height,
                frame_idx=i,
                total_frames=total_frames,
                defect_present=defect_present,
                defect_severity=severity,
                is_repaired=is_repaired
            )
            writer.write(frame)
        writer.release()
        print(f"[VideoGen] Finished: {out_path} ({os.path.getsize(out_path)} bytes)")

if __name__ == "__main__":
    target_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "sample_data", "videos")
    create_demo_videos(target_dir)
