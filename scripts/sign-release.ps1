# 签名安装包并更新 update.json
# 用法: .\scripts\sign-release.ps1 -Version "1.0.1" -ExePath "src-tauri/target/release/bundle/nsis/FiveDesigner_1.0.0_x64-setup.exe"

param(
  [Parameter(Mandatory = $true)]
  [string]$Version,
  [Parameter(Mandatory = $true)]
  [string]$ExePath,
  [string]$Notes = "新版本更新",
  [string]$PrivateKeyPath = ".tauri/update-keys"
)

$ErrorActionPreference = "Stop"

# 检查文件是否存在
if (-not (Test-Path $ExePath)) {
  Write-Host "错误: 安装包不存在: $ExePath" -ForegroundColor Red
  exit 1
}

if (-not (Test-Path $PrivateKeyPath)) {
  Write-Host "错误: 私钥不存在: $PrivateKeyPath" -ForegroundColor Red
  exit 1
}

# 读取私钥密码
$password = Read-Host "请输入私钥密码" -AsSecureString
$BSTR = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($password)
$plainPassword = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($BSTR)

# 生成签名
Write-Host "生成签名..." -ForegroundColor Yellow
$env:TAURI_SIGNING_PRIVATE_KEY_PATH = (Resolve-Path $PrivateKeyPath).Path
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = $plainPassword

$signature = npx tauri signer sign --password $plainPassword (Resolve-Path $ExePath).Path 2>&1 | Select-Object -Last 1

if (-not $signature) {
  Write-Host "签名生成失败" -ForegroundColor Red
  exit 1
}

Write-Host "签名: $signature" -ForegroundColor Green

# 更新 update.json
$updateJsonPath = "update.json"
$updateJson = Get-Content $updateJsonPath -Raw | ConvertFrom-Json

$updateJson.version = $Version
$updateJson.notes = $Notes
$updateJson.pub_date = (Get-Date -Format "yyyy-MM-ddTHH:mm:sszzz")
$updateJson.platforms."windows-x86_64".signature = $signature
$updateJson.platforms."windows-x86_64".url = "https://github.com/fangpu1912/fivedesigner/releases/download/v$Version/FiveDesigner_${Version}_x64-setup.exe"

$updateJson | ConvertTo-Json -Depth 10 | Set-Content $updateJsonPath -Encoding UTF8

Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host "签名完成! update.json 已更新" -ForegroundColor Green
Write-Host "版本: $Version" -ForegroundColor Cyan
Write-Host "请提交并推送 update.json 到 GitHub" -ForegroundColor Yellow
Write-Host "============================================" -ForegroundColor Green