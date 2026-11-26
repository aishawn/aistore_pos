param(
  [string]$FixtureDirectory = ".local/ai-eval/synthetic-asr"
)

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "../..")).Path
$fixturePath = Join-Path $repoRoot $FixtureDirectory
$manifestBuilder = Join-Path $PSScriptRoot "build-synthetic-transcription-fixtures.mjs"
$audioConverter = Join-Path $PSScriptRoot "convert-synthetic-transcription-audio.py"
$effectsScript = Join-Path $PSScriptRoot "apply-synthetic-transcription-effects.py"
$nodeExe = if ($env:ASR_NODE_BIN) { $env:ASR_NODE_BIN } else { (Get-Command node -ErrorAction Stop).Source }
$nodeVersion = [version]((& $nodeExe --version).Trim().TrimStart('v'))
if ($nodeVersion -lt [version]'24.0') {
  throw "Synthetic ASR fixture generation requires Node.js 24 or newer. Set ASR_NODE_BIN to the Node 24 executable."
}
$pythonExe = (Get-Command python -ErrorAction Stop).Source
$edgeTts = if ($env:EDGE_TTS_BIN) {
  if (-not (Test-Path -LiteralPath $env:EDGE_TTS_BIN -PathType Leaf)) {
    throw "EDGE_TTS_BIN does not point to an executable file: $env:EDGE_TTS_BIN"
  }
  (Resolve-Path -LiteralPath $env:EDGE_TTS_BIN).Path
} else {
  (Get-Command edge-tts -ErrorAction Stop).Source
}

New-Item -ItemType Directory -Force -Path $fixturePath | Out-Null
$env:ASR_FIXTURE_DIRECTORY = $FixtureDirectory
& $nodeExe $manifestBuilder
if ($LASTEXITCODE -ne 0) { throw "Could not create the synthetic ASR manifest." }

$manifest = Get-Content -LiteralPath (Join-Path $fixturePath "manifest.json") -Raw | ConvertFrom-Json
Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$voices = @($synth.GetInstalledVoices() | ForEach-Object { $_.VoiceInfo })
if (-not ($voices | Where-Object Name -eq "Microsoft Huihui Desktop")) {
  throw "Required installed synthesis voice is unavailable: Microsoft Huihui Desktop"
}

try {
  foreach ($case in $manifest.cases) {
    $output = Join-Path $fixturePath ([string]$case.audioFile)
    if ([string]$case.voiceLocale -eq "en-AU") {
      $temporaryMp3 = Join-Path $fixturePath ([string]$case.id + ".edge.mp3")
      $edgeArgs = @(
        "--text", [string]$case.utterance,
        "--voice", "en-AU-NatashaNeural",
        "--write-media", $temporaryMp3
      )
      & $edgeTts @edgeArgs
      if ($LASTEXITCODE -ne 0) { throw "Edge TTS failed for sample $($case.id)." }
      & $pythonExe $audioConverter $temporaryMp3 $output
      if ($LASTEXITCODE -ne 0) { throw "WAV conversion failed for sample $($case.id)." }
      Remove-Item -LiteralPath $temporaryMp3 -Force
    } elseif ([string]$case.voiceLocale -eq "zh-CN") {
      $temporaryWav = Join-Path $fixturePath ([string]$case.id + ".synth.wav")
      $synth.SelectVoice("Microsoft Huihui Desktop")
      $synth.SetOutputToWaveFile($temporaryWav)
      $synth.Speak([string]$case.utterance)
      $synth.SetOutputToNull()
      & $pythonExe $audioConverter $temporaryWav $output
      if ($LASTEXITCODE -ne 0) { throw "WAV normalization failed for sample $($case.id)." }
      Remove-Item -LiteralPath $temporaryWav -Force
    } else {
      throw "Unsupported synthesis locale: $($case.voiceLocale)"
    }
  }
} finally {
  $synth.Dispose()
}

& $pythonExe $effectsScript (Join-Path $fixturePath "manifest.json") $fixturePath
if ($LASTEXITCODE -ne 0) { throw "Could not apply deterministic synthetic audio effects." }

[pscustomobject]@{
  manifest = (Join-Path $fixturePath "manifest.json")
  cases = $manifest.cases.Count
  englishSynthesisLocale = "en-AU (Microsoft Edge Natasha Neural)"
  chineseSynthesisLocale = "zh-CN (Microsoft Huihui Desktop)"
  outputDirectory = $fixturePath
} | ConvertTo-Json -Compress
