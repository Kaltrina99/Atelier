<#
.SYNOPSIS
  Scaffolds a new feature (backend + frontend) by copying the Products template.
.EXAMPLE
  ./scripts/new-feature.ps1 -Name Customer -Plural Customers
#>
param(
    [Parameter(Mandatory)] [string] $Name,     # PascalCase singular, e.g. Customer
    [Parameter(Mandatory)] [string] $Plural    # PascalCase plural,   e.g. Customers
)
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$lower = { param($s) $s.Substring(0,1).ToLower() + $s.Substring(1) }

$map = [ordered]@{
    "Products" = $Plural
    "products" = & $lower $Plural
    "Product"  = $Name
    "product"  = & $lower $Name
}

function Copy-Template($src, $dst) {
    if (Test-Path $dst) { throw "$dst already exists" }
    New-Item -ItemType Directory -Path $dst | Out-Null
    Get-ChildItem $src -File | ForEach-Object {
        $newName = $_.Name
        $text = Get-Content $_.FullName -Raw
        foreach ($k in $map.Keys) {
            $newName = $newName.Replace($k, $map[$k])
            $text = $text -creplace [regex]::Escape($k), $map[$k]
        }
        Set-Content -Path (Join-Path $dst $newName) -Value $text -NoNewline -Encoding utf8
        Write-Host "  + $newName"
    }
}

$api = Get-ChildItem "$root/backend/src" -Directory | Select-Object -First 1
Write-Host "Backend:"
Copy-Template "$($api.FullName)/Features/Products" "$($api.FullName)/Features/$Plural"
Write-Host "Frontend:"
Copy-Template "$root/frontend/src/features/products" "$root/frontend/src/features/$(& $lower $Plural)"

Write-Host "`nNext:"
Write-Host "  1. Edit the fields in $Name.cs, ${Name}Contracts.cs, types.ts and ${Name}Form.tsx"
Write-Host "  2. Create the database migration (run AFTER editing the fields):"
Write-Host "       dotnet tool restore"
Write-Host "       dotnet build `"$($api.FullName)`""
Write-Host "       dotnet ef migrations add Add$Plural --project `"$($api.FullName)`" --output-dir Common/Data/Migrations"
Write-Host "  3. Restart the API - the migration is applied on startup in Development."
