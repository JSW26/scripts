# Kio → Kiosk Downloader: Windows 연결 설치 (Bridge 1.1.1)

Kio 사용자 스크립트의 `Kio ↓` 버튼이 보내는 `kioffdl://` 링크를 Windows에서 처리하는 보조 프로그램입니다. **Tampermonkey 스크립트 설치와는 별도로 최초 1회 설치해야 합니다.**

## 설치

1. [Kiosk Downloader](https://github.com/myparsleycat/kiosk-downloader/releases/latest)를 먼저 설치하거나 포터블 버전을 원하는 위치에 둡니다.
2. 이 저장소에서 `bridge/` 폴더에 있는 **`bridge.ps1`과 `install.cmd`**를 같은 폴더로 다운로드하거나, [저장소 ZIP](https://github.com/JSW26/scripts/archive/refs/heads/main.zip)을 받아 압축 해제합니다.
3. `bridge/install.cmd`를 **더블클릭**합니다. 프로그램을 자동으로 못 찾으면 Kiosk Downloader의 `.exe` 파일을 직접 선택합니다. 관리자 권한은 필요 없습니다. 기존 설치 상태에서도 동일한 파일로 업데이트 가능합니다.
4. Tampermonkey에 [Kio 연동 스크립트](https://raw.githubusercontent.com/JSW26/scripts/main/scripts/Kio_to_Downloader.user.js)를 설치하고 `https://kio.ac/c/...` 공유 페이지에서 `Kio ↓`를 누릅니다.
5. Firefox에서 외부 애플리케이션 실행을 허용합니다. Kiosk Downloader 창을 활성화하고 **공유 URL 자동 붙여넣기(`Ctrl+V`)**를 수행하여 새 다운로드 화면에서 목록을 불러옵니다.

설치 프로그램은 `%LOCALAPPDATA%\KioDownloaderBridge`에 고정된 런처를 복사하고 현재 사용자 계정의 `kioffdl://` 프로토콜을 등록합니다. ZIP의 원본 폴더는 설치 후 옮기거나 삭제해도 됩니다. Kiosk Downloader의 실행 파일을 옮겼다면 `install.cmd`를 다시 실행하세요.

## 제거

`bridge/uninstall.cmd`를 더블클릭하면 Windows 연동 등록과 보조 파일을 제거합니다. Kiosk Downloader 본체와 Tampermonkey 스크립트는 삭제하지 않습니다.

## 오류 확인

- `프로토콜을 열 앱이 없음`: `install.cmd`를 다시 실행합니다.
- `Kiosk Downloader executable was moved or removed`: 앱 실행 파일을 찾을 수 없으니 다시 설치합니다.
- `Failed to copy URL to the clipboard`: 클립보드 사용 중인 앱을 닫고 재시도합니다.
- 프로그램은 열렸는데 URL이 자동 입력되지 않으면 **새 다운로드 → Ctrl+V**를 이용합니다. 자동 붙여넣기 기능은 사용자의 Windows 환경에서 2026-11-14 정상 동작 확인했습니다. Kiosk Downloader의 공식 외부 URL 입력 API가 아닌 **활성 창에 Ctrl+V 입력을 보내는 방식**입니다.

안전: 런처는 `https://kio.ac/c/...` 또는 `https://www.kio.ac/c/...` 링크만 허용합니다. 브라우저에서 임의 명령을 실행하지 않습니다. Windows에서 실제 동작하는지는 사용자의 환경에서 확인해야 합니다.
