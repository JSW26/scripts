# Scripts

브라우저 사용자 스크립트(UserScript)의 소스와 버전 이력을 관리하는 저장소입니다. **Tampermonkey 브라우저 확장 프로그램을 설치한 뒤**, 아래 설치 링크를 열어 각 스크립트를 등록하고 자동 업데이트할 수 있습니다.

> **기록 안내:** GitHub 버전 관리는 2026-11-13부터 시작했습니다. 그 이전 개발 이력은 기존 파일을 바탕으로 정리했으며 일부 내용이 정확하지 않을 수 있습니다.

## 스크립트

| 이름 | 적용 사이트 | 최신 버전 | 설치 | 패치노트 / 이전 버전 |
| --- | --- | --- | --- | --- |
| 통합 자동 디코더 | `kone.gg`, `kio.ac` | 4.0.0 | [설치](https://raw.githubusercontent.com/JSW26/tampermonkey-scripts/main/scripts/Kone_Unified_Decoder.user.js) | [기록](history/kone-unified/CHANGELOG.md) |
| 이미지 자동 복구 | `kone.gg` | 0.3.4 | [설치](https://raw.githubusercontent.com/JSW26/tampermonkey-scripts/main/scripts/Kone_Image_Recovery.user.js) | [기록](history/kone-image-recovery/CHANGELOG.md) |
| Base64 드래그 디코더 | 전체 HTTP(S) 사이트 | 1.2.0 | [설치](https://raw.githubusercontent.com/JSW26/tampermonkey-scripts/main/scripts/Base64_Drag_Decoder.user.js) | [기록](history/base64-drag/CHANGELOG.md) |
| 다운로드 프로그램 연동 | `kio.ac` | 1.1.0 | [설치](https://raw.githubusercontent.com/JSW26/tampermonkey-scripts/main/scripts/Kio_to_Downloader.user.js) | [기록](history/kio-downloader/CHANGELOG.md) |

## 폴더 구조

```text
tampermonkey-scripts/
├── scripts/                       # 최신 배포 스크립트 4개
│   ├── Kone_Unified_Decoder.user.js
│   ├── Kone_Image_Recovery.user.js
│   ├── Base64_Drag_Decoder.user.js
│   └── Kio_to_Downloader.user.js
├── history/                       # 스크립트별 패치노트 + 이전 소스
│   ├── kone-unified/
│   │   ├── CHANGELOG.md
│   │   └── v*.user.js
│   ├── kone-image-recovery/
│   │   ├── CHANGELOG.md
│   │   └── v*.user.js
│   ├── base64-drag/
│   │   ├── CHANGELOG.md
│   │   └── v*.user.js
│   └── kio-downloader/
│       ├── CHANGELOG.md
│       └── v*.user.js
├── CONTRIBUTING.md
├── LICENSE.txt
└── README.md
```

**최신 스크립트 경로는 유지합니다.** 설치된 Tampermonkey의 `@updateURL`·`@downloadURL`이 해당 위치를 참조하므로, 파일을 옮기면 기존 기기의 자동 업데이트가 끊길 수 있습니다. 대신 스크립트별 변경 이력과 구버전 파일을 같은 `history/` 하위 폴더에 모았습니다.

## 설치와 업데이트

**설치 방법:** 브라우저에 [Tampermonkey 확장 프로그램](https://www.tampermonkey.net/)을 설치한 다음, 위 표의 **설치** 링크를 열어 스크립트 설치를 승인합니다. 설치한 스크립트는 Tampermonkey에서 관리하며 지원되는 경우 업데이트를 확인할 수 있습니다. 각 스크립트의 `@match`, `@exclude`, 권한 및 의존성은 실제 소스의 메타데이터를 기준으로 확인하세요.

- 배포 스크립트는 기존 GitHub Raw 주소에서 자동 업데이트됩니다.
- **임시 버전(`-beta.N`) → 실사용 테스트 → 명시적인 컨펌 → 정식 버전** 순서로 변경합니다.
- 현재 테스트 버전도 `main`의 동일한 업데이트 주소에 배포하므로 다른 설치 기기에 자동 반영될 수 있습니다.
- `history/`의 구버전 파일은 보관용이며 자동 업데이트용이 아닙니다.
- 다운로드 프로그램 연동 스크립트는 별도의 Windows 프로토콜 핸들러가 필요합니다.

관리 규칙은 [CONTRIBUTING.md](CONTRIBUTING.md)를 참고합니다. 공개 저장소에 토큰·비밀번호·쿠키 등 민감한 정보를 포함하지 않습니다.
