$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path $PSScriptRoot -Parent
$outputDir = Join-Path $repoRoot '.artifacts/deploy'
New-Item -ItemType Directory -Force -Path $outputDir | Out-Null
$archivePath = Join-Path $outputDir 'reelcast-web.tar.gz'
Push-Location $repoRoot
try {
    tar --exclude=node_modules --exclude=.next --exclude=.env* --exclude=*.log `
        --exclude=*.tsbuildinfo --exclude=*.pem --exclude=.git --exclude=.lovable `
        -czf $archivePath compose.prod.yml deploy/Caddyfile frontend/Dockerfile `
        frontend/.dockerignore frontend/package.json frontend/package-lock.json `
        frontend/next.config.mjs frontend/tsconfig.json frontend/postcss.config.js `
        frontend/tailwind.config.ts frontend/components.json frontend/public frontend/src
    if ($LASTEXITCODE -ne 0) { throw 'Web deployment archive creation failed.' }
    Write-Output "Prepared: $archivePath"
} finally {
    Pop-Location
}
