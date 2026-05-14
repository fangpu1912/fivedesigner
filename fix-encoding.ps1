$content = Get-Content 'd:\trae_projects\fivedesigner\src\pages\StoryboardDraw.tsx' -Raw -Encoding UTF8

$replacements = @{
    "鍦ㄥ彸渚ч厤缃€弬鏁板苟鐢熸垚" = "在右侧配置参数并生成"
    "鐢熸垚鎻愮ず璇?" = "生成提示词"
    "鍙傝€冨浘锛氫綔涓洪€?鍐呭?鍙傝€冿紝杈呭姪鐢熸垚" = "参考图：作为首帧/内容参考，辅助生成"
}

foreach ($key in $replacements.Keys) {
    if ($content.Contains($key)) {
        $content = $content.Replace($key, $replacements[$key])
        Write-Host "Replaced: $($key.Substring(0, [Math]::Min(20, $key.Length)))... -> $($replacements[$key])"
    }
}

Set-Content -Path 'd:\trae_projects\fivedesigner\src\pages\StoryboardDraw.tsx' -Value $content -Encoding UTF8
Write-Host "`nDone!"
