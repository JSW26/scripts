# 저장소 유지보수 규칙

## 프로젝트별 구조

- `scripts/<종류>/<이름>_v<버전>.user.js`: 현재 배포하는 실행 코드(프로젝트당 1개)
- `scripts/<종류>/update.meta.js`: Tampermonkey 버전 확인용 메타데이터(실행 코드 없음)
- `scripts/<종류>/README.md`: 기능, 설치 방법 및 사용 안내
- `scripts/<종류>/CHANGELOG.md`: 버전별 변경 내용
- `scripts/<종류>/history/`: 과거 버전만 보관. 현재 버전은 중복 보관하지 않음
- `scripts/kio-downloader/bridge/`: Kio 다운로드 연동 Windows 프로그램 전용
- 저장소 최상위 `README.md`: 스크립트 목록 및 설치 링크

루트 `scripts/`에 스크립트 실행 파일을 따로 두지 않습니다.

## 업데이트 순서

1. 필요한 스크립트만 수정해 `-beta.N` 테스트 버전으로 배포합니다.
2. 사용자 환경에서 정상 작동 확인 후 명시적인 승인으로 정식 버전을 확정합니다.
3. 현행 `_v<이전버전>.user.js` 실행 파일을 `history/v<이전버전>.user.js`로 이동합니다.
4. 새 `_<새버전>.user.js` 실행 파일 하나를 배포하고, `@version`, `@updateURL`, `@downloadURL`을 확인합니다.
5. `update.meta.js`의 `@version`과 `@downloadURL`을 새 실행 파일 기준으로 업데이트합니다.
6. 개별 README 및 CHANGELOG와 최상위 README의 파일명·링크·버전을 바꿉니다.
7. 새 버전 자동 업데이트는 Tampermonkey에서 별도로 테스트합니다. 메타데이터 변경만으로 자동 업데이트 성공을 단정하지 않습니다.

## 보안과 기록

- 폴더 정리만으로 기능이나 버전은 변경하지 않습니다.
- 실기기 검증 결과를 임의로 작성하지 않습니다.
- 서로 다른 스크립트를 임의 통합하지 않습니다.
- 공개 저장소에 개인정보·쿠키·토큰·암호를 넣지 않습니다.
- 원 저작자 표기와 라이선스를 유지합니다.
