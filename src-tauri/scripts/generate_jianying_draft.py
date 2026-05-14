#!/usr/bin/env python3
"""
剪映草稿生成脚本 - 用于 FiveDesigner 调用系统 Python 生成剪映草稿
支持剪映 6.0+ 版本（通过 pyJianYingDraft 库）

用法:
    python generate_jianying_draft.py <input_json> <output_dir>

input_json 格式:
{
    "draft_name": "项目名称",
    "width": 1080,
    "height": 1920,
    "fps": 30,
    "clips": [
        {
            "video_path": "C:/.../video.mp4",
            "audio_path": "C:/.../audio.mp3",
            "duration": 5.0,
            "subtitle": "字幕文本"
        }
    ]
}
"""

import json
import sys
import os
import subprocess
from pathlib import Path


def check_pyjianyingdraft():
    """检查 pyJianYingDraft 是否已安装"""
    try:
        import pyJianYingDraft as draft
        return True
    except ImportError:
        return False


def install_pyjianyingdraft():
    """尝试安装 pyJianYingDraft"""
    try:
        subprocess.run(
            [sys.executable, "-m", "pip", "install", "pyJianYingDraft"],
            check=True,
            capture_output=True,
            text=True
        )
        return True
    except subprocess.CalledProcessError:
        # 尝试从 GitHub 安装
        try:
            subprocess.run(
                [sys.executable, "-m", "pip", "install", "git+https://github.com/GuanYixuan/pyJianYingDraft.git"],
                check=True,
                capture_output=True,
                text=True
            )
            return True
        except subprocess.CalledProcessError:
            return False


def get_video_info(video_path):
    """获取视频信息（分辨率、时长）"""
    try:
        result = subprocess.run(
            ['ffprobe', '-v', 'quiet', '-print_format', 'json', 
             '-show_format', '-show_streams', video_path],
            capture_output=True, text=True, timeout=10
        )
        info = json.loads(result.stdout)
        
        # 获取视频流信息
        video_stream = None
        for stream in info.get('streams', []):
            if stream.get('codec_type') == 'video':
                video_stream = stream
                break
        
        if video_stream:
            width = int(video_stream.get('width', 1080))
            height = int(video_stream.get('height', 1920))
        else:
            width, height = 1080, 1920
            
        # 获取时长
        duration = float(info['format'].get('duration', 5.0))
        
        return {'width': width, 'height': height, 'duration': duration}
    except Exception as e:
        print(f"获取视频信息失败: {e}", file=sys.stderr)
        return {'width': 1080, 'height': 1920, 'duration': 5.0}


def generate_with_pyjianyingdraft(data, output_dir):
    """使用 pyJianYingDraft 生成剪映草稿"""
    import pyJianYingDraft as draft

    os.makedirs(output_dir, exist_ok=True)

    draft_name = data.get("draft_name", "FiveDesigner_Export")
    clips = data.get("clips", [])
    fps = data.get("fps", 30)

    # 检测第一个视频的分辨率来决定画布方向
    canvas_width = 1080
    canvas_height = 1920
    
    if clips:
        first_video = clips[0].get("video_path", "")
        if first_video and os.path.exists(first_video):
            info = get_video_info(first_video)
            video_width = info['width']
            video_height = info['height']
            
            # 根据视频方向设置画布
            if video_width > video_height:
                # 横屏视频
                canvas_width = 1920
                canvas_height = 1080
                print(f"检测到横屏视频 {video_width}x{video_height}，使用画布 {canvas_width}x{canvas_height}", file=sys.stderr)
            else:
                # 竖屏视频
                canvas_width = 1080
                canvas_height = 1920
                print(f"检测到竖屏视频 {video_width}x{video_height}，使用画布 {canvas_width}x{canvas_height}", file=sys.stderr)

    # 创建草稿文件夹
    draft_folder = draft.DraftFolder(output_dir)
    if draft_folder.has_draft(draft_name):
        draft_folder.remove(draft_name)

    # 创建草稿
    jy_draft = draft_folder.create_draft(
        draft_name=draft_name,
        width=canvas_width,
        height=canvas_height,
        fps=fps,
        maintrack_adsorb=True,
        allow_replace=True,
    )

    # 创建轨道
    jy_draft.add_track(draft.TrackType.video)
    jy_draft.add_track(draft.TrackType.audio, "配音")
    jy_draft.add_track(draft.TrackType.text, "字幕")

    # 逐片段添加
    current_s = 0.0

    for clip in clips:
        video_path = clip.get("video_path", "")
        audio_path = clip.get("audio_path", "")
        duration = clip.get("duration", 5.0)
        subtitle = clip.get("subtitle", "")

        if not video_path or not os.path.exists(video_path):
            print(f"警告: 视频文件不存在: {video_path}", file=sys.stderr)
            continue

        # 规范化路径（使用正斜杠，避免转义问题）
        video_path = os.path.normpath(video_path).replace("\\", "/")
        if audio_path:
            audio_path = os.path.normpath(audio_path).replace("\\", "/")

        # 获取实际时长
        actual_dur = duration
        try:
            result = subprocess.run(
                ['ffprobe', '-v', 'quiet', '-print_format', 'json', '-show_format', video_path],
                capture_output=True, text=True, timeout=10
            )
            info = json.loads(result.stdout)
            actual_dur = float(info['format']['duration'])
            print(f"视频时长: {actual_dur}s", file=sys.stderr)
        except Exception as e:
            print(f"获取视频时长失败，使用默认时长 {duration}s: {e}", file=sys.stderr)
            actual_dur = duration

        # 确保时长有效
        if actual_dur <= 0:
            actual_dur = 5.0

        # 视频片段 - 使用绝对路径
        abs_video_path = os.path.abspath(video_path.replace("/", os.sep))
        print(f"添加视频: {abs_video_path}", file=sys.stderr)
        video_material = draft.VideoMaterial(abs_video_path)
        video_segment = draft.VideoSegment(
            material=video_material,
            target_timerange=draft.trange(f"{current_s}s", f"{actual_dur}s"),
        )
        jy_draft.add_segment(video_segment)

        # 音频片段
        if audio_path and os.path.exists(audio_path.replace("/", os.sep)):
            abs_audio_path = os.path.abspath(audio_path.replace("/", os.sep))
            print(f"添加音频: {abs_audio_path}", file=sys.stderr)
            audio_material = draft.AudioMaterial(abs_audio_path)
            audio_segment = draft.AudioSegment(
                material=audio_material,
                target_timerange=draft.trange(f"{current_s}s", f"{actual_dur}s"),
                volume=1.0,
            )
            jy_draft.add_segment(audio_segment, "配音")

        # 字幕片段
        if subtitle.strip():
            text_segment = draft.TextSegment(
                text=subtitle.strip(),
                timerange=draft.trange(f"{current_s}s", f"{actual_dur}s"),
                style=draft.TextStyle(
                    size=8.0,
                    bold=False,
                    italic=False,
                    color=(1.0, 1.0, 1.0),
                ),
                border=draft.TextBorder(
                    color=(0.0, 0.0, 0.0),
                    width=40.0,
                ),
                clip_settings=draft.ClipSettings(transform_y=-0.85),
            )
            jy_draft.add_segment(text_segment, "字幕")

        current_s += actual_dur

    # 保存草稿
    jy_draft.save()

    draft_path = os.path.join(output_dir, draft_name)
    return draft_path


def generate_fallback_json(data, output_dir):
    """回退方案：生成标准 JSON 格式（适用于剪映 5.9 及以下）"""
    import subprocess
    import json as json_lib
    
    os.makedirs(output_dir, exist_ok=True)

    draft_name = data.get("draft_name", "FiveDesigner_Export")
    fps = data.get("fps", 30)
    clips = data.get("clips", [])
    
    # 检测第一个视频的分辨率来决定画布方向
    canvas_width = 1080
    canvas_height = 1920
    
    if clips:
        first_video = clips[0].get("video_path", "")
        if first_video and os.path.exists(first_video):
            info = get_video_info(first_video)
            video_width = info['width']
            video_height = info['height']
            
            # 根据视频方向设置画布
            if video_width > video_height:
                # 横屏视频
                canvas_width = 1920
                canvas_height = 1080
                print(f"检测到横屏视频 {video_width}x{video_height}，使用画布 {canvas_width}x{canvas_height}", file=sys.stderr)
            else:
                # 竖屏视频
                canvas_width = 1080
                canvas_height = 1920
                print(f"检测到竖屏视频 {video_width}x{video_height}，使用画布 {canvas_width}x{canvas_height}", file=sys.stderr)

    # 创建草稿文件夹
    draft_path = os.path.join(output_dir, draft_name)
    os.makedirs(draft_path, exist_ok=True)
    os.makedirs(os.path.join(draft_path, "materials"), exist_ok=True)

    # 生成 draft_content.json（简化版）
    now = int(os.path.getmtime(__file__) if os.path.exists(__file__) else 0)

    video_materials = []
    audio_materials = []
    video_segments = []
    audio_segments = []

    current_time = 0
    total_duration = 0

    for i, clip in enumerate(clips):
        video_path = clip.get("video_path", "")
        audio_path = clip.get("audio_path", "")
        duration = clip.get("duration", 5.0)

        # 获取实际视频时长
        actual_duration = duration
        if video_path and os.path.exists(video_path):
            try:
                result = subprocess.run(
                    ['ffprobe', '-v', 'quiet', '-print_format', 'json', '-show_format', video_path],
                    capture_output=True, text=True, timeout=10
                )
                info = json_lib.loads(result.stdout)
                actual_duration = float(info['format']['duration'])
                print(f"视频 {i} 实际时长: {actual_duration}s", file=sys.stderr)
            except Exception as e:
                print(f"获取视频 {i} 时长失败: {e}", file=sys.stderr)
        
        duration_us = int(actual_duration * 1000000)

        if video_path and os.path.exists(video_path):
            # 规范化路径：使用正斜杠，避免 JSON 转义问题
            abs_path = os.path.abspath(video_path).replace("\\", "/")
            file_name = os.path.basename(video_path)
            
            video_materials.append({
                "id": f"video_{i}",
                "video_material_id": f"video_{i}",
                "material_name": file_name,
                "local_material_id": f"video_{i}",
                "path": abs_path,
                "duration": duration_us,
                "width": canvas_width,
                "height": canvas_height,
                "fps": fps,
                "type": "video",
                "create_time": now,
                "import_time": now,
                "md5": "",
                "item_source": 1,
            })

            video_segments.append({
                "id": f"segment_{i}",
                "material_id": f"video_{i}",
                "target_timerange": {
                    "start": int(current_time * 1000000),
                    "duration": duration_us,
                },
                "source_timerange": {
                    "start": 0,
                    "duration": duration_us,
                },
                "speed": 1.0,
                "volume": 1.0,
                "clip": {
                    "alpha": 1.0,
                    "flip": {"horizontal": False, "vertical": False},
                    "rotation": 0.0,
                    "scale": {"x": 1.0, "y": 1.0},
                    "transform": {"x": 0.0, "y": 0.0},
                },
            })

        if audio_path and os.path.exists(audio_path):
            # 规范化路径
            abs_path = os.path.abspath(audio_path).replace("\\", "/")
            file_name = os.path.basename(audio_path)
            
            audio_materials.append({
                "id": f"audio_{i}",
                "audio_material_id": f"audio_{i}",
                "material_name": file_name,
                "local_material_id": f"audio_{i}",
                "path": abs_path,
                "duration": duration_us,
                "sample_rate": 44100,
                "channels": 2,
                "bit_rate": 192000,
                "type": "audio",
                "create_time": now,
                "import_time": now,
                "md5": "",
                "item_source": 1,
            })

            audio_segments.append({
                "id": f"audio_segment_{i}",
                "material_id": f"audio_{i}",
                "target_timerange": {
                    "start": int(current_time * 1000000),
                    "duration": duration_us,
                },
                "source_timerange": {
                    "start": 0,
                    "duration": duration_us,
                },
                "speed": 1.0,
                "volume": 1.0,
            })

        current_time += actual_duration
        total_duration += duration_us

    tracks = []
    if video_segments:
        tracks.append({
            "id": "track_video",
            "type": "video",
            "name": "视频轨道 1",
            "render_index": 0,
            "mute": False,
            "segments": video_segments,
        })

    if audio_segments:
        tracks.append({
            "id": "track_audio",
            "type": "audio",
            "name": "音频轨道 1",
            "render_index": 10000,
            "mute": False,
            "segments": audio_segments,
        })

    draft_content = {
        "canvas_config": {
            "width": canvas_width,
            "height": canvas_height,
            "ratio": "original",
            "fps": fps,
        },
        "color_space": 0,
        "config": {
            "adjust_max_index": 1,
            "attachment_info": [],
            "combination_max_index": 1,
            "export_range": None,
            "extract_audio_last_index": 1,
            "lyrics_recognition_id": "",
            "lyrics_sync": True,
            "lyrics_taskinfo": [],
            "maintrack_adsorb": True,
            "material_save_mode": 0,
            "original_sound_last_index": 1,
            "record_audio_last_index": 1,
            "sticker_max_index": 1,
            "subtitle_recognition_id": "",
            "subtitle_sync": True,
            "subtitle_taskinfo": [],
            "system_font_list": [],
            "video_mute": False,
            "zoom_info_params": None,
        },
        "cover": None,
        "create_time": now,
        "duration": total_duration,
        "extra_info": None,
        "fps": float(fps),
        "free_render_index_mode_on": False,
        "group_container": None,
        "id": f"draft_{now}",
        "keyframe_graph_list": [],
        "keyframes": {
            "adjusts": [],
            "audios": [],
            "effects": [],
            "filters": [],
            "handwrites": [],
            "stickers": [],
            "texts": [],
            "videos": [],
        },
        "last_modified_platform": {
            "app_id": 3704,
            "app_source": "lv",
            "app_version": "4.7.2",
            "device_id": "fc871fd0f7df9197856c41e5c14692e3",
            "hard_disk_id": "41242e7a5bd929da250d4f775eb50880",
            "mac_address": "bd3b6e089f498a7037dc279f6ee07f73",
            "os": "windows",
            "os_version": "10.0.22621",
        },
        "materials": {
            "audio_balances": [],
            "audio_effects": [],
            "audio_fades": [],
            "audios": audio_materials,
            "beats": [],
            "canvases": [],
            "chromas": [],
            "color_curves": [],
            "digital_humans": [],
            "drafts": [],
            "effects": [],
            "flowers": [],
            "green_screens": [],
            "handwrites": [],
            "hsl": [],
            "images": [],
            "log_color_wheels": [],
            "loudnesses": [],
            "manual_deformations": [],
            "masks": [],
            "material_animations": [],
            "material_colors": [],
            "placeholders": [],
            "plugin_effects": [],
            "primary_color_wheels": [],
            "realtime_denoises": [],
            "shapes": [],
            "smart_crops": [],
            "sound_channel_mappings": [],
            "speeds": [],
            "stickers": [],
            "tail_leaders": [],
            "text_templates": [],
            "texts": [],
            "transitions": [],
            "video_effects": [],
            "video_trackings": [],
            "videos": video_materials,
            "vocal_beautifys": [],
            "vocal_separations": [],
        },
        "mutable_config": None,
        "name": "",
        "new_version": "87.0.0",
        "platform": {
            "app_id": 3704,
            "app_source": "lv",
            "app_version": "4.7.2",
            "device_id": "fc871fd0f7df9197856c41e5c14692e3",
            "hard_disk_id": "41242e7a5bd929da250d4f775eb50880",
            "mac_address": "bd3b6e089f498a7037dc279f6ee07f73",
            "os": "windows",
            "os_version": "10.0.22621",
        },
        "relationships": [],
        "render_index_track_mode_on": False,
        "retouch_cover": None,
        "source": "default",
        "static_cover_image_path": "",
        "tracks": tracks,
        "update_time": now,
        "version": 360000,
    }

    draft_meta_info = {
        "cloud_package_completed_time": "",
        "draft_cloud_capcut_purchase_info": "",
        "draft_cloud_last_action_download": False,
        "draft_cloud_materials": [],
        "draft_cloud_purchase_info": "",
        "draft_cloud_template_id": "",
        "draft_cloud_tutorial_info": "",
        "draft_cloud_videocut_purchase_info": "",
        "draft_cover": "draft_cover.jpg",
        "draft_deeplink_url": "",
        "draft_enterprise_info": {
            "draft_enterprise_extra": "",
            "draft_enterprise_id": "",
            "draft_enterprise_name": "",
            "enterprise_material": [],
        },
        "draft_fold_path": "",
        "draft_id": f"draft_{now}",
        "draft_is_article_video_draft": False,
        "draft_is_from_deeplink": "false",
        "draft_materials": [
            {"type": 0, "value": []},
            {"type": 1, "value": []},
            {"type": 2, "value": []},
            {"type": 3, "value": []},
            {"type": 6, "value": []},
            {"type": 7, "value": []},
            {"type": 8, "value": []},
        ],
        "draft_materials_copied_info": [],
        "draft_name": draft_name,
        "draft_new_version": "",
        "draft_removable_storage_device": "",
        "draft_root_path": "",
        "draft_segment_extra_info": [],
        "draft_timeline_materials_size_": 0,
        "tm_draft_cloud_completed": "",
        "tm_draft_cloud_modified": 0,
        "tm_draft_create": now,
        "tm_draft_modified": now,
        "tm_draft_removed": 0,
        "tm_duration": total_duration,
    }

    with open(os.path.join(draft_path, "draft_content.json"), "w", encoding="utf-8") as f:
        json.dump(draft_content, f, ensure_ascii=False, indent=2)

    with open(os.path.join(draft_path, "draft_meta_info.json"), "w", encoding="utf-8") as f:
        json.dump(draft_meta_info, f, ensure_ascii=False, indent=2)

    return draft_path


def main():
    if len(sys.argv) < 3:
        print("用法: python generate_jianying_draft.py <input_json> <output_dir>", file=sys.stderr)
        sys.exit(1)

    input_json_path = sys.argv[1]
    output_dir = sys.argv[2]

    # 读取输入 JSON
    with open(input_json_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    # 检查 pyJianYingDraft
    if check_pyjianyingdraft():
        try:
            draft_path = generate_with_pyjianyingdraft(data, output_dir)
            print(json.dumps({"success": True, "draft_path": draft_path, "method": "pyJianYingDraft"}))
            return
        except Exception as e:
            print(f"pyJianYingDraft 生成失败: {e}，尝试回退方案", file=sys.stderr)

    # 尝试安装 pyJianYingDraft
    print("尝试安装 pyJianYingDraft...", file=sys.stderr)
    if install_pyjianyingdraft():
        try:
            draft_path = generate_with_pyjianyingdraft(data, output_dir)
            print(json.dumps({"success": True, "draft_path": draft_path, "method": "pyJianYingDraft"}))
            return
        except Exception as e:
            print(f"安装后仍然失败: {e}", file=sys.stderr)

    # 回退到 JSON 方案
    print("使用回退方案生成 JSON 格式草稿（仅兼容剪映 5.9 及以下）", file=sys.stderr)
    try:
        draft_path = generate_fallback_json(data, output_dir)
        print(json.dumps({"success": True, "draft_path": draft_path, "method": "fallback_json"}))
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))
        sys.exit(1)


if __name__ == "__main__":
    main()
