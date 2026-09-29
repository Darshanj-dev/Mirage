; MIRAGE for Chrome and Edge — Windows installer (Inno Setup 6).
; Built by GitHub Actions (.github/workflows/release.yml) on a Windows runner:
;   npm ci && npm run build && iscc /DAppVersion=1.0.0 installers\windows\mirage-chrome.iss
;
; Installs the extension for the current user (no administrator rights) into
;   %LOCALAPPDATA%\MIRAGE\chrome-extension\extension
; and opens a guide for the one step Chrome/Edge require for extensions that are not from the
; Chrome Web Store: Developer mode → "Load unpacked" → choose that folder.

#ifndef AppVersion
  #define AppVersion "1.0.0"
#endif

[Setup]
AppId={{6F3A2C1E-5B7D-4E8A-9C21-4D8E0B7A9F10}
AppName=MIRAGE for Chrome
AppVersion={#AppVersion}
AppVerName=MIRAGE for Chrome {#AppVersion}
AppPublisher=Team Nexora
AppPublisherURL=https://github.com/Darshanj-dev/Mirage
AppSupportURL=https://github.com/Darshanj-dev/Mirage/issues
DefaultDirName={localappdata}\MIRAGE\chrome-extension
DisableDirPage=yes
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
OutputDir=..\..\dist
OutputBaseFilename=MIRAGE-Chrome-Setup-{#AppVersion}
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
UninstallDisplayName=MIRAGE for Chrome
LicenseFile=..\..\LICENSE
InfoAfterFile=after-install.txt

[Messages]
WelcomeLabel2=This installs the MIRAGE browser extension for Google Chrome and Microsoft Edge.%n%nMIRAGE checks what you are about to send to ChatGPT, Gemini, Claude, Copilot and Perplexity, on this computer, and hides personal details and secrets before they reach the AI.%n%nNothing is sent to MIRAGE: there is no server.

[Files]
Source: "..\..\.output\chrome-mv3\*"; DestDir: "{app}\extension"; Flags: recursesubdirs createallsubdirs ignoreversion
Source: "install-guide.html"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\..\LICENSE"; DestDir: "{app}"; Flags: ignoreversion

[InstallDelete]
; A clean copy on every update, so no stale files are left from an older version.
Type: filesandordirs; Name: "{app}\extension"

[Icons]
Name: "{userprograms}\MIRAGE\Finish installing MIRAGE in Chrome or Edge"; Filename: "{app}\install-guide.html"
Name: "{userprograms}\MIRAGE\MIRAGE extension folder"; Filename: "{app}\extension"
Name: "{userprograms}\MIRAGE\Uninstall MIRAGE"; Filename: "{uninstallexe}"

[Run]
Filename: "{app}\install-guide.html"; Description: "Open the guide to finish in Chrome or Edge"; Flags: postinstall shellexec nowait skipifsilent
Filename: "{code:ChromePath}"; Parameters: "chrome://extensions"; Description: "Open Chrome's extensions page"; Flags: postinstall nowait skipifsilent unchecked; Check: HasChrome
Filename: "{code:EdgePath}"; Parameters: "edge://extensions"; Description: "Open Edge's extensions page"; Flags: postinstall nowait skipifsilent unchecked; Check: HasEdge

[UninstallDelete]
Type: filesandordirs; Name: "{app}"

[Code]
function AppPath(const Exe: String): String;
var
  Path: String;
begin
  Result := '';
  if RegQueryStringValue(HKCU, 'Software\Microsoft\Windows\CurrentVersion\App Paths\' + Exe, '', Path) then Result := Path
  else if RegQueryStringValue(HKLM, 'Software\Microsoft\Windows\CurrentVersion\App Paths\' + Exe, '', Path) then Result := Path;
end;

function ChromePath(Param: String): String; begin Result := AppPath('chrome.exe'); end;
function EdgePath(Param: String): String; begin Result := AppPath('msedge.exe'); end;
function HasChrome: Boolean; begin Result := ChromePath('') <> ''; end;
function HasEdge: Boolean; begin Result := EdgePath('') <> ''; end;
