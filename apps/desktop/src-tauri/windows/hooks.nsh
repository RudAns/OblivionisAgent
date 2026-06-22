; OblivionisAgent NSIS install hooks
; Update/install copies files over the existing install. The engine sidecar
; (oblivionis-bridge.exe) may still be running and locks its own exe, causing
; "Error opening file for writing". Kill it before file copy.
!macro NSIS_HOOK_PREINSTALL
  nsExec::Exec 'taskkill /F /IM oblivionis-bridge.exe'
!macroend
