use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::process::Command;
use tauri::command;

#[derive(Debug, Serialize, Deserialize)]
pub struct SceneDetectionRequest {
    pub video_path: String,
    pub threshold: f64, // 检测阈值 (0.0 - 1.0)，默认 0.3
    pub output_dir: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SceneInfo {
    pub id: usize,
    pub start_time: f64,    // 开始时间（秒）
    pub end_time: f64,      // 结束时间（秒）
    pub start_time_formatted: String, // 格式化时间 HH:MM:SS
    pub end_time_formatted: String,
    pub duration: f64,      // 时长（秒）
    pub duration_formatted: String,
    pub screenshot_path: String, // 截图路径
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SceneDetectionResult {
    pub scenes: Vec<SceneInfo>,
    pub total_scenes: usize,
    pub video_duration: f64,
    pub video_fps: f64,
    pub video_width: i32,
    pub video_height: i32,
}

/// 格式化秒数为 HH:MM:SS
fn format_time(seconds: f64) -> String {
    let hours = (seconds / 3600.0) as i32;
    let minutes = ((seconds % 3600.0) / 60.0) as i32;
    let secs = (seconds % 60.0) as i32;
    format!("{:02}:{:02}:{:02}", hours, minutes, secs)
}

/// 使用 FFmpeg 检测视频场景切换
/// 
/// 原理：使用 ffmpeg 的 select=scene 滤镜检测场景变化
/// 输出时间戳，然后根据时间戳截取截图
#[command]
pub async fn detect_video_scenes(
    request: SceneDetectionRequest,
) -> Result<SceneDetectionResult, String> {
    let video_path = PathBuf::from(&request.video_path);
    
    if !video_path.exists() {
        return Err(format!("视频文件不存在: {}", request.video_path));
    }

    // 创建输出目录
    let output_dir = PathBuf::from(&request.output_dir);
    fs::create_dir_all(&output_dir)
        .map_err(|e| format!("创建输出目录失败: {}", e))?;

    let screenshots_dir = output_dir.join("screenshots");
    fs::create_dir_all(&screenshots_dir)
        .map_err(|e| format!("创建截图目录失败: {}", e))?;

    // 1. 获取视频信息
    let ffprobe_output = Command::new("ffprobe")
        .args(&[
            "-v", "error",
            "-select_streams", "v:0",
            "-show_entries", "stream=width,height,r_frame_rate,duration",
            "-show_entries", "format=duration",
            "-of", "json",
            request.video_path.as_str(),
        ])
        .output()
        .map_err(|e| format!("ffprobe 执行失败: {}", e))?;

    if !ffprobe_output.status.success() {
        let stderr = String::from_utf8_lossy(&ffprobe_output.stderr);
        return Err(format!("ffprobe 错误: {}", stderr));
    }

    let video_info: serde_json::Value = serde_json::from_slice(&ffprobe_output.stdout)
        .map_err(|e| format!("解析视频信息失败: {}", e))?;

    let video_duration = video_info["format"]["duration"]
        .as_str()
        .and_then(|s| s.parse::<f64>().ok())
        .or_else(|| video_info["streams"][0]["duration"].as_str().and_then(|s| s.parse::<f64>().ok()))
        .unwrap_or(0.0);

    let video_width = video_info["streams"][0]["width"].as_i64().unwrap_or(0) as i32;
    let video_height = video_info["streams"][0]["height"].as_i64().unwrap_or(0) as i32;

    let fps_str = video_info["streams"][0]["r_frame_rate"].as_str().unwrap_or("30/1");
    let video_fps = if fps_str.contains('/') {
        let parts: Vec<&str> = fps_str.split('/').collect();
        if parts.len() == 2 {
            parts[0].parse::<f64>().unwrap_or(30.0) / parts[1].parse::<f64>().unwrap_or(1.0)
        } else {
            30.0
        }
    } else {
        fps_str.parse::<f64>().unwrap_or(30.0)
    };

    // 2. 使用 FFmpeg scene filter 检测场景切换
    // scene=value 表示场景切换阈值，越小越敏感
    let threshold = request.threshold.clamp(0.01, 0.99);
    
    let ffmpeg_output = Command::new("ffmpeg")
        .args(&[
            "-i", request.video_path.as_str(),
            "-vf", format!("select='gt(scene, {})',showinfo", threshold).as_str(),
            "-f", "null",
            "-",
        ])
        .output()
        .map_err(|e| format!("ffmpeg 场景检测失败: {}", e))?;

    let stderr = String::from_utf8_lossy(&ffmpeg_output.stderr);

    // 解析场景切换时间点
    let mut scene_times: Vec<f64> = vec![0.0]; // 第一帧总是场景开始

    for line in stderr.lines() {
        // 查找 pts_time 信息
        if line.contains("pts_time:") {
            if let Some(pos) = line.find("pts_time:") {
                let time_str = &line[pos + 9..];
                if let Some(end_pos) = time_str.find(' ') {
                    let time_val = time_str[..end_pos].trim();
                    if let Ok(time) = time_val.parse::<f64>() {
                        if time > 0.0 && !scene_times.contains(&time) {
                            scene_times.push(time);
                        }
                    }
                }
            }
        }
    }

    // 添加视频结束时间
    if video_duration > 0.0 {
        scene_times.push(video_duration);
    }

    // 去重排序
    scene_times.sort_by(|a, b| a.partial_cmp(b).unwrap());
    scene_times.dedup_by(|a, b| (*a - *b).abs() < 0.1); // 去除太接近的时间点

    // 3. 为每个场景截取截图
    let mut scenes: Vec<SceneInfo> = Vec::new();

    for i in 0..scene_times.len().saturating_sub(1) {
        let start_time = scene_times[i];
        let end_time = scene_times[i + 1];
        let duration = end_time - start_time;

        // 截图文件名
        let screenshot_filename = format!("scene_{:03}_{:.2}s.jpg", i + 1, start_time);
        let screenshot_path = screenshots_dir.join(&screenshot_filename);

        // 使用 FFmpeg 截取初始帧（场景开始的第一帧）作为截图
        let screenshot_result = Command::new("ffmpeg")
            .args(&[
                "-ss", &format!("{:.3}", start_time),
                "-i", request.video_path.as_str(),
                "-vframes", "1",
                "-q:v", "2",
                "-y",
                screenshot_path.to_str().unwrap(),
            ])
            .output();

        let screenshot_path_str = match screenshot_result {
            Ok(output) if output.status.success() => {
                screenshot_path.to_string_lossy().to_string()
            }
            _ => {
                String::new() // 截图失败则返回空字符串
            }
        };

        scenes.push(SceneInfo {
            id: i + 1,
            start_time,
            end_time,
            start_time_formatted: format_time(start_time),
            end_time_formatted: format_time(end_time),
            duration,
            duration_formatted: format_time(duration),
            screenshot_path: screenshot_path_str,
        });
    }

    Ok(SceneDetectionResult {
        total_scenes: scenes.len(),
        scenes,
        video_duration,
        video_fps,
        video_width,
        video_height,
    })
}

/// 导出视频片段
#[command]
pub async fn export_scene_video(
    video_path: String,
    start_time: f64,
    end_time: f64,
    output_path: String,
) -> Result<String, String> {
    let output = Command::new("ffmpeg")
        .args(&[
            "-ss", &format!("{:.3}", start_time),
            "-t", &format!("{:.3}", end_time - start_time),
            "-i", &video_path,
            "-c:v", "libx264",
            "-c:a", "aac",
            "-y",
            &output_path,
        ])
        .output()
        .map_err(|e| format!("导出视频片段失败: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("导出视频失败: {}", stderr));
    }

    Ok(output_path)
}

/// 批量导出场景截图和视频
#[derive(Debug, Serialize, Deserialize)]
pub struct ExportScenesRequest {
    pub video_path: String,
    pub scenes: Vec<SceneExportInfo>,
    pub output_dir: String,
    pub export_screenshots: bool,
    pub export_videos: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SceneExportInfo {
    pub id: usize,
    pub start_time: f64,
    pub end_time: f64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ExportResult {
    pub screenshot_paths: Vec<String>,
    pub video_paths: Vec<String>,
}

#[command]
pub async fn export_scenes(
    request: ExportScenesRequest,
) -> Result<ExportResult, String> {
    let output_dir = PathBuf::from(&request.output_dir);
    fs::create_dir_all(&output_dir)
        .map_err(|e| format!("创建输出目录失败: {}", e))?;

    let mut screenshot_paths: Vec<String> = Vec::new();
    let mut video_paths: Vec<String> = Vec::new();

    for scene in &request.scenes {
        let start_formatted = format_time(scene.start_time).replace(':', "-");
        let end_formatted = format_time(scene.end_time).replace(':', "-");

        // 导出截图
        if request.export_screenshots {
            let screenshot_path = output_dir.join(format!(
                "scene_{:03}_{}_to_{}.jpg",
                scene.id, start_formatted, end_formatted
            ));

            // 截取场景开始的第一帧作为截图
            let result = Command::new("ffmpeg")
                .args(&[
                    "-ss", &format!("{:.3}", scene.start_time),
                    "-i", &request.video_path,
                    "-vframes", "1",
                    "-q:v", "2",
                    "-y",
                    screenshot_path.to_str().unwrap(),
                ])
                .output();

            if let Ok(output) = result {
                if output.status.success() {
                    screenshot_paths.push(screenshot_path.to_string_lossy().to_string());
                }
            }
        }

        // 导出视频片段
        if request.export_videos {
            let video_path = output_dir.join(format!(
                "scene_{:03}_{}_to_{}.mp4",
                scene.id, start_formatted, end_formatted
            ));

            let result = Command::new("ffmpeg")
                .args(&[
                    "-ss", &format!("{:.3}", scene.start_time),
                    "-t", &format!("{:.3}", scene.end_time - scene.start_time),
                    "-i", &request.video_path,
                    "-c:v", "libx264",
                    "-c:a", "aac",
                    "-y",
                    video_path.to_str().unwrap(),
                ])
                .output();

            if let Ok(output) = result {
                if output.status.success() {
                    video_paths.push(video_path.to_string_lossy().to_string());
                }
            }
        }
    }

    Ok(ExportResult {
        screenshot_paths,
        video_paths,
    })
}

/// 按指定时间截取单帧截图
#[command]
pub async fn capture_frame(
    video_path: String,
    timestamp: f64,
    output_path: String,
) -> Result<String, String> {
    let output = Command::new("ffmpeg")
        .args(&[
            "-ss", &format!("{:.3}", timestamp),
            "-i", &video_path,
            "-vframes", "1",
            "-q:v", "2",
            "-y",
            &output_path,
        ])
        .output()
        .map_err(|e| format!("截取帧失败: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("截取帧失败: {}", stderr));
    }

    Ok(output_path)
}
