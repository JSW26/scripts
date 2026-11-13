# Version Archive

이관 이전 및 이전 배포 버전의 소스 스냅샷 보관소입니다.

`history/`의 파일은 버전 비교, 회귀 분석 및 필요 시 이전 동작 복원에 사용하며 **자동 업데이트용 배포 파일이 아닙니다**. 최신 배포본은 [scripts/](../scripts/), 변경 내역은 [CHANGELOG.md](../CHANGELOG.md)를 참조합니다.

## Archive Index

적용 사이트는 **각 구버전의 실제 메타데이터**를 기준으로 표시합니다. 버전마다 지정한 하위 도메인이나 경로가 다를 수 있으므로, 상세 조건은 해당 소스의 `@match` 및 `@exclude`를 확인합니다.

| 기능 분류 | 적용 사이트 | 버전 | 주요 변경 | 소스 |
| --- | --- | --- | --- | --- |
| 콘텐츠 자동 해독 | `kone.gg`, `kio.ac` | 3.0.0 | 디코딩 및 입력 보조 기능 통합 | [보기](kone-unified/v3.0.0.user.js) |
| 콘텐츠 자동 해독 | `kone.gg`, `kio.ac` | 3.0.1 | SPA 경로 전환 시 상태 초기화 | [보기](kone-unified/v3.0.1.user.js) |
| 콘텐츠 자동 해독 | `kone.gg`, `kio.ac` | 3.1.0 | 처리 캐시 및 반복 스캔 최적화 | [보기](kone-unified/v3.1.0.user.js) |
| 콘텐츠 자동 해독 | `kone.gg`, `kio.ac` | 3.2.0 | 반투명 UI와 패널 충돌 회피 | [보기](kone-unified/v3.2.0.user.js) |
| 콘텐츠 자동 해독 | `kone.gg`, `kio.ac` | 4.0.0 | 다중 디코딩 형식 및 편의 기능 통합 | [보기](kone-unified/v4.0.0.user.js) |
| 이미지 리소스 복구 | `kone.gg` | 0.1.0 | 수동 재시도 및 화면 위치 복원 | [보기](kone-image-recovery/v0.1.0.user.js) |
| 이미지 리소스 복구 | `kone.gg` | 0.2.0 | 실패 요청 추적 및 재시도 개선 | [보기](kone-image-recovery/v0.2.0.user.js) |
| 이미지 리소스 복구 | `kone.gg/s/*` (게시글 경로) | 0.3.0 | 만료된 리소스 URL 재조회 | [보기](kone-image-recovery/v0.3.0.user.js) |
| 이미지 리소스 복구 | `kone.gg` | 0.3.1 | 진단 UI 및 SPA 재렌더링 대응 | [보기](kone-image-recovery/v0.3.1.user.js) |
| 이미지 리소스 복구 | `kone.gg` | 0.3.2 | 장시간 비활성 이후 첫 이미지 복구 개선 시도 | [보기](kone-image-recovery/v0.3.2.user.js) |
| 이미지 리소스 복구 | `kone.gg` | 0.3.3 | 제어 패널 우측 하단 정렬 | [보기](kone-image-recovery/v0.3.3.user.js) |
| 선택 텍스트 디코딩 | 전체 HTTP(S) 사이트 | 1.0.0 | 선택 영역 Base64 디코딩 UI | [보기](base64-drag/v1.0.0.user.js) |
| 선택 텍스트 디코딩 | 전체 HTTP(S) 사이트 (`kone.gg` 제외) | 1.1.0 | 다른 해독 기능과의 적용 범위 중복 방지 | [보기](base64-drag/v1.1.0.user.js) |
| 선택 텍스트 디코딩 | 전체 HTTP(S) 사이트 (제외 없음) | 1.2.0 | 사이트별 제외 규칙 삭제, 독립적인 경량 디코더로 유지 | [보기](base64-drag/v1.2.0.user.js) |
| 로컬 프로그램 연동 | `kio.ac` | 1.1.0 | 사용자 정의 프로토콜을 통한 다운로드 프로그램 호출 | [보기](kio-downloader/v1.1.0.user.js) |
| 레거시 구성 요소 | `*.kone.gg` | 2.3.0 | 중첩 인코딩 자동 해독 | [보기](legacy-precursors/kone-auto-decoder-v2.3.0.user.js) |
| 레거시 구성 요소 | `*.kio.ac` | 1.1 | 동적 입력 양식의 암호 자동 입력 | [보기](legacy-precursors/kio-auto-password-v1.1.user.js) |

## Archive Policy

- 위 목록은 확보·보관된 **17개 소스 스냅샷**을 정리한 것입니다.
- 이관 이전 버전의 날짜는 파일 제공·보관 시점을 기준으로 하며 GitHub의 커밋 날짜와 일치하지 않을 수 있습니다.
- 일부 초기 버전은 독립 소스가 아닌 ZIP 또는 번들 형태로만 확인되어 개별 스냅샷에 포함되지 않았습니다.
- 이전 버전의 존재 또는 소스 확보가 모든 브라우저 환경에서의 정상 동작을 보증하지는 않습니다.
- 구버전 소스에서 복구 또는 새 배포가 필요한 경우, 배포 대상인 `scripts/`에서 새 버전으로 관리합니다.
