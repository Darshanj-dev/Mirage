; MIRAGE desktop companion for Windows (beta) — installer (Inno Setup 6).
; Built by .github/workflows/windows-desktop.yml on a Windows runner from
;   dotnet publish desktop-windows/src/Mirage.Desktop -c Release -r win-x64 --self-contained -p:PublishSingleFile=true
; Per-user install (no administrator rights) into %LOCALAPPDATA%\Programs\MIRAGE.

#ifndef AppVersion
  #define AppVersion "1.0.0"
#endif
#ifndef PublishDir
  #define PublishDir "..\..\desktop-windows\publish"
#endif

[Setup]
AppId={{B2E7D9A4-3C61-4F0B-8E5A-7D2C9F1A4B63}
AppName=MIRAGE
AppVersion={#AppVersion}
AppVerName=MIRAGE {#AppVersion} (beta)
AppPublisher=Team Nexora
AppPublisherURL=https://github.com/Darshanj-dev/Mirage
DefaultDirName={localappdata}\Programs\MIRAGE
DisableDirPage=yes
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
OutputDir=..\..\dist
OutputBaseFilename=MIRAGE-Desktop-Windows-Setup-{#AppVersion}-beta
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
CloseApplications=yes
UninstallDisplayName=MIRAGE
UninstallDisplayIcon={app}\MIRAGE.exe
LicenseFile=..\..\LICENSE

[Messages]
WelcomeLabel2=This installs MIRAGE, a privacy firewall for the ChatGPT and Claude desktop apps.%n%nMIRAGE checks what you are about to send, on this PC, and stops the send when it finds a secret or personal detail, so you can protect it first.%n%nBeta on Windows: built and core-tested, not yet tested against ChatGPT or Claude on Windows.

[Tasks]
Name: "startup"; Description: "Start MIRAGE when I sign in"; Flags: unchecked

[Files]
Source: "{#PublishDir}\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs ignoreversion
Source: "..\..\LICENSE"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{userprograms}\MIRAGE"; Filename: "{app}\MIRAGE.exe"
Name: "{userprograms}\Uninstall MIRAGE"; Filename: "{uninstallexe}"

[Registry]
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "MIRAGE"; ValueData: """{app}\MIRAGE.exe"""; Tasks: startup; Flags: uninsdeletevalue

[Run]
Filename: "{app}\MIRAGE.exe"; Description: "Start MIRAGE now"; Flags: postinstall nowait skipifsilent

[UninstallRun]
Filename: "{cmd}"; Parameters: "/C taskkill /IM MIRAGE.exe /F"; Flags: runhidden; RunOnceId: "StopMirage"

[UninstallDelete]
Type: filesandordirs; Name: "{app}"
