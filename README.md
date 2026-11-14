# Scripts

Tampermonkey 스크립트 4개를 기능별 폴더로 관리합니다. 각 폴더에서 최신본, 설명, 업데이트 기록, 이전 버전을 확인할 수 있습니다.

> GitHub 이력 정리는 2026-11-13부터 시작했습니다. 그 이전 기록 일부는 정확하지 않을 수 있습니다.

## 스크립트 목록

| 스크립트 | 현재 버전 | 설치 | 업데이트 기록 |
| --- | --- | --- | --- |
| [코네 통합 자동 디코더](scripts/kone-unified/) | 4.0.0 | [Tampermonkey 설치](https://raw.githubusercontent.com/JSW26/scripts/main/scripts/kone-unified/Kone_Unified_Decoder_v4.0.0.user.js) | [변경 이력](scripts/kone-unified/CHANGELOG.md) |
| [코네 이미지 자동 복구](scripts/kone-image-recovery/) | 0.3.5 | [Tampermonkey 설치](https://raw.githubusercontent.com/JSW26/scripts/main/scripts/kone-image-recovery/Kone_Image_Recovery_v0.3.5.user.js) | [변경 이력](scripts/kone-image-recovery/CHANGELOG.md) |
| [Base64 드래그 디코더](scripts/base64-drag/) | 1.2.0 | [Tampermonkey 설치](https://raw.githubusercontent.com/JSW26/scripts/main/scripts/base64-drag/Base64_Drag_Decoder_v1.2.0.user.js) | [변경 이력](scripts/base64-drag/CHANGELOG.md) |
| [Kio → Kiosk Downloader 연동](scripts/kio-downloader/) | 1.1.0 | [Tampermonkey 설치](https://raw.githubusercontent.com/JSW26/scripts/main/scripts/kio-downloader/Kio_to_Downloader_v1.1.0.user.js) | [변경 이력](scripts/kio-downloader/CHANGELOG.md) |

## 폴더 구조

```text
scripts/
├── kone-unified/
│   ├── Kone_Unified_Decoder_v4.0.0.user.js
│   ├── update.meta.js
│   ├── README.md
│   ├── CHANGELOG.md
│   └── history/
├── kone-image-recovery/
│   ├── Kone_Image_Recovery_v0.3.5.user.js
│   ├── update.meta.js
│   ├── README.md
│   ├── CHANGELOG.md
│   └── history/
├── base64-drag/
│   ├── Base64_Drag_Decoder_v1.2.0.user.js
│   ├── update.meta.js
│   ├── README.md
│   ├── CHANGELOG.md
│   └── history/
└── kio-downloader/
    ├── Kio_to_Downloader_v1.1.0.user.js
    ├── update.meta.js
    ├── README.md
    ├── CHANGELOG.md
    ├── history/
    └── bridge/
        ├── install.cmd
        ├── bridge.ps1
        ├── uninstall.cmd
        └── README.md
```

파일 역할: `_v버전.user.js`는 현재 설치용 실행 코드 하나, `update.meta.js`는 버전 확인용 정보만 담은 작은 파일, `history/`에는 이전 버전만, `CHANGELOG.md`에는 변경 내역을 기록합니다.

## 설치와 업데이트 안내

1. [Tampermonkey](https://www.tampermonkey.net/)를 설치합니다.
2. 위 표의 설치 링크에서 해당 사용자 스크립트를 설치합니다.
3. Kio 다운로드 연동에는 [Windows Bridge 설치](scripts/kio-downloader/bridge/README.md)가 별도로 필요합니다. 기존 Bridge가 정상 작동한다면 다시 설치할 필요는 없습니다.

이전 `scripts/*.user.js` 및 버전이 없는 파일 이름은 정리 과정에서 삭제했습니다. **해당 구경로로 설치한 스크립트는 이 표의 새 링크를 통해 다시 설치해야** 향후 업데이트 주소가 바뀝니다. 설치 전에 Tampermonkey에서 기존 항목이 남아 있는지 확인해 중복 활성화하지 마세요.

버전 번호가 들어간 실행 파일명과 자동 업데이트를 함께 유지하려고 `update.meta.js`를 배치했습니다. 다만 버전 변경 시 `@downloadURL`의 주소도 달라지므로 후속 버전으로의 완전한 자동 갱신은 미검증 상태입니다. 다음 버전 배포 전 반드시 실제 Tampermonkey에서 테스트해야 하며, 필요하면 새 버전 설치 링크를 이용해 갱신해야 합니다.

스크립트 기능 자체는 변경하지 않았습니다. [유지보수 규칙](CONTRIBUTING.md)
