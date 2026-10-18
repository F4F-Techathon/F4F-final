$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$format = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(24000, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)
$voices = @($synth.GetInstalledVoices() | Where-Object { $_.Enabled -and $_.VoiceInfo.Culture.Name -eq 'zh-CN' } | ForEach-Object { $_.VoiceInfo.Name })
try {
  while ($null -ne ($line = [Console]::ReadLine())) {
    try {
      $request = $line | ConvertFrom-Json
      $preferred = switch ($request.voice) {
        'rong' { 'Yaoyao' }
        'hua' { 'Kangkang' }
        default { 'Huihui' }
      }
      $name = $voices | Where-Object { $_ -match $preferred } | Select-Object -First 1
      if (-not $name) { $name = $voices | Select-Object -First 1 }
      if (-not $name) { throw 'No installed Chinese Windows voice' }
      $synth.SelectVoice($name)
      $synth.Rate = switch ($request.voice) { 'rong' { 1 } 'pierre' { -1 } default { 0 } }
      $memory = New-Object System.IO.MemoryStream
      try {
        $synth.SetOutputToAudioStream($memory, $format)
        $synth.Speak([string]$request.text)
        $pcm = [Convert]::ToBase64String($memory.ToArray())
        [Console]::WriteLine((@{ pcm = $pcm; sampleRate = 24000; voice = $name } | ConvertTo-Json -Compress))
      } finally {
        $synth.SetOutputToNull()
        $memory.Dispose()
      }
    } catch {
      [Console]::WriteLine((@{ error = $_.Exception.Message } | ConvertTo-Json -Compress))
    }
  }
} finally { $synth.Dispose() }
