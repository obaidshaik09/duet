# Opens the generated deck in Microsoft PowerPoint, adds slide transitions, re-saves it
# as a native PowerPoint file, and exports a PDF copy of the slides.
# Skips quietly if PowerPoint is not installed.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$src = Join-Path $root 'docs\Duet-Class-Presentation.pptx'
$tmp = Join-Path $root 'docs\Duet-Class-Presentation.tmp.pptx'
$pdf = Join-Path $root 'docs\Duet-Class-Presentation.pdf'

try {
  $app = New-Object -ComObject PowerPoint.Application
} catch {
  Write-Host 'PowerPoint not installed - keeping the generated deck as is.'
  exit 0
}

$ppSaveAsOpenXMLPresentation = 24
$ppSaveAsPDF = 32
$ppEffectFadeSmoothly = 3849

try {
  $pres = $app.Presentations.Open($src, $false, $false, $false)
  foreach ($slide in $pres.Slides) {
    $slide.SlideShowTransition.EntryEffect = $ppEffectFadeSmoothly
    $slide.SlideShowTransition.Duration = 0.5
  }
  $pres.SaveAs($tmp, $ppSaveAsOpenXMLPresentation)
  $pres.SaveAs($pdf, $ppSaveAsPDF)
  $count = $pres.Slides.Count
  $pres.Close()
} finally {
  $app.Quit()
  [System.Runtime.InteropServices.Marshal]::ReleaseComObject($app) | Out-Null
}

Move-Item -Force $tmp $src
Write-Host "PowerPoint saved $count slides with transitions; PDF copy at docs\Duet-Class-Presentation.pdf"
