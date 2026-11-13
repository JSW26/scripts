# Tampermonkey 스크립트 보관소

## 이전 수정 이력과 구버전

- **[전체 패치노트 (CHANGELOG.md)](CHANGELOG.md)** — 버전별 수정 이유, 추가 기능, 개선 시도 및 확인된 한계
- **[버전별 소스 보관소 (history/)](history/README.md)** — 이전 대화에서 복원한 16개 스냅샷

과거 소스는 `history/`에 보관하며, 설치·자동 업데이트는 아래의 `scripts/` 링크를 사용합니다.

기존 대화에서 제작한 정상 동작 버전을 바탕으로 스크립트를 각각 독립적으로 관리합니다. 소스 코드는 그대로 유지하고 GitHub를 통한 업데이트를 위해 `@updateURL`과 `@downloadURL`만 추가했습니다.

## 설치 링크

| 스크립트 | 버전 | 설치 |
| --- | --- | --- |
| 코네 통합 디코더 4 | 4.0.0 | [Kone_Unified_Decoder.user.js](https://raw.githubusercontent.com/JSW26/tampermonkey-scripts/main/scripts/Kone_Unified_Decoder.user.js) |
| 코네 이미지 403 자동 복구 (우측 도킹 UI) | 0.3.3 | [Kone_Image_Recovery.user.js](https://raw.githubusercontent.com/JSW26/tampermonkey-scripts/main/scripts/Kone_Image_Recovery.user.js) |
| Kio → Kiosk Downloader (Windows Bridge) | 1.1.0 | [Kio_to_Downloader.user.js](https://raw.githubusercontent.com/JSW26/tampermonkey-scripts/main/scripts/Kio_to_Downloader.user.js) |
| Base64 드래그 디코더 (코네 제외) | 1.1.0 | [Base64_Drag_Decoder.user.js](https://raw.githubusercontent.com/JSW26/tampermonkey-scripts/main/scripts/Base64_Drag_Decoder.user.js) |

### 첫 설치 및 기존 스크립트 교체

1. 먼저 **Tampermonkey → 유틸리티 → ZIP 내보내기**로 현재 설치본을 백업합니다.
2. 위의 `.user.js` 링크를 Firefox에서 열고 Tampermonkey의 **설치/업데이트**를 진행합니다.
3. 대시보드에서 동일 기능의 구버전이 중복 실행되지 않는지 확인합니다. 새 스크립트가 별도로 생성되었다면 기존 사본을 비활성화합니다.
4. 코네와 키오스크 탭을 새로고침해 정상 동작하는지 확인합니다.

**주의:** 별도 Base64 드래그 디코더는 코네 외의 사이트에서 사용하는 선택 기능입니다. 코네 페이지의 드래그 해독은 통합 디코더가 처리합니다.

**Kio Windows Bridge:** 이 Tampermonkey 스크립트만으로는 Windows의 Kiosk Downloader가 실행되지 않습니다. 기존 `Kio_Tampermonkey_Bridge_v1.1.zip` 설치 패키지의 로컬 프로토콜 핸들러가 별도로 필요합니다.

## 업데이트 방식

각 파일의 메타데이터에 원본 파일의 GitHub Raw URL이 `@updateURL` / `@downloadURL`로 등록되어 있습니다. 앞으로 코드를 수정하면 해당 파일을 갱신하고 **`@version`을 반드시 증가**시킵니다. Tampermonkey가 설정된 주기에 새 버전을 확인하며, 원한다면 확장 프로그램에서 수동으로 업데이트를 확인할 수 있습니다.

- GitHub에 코드가 올라갔다고 기존 설치본이 자동으로 이 저장소를 바라보는 것은 아닙니다. **위 링크로 최초 1회 설치/업데이트가 필요합니다.**
- 각 기능은 분리해 관리합니다. 변경 이력은 Git 커밋에서 확인할 수 있습니다.
- 현재 소스는 복원한 기존 버전이므로 이 저장소에 올렸다고 브라우저 실기기 테스트가 새로 수행된 것은 아닙니다.

## 출처 및 보안

통합 디코더는 Kone Merged Decoder, Kone base64 autodecoder Rebuilt(OMNI7), Arca base64 autodecoder(Laria)를 바탕으로 제작됐습니다. 저작권 및 라이선스는 [LICENSE.txt](LICENSE.txt)를 참고하세요. 외부 라이브러리는 각 배포처의 라이선스를 따릅니다.

**이 저장소는 공개 상태입니다.** 계정 비밀번호, API 키, 세션 토큰, 쿠키 등 비밀 정보가 포함된 코드를 절대 커밋하지 마세요. 코드 안에 사이트용 기본 암호 예시가 포함되어 있으므로, 개인적으로 사용하는 비밀 암호를 여기에 직접 추가하지 않는 것이 좋습니다.
