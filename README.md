# Tampermonkey Scripts

Tampermonkey 사용자 스크립트의 원본과 변경 이력을 관리하는 저장소입니다.

## 사용 방법

기존 스크립트를 `scripts/*.user.js` 형식으로 등록한 후, 각 스크립트의 UserScript 메타데이터에 업데이트 주소를 설정합니다.

```javascript
// @version      1.0.0
// @updateURL    https://raw.githubusercontent.com/JSW26/tampermonkey-scripts/main/scripts/EXAMPLE.user.js
// @downloadURL  https://raw.githubusercontent.com/JSW26/tampermonkey-scripts/main/scripts/EXAMPLE.user.js
```

위 `EXAMPLE.user.js`는 예시 경로입니다. 실제 스크립트를 등록할 때 파일명과 버전을 맞춰야 합니다.

- GitHub에 수정된 스크립트를 올릴 때마다 `@version`을 증가시킵니다.
- Tampermonkey는 설정된 업데이트 주기에 새 버전을 확인합니다.
- 이전 버전은 Git 커밋 기록에서 확인하거나 복구할 수 있습니다.

## 보안 및 관리

- **이 저장소는 공개(Public) 상태입니다.** 비밀번호, 인증 토큰, 쿠키, 개인 데이터가 포함된 스크립트를 올리지 마세요.
- 기존 스크립트를 먼저 백업하고, 변경 사항은 요청에 따라 반영합니다.
- 원본 동작을 유지하는 것을 우선하며, 업데이트 시 변경 내용을 커밋에 기록합니다.
