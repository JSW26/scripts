# Scripts

Tampermonkey 사용자 스크립트를 **종류별 폴더**로 관리합니다. 각 폴더에 최신본, 설치 안내, 패치노트, 이전 버전이 함께 있습니다.

> GitHub 기반 이력 관리는 2026-11-13부터 시작했습니다. 그 이전 기록은 일부 정확하지 않을 수 있습니다.

## 스크립트별 설치

| 이름 | 적용 사이트 | 최신 버전 | 설치 | 프로젝트 / 변경 이력 |
| --- | --- | --- | --- | --- |
| 코네 통합 자동 디코더 | `kone.gg`, `kio.ac` | `4.0.0` | [설치](https://raw.githubusercontent.com/JSW26/scripts/main/scripts/kone-unified/Kone_Unified_Decoder.user.js) | [폴더](scripts/kone-unified/) · [패치노트](scripts/kone-unified/CHANGELOG.md) |
| 코네 이미지 자동 복구 | `kone.gg` | `0.3.5` | [설치](https://raw.githubusercontent.com/JSW26/scripts/main/scripts/kone-image-recovery/Kone_Image_Recovery.user.js) | [폴더](scripts/kone-image-recovery/) · [패치노트](scripts/kone-image-recovery/CHANGELOG.md) |
| Base64 드래그 디코더 | 전체 HTTP(S) | `1.2.0` | [설치](https://raw.githubusercontent.com/JSW26/scripts/main/scripts/base64-drag/Base64_Drag_Decoder.user.js) | [폴더](scripts/base64-drag/) · [패치노트](scripts/base64-drag/CHANGELOG.md) |
| Kio → Kiosk Downloader 연동 | `kio.ac` | `1.1.0` | [설치](https://raw.githubusercontent.com/JSW26/scripts/main/scripts/kio-downloader/Kio_to_Downloader.user.js) | [폴더](scripts/kio-downloader/) · [패치노트](scripts/kio-downloader/CHANGELOG.md) |

**Kio 다운로드 연동:** 다른 스크립트와 달리 [Windows Bridge 설치](scripts/kio-downloader/bridge/README.md)가 필요합니다. 최초 1회 `scripts/kio-downloader/bridge/install.cmd`를 실행하세요. Tampermonkey 스크립트 `1.1.0`, Bridge `1.1.1`은 각각 별개의 버전입니다.

## 프로젝트 구조

```text
scripts/
├── kone-unified/
│   ├── Kone_Unified_Decoder.user.js   # 최신본
│   ├── README.md                      # 설치 안내
│   ├── CHANGELOG.md                   # 업데이트 기록
│   └── history/                       # 이전 버전
├── kone-image-recovery/
│   ├── Kone_Image_Recovery.user.js
│   ├── README.md
│   ├── CHANGELOG.md
│   └── history/
├── base64-drag/
│   ├── Base64_Drag_Decoder.user.js
│   ├── README.md
│   ├── CHANGELOG.md
│   └── history/
├── kio-downloader/
│   ├── Kio_to_Downloader.user.js
│   ├── README.md
│   ├── CHANGELOG.md
│   ├── history/
│   └── bridge/
│       ├── bridge.ps1
│       ├── install.cmd
│       ├── uninstall.cmd
│       └── README.md
├── Kone_Unified_Decoder.user.js        # 이전 설치 URL 호환
├── Kone_Image_Recovery.user.js         # 이전 설치 URL 호환
├── Base64_Drag_Decoder.user.js         # 이전 설치 URL 호환
└── Kio_to_Downloader.user.js           # 이전 설치 URL 호환
```

## 설치와 자동 업데이트

[Tampermonkey](https://www.tampermonkey.net/) 설치 후 위 표의 설치 링크를 열어 승인합니다. Kio 연동은 Windows Bridge를 별도로 설치해야 합니다.

**이전 설치 사용자:** `scripts/*.user.js` 위치의 기존 설치 주소 4개는 남겨 두었습니다. 설치된 스크립트가 당장 업데이트에 실패하지 않도록 하기 위한 **호환용 파일**이며, 앞으로 새 버전 배포 시 새 경로와 예전 경로를 함께 갱신합니다. 폴더 정리만으로 Tampermonkey가 이미 저장한 업데이트 URL이 자동 변경되는 것은 아닙니다. 새로 설치할 때는 개별 폴더의 최신본을 사용하세요.

구조만 변경했으므로 사용자 스크립트의 버전·기능은 변경하지 않았습니다. [개발 및 배포 규칙](CONTRIBUTING.md)
