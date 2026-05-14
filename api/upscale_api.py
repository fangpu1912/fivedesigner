"""
Real-ESRGAN 图片超分 API
使用 FastAPI 框架

安装依赖:
pip install fastapi uvicorn realesrgan basicsr torch torchvision numpy pillow

运行:
uvicorn upscale_api:app --host 0.0.0.0 --port 8000
"""

import base64
import io
import os
import tempfile
from typing import Optional

import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image
from pydantic import BaseModel

app = FastAPI(title="Real-ESRGAN 超分 API")

# 允许跨域
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class UpscaleRequest(BaseModel):
    imageBase64: str
    scale: float = 2.0
    model: str = "realesrgan-x4plus"  # realesrgan-x4plus, realesrgan-x2plus, realesrgan-anime


class UpscaleResponse(BaseModel):
    success: bool
    imageUrl: Optional[str] = None
    error: Optional[str] = None
    metadata: Optional[dict] = None


# 全局模型缓存
models = {}


def get_model(model_name: str):
    """获取或加载 Real-ESRGAN 模型"""
    if model_name not in models:
        try:
            from realesrgan import RealESRGANer
            from basicsr.archs.rrdbnet_arch import RRDBNet

            # 模型配置
            model_configs = {
                "realesrgan-x4plus": {
                    "model": RRDBNet(num_in_ch=3, num_out_ch=3, num_feat=64, num_block=23, num_grow_ch=32, scale=4),
                    "model_path": "weights/RealESRGAN_x4plus.pth",
                    "netscale": 4,
                },
                "realesrgan-x2plus": {
                    "model": RRDBNet(num_in_ch=3, num_out_ch=3, num_feat=64, num_block=23, num_grow_ch=32, scale=2),
                    "model_path": "weights/RealESRGAN_x2plus.pth",
                    "netscale": 2,
                },
                "realesrgan-anime": {
                    "model": RRDBNet(num_in_ch=3, num_out_ch=3, num_feat=64, num_block=6, num_grow_ch=32, scale=4),
                    "model_path": "weights/RealESRGAN_x4plus_anime_6B.pth",
                    "netscale": 4,
                },
            }

            if model_name not in model_configs:
                raise ValueError(f"不支持的模型: {model_name}")

            config = model_configs[model_name]

            # 检查模型文件是否存在
            if not os.path.exists(config["model_path"]):
                # 下载模型
                os.makedirs("weights", exist_ok=True)
                url = f"https://github.com/xinntao/Real-ESRGAN/releases/download/v0.1.0/{os.path.basename(config['model_path'])}"
                print(f"下载模型: {url}")
                import urllib.request
                urllib.request.urlretrieve(url, config["model_path"])

            upsampler = RealESRGANer(
                scale=config["netscale"],
                model_path=config["model_path"],
                model=config["model"],
                tile=0,
                tile_pad=10,
                pre_pad=0,
                half=True,  # 使用半精度加速
            )

            models[model_name] = upsampler
            print(f"模型 {model_name} 加载完成")

        except Exception as e:
            print(f"模型加载失败: {e}")
            raise

    return models[model_name]


def upscale_with_realesrgan(image: Image.Image, scale: float, model_name: str) -> Image.Image:
    """使用 Real-ESRGAN 放大图片"""
    upsampler = get_model(model_name)

    # 转换为 numpy 数组
    img_array = np.array(image)

    # 执行超分
    output, _ = upsampler.enhance(img_array, outscale=scale)

    # 转换回 PIL Image
    output_image = Image.fromarray(output)

    return output_image


def upscale_with_bicubic(image: Image.Image, scale: float) -> Image.Image:
    """使用双三次插值放大图片"""
    new_width = int(image.width * scale)
    new_height = int(image.height * scale)
    return image.resize((new_width, new_height), Image.Resampling.LANCZOS)


@app.post("/api/upscale", response_model=UpscaleResponse)
async def upscale_image(request: UpscaleRequest):
    """
    图片超分接口
    """
    try:
        # 解码 base64 图片
        image_data = base64.b64decode(request.imageBase64.split(",")[-1])
        image = Image.open(io.BytesIO(image_data)).convert("RGB")

        original_width, original_height = image.size

        # 根据模型选择算法
        if request.model == "bicubic":
            output_image = upscale_with_bicubic(image, request.scale)
        else:
            output_image = upscale_with_realesrgan(image, request.scale, request.model)

        # 转换为 base64
        buffer = io.BytesIO()
        output_image.save(buffer, format="PNG", optimize=True)
        output_base64 = base64.b64encode(buffer.getvalue()).decode()

        return UpscaleResponse(
            success=True,
            imageUrl=f"data:image/png;base64,{output_base64}",
            metadata={
                "originalWidth": original_width,
                "originalHeight": original_height,
                "upscaledWidth": output_image.width,
                "upscaledHeight": output_image.height,
                "scale": request.scale,
                "model": request.model,
            },
        )

    except Exception as e:
        print(f"超分失败: {e}")
        import traceback
        traceback.print_exc()
        return UpscaleResponse(success=False, error=str(e))


@app.get("/health")
async def health_check():
    """健康检查"""
    return {"status": "ok", "models_loaded": list(models.keys())}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
