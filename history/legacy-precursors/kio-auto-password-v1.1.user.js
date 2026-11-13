// ==UserScript==
// @name         키오스크(kio.ac) 자동 비밀번호 입력 (Fix)
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  React/Vue 환경을 우회하여 키오스크 비밀번호를 자동 입력하고 접속합니다.
// @match        https://*.kio.ac/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // 1. URL 꼬리표(#pwd=비밀번호)에서 비밀번호 빼오기 (쿼리 스트링 ?pwd= 도 대응)
    const match = window.location.href.match(/[#?&]pwd=([^&]+)/);

    if (match) {
        const password = decodeURIComponent(match[1]);
        console.log("[키오스크 자동 입력] 비밀번호 발견:", password);

        const findAndFill = setInterval(() => {

            // 💡 개선점 1: 단순히 password 타입이 아니라, '비밀번호'라는 힌트가 있는 모든 입력칸 찾기
            const inputs = Array.from(document.querySelectorAll('input'));
            const pwdInput = inputs.find(i => i.type === 'password' || (i.placeholder && i.placeholder.includes('비밀번호')));

            if (pwdInput) {
                clearInterval(findAndFill); // 타이머 종료

                // 💡 개선점 2: React/Vue 프레임워크 우회 입력 방식 (네이티브 Setter 호출)
                const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
                if (nativeInputValueSetter) {
                    nativeInputValueSetter.call(pwdInput, password);
                } else {
                    pwdInput.value = password;
                }

                // 사람이 직접 타자를 친 것처럼 브라우저에 신호 보내기
                pwdInput.dispatchEvent(new Event('input', { bubbles: true }));
                pwdInput.dispatchEvent(new Event('change', { bubbles: true }));

                console.log("[키오스크 자동 입력] 비밀번호 입력 완료! 확인 버튼 클릭 시도...");

                // 💡 프레임워크가 값을 인식할 아주 짧은 시간을 준 뒤 엔터/클릭
                setTimeout(() => {
                    const buttons = Array.from(document.querySelectorAll('button'));
                    // '확인', '입력', '다운로드' 등의 글자가 들어간 버튼 찾기
                    const submitBtn = buttons.find(b => b.textContent.includes('확인') || b.textContent.includes('입력') || b.textContent.includes('다운로드')) || pwdInput.nextElementSibling;

                    if (submitBtn && typeof submitBtn.click === 'function') {
                        submitBtn.click();
                    } else if (pwdInput.form) {
                        pwdInput.form.submit();
                    } else {
                        // 버튼을 못 찾으면 입력칸에서 직접 '엔터키'를 친 효과 발생
                        pwdInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
                        pwdInput.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', keyCode: 13, bubbles: true }));
                    }
                }, 100);
            }
        }, 300); // 0.3초마다 폼이 로딩됐는지 확인

        setTimeout(() => clearInterval(findAndFill), 5000);
    }
})();
