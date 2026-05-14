# 创建 GitHub Release 并上传安装包
$owner = "fangpu1912"
$repo = "fivedesigner"
$tag = "v1.0.0"
$releaseName = "FiveDesigner v1.0.0"

$body = @"
🎉 初始开源版本

## 功能特性
- ✨ AI 驱动的剧本创作与灵感生成
- 🎭 角色/场景/道具资产管理
- 🎬 可视化分镜编排
- 🤖 多供应商 AI 集成（图像/视频/语音生成）
- 🔄 工作流节点编辑器
- 🔊 配音合成与样片审阅

## 安装说明
- **MSI 安装包**（推荐）：双击安装，支持系统卸载
- **EXE 安装程序**：便携安装，自动配置环境

## 系统要求
- Windows 10/11
- 需要 AI 供应商 API Key（首次启动配置）

## 开源协议
MIT License

---

## 支持作者
⭐ **Star 项目**: https://github.com/$owner/$repo
🐛 **提交 Issue**: https://github.com/$owner/$repo/issues
💡 **功能建议**: https://github.com/$owner/$repo/discussions

您的支持是我们持续开发的动力！
"@

# 获取上传 URL
$releaseData = @{
    tag_name = $tag
    name = $releaseName
    body = $body
    draft = $false
    prerelease = $false
} | ConvertTo-Json

Write-Host "请在浏览器中手动创建 Release 并上传文件：" -ForegroundColor Green
Write-Host ""
Write-Host "1. 访问: https://github.com/$owner/$repo/releases/new" -ForegroundColor Cyan
Write-Host ""
Write-Host "2. 填写信息：" -ForegroundColor Yellow
Write-Host "   Tag version: $tag"
Write-Host "   Release title: $releaseName"
Write-Host ""
Write-Host "3. 复制以下描述内容：" -ForegroundColor Yellow
Write-Host "----------------------------------------"
Write-Host $body
Write-Host "----------------------------------------"
Write-Host ""
Write-Host "4. 上传文件：" -ForegroundColor Yellow
Write-Host "   - FiveDesigner_1.0.0_x64_en-US.msi"
Write-Host "   - FiveDesigner_1.0.0_x64-setup.exe"
Write-Host ""
Write-Host "文件位置：" -ForegroundColor Cyan
Write-Host "  src-tauri\target\release\bundle\msi\FiveDesigner_1.0.0_x64_en-US.msi"
Write-Host "  src-tauri\target\release\bundle\nsis\FiveDesigner_1.0.0_x64-setup.exe"
Write-Host ""
Write-Host "5. 点击 Publish release" -ForegroundColor Green

# 尝试自动打开浏览器
$releaseUrl = "https://github.com/$owner/$repo/releases/new"
try {
    Start-Process $releaseUrl
    Write-Host ""
    Write-Host "已尝试在浏览器中打开创建页面..." -ForegroundColor Green
} catch {
    Write-Host ""
    Write-Host "请手动访问: $releaseUrl" -ForegroundColor Red
}
