<#
.SYNOPSIS
  Renames the whole template (namespaces, project files, folders, app title).
  Run once, right after copying the template for a new application.
.EXAMPLE
  ./scripts/rename-project.ps1 -NewName RiskPortal
#>
param([Parameter(Mandatory)] [string] $NewName, [string] $OldName = "Starter")
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$skip = '\\(node_modules|bin|obj|dist|\.git)(\\|$)|/(node_modules|bin|obj|dist|\.git)(/|$)'
$oldKebab = $OldName.ToLower(); $newKebab = $NewName.ToLower()

# 1. File contents
Get-ChildItem $root -Recurse -File | Where-Object { $_.FullName -notmatch $skip -and $_.Name -notmatch 'rename-project' } |
ForEach-Object {
    $text = Get-Content $_.FullName -Raw
    if ($null -ne $text -and ($text.Contains($OldName) -or $text.Contains("$oldKebab-web"))) {
        $text = $text.Replace($OldName, $NewName).Replace("$oldKebab-web", "$newKebab-web")
        Set-Content $_.FullName $text -NoNewline -Encoding utf8
    }
}

# 2. File and folder names (deepest first)
Get-ChildItem $root -Recurse | Where-Object { $_.FullName -notmatch $skip -and $_.Name.Contains($OldName) } |
Sort-Object { $_.FullName.Length } -Descending |
ForEach-Object { Rename-Item $_.FullName $_.Name.Replace($OldName, $NewName) }

Write-Host "Renamed $OldName -> $NewName"
