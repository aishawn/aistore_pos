param(
  [string]$FixtureDirectory = ".local/ai-eval/synthetic-asr"
)

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "../..")).Path
$fixturePath = Join-Path $repoRoot $FixtureDirectory
$manifestBuilder = Join-Path $PSScriptRoot "build-synthetic-transcription-fixtures.mjs"
$effectsScript = Join-Path $PSScriptRoot "apply-synthetic-transcription-effects.py"
$nodeExe = if ($env:ASR_NODE_BIN) { $env:ASR_NODE_BIN } else { (Get-Command node -ErrorAction Stop).Source }
$nodeVersion = [version]((& $nodeExe --version).Trim().TrimStart('v'))
if ($nodeVersion -lt [version]'24.0') {
  throw "Synthetic ASR fixture generation requires Node.js 24 or newer. Set ASR_NODE_BIN to the Node 24 executable."
}
$pythonExe = (Get-Command python -ErrorAction Stop).Source

New-Item -ItemType Directory -Force -Path $fixturePath | Out-Null
$env:ASR_FIXTURE_DIRECTORY = $FixtureDirectory
& $nodeExe $manifestBuilder
if ($LASTEXITCODE -ne 0) { throw "Could not create the synthetic ASR manifest." }

$manifest = Get-Content -LiteralPath (Join-Path $fixturePath "manifest.json") -Raw | ConvertFrom-Json
Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$voices = @($synth.GetInstalledVoices() | ForEach-Object { $_.VoiceInfo })
$voiceByLocale = @{
  "en-US" = "Microsoft Zira Desktop"
  "zh-CN" = "Microsoft Huihui Desktop"
}

try {
  foreach ($case in $manifest.cases) {
    $voiceName = $voiceByLocale[[string]$case.voiceLocale]
    if (-not ($voices | Where-Object Name -eq $voiceName)) {
      throw "Required installed synthesis voice is unavailable: $voiceName"
    }
    $synth.SelectVoice($voiceName)
    $output = Join-Path $fixturePath ([string]$case.audioFile)
    $synth.SetOutputToWaveFile($output)
    $synth.Speak([string]$case.utterance)
    $synth.SetOutputToNull()
  }
} finally {
  $synth.Dispose()
}

& $pythonExe $effectsScript (Join-Path $fixturePath "manifest.json") $fixturePath
if ($LASTEXITCODE -ne 0) { throw "Could not apply deterministic synthetic audio effects." }

[pscustomobject]@{
  manifest = (Join-Path $fixturePath "manifest.json")
  cases = $manifest.cases.Count
  englishSynthesisLocale = "en-US (Microsoft Zira Desktop)"
  chineseSynthesisLocale = "zh-CN (Microsoft Huihui Desktop)"
  outputDirectory = $fixturePath
} | ConvertTo-Json -Compress
