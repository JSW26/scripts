# 이전 버전 보관소

이 폴더에는 2026-11-13 이전의 대화 및 전달된 파일에서 **실제 소스가 확보된 버전 16개**를 보관합니다.

- 자세한 수정 이유 및 패치노트: [CHANGELOG.md](../CHANGELOG.md)
- 설치 및 자동 업데이트용 최신 버전: [scripts/](../scripts/)
- `history/`의 파일은 **과거 원본 스냅샷**입니다. 자동 업데이트 주소를 붙이지 않았으며 일반 사용 시 직접 설치하지 않는 것을 권장합니다.
- 이전 대화에서 전달했던 ZIP·TXT·JS 원본을 복원한 것이므로 GitHub 커밋 날짜가 과거 출시 날짜를 의미하지 않습니다.

## 코네 통합 디코더 (5개)

| 버전 | 변경 키워드 | 소스 |
|---|---|---|
| 3.0.0 | SecureEncoder + Base64 + Kio 통합 | [원본](kone-unified/v3.0.0.user.js) |
| 3.0.1 | SPA 경로 전환 시 토큰 상태 초기화 | [원본](kone-unified/v3.0.1.user.js) |
| 3.1.0 | 캐시, 해독 대기 및 중복 처리 최적화 | [원본](kone-unified/v3.1.0.user.js) |
| 3.2.0 | 반투명 상태 UI, 이미지 복구 패널과 겹침 방지 | [원본](kone-unified/v3.2.0.user.js) |
| 4.0.0 | 반복 Base64/점자/SecureEncoder 및 편의 기능 통합 | [원본](kone-unified/v4.0.0.user.js) |

## 코네 이미지 복구 (6개)

| 버전 | 변경 키워드 | 소스 |
|---|---|---|
| 0.1.0 | 수동 이미지 재시도, 스크롤/펼침 복원 | [원본](kone-image-recovery/v0.1.0.user.js) |
| 0.2.0 | 실패 이미지의 안전한 재시도 | [원본](kone-image-recovery/v0.2.0.user.js) |
| 0.3.0 | 403 만료 URL의 새 주소 자동 갱신 | [원본](kone-image-recovery/v0.3.0.user.js) |
| 0.3.1 | 진단/접기 UI, SPA 재표시 | [원본](kone-image-recovery/v0.3.1.user.js) |
| 0.3.2 | 오래 방치한 뒤 첫 이미지 오류 개선 시도 | [원본](kone-image-recovery/v0.3.2.user.js) |
| 0.3.3 | 우측 하단 도킹 UI | [원본](kone-image-recovery/v0.3.3.user.js) |

## Base64 드래그 디코더 (2개)

| 버전 | 변경 키워드 | 소스 |
|---|---|---|
| 1.0.0 | 드래그 선택한 Base64 디코딩 및 복사 | [원본](base64-drag/v1.0.0.user.js) |
| 1.1.0 | Kone 도메인 제외하여 통합 디코더와 중복 방지 | [원본](base64-drag/v1.1.0.user.js) |

## Kio → Kiosk Downloader (1개)

| 버전 | 변경 키워드 | 소스 |
|---|---|---|
| 1.1.0 | 임시 Firefox 확장 대신 Tampermonkey 및 Windows 프로토콜 브리지 | [원본](kio-downloader/v1.1.0.user.js) |

## 전신 스크립트 (2개)

| 버전 | 변경 키워드 | 소스 |
|---|---|---|
| Kone Auto Decoder 2.3.0 | Spacencode 결과 속 Base64 이중 해독 | [원본](legacy-precursors/kone-auto-decoder-v2.3.0.user.js) |
| Kio 자동 비밀번호 입력 1.1 | React/Vue에서 비밀번호 자동 입력 | [원본](legacy-precursors/kio-auto-password-v1.1.user.js) |

## 복원되지 않은 다른 과거 패키지

기존 파일 목록에서 다음 초기 산출물도 확인했습니다: Secure Decoder 1.1.1-TM1, Firefox Lite 1.2.0, Kone/Kiosk Secure Decoder Lite 1.0.0, Kone Auto Decoder 2.3.1·2.3.2 ZIP, Firefox Kio Bridge 1.0. 다만 이들은 대용량 번들/ZIP 또는 **서로 다른 전신 도구** 형태이므로 이번 `history/`에는 개별 버전별 소스로 등록하지 않았습니다. 이들의 정확한 변경 내용도 추측해서 만들어 넣지 않았습니다.

전체 역사 기록은 [CHANGELOG.md](../CHANGELOG.md)를 참고하세요.
