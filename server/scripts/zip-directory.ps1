param(
  [Parameter(Mandatory = $true)][string]$SourcePath,
  [Parameter(Mandatory = $true)][string]$ZipPath
)

if (Test-Path $ZipPath) {
  Remove-Item -LiteralPath $ZipPath -Force
}

$items = Get-ChildItem -LiteralPath $SourcePath -File | Where-Object { $_.Extension -in ".docx", ".pdf" }
if ($items.Count -eq 0) {
  throw "No export files found to archive."
}

Compress-Archive -LiteralPath $items.FullName -DestinationPath $ZipPath -Force
