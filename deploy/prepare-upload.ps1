$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path $PSScriptRoot -Parent
$outputDir = Join-Path $repoRoot '.artifacts/deploy'
New-Item -ItemType Directory -Force -Path $outputDir | Out-Null
$archivePath = Join-Path $outputDir 'reelcast-services.tar.gz'
Push-Location $repoRoot
try {
    # Explicit paths keep private environments, dumps, virtualenvs and local
    # artifacts out of the upload. Environments are transferred separately.
    tar --exclude=__pycache__ --exclude=*.pyc --exclude=*.log --exclude=.env* --exclude=*.pem -czf $archivePath `
        compose.prod.yml backend/Dockerfile backend/.dockerignore `
        backend/requirements.txt backend/app backend/scripts `
        tracking-provider-adapter/Dockerfile tracking-provider-adapter/.dockerignore `
        tracking-provider-adapter/requirements.txt tracking-provider-adapter/app
    if ($LASTEXITCODE -ne 0) { throw 'Deployment archive creation failed.' }
    Write-Output "Prepared: $archivePath"
} finally {
    Pop-Location
}
