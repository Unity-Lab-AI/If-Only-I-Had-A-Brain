# Run by start.bat / Savestart.bat on EVERY launch, after her pages open.
# Keeps the newest of each window/tab the launchers create and closes the
# older copies left from previous boots. Never touches the running brain
# window ("leave running") or tabs it did not open.
param([int]$DelaySec = 20)
Start-Sleep -Seconds $DelaySec
# 1) log tails: keep the newest Get-Content -Wait on server.log, kill older ones
$tails = Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match 'Get-Content -Path .*server\.log.* -Wait' -and $_.CommandLine -notmatch 'CimInstance' } | Sort-Object CreationDate
if ($tails.Count -gt 1) { $tails | Select-Object -SkipLast 1 | ForEach-Object { Stop-Process -Id $_.ProcessId -Force; "killed old tail $($_.ProcessId) $($_.CreationDate)" } }
# 2) Chrome duplicate tabs: close older copies (tab order = open order) until one of each remains
Add-Type -AssemblyName UIAutomationClient,UIAutomationTypes
$r=[Windows.Automation.AutomationElement]::RootElement
$c=New-Object Windows.Automation.PropertyCondition([Windows.Automation.AutomationElement]::ClassNameProperty,'Chrome_WidgetWin_1')
$t=New-Object Windows.Automation.PropertyCondition([Windows.Automation.AutomationElement]::ControlTypeProperty,[Windows.Automation.ControlType]::TabItem)
$b=New-Object Windows.Automation.PropertyCondition([Windows.Automation.AutomationElement]::ControlTypeProperty,[Windows.Automation.ControlType]::Button)
foreach ($key in 'Camera recording','Live Dashboard','Teach View','BRAINPAGE','localhost') {
  for ($pass = 0; $pass -lt 6; $pass++) {
    $m = @(); foreach ($w in $r.FindAll('Children',$c)) { $m += @($w.FindAll('Descendants',$t) | Where-Object {
      # Match on words only: Chrome's title separators are not ASCII " - ".
      if ($key -eq 'BRAINPAGE') { $_.Current.Name -match 'IF ONLY I HAD A BRAIN' -and $_.Current.Name -notmatch 'Camera recording' -and $_.Current.Name -notmatch 'Repositories|donor-release' }
      else { $_.Current.Name -like ('*'+$key+'*') } }) }
    if ($m.Count -le 1) { break }
    $x = $m[0]; $n = $x.Current.Name
    $btn = $x.FindAll('Descendants',$b) | Where-Object { $_.Current.Name -match 'Close' -and $_.Current.IsEnabled } | Select-Object -First 1
    if ($btn) { $btn.GetCurrentPattern([Windows.Automation.InvokePattern]::Pattern).Invoke(); "closed tab: $n"; Start-Sleep -Milliseconds 400 }
    else {
      # A background tab exposes no Close button to automation: select it, then Ctrl+W.
      try {
        $x.GetCurrentPattern([Windows.Automation.SelectionItemPattern]::Pattern).Select()
        Start-Sleep -Milliseconds 300
        $x.SetFocus()
        Add-Type -AssemblyName System.Windows.Forms
        [System.Windows.Forms.SendKeys]::SendWait('^w')
        "closed tab (ctrl+w): $n"; Start-Sleep -Milliseconds 500
      } catch { "could not close tab: $n ($($_.Exception.Message))"; break }
    }
  }
}
# 3) dead launcher cmd windows from earlier boots — never the live 'leave running' ones
Get-Process cmd -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -and $_.MainWindowTitle -notmatch 'leave running' -and $_.MainWindowTitle -match 'Savestart|start\.bat|system32\\cmd' -and $_.Id -ne $PID } | ForEach-Object { Stop-Process -Id $_.Id -Force; "killed cmd $($_.Id) $($_.MainWindowTitle)" }
