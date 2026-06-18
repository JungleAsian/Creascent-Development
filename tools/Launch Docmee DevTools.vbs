Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
dashboardDir = fso.BuildPath(scriptDir, "dashboard")
nextBin = fso.BuildPath(scriptDir, "dashboard\node_modules\next\dist\bin\next")
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

Sub RunHidden(command, workingDirectory)
  Set startup = GetObject("winmgmts:Win32_ProcessStartup").SpawnInstance_
  startup.ShowWindow = 0
  Set process = GetObject("winmgmts:Win32_Process")
  process.Create command, workingDirectory, startup, processId
End Sub

If Not DashboardReady() Then
  RunHidden Quote(nodeExe) & " " & Quote(nextBin) & " dev -p 4000 -H 127.0.0.1", dashboardDir

  For i = 1 To 30
    If DashboardReady() Then Exit For
    WScript.Sleep 1000
  Next
End If

shell.CurrentDirectory = scriptDir
shell.Run Quote(appExe), 1, False
