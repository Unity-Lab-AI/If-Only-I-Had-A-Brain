# Run by start.bat / Savestart.bat on EVERY launch, after her pages open.
# Keeps the newest of each window/tab the launchers create and closes the
# older copies left from previous boots. Never touches the running brain
# window ("leave running") or tabs it did not open.
#
# ⛔ NOT ONE PASS AT A FIXED DELAY. One pass 20 s after the pages were opened
# missed the duplicates on two launches in a row (a pass run by hand afterwards
# closed them every time): the new tabs were not all there / titled yet. The tab
# pass now repeats every $EverySec for $WatchSec, so a tab that opens or loads
# late is still caught. Every run is logged to server\cleanup-windows.log, so a
# launch that closed nothing says so instead of being silent.
param([int]$DelaySec = 10, [int]$WatchSec = 120, [int]$EverySec = 10)
$log = Join-Path $PSScriptRoot '..\server\cleanup-windows.log'
function Log($s) { $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $s"; $line; try { Add-Content -Path $log -Value $line } catch {} }
Log "cleanup start (pid $PID) delay=${DelaySec}s watch=${WatchSec}s every=${EverySec}s"
Start-Sleep -Seconds $DelaySec
# 1) log tails: keep the newest Get-Content -Wait on server.log, kill older ones
$tails = Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match 'Get-Content -Path .*server\.log.* -Wait' -and $_.CommandLine -notmatch 'CimInstance' } | Sort-Object CreationDate
if ($tails.Count -gt 1) { $tails | Select-Object -SkipLast 1 | ForEach-Object { Stop-Process -Id $_.ProcessId -Force; Log "killed old tail $($_.ProcessId) $($_.CreationDate)" } }
# 2) Chrome duplicate tabs: close older copies (tab order = open order) until one of each remains
Add-Type -AssemblyName UIAutomationClient,UIAutomationTypes
$r=[Windows.Automation.AutomationElement]::RootElement
$c=New-Object Windows.Automation.PropertyCondition([Windows.Automation.AutomationElement]::ClassNameProperty,'Chrome_WidgetWin_1')
$t=New-Object Windows.Automation.PropertyCondition([Windows.Automation.AutomationElement]::ControlTypeProperty,[Windows.Automation.ControlType]::TabItem)
$b=New-Object Windows.Automation.PropertyCondition([Windows.Automation.AutomationElement]::ControlTypeProperty,[Windows.Automation.ControlType]::Button)
$closedTotal = 0
$t0 = Get-Date
$round = 0
do {
  $round++
  $closedThisRound = 0
  foreach ($key in 'Camera recording','Live Dashboard','Teach View','BRAINPAGE','localhost') {
    for ($pass = 0; $pass -lt 6; $pass++) {
      $m = @(); foreach ($w in $r.FindAll('Children',$c)) { $m += @($w.FindAll('Descendants',$t) | Where-Object {
        # Match on words only: Chrome's title separators are not ASCII " - ".
        if ($key -eq 'BRAINPAGE') { $_.Current.Name -match 'IF ONLY I HAD A BRAIN' -and $_.Current.Name -notmatch 'Camera recording' -and $_.Current.Name -notmatch 'Repositories|donor-release' }
        else { $_.Current.Name -like ('*'+$key+'*') } }) }
      if ($m.Count -le 1) { break }
      $x = $m[0]; $n = $x.Current.Name
      $btn = $x.FindAll('Descendants',$b) | Where-Object { $_.Current.Name -match 'Close' -and $_.Current.IsEnabled } | Select-Object -First 1
      if ($btn) { $btn.GetCurrentPattern([Windows.Automation.InvokePattern]::Pattern).Invoke(); Log "closed tab: $n"; $closedThisRound++; Start-Sleep -Milliseconds 400 }
      else {
        # A background tab exposes no Close button to automation: select it, then Ctrl+W.
        try {
          $x.GetCurrentPattern([Windows.Automation.SelectionItemPattern]::Pattern).Select()
          Start-Sleep -Milliseconds 300
          $x.SetFocus()
          Add-Type -AssemblyName System.Windows.Forms
          [System.Windows.Forms.SendKeys]::SendWait('^w')
          Log "closed tab (ctrl+w): $n"; $closedThisRound++; Start-Sleep -Milliseconds 500
        } catch { Log "could not close tab: $n ($($_.Exception.Message))"; break }
      }
    }
  }
  $closedTotal += $closedThisRound
  if (((Get-Date) - $t0).TotalSeconds -ge $WatchSec) { break }
  Start-Sleep -Seconds $EverySec
} while ($true)
# 3) dead launcher cmd windows from earlier boots — never the live 'leave running' ones
Get-Process cmd -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -and $_.MainWindowTitle -notmatch 'leave running' -and $_.MainWindowTitle -match 'Savestart|start\.bat|system32\\cmd' -and $_.Id -ne $PID } | ForEach-Object { Stop-Process -Id $_.Id -Force; Log "killed cmd $($_.Id) $($_.MainWindowTitle)" }
$tabs = @(); foreach ($w in $r.FindAll('Children',$c)) { $tabs += @($w.FindAll('Descendants',$t) | ForEach-Object { $_.Current.Name }) }
Log "cleanup done: $round round(s), $closedTotal tab(s) closed; brain tabs left: $(@($tabs | Where-Object { $_ -match 'IF ONLY I HAD A BRAIN|Live Dashboard|Teach View' }).Count)"
