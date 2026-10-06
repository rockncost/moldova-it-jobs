param([switch]$Remove)
$taskName='Moldova IT Jobs - Daily Refresh'
if($Remove){Unregister-ScheduledTask -TaskName $taskName -Confirm:$false;exit}
$taskRoot=Split-Path $PSScriptRoot -Parent
$taskNode=(Get-Command node -ErrorAction Stop).Source
$taskAction=New-ScheduledTaskAction -Execute $taskNode -Argument ('"'+(Join-Path $taskRoot 'refresh-jobs.js')+'"') -WorkingDirectory $taskRoot
$taskTrigger=New-ScheduledTaskTrigger -Daily -At '08:00'
$taskSettings=New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Hours 2) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
$taskIdentity=[System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$taskPrincipal=New-ScheduledTaskPrincipal -UserId $taskIdentity -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName $taskName -Action $taskAction -Trigger $taskTrigger -Settings $taskSettings -Principal $taskPrincipal -Description 'Refreshes the local Moldova job database without requiring the website to be open. Runs while this user is signed in; catches up missed runs.' -Force | Select-Object TaskName,State
