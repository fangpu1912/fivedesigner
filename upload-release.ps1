# 使用 GitHub API 创建 Release 并上传安装包
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

# 文件路径
$msiPath = "src-tauri/target/release/bundle/msi/FiveDesigner_1.0.0_x64_en-US.msi"
$exePath = "src-tauri/target/release/bundle/nsis/FiveDesigner_1.0.0_x64-setup.exe"

Write-Host "开始创建 GitHub Release..." -ForegroundColor Green
Write-Host ""

# 提示用户输入 GitHub Token
Write-Host "需要 GitHub Personal Access Token (PAT) 来创建 Release" -ForegroundColor Yellow
Write-Host "如果没有，请在 GitHub 创建: https://github.com/settings/tokens/new" -ForegroundColor Cyan
Write-Host "权限需要勾选: repo" -ForegroundColor Cyan
Write-Host ""

$token = Read-Host "请输入 GitHub Token"

if ([string]::IsNullOrWhiteSpace($token)) {
    Write-Host "Token 不能为空，退出..." -ForegroundColor Red
    exit 1
}

$headers = @{
    "Authorization" = "token $token"
    "Accept" = "application/vnd.github.v3+json"
}

# 创建 Release
$releaseData = @{
    tag_name = $tag
    name = $releaseName
    body = $body
    draft = $false
    prerelease = $false
} | ConvertTo-Json

try {
    Write-Host "创建 Release..." -ForegroundColor Yellow
    $release = Invoke-RestMethod -Uri "https://api.github.com/repos/$owner/$repo/releases" -Method Post -Headers $headers -ContentType "application/json" -Body $releaseData
    $uploadUrl = $release.upload_url -replace "{\\?name,label}", ""
    Write-Host "Release 创建成功! ID: $($release.id)" -ForegroundColor Green
    Write-Host ""

    # 上传 MSI
    Write-Host "上传 MSI 安装包..." -ForegroundColor Yellow
    $msiFile = Get-Item $msiPath
    $msiName = $msiFile.Name
    $msiUrl = "$uploadUrl?name=$msiName"
    Invoke-RestMethod -Uri $msiUrl -Method Post -Headers $headers -ContentType "application/octet-stream" -InFile $msiPath
    Write-Host "MSI 上传成功!" -ForegroundColor Green

    # 上传 EXE
    Write-Host "上传 EXE 安装包..." -ForegroundColor Yellow
    $exeFile = Get-Item $exePath
    $exeName = $exeFile.Name
    $exeUrl = "$uploadUrl?name=$exeName"
    Invoke-RestMethod -Uri $exeUrl -Method Post -Headers $headers -ContentType "application/octet-stream" -InFile $exePath
    Write-Host "EXE 上传成功!" -ForegroundColor Green

    Write-Host ""
    Write-Host "============================================" -ForegroundColor Green
    Write-Host "Release 创建并上传完成!" -ForegroundColor Green
    Write-Host "访问: https://github.com/$owner/$repo/releases/tag/$tag" -ForegroundColor Cyan
    Write-Host "============================================" -ForegroundColor Green
}
catch {
    Write-Host "错误: $_" -ForegroundColor Red
    Write-Host ""
    Write-Host "可能需要手动创建 Release，请运行: .\release.ps1" -ForegroundColor Yellow
}
