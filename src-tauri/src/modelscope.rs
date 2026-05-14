use serde::{Deserialize, Serialize};
use tauri::command;

#[derive(Debug, Serialize)]
pub struct SubmitTaskResponse {
    pub task_id: String,
    pub image_url: Option<String>,
    pub message: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ChatResponse {
    pub choices: Vec<ChatChoice>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ChatChoice {
    pub message: ChatMessage,
    pub finish_reason: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ChatRequest {
    pub model: String,
    pub messages: serde_json::Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_tokens: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub temperature: Option<f64>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ModelscopeRequest {
    pub model: String,
    pub prompt: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub negative_prompt: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub size: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub seed: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub steps: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub guidance: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub image_url: Option<String>,
    #[serde(skip_serializing)]
    pub async_mode: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ModelscopeTaskResponse {
    pub task_id: String,
    pub request_id: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ModelscopeTaskStatus {
    pub task_status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub output_images: Option<Vec<String>>,
    pub request_id: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ModelscopeError {
    pub errors: serde_json::Value,
    pub request_id: String,
}

#[command]
pub async fn modelscope_submit_task(
    api_key: String,
    request: ModelscopeRequest,
) -> Result<SubmitTaskResponse, String> {
    let client = reqwest::Client::new();
    let request_json = serde_json::to_string(&request).map_err(|e| e.to_string())?;
    let use_async = request.async_mode.unwrap_or(false);

    let mut req_builder = client
        .post("https://api-inference.modelscope.cn/v1/images/generations")
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json");

    if use_async {
        req_builder = req_builder.header("X-ModelScope-Async-Mode", "true");
    }

    let response = req_builder
        .body(request_json.clone())
        .send()
        .await
        .map_err(|e| format!("网络请求失败: {}", e))?;

    let status = response.status();
    let response_text = response.text().await.map_err(|e| e.to_string())?;

    if !status.is_success() {
        // 解析 ModelScope 返回的详细错误
        let error_detail = serde_json::from_str::<serde_json::Value>(&response_text)
            .ok()
            .and_then(|v| v.get("errors").cloned())
            .map(|e| e.to_string())
            .unwrap_or_else(|| response_text.clone());

        eprintln!(
            "ModelScope API Error ({}): {}\n请求体: {}",
            status, error_detail, request_json
        );
        return Err(format!("ModelScope API 错误 ({}): {}", status, error_detail));
    }

    // 尝试解析异步模式响应（含 task_id）
    if let Ok(task_resp) = serde_json::from_str::<ModelscopeTaskResponse>(&response_text) {
        return Ok(SubmitTaskResponse {
            task_id: task_resp.task_id,
            image_url: None,
            message: None,
        });
    }

    // 尝试解析同步模式响应（含 data[0].url）
    if let Ok(sync_resp) = serde_json::from_str::<serde_json::Value>(&response_text) {
        if let Some(url) = sync_resp
            .get("data")
            .and_then(|d| d.as_array())
            .and_then(|arr| arr.first())
            .and_then(|item| item.get("url"))
            .and_then(|u| u.as_str())
        {
            let task_id = format!("sync-{}", uuid::Uuid::new_v4());
            return Ok(SubmitTaskResponse {
                task_id,
                image_url: Some(url.to_string()),
                message: None,
            });
        }
    }

    Err(format!("无法解析响应: {}", response_text))
}

/// 查询魔搭 API 任务状态
#[command]
pub async fn modelscope_check_status(
    api_key: String,
    task_id: String,
) -> Result<ModelscopeTaskStatus, String> {
    let client = reqwest::Client::new();

    let response = client
        .get(format!("https://api-inference.modelscope.cn/v1/tasks/{}", task_id))
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .header("X-ModelScope-Task-Type", "image_generation")
        .send()
        .await
        .map_err(|e| format!("请求失败: {}", e))?;

    let status = response.status();
    let response_text = response.text().await.map_err(|e| format!("读取响应失败: {}", e))?;

    if !status.is_success() {
        if let Ok(error) = serde_json::from_str::<ModelscopeError>(&response_text) {
            return Err(format!("魔搭API错误: {:?}", error.errors));
        }
        return Err(format!("HTTP错误 {}: {}", status, response_text));
    }

    serde_json::from_str(&response_text)
        .map_err(|e| format!("解析响应失败: {} - 响应内容: {}", e, response_text))
}

/// ModelScope 对话/视觉语言分析
#[command]
pub async fn modelscope_chat(
    api_key: String,
    request: ChatRequest,
) -> Result<ChatResponse, String> {
    let client = reqwest::Client::new();
    let request_json = serde_json::to_string(&request).map_err(|e| e.to_string())?;

    let response = client
        .post("https://api-inference.modelscope.cn/v1/chat/completions")
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .body(request_json.clone())
        .send()
        .await
        .map_err(|e| format!("网络请求失败: {}", e))?;

    let status = response.status();
    let response_text = response.text().await.map_err(|e| e.to_string())?;

    if !status.is_success() {
        let error_detail = serde_json::from_str::<serde_json::Value>(&response_text)
            .ok()
            .and_then(|v| v.get("message").or(v.get("error")).cloned())
            .map(|e| e.to_string())
            .unwrap_or_else(|| response_text.clone());

        eprintln!(
            "ModelScope Chat Error ({}): {}\n请求体: {}",
            status, error_detail, request_json
        );
        return Err(format!("ModelScope Chat API 错误 ({}): {}", status, error_detail));
    }

    serde_json::from_str(&response_text)
        .map_err(|e| format!("解析聊天响应失败: {} - 响应内容: {}", e, response_text))
}
