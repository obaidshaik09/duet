# Opens docs/Duet-Sales-Pitch.pptx in Microsoft PowerPoint, embeds each slide's voiceover so it plays
# automatically, times every slide to its narration, adds transitions, and exports docs/Duet-Sales-Pitch.mp4.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$src = Join-Path $root 'docs\Duet-Sales-Pitch.pptx'
$tmp = Join-Path $root 'docs\Duet-Sales-Pitch.tmp.pptx'
$mp4 = Join-Path $root 'docs\Duet-Sales-Pitch.mp4'
$audioDir = Join-Path $root 'docs\pitch-audio'

try {
  $app = New-Object -ComObject PowerPoint.Application
} catch {
  Write-Host 'PowerPoint not installed - the deck is built but has no embedded voice or video.'
  exit 0
}

$msoTrue = -1
$msoFalse = 0
$ppSaveAsOpenXMLPresentation = 24
$ppEffectFadeSmoothly = 3849
$msoAnimEffectMediaPlay = 83
$msoAnimTriggerAfterPrevious = 3
$ppMediaTaskStatusDone = 3
$ppMediaTaskStatusFailed = 4

try {
  $pres = $app.Presentations.Open($src, $msoFalse, $msoFalse, $msoFalse)
  $offSlide = $pres.PageSetup.SlideWidth + 40
  $total = 0.0
  $i = 0
  foreach ($slide in $pres.Slides) {
    $i++
    $clip = Join-Path $audioDir ('slide{0:D2}.mp3' -f $i)
    $slide.SlideShowTransition.EntryEffect = $ppEffectFadeSmoothly
    $slide.SlideShowTransition.Duration = 0.6
    $seconds = 5.0
    if (Test-Path $clip) {
      # Kept just off the slide so the speaker icon never shows; it still plays in the show and the video.
      $audio = $slide.Shapes.AddMediaObject2($clip, $msoFalse, $msoTrue, $offSlide, 20, 40, 40)
      $audio.Name = "Voiceover $i"
      $slide.TimeLine.MainSequence.AddEffect($audio, $msoAnimEffectMediaPlay, 0, $msoAnimTriggerAfterPrevious) | Out-Null
      $seconds = $audio.MediaFormat.Length / 1000.0 + 0.9
    }
    $slide.SlideShowTransition.AdvanceOnClick = $msoTrue
    $slide.SlideShowTransition.AdvanceOnTime = $msoTrue
    $slide.SlideShowTransition.AdvanceTime = [math]::Round($seconds, 1)
    $total += $seconds + 0.6
  }
  $pres.SaveAs($tmp, $ppSaveAsOpenXMLPresentation)
  Write-Host ('Embedded voiceover on {0} slides (about {1:N0} seconds). Exporting the video...' -f $i, $total)

  $pres.CreateVideo($mp4, $true, 5, 1080, 30, 90)
  do {
    Start-Sleep -Seconds 3
    $status = $pres.CreateVideoStatus
  } while ($status -ne $ppMediaTaskStatusDone -and $status -ne $ppMediaTaskStatusFailed)
  $pres.Close()
  if ($status -eq $ppMediaTaskStatusFailed) { throw 'PowerPoint could not export the video.' }
} finally {
  $app.Quit()
  [System.Runtime.InteropServices.Marshal]::ReleaseComObject($app) | Out-Null
}

Move-Item -Force $tmp $src
Write-Host 'Saved docs\Duet-Sales-Pitch.pptx (narrated, plays by itself) and docs\Duet-Sales-Pitch.mp4'
