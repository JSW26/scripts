// ==UserScript==
// @name         Kio → Kiosk Downloader (Windows Bridge)
// @namespace    https://kio.ac/
// @version      1.1.0
// @updateURL    https://raw.githubusercontent.com/JSW26/scripts/main/scripts/kio-downloader/Kio_to_Downloader.user.js
// @downloadURL  https://raw.githubusercontent.com/JSW26/scripts/main/scripts/kio-downloader/Kio_to_Downloader.user.js
// @description  kio.ac 공유 페이지에서 Kiosk Downloader를 호출합니다. 최초 1회 Windows 연결 설치가 필요합니다.
// @match        https://kio.ac/*
// @match        https://www.kio.ac/*
// @grant        GM_registerMenuCommand
// @run-at       document-idle
// @noframes
// ==/UserScript==

(() => {
  'use strict';

  const SCHEME = 'kioffdl';
  const ID = 'kio-tm-bridge-launcher';
  // The native helper independently validates the decoded URL.
  function getShareUrl() {
    try {
      const u = new URL(location.href);
      if (u.protocol !== 'https:' || !['kio.ac', 'www.kio.ac'].includes(u.hostname)) return null;
      if (!/^\/c\/[A-Za-z0-9_-]+\/?$/.test(u.pathname)) return null;
      return u.href;
    } catch (_) {
      return null;
    }
  }

  function encodeUrl(url) {
    const bytes = new TextEncoder().encode(url);
    let binary = '';
    for (const b of bytes) binary += String.fromCharCode(b);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function protocolUrl(url) {
    return `${SCHEME}://open/${encodeUrl(url)}`;
  }

  function showStatus(message) {
    const old = document.getElementById('kio-tm-bridge-status');
    if (old) old.remove();
    const tip = document.createElement('div');
    tip.id = 'kio-tm-bridge-status';
    tip.textContent = message;
    Object.assign(tip.style, {
      position: 'fixed', right: '16px', bottom: '61px', zIndex: '2147483647',
      maxWidth: '310px', padding: '9px 11px', borderRadius: '9px',
      background: 'rgba(24,26,31,.94)', color: '#fff', font: '12px/1.55 system-ui, sans-serif',
      border: '1px solid rgba(255,255,255,.2)', pointerEvents: 'none',
      boxShadow: '0 4px 18px rgba(0,0,0,.2)'
    });
    document.documentElement.appendChild(tip);
    setTimeout(() => tip.remove(), 4600);
  }

  function launch() {
    const url = getShareUrl();
    if (!url) {
      alert('kio.ac/c/... 형식의 공유 페이지에서만 사용할 수 있습니다.');
      return;
    }
    showStatus('Windows 연결 프로그램 실행을 요청했습니다. Firefox가 외부 앱 실행을 물으면 허용하세요.');
    // A click-triggered top-level navigation keeps a real user activation.
    window.location.href = protocolUrl(url);
  }

  if (typeof GM_registerMenuCommand === 'function') {
    GM_registerMenuCommand('Kiosk Downloader로 현재 공유 링크 보내기', launch);
  }

  function updateButton() {
    const shareUrl = getShareUrl();
    let btn = document.getElementById(ID);
    if (!shareUrl) {
      if (btn) btn.remove();
      return;
    }
    if (btn) return;
    btn = document.createElement('button');
    btn.id = ID;
    btn.type = 'button';
    btn.textContent = 'Kio ↓';
    btn.title = 'Kiosk Downloader에서 현재 공유 링크 열기 (Alt+Shift+K)';
    btn.setAttribute('aria-label', 'Kiosk Downloader로 보내기');
    Object.assign(btn.style, {
      position: 'fixed', right: '13px', bottom: '13px', zIndex: '2147483647',
      padding: '7px 12px', borderRadius: '18px',
      border: '1px solid rgba(255,255,255,.28)',
      background: 'rgba(23,26,31,.72)', color: '#fff',
      font: '600 13px/1.4 system-ui, sans-serif', cursor: 'pointer',
      boxShadow: '0 2px 9px rgba(0,0,0,.14)', opacity: '.58',
      transition: 'opacity 130ms ease'
    });
    btn.addEventListener('mouseenter', () => { btn.style.opacity = '1'; });
    btn.addEventListener('mouseleave', () => { btn.style.opacity = '.58'; });
    btn.addEventListener('click', launch);
    document.documentElement.appendChild(btn);
  }

  document.addEventListener('keydown', e => {
    if (e.altKey && e.shiftKey && !e.ctrlKey && !e.metaKey && e.code === 'KeyK') {
      e.preventDefault();
      launch();
    }
  }, true);

  // Covers Kiosk's client-side navigation without polling continuously.
  const onUrlChange = () => setTimeout(updateButton, 0);
  window.addEventListener('popstate', onUrlChange);
  window.addEventListener('hashchange', onUrlChange);
  for (const method of ['pushState', 'replaceState']) {
    const original = history[method];
    try {
      history[method] = function (...args) {
        const result = original.apply(this, args);
        onUrlChange();
        return result;
      };
    } catch (_) { /* Some page contexts protect history methods. */ }
  }
  updateButton();
})();
