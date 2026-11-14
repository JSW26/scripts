# Development & Release Guide

## 저장소 구조

- `scripts/<script>/NAME.user.js`: 최신 배포본 및 신규 설치 링크
- `scripts/<script>/README.md`: 해당 스크립트 사용 및 설치 안내
- `scripts/<script>/CHANGELOG.md`: 해당 스크립트의 패치노트
- `scripts/<script>/history/`: 구버전 소스
- `scripts/kio-downloader/bridge/`: Kio → Kiosk Downloader 전용 Windows 연동 파일
- `scripts/*.user.js`: 기존 Tampermonkey 설치 주소 호환용. **자동 업데이트를 보호하기 위해 유지**

## 업데이트 방식

### 1. Preview
1. 해당 프로젝트의 최신 소스를 `<next-version>-beta.N`으로 갱신합니다.
2. `@updateURL` 및 `@downloadURL`은 신규 프로젝트 경로를 사용합니다.
3. 이전 `scripts/<name>.user.js` 호환 주소의 파일에도 동일한 기능과 버전의 코드를 동시에 반영합니다.
4. 브라우저에서 실사용 검증 전에는 정상 작동이라고 기록하지 않습니다.
5. 정식 보관본·태그·최종 패치노트는 확정 전 작성하지 않습니다.

### 2. Verification
- 사용자의 실기기 테스트를 통해 동작을 검증합니다.
- 실패할 경우 `-beta.2`, `-beta.3` 등으로 반복합니다.
- **사용자의 명시적 승인 전에는 정식 버전으로 승격하지 않습니다.**

### 3. Stable
1. 검증된 코드의 `@version`을 정식 버전으로 변경합니다.
2. 신규 배포 위치와 예전 URL 호환 파일을 함께 갱신합니다.
3. `scripts/<script>/history/v<version>.user.js`에 보관본을 생성하고 업데이트 메타데이터를 제거합니다.
4. 프로젝트 `CHANGELOG.md`와 `README.md`, 최상위 `README.md`를 최신화합니다.

## 기록 원칙
- 폴더 재배치는 기능 변경이나 버전 상향 사유가 아닙니다.
- 이전 URL 호환 파일을 삭제하면 기존 설치 사용자들의 자동 업데이트가 끊길 수 있습니다.
- 서로 독립된 스크립트는 임의로 통합하지 않습니다.
- 실제 검증한 사실만 기록하고 오래된 이력의 불확실성을 명시합니다.
- 토큰·쿠키·비밀번호를 공개 저장소에 포함하지 않습니다.
- 원 저작자 및 외부 라이브러리 라이선스를 유지합니다.
