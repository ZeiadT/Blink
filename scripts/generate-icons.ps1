Add-Type -AssemblyName System.Drawing

$sizes = @(16, 32, 48, 128)
$outputDir = "c:\Business\Blink\public\icons"

foreach ($size in $sizes) {
    $bmp = New-Object System.Drawing.Bitmap($size, $size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias

    # Dark background
    $bgBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(10, 10, 15))
    $g.FillRectangle($bgBrush, 0, 0, $size, $size)

    # Purple gradient circle
    $padding = [int]($size * 0.1)
    $rect = New-Object System.Drawing.Rectangle($padding, $padding, ($size - 2 * $padding), ($size - 2 * $padding))
    $gradBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush($rect, [System.Drawing.Color]::FromArgb(108, 92, 231), [System.Drawing.Color]::FromArgb(168, 85, 247), [System.Drawing.Drawing2D.LinearGradientMode]::ForwardDiagonal)
    $g.FillEllipse($gradBrush, $rect)

    # Lightning bolt shape (simplified)
    $cx = $size / 2
    $cy = $size / 2
    $s = $size * 0.25
    $points = @(
        [System.Drawing.PointF]::new($cx - $s * 0.1, $cy - $s),
        [System.Drawing.PointF]::new($cx + $s * 0.5, $cy - $s),
        [System.Drawing.PointF]::new($cx - $s * 0.05, $cy + $s * 0.1),
        [System.Drawing.PointF]::new($cx + $s * 0.15, $cy + $s * 0.1),
        [System.Drawing.PointF]::new($cx - $s * 0.4, $cy + $s),
        [System.Drawing.PointF]::new($cx + $s * 0.1, $cy - $s * 0.1)
    )
    $whiteBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
    $g.FillPolygon($whiteBrush, $points)

    $g.Dispose()
    $outputPath = Join-Path $outputDir "icon-$size.png"
    $bmp.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    Write-Host "Created icon-$size.png"
}

Write-Host "All icons generated."
