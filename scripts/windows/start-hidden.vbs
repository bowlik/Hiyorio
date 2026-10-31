' Spusti run-server.cmd bez viditelneho okna.
Set fso = CreateObject("Scripting.FileSystemObject")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
CreateObject("WScript.Shell").Run "cmd /c """ & dir & "\run-server.cmd""", 0, False
