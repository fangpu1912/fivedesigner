# Real-ESRGAN 图片超分 API

## 快速开始

### 1. 安装依赖

```bash
cd api
pip install -r requirements.txt
```

### 2. 下载模型（可选，首次运行会自动下载）

```bash
mkdir -p weights
cd weights

# 下载 Real-ESRGAN x4plus 模型
wget https://github.com/xinntao/Real-ESRGAN/releases/download/v0.1.0/RealESRGAN_x4plus.pth

# 下载 Real-ESRGAN x2plus 模型
wget https://github.com/xinntao/Real-ESRGAN/releases/download/v0.1.0/RealESRGAN_x2plus.pth

# 下载动漫专用模型
wget https://github.com/xinntao/Real-ESRGAN/releases/download/v0.1.0/RealESRGAN_x4plus_anime_6B.pth
```

### 3. 启动服务

```bash
python upscale_api.py
```

或使用 uvicorn：

```bash
uvicorn upscale_api:app --host 0.0.0.0 --port 8000 --reload
```

## API 接口

### POST /api/upscale

请求体：

```json
{
  "imageBase64": "data:image/png;base64,iVBORw0KGgo...",
  "scale": 2.0,
  "model": "realesrgan-x4plus"
}
```

参数说明：

- `imageBase64`: Base64 编码的图片（支持 data URL 格式）
- `scale`: 放大倍数（1.5-4）
- `model`: 模型名称
  - `bicubic`: 双三次插值（本地，无需后端）
  - `realesrgan-x4plus`: Real-ESRGAN 4倍放大（通用）
  - `realesrgan-x2plus`: Real-ESRGAN 2倍放大（通用）
  - `realesrgan-anime`: Real-ESRGAN 动漫专用

响应：

```json
{
  "success": true,
  "imageUrl": "data:image/png;base64,iVBORw0KGgo...",
  "metadata": {
    "originalWidth": 512,
    "originalHeight": 512,
    "upscaledWidth": 2048,
    "upscaledHeight": 2048,
    "scale": 4,
    "model": "realesrgan-x4plus"
  }
}
```

### GET /health

健康检查接口

## 前端配置

确保前端请求的 API 地址正确：

```typescript
// src/services/upscaleService.ts
const API_BASE_URL = 'http://localhost:8000'  // 根据实际部署修改
```

## 模型文件大小

| 模型 | 大小 |
|------|------|
| RealESRGAN_x4plus.pth | ~64MB |
| RealESRGAN_x2plus.pth | ~64MB |
| RealESRGAN_x4plus_anime_6B.pth | ~18MB |

## 性能参考

- GPU (RTX 3060): 512x512 -> 2048x2048 约 2-3 秒
- CPU (i7-12700): 512x512 -> 2048x2048 约 15-30 秒

## 部署建议

1. **开发环境**: 直接使用 `python upscale_api.py`
2. **生产环境**: 使用 Docker 部署
3. **GPU 加速**: 确保 CUDA 可用以获得最佳性能
