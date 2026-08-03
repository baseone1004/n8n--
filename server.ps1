$ErrorActionPreference = "SilentlyContinue"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$port = 8000
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$port/")
try { $listener.Start() } catch {
  Write-Host "포트 $port 를 열 수 없습니다. 이미 실행 중이거나 다른 프로그램이 사용 중일 수 있어요." -ForegroundColor Yellow
  Read-Host "엔터를 누르면 닫힘"; exit
}
# 브라우저는 사용자가 latest.html을 열 때만 실행합니다.
Write-Host ""
Write-Host "  옛이야기 스튜디오 서버 실행 중 (타입캐스트/KIE 중계 포함)" -ForegroundColor Green
Write-Host "  주소: http://localhost:$port/index.html"
Write-Host "  (이 창을 닫으면 종료됩니다. 켜 두세요.)"
Write-Host ""
$mime = @{ ".html"="text/html; charset=utf-8"; ".js"="application/javascript; charset=utf-8"; ".mjs"="application/javascript; charset=utf-8"; ".css"="text/css; charset=utf-8"; ".json"="application/json; charset=utf-8"; ".png"="image/png"; ".jpg"="image/jpeg"; ".jpeg"="image/jpeg"; ".gif"="image/gif"; ".svg"="image/svg+xml"; ".ico"="image/x-icon"; ".txt"="text/plain; charset=utf-8" }

while ($listener.IsListening) {
  try {
    $ctx = $listener.GetContext()
    $reqPath = $ctx.Request.Url.LocalPath

    # ---- CORS 우회용 중계(proxy): /__proxy?u=<대상 URL> ----
    if ($reqPath -eq "/__proxy") {
      $target = $ctx.Request.QueryString["u"]
      $method = $ctx.Request.HttpMethod
      $reqBody = $null
      if ($ctx.Request.HasEntityBody) {
        $sr = New-Object System.IO.StreamReader($ctx.Request.InputStream, $ctx.Request.ContentEncoding)
        $reqBody = $sr.ReadToEnd(); $sr.Close()
      }
      try {
        $req = [System.Net.HttpWebRequest]::Create($target)
        $req.Method = $method
        $auth = $ctx.Request.Headers["Authorization"]; if ($auth) { $req.Headers["Authorization"] = $auth }
        $ct = $ctx.Request.Headers["Content-Type"]; if ($ct) { $req.ContentType = $ct }
        if ($reqBody) {
          $bytes = [System.Text.Encoding]::UTF8.GetBytes($reqBody)
          $req.ContentLength = $bytes.Length
          $s = $req.GetRequestStream(); $s.Write($bytes, 0, $bytes.Length); $s.Close()
        }
        try { $resp = $req.GetResponse() } catch [System.Net.WebException] { $resp = $_.Exception.Response }
        $rs = $resp.GetResponseStream()
        $ms = New-Object System.IO.MemoryStream; $rs.CopyTo($ms); $outBytes = $ms.ToArray()
        if ($resp.ContentType) { $ctx.Response.ContentType = $resp.ContentType }
        try { $ctx.Response.StatusCode = [int]$resp.StatusCode } catch {}
        $ctx.Response.OutputStream.Write($outBytes, 0, $outBytes.Length)
      } catch {
        $ctx.Response.StatusCode = 502
        $errb = [System.Text.Encoding]::UTF8.GetBytes("proxy error: " + $_.Exception.Message)
        $ctx.Response.OutputStream.Write($errb, 0, $errb.Length)
      }
      $ctx.Response.Close()
      continue
    }

    # ---- 정적 파일 서빙 ----
    $p = [System.Uri]::UnescapeDataString($reqPath)
    if ($p -eq "/") { $p = "/index.html" }
    $file = Join-Path $root ($p.TrimStart("/"))
    if (Test-Path $file -PathType Leaf) {
      $fbytes = [System.IO.File]::ReadAllBytes($file)
      $ext = [System.IO.Path]::GetExtension($file).ToLower()
      if ($mime.ContainsKey($ext)) { $ctx.Response.ContentType = $mime[$ext] }
      $ctx.Response.Headers["Cache-Control"] = "no-store, no-cache, must-revalidate"
      $ctx.Response.OutputStream.Write($fbytes, 0, $fbytes.Length)
    } else { $ctx.Response.StatusCode = 404 }
    $ctx.Response.Close()
  } catch { }
}
