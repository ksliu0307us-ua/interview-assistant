# Opens Windows Firewall for Next.js on your LAN.
# MUST run in an elevated PowerShell (Run as administrator).

param([int] $Port = 3000)

$ruleName = "Interview Assist (Next.js) TCP $Port"
$existing = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
if ($existing) {
  Write-Host "Rule already exists: $ruleName"
  exit 0
}

try {
  New-NetFirewallRule `
    -DisplayName $ruleName `
    -Direction Inbound `
    -LocalPort $Port `
    -Protocol TCP `
    -Action Allow `
    -ErrorAction Stop | Out-Null
  Write-Host "OK: Inbound TCP port $Port is allowed ($ruleName)." -ForegroundColor Green
  exit 0
}
catch {
  Write-Host "FAILED: $($_.Exception.Message)" -ForegroundColor Red
  Write-Host ""
  Write-Host "This command needs Administrator rights."
  Write-Host "  - Close this window, open Start -> type PowerShell -> right-click -> Run as administrator"
  Write-Host "  - cd to your project, then: .\scripts\allow-lan-firewall.ps1"
  Write-Host ""
  Write-Host "Or add the rule by hand: Windows Security -> Firewall & network protection ->"
  Write-Host "Advanced settings -> Inbound Rules -> New Rule -> Port -> TCP -> $Port -> Allow"
  exit 1
}
