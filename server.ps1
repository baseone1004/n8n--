$ErrorActionPreference = "SilentlyContinue"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$port = 8000
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$port/")
try { $listener.Start() } catch {
  Write-Host "포트 $port 를 열 수 없습니다. 이미 실행 중이거나 다른 프로그램이 사용 중일 수 있어요." -ForegroundColor Yellow
  Read-Host "엔터를 누르면 닫힘"; exit
}
Start-Process "http://localhost:$port/index.html"
Write-Host ""
Write-Host "  옛이야기 스튜디오 서버 실행 중" -ForegroundColor Green
Write-Host "  주소: http://localhost:$port/index.html"
Write-Host "  (이 창을 닫으면 종료됩니다. 켜 두세요.)"
Write-Host ""
$mime = @{ ".html"="text/html; charset=utf-8"; ".js"="application/javascript; charset=utf-8"; ".mjs"="application/javascript; charset=utf-8"; ".css"="text/css; charset=utf-8"; ".json"="application/json; charset=utf-8"; ".png"="image/png"; ".jpg"="image/jpeg"; ".jpeg"="image/jpeg"; ".gif"="image/gif"; ".svg"="image/svg+xml"; ".ico"="image/x-icon"; ".txt"="text/plain; charset=utf-8" }
while ($listener.IsListening) {
  try {
    $ctx = $listener.GetContext()
    $p = [System.Uri]::UnescapeDataString($ctx.Request.Url.LocalPath)
    if ($p -eq "/") { $p = "/index.html" }
    $file = Join-Path $root ($p.TrimStart("/"))
    if (Test-Path $file -PathType Leaf) {
      $bytes = [System.IO.File]::ReadAllBytes($file)
      $ext = [System.IO.Path]::GetExtension($file).ToLower()
      if ($mime.ContainsKey($ext)) { $ctx.Response.ContentType = $mime[$ext] }
      $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    } else { $ctx.Response.StatusCode = 404 }
    $ctx.Response.Close()
  } catch { }
}
