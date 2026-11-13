# UserScript Collection

브라우저 사용자 스크립트(UserScript)의 소스 코드, 배포 버전, 변경 이력 및 이전 버전을 관리하는 저장소입니다. 각 스크립트는 독립적인 기능 단위로 구성되며, 향후 다양한 웹 환경과 자동화 작업을 위한 스크립트를 추가할 수 있도록 설계되었습니다.

스크립트의 실제 적용 범위는 각 파일 상단 메타데이터의 `@match`, `@include`, `@exclude`를 따릅니다.

## Repository Structure

```text
.
├── scripts/          # 설치 및 자동 업데이트용 최신 배포 스크립트
├── history/          # 버전별 소스 스냅샷(배포 대상 아님)
│   └── README.md     # 보관된 버전 목록
├── CHANGELOG.md      # 기능별 변경 이력 및 패치노트
├── CONTRIBUTING.md   # 버전 관리 및 문서 작성 규칙
├── LICENSE.txt       # 라이선스 및 기존 저작자 표기
└── README.md         # 저장소 개요 및 사용 방법
```

## Scripts

| 스크립트 | 주요 기능 | 적용 사이트 | 버전 | 설치 |
| --- | --- | --- | --- | --- |
| 통합 자동 디코더 | Base64·점자·SecureEncoder 해독, 링크·암호 입력 보조 | `kone.gg`, `kio.ac` | 4.0.0 | [설치](https://raw.githubusercontent.com/JSW26/tampermonkey-scripts/main/scripts/Kone_Unified_Decoder.user.js) |
| 이미지 자동 복구 | 실패한 이미지 요청의 새 URL 조회 및 교체 | `kone.gg` | 0.3.3 | [설치](https://raw.githubusercontent.com/JSW26/tampermonkey-scripts/main/scripts/Kone_Image_Recovery.user.js) |
| 다운로드 프로그램 연동 | 공유 링크를 Windows 로컬 프로그램에 전달 | `kio.ac` | 1.1.0 | [설치](https://raw.githubusercontent.com/JSW26/tampermonkey-scripts/main/scripts/Kio_to_Downloader.user.js) |
| Base64 드래그 디코더 | 선택한 Base64 문자열 해독·복사 | 전체 HTTP(S) 사이트 (제외 없음) | 1.2.0 | [설치](https://raw.githubusercontent.com/JSW26/tampermonkey-scripts/main/scripts/Base64_Drag_Decoder.user.js) |

적용 사이트는 현재 배포 버전의 메타데이터를 요약한 것입니다. 하위 도메인과 일부 경로에 대한 정확한 실행 조건은 각 `.user.js` 파일의 `@match`·`@exclude`를 확인합니다.

**실행 조건**
- 스크립트별 적용 대상 및 제외 규칙은 UserScript 메타데이터에서 확인할 수 있습니다.
- 일부 기능은 외부 JavaScript 라이브러리를 사용합니다.
- 로컬 프로그램 연동 기능에는 Windows 환경의 별도 프로토콜 핸들러가 필요합니다. 사용자 스크립트만 설치해도 로컬 프로그램이 자동 설치되지는 않습니다.
- 동일 기능의 여러 스크립트를 동시에 활성화하면 UI 또는 이벤트 처리가 중복될 수 있습니다.

## Installation

1. Tampermonkey 또는 호환되는 사용자 스크립트 관리 확장 프로그램을 설치합니다.
2. 설치하려는 항목의 **설치** 링크를 열고 스크립트의 권한 및 적용 범위를 확인합니다.
3. 기존 버전을 사용 중인 경우 설치 데이터를 먼저 백업하고 중복 실행 여부를 확인합니다.
4. 적용 대상 페이지에서 동작을 확인합니다.

개별 스크립트의 메타데이터와 의존성에 따라 브라우저 및 운영체제별 지원 범위가 다를 수 있습니다.

## Updates

**배포 절차:** 변경 코드는 임시 Preview 버전(`-beta.N`)으로 먼저 배포해 실제 환경에서 테스트합니다. 명시적인 승인 이후 정식 버전으로 전환하고 패치노트 및 버전 보관소를 갱신합니다. 상세 절차는 [CONTRIBUTING.md](CONTRIBUTING.md)를 참조합니다.

**테스트 버전 안내:** 현재 자동 업데이트 주소는 공개 `main` 브랜치에 연결되어 있으므로, Preview 버전 역시 동일 스크립트를 설치한 기기에 자동 적용될 수 있습니다. README의 버전 표는 마지막으로 확정된 정식 버전을 기준으로 관리합니다.

`scripts/`의 배포 파일에는 GitHub Raw 주소를 사용하는 `@updateURL` 및 `@downloadURL`이 설정되어 있습니다.

- 변경 배포 시 `@version`을 증가시킵니다.
- 스크립트 관리자가 설정된 주기에 새 버전을 확인합니다. 필요하면 수동으로 업데이트를 확인할 수 있습니다.
- 다른 출처에서 설치한 기존 사본은 이 저장소로 자동 연결되지 않으므로 최초 1회 저장소의 배포 링크로 설치하거나 업데이트해야 합니다.
- `history/`의 파일은 보관용으로, 자동 업데이트 채널로 사용하지 않습니다.

## Version History

- [CHANGELOG.md](CHANGELOG.md) — 버전별 변경 목적, 추가 기능, 수정 사항 및 검증 범위
- [history/README.md](history/README.md) — 이전 버전 소스 목록 및 보관 정책
- [GitHub Commits](https://github.com/JSW26/tampermonkey-scripts/commits/main/) — 저장소 이관 이후 실제 커밋 기록

2026-11-13 이전의 기록은 기존 산출물과 확인 가능한 버전 파일을 바탕으로 재구성한 이력입니다. 과거 버전의 보관 날짜와 Git 커밋 날짜는 서로 다를 수 있습니다.

## Development & Maintenance

새 스크립트는 `scripts/`에 독립적인 `.user.js` 파일로 추가합니다. 기능 변경, 버전 증가, 변경 내역 기록 및 이전 소스 백업 기준은 [CONTRIBUTING.md](CONTRIBUTING.md)를 따릅니다.

## Security & License

공개 저장소에는 인증 정보, 쿠키, 개인용 비밀번호, 액세스 토큰 및 비밀 키를 저장하지 않습니다. 외부 라이브러리와 파생 코드의 라이선스 및 저작자 표기는 [LICENSE.txt](LICENSE.txt)와 각 소스 파일을 확인합니다.
