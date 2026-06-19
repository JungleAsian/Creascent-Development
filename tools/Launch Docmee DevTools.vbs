Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
dashboardDir = fso.BuildPath(scriptDir, "dashboard")
nextBin = fso.BuildPath(scriptDir, "dashboard\node_modules\next\dist\bin\next")
tsxBin = fso.BuildPath(scriptDir, "node_modules\tsx\dist\cli.mjs")
sentinelEntry = fso.BuildPath(scriptDir, "sentinel\daemon.ts")
appExe = fso.BuildPath(scriptDir, "app\src-tauri\target\debug\docmee-devtools.exe")
nodeExe = "C:\Users\Jungl\AppData\Local\hermes\node\node.exe"

Function Quote(value)
  Quote = Chr(34) & value & Chr(34)
End Function

Function DashboardReady()
  On Error Resume Next
  Set http = CreateObject("MSXML2.ServerXMLHTTP.6.0")
  http.open "GET", "http://127.0.0.1:4000", False
  http.setTimeouts 1000, 1000, 1000, 1000
  http.send
  DashboardReady = (Err.Number = 0 And http.status >= 200 And http.status < 500)
  Err.Clear
  On Error GoTo 0
End Function

Function SentinelReady()
  On Error Resume Next
  Set http = CreateObject("MSXML2.ServerXMLHTTP.6.0")
  http.open "GET", "http://127.0.0.1:4001/health", False
  http.setTimeouts 1000, 1000, 1000, 1000
  http.send
  SentinelReady = (Err.Number = 0 And http.status = 200)
  Err.Clear
  On Error GoTo 0
End Function

Function GetDashboardHost()
  On Error Resume Next
  Set service = GetObject("winmgmts:\\.\root\cimv2")
  Set adapters = service.ExecQuery("SELECT IPAddress FROM Win32_NetworkAdapterConfiguration WHERE IPEnabled = True")
  For Each adapter In adapters
    If IsArray(adapter.IPAddress) Then
      For Each ip In adapter.IPAddress
        If Left(ip, 4) = "100." Then
          GetDashboardHost = "0.0.0.0"
          Exit Function
        End If
      Next
    End If
  Next
  GetDashboardHost = "127.0.0.1"
  On Error GoTo 0
End Function

Sub RunHidden(command, workingDirectory)
  Set startup = GetObject("winmgmts:Win32_ProcessStartup").SpawnInstance_
  startup.ShowWindow = 0
  Set process = GetObject("winmgmts:Win32_Process")
  process.Create command, workingDirectory, startup, processId
End Sub

If Not DashboardReady() Then
  dashboardHost = GetDashboardHost()
  RunHidden Quote(nodeExe) & " " & Quote(nextBin) & " dev -p 4000 -H " & dashboardHost, dashboardDir

  For i = 1 To 30
    If DashboardReady() Then Exit For
    WScript.Sleep 1000
  Next
End If

' Start the Sentinel daemon (independent process) if it is not already running.
If Not SentinelReady() Then
  RunHidden Quote(nodeExe) & " " & Quote(tsxBin) & " " & Quote(sentinelEntry), scriptDir
End If

shell.CurrentDirectory = scriptDir
shell.Run Quote(appExe), 1, False
