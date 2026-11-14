// ==UserScript==
// @name         Kone - 이미지 로딩 재시도 및 읽던 위치 복원
// @namespace    local.kone.image.recovery
// @version      0.1.0
// @description  코네 이미지 지연 로딩이 멈췄을 때 현재 화면의 이미지 재시도, 새로고침 전 스크롤 및 details 펼침 상태 저장/복구.
// @match        https://kone.gg/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(() => {
  'use strict';
  if (window.__koneImageRecoveryInstalled) return;
  window.__koneImageRecoveryInstalled = true;

  const PREFIX = 'kone-image-recovery-v1:';
  const MAX_AGE = 12 * 60 * 60 * 1000; // 동일 탭에서 최대 12시간
  const MAX_RETRIES = 15; // 한 번 누를 때 네트워크 요청 폭주 방지
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const key = () => PREFIX + location.pathname + location.search;
  let restoreBusy = false;
  let saveTimer = 0;
  let toastTimer = 0;

  function getSaved() {
    try {
      const data = JSON.parse(sessionStorage.getItem(key()) || 'null');
      return data && Date.now() - data.time < MAX_AGE ? data : null;
    } catch (_) { return null; }
  }

  function savePosition() {
    if (restoreBusy) return;
    try {
      const details = [...document.querySelectorAll('details')];
      const open = details.map((node, i) => node.open ? i : -1).filter(i => i >= 0);
      sessionStorage.setItem(key(), JSON.stringify({
        y: window.scrollY,
        time: Date.now(),
        open,
        detailsCount: details.length
      }));
    } catch (_) { /* storage unavailable */ }
  }

  function scheduleSave() {
    if (restoreBusy) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(savePosition, 180);
  }

  const panel = document.createElement('div');
  panel.id = 'kone-image-recovery-panel';
  panel.style.cssText = [
    'position:fixed','right:12px','bottom:14px','z-index:2147483646',
    'display:flex','gap:6px','align-items:center','flex-wrap:wrap',
    'max-width:calc(100vw - 24px)','font:12px/1.3 sans-serif'
  ].join(';');

  function button(title, handler) {
    const el = document.createElement('button');
    el.type = 'button';
    el.textContent = title;
    el.style.cssText = [
      'padding:8px 10px','border:1px solid #697386','border-radius:8px',
      'background:#202630','color:white','cursor:pointer','box-shadow:0 2px 8px #0004',
      'font:inherit','white-space:nowrap'
    ].join(';');
    el.addEventListener('click', handler);
    panel.appendChild(el);
    return el;
  }

  const retryButton = button('이미지 재시도', retryVisibleImages);
  button('위치 복원', () => restorePosition(true));
  const toast = document.createElement('div');
  toast.setAttribute('role','status');
  toast.style.cssText = [
    'position:fixed','right:12px','bottom:58px','z-index:2147483647',
    'padding:9px 11px','max-width:320px','border-radius:8px',
    'background:#303641','color:white','font:12px/1.4 sans-serif',
    'box-shadow:0 2px 10px #0005','display:none','pointer-events:none'
  ].join(';');

  function notify(message) {
    toast.textContent = message;
    toast.style.display = 'block';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.style.display = 'none', 3300);
  }

  function isNearView(img) {
    if (!img.getClientRects().length) return false; // 숨긴 이미지 무시
    const r = img.getBoundingClientRect();
    const distance = Math.max(innerHeight * 1.1, 700);
    return r.bottom >= -distance && r.top <= innerHeight + distance;
  }

  async function retryVisibleImages() {
    retryButton.disabled = true;
    retryButton.style.opacity = '0.65';
    try {
      const y = scrollY;
      // 사이트 자체 스크롤 기반 지연 로딩 핸들러를 다시 작동하도록 요청.
      dispatchEvent(new Event('scroll'));
      dispatchEvent(new Event('resize'));
      // 실제 스크롤 변화가 있어야만 반응하는 구현을 위한 미세한 움직임.
      scrollTo({top: Math.max(0, y - 1), behavior: 'instant'});
      scrollTo({top: y, behavior: 'instant'});

      const candidates = [...document.images].filter(isNearView);
      let activated = 0;
      let retried = 0;
      for (const img of candidates) {
        // 브라우저 고유의 loading=lazy만 현재/근처 이미지에 한해 해제.
        if (img.loading === 'lazy') {
          img.loading = 'eager';
          activated++;
        }
        if (retried >= MAX_RETRIES) continue;
        // 네트워크 로딩이 끝났지만 디코딩에 실패한 이미지에만 재요청.
        if (!img.complete || img.naturalWidth !== 0) continue;
        const src = img.getAttribute('src');
        if (!src || src.startsWith('data:') || src.startsWith('blob:')) continue;
        retried++;
        // 캐시 무효화 쿼리 등 URL 변경 없이 동일 주소만 재요청.
        img.removeAttribute('src');
        await sleep(0);
        if (img.isConnected) img.setAttribute('src', src);
        await sleep(35);
      }
      notify(`현재 화면 근처 ${candidates.length}개 확인 · 지연 해제 ${activated}개 · 실패 이미지 재시도 ${retried}개`);
    } catch (err) {
      notify('재시도 실패: ' + String(err && err.message || err));
    } finally {
      retryButton.disabled = false;
      retryButton.style.opacity = '';
    }
  }

  async function restorePosition(manual) {
    const data = getSaved();
    if (!data) {
      if (manual) notify('저장된 위치가 없습니다. 현재 위치는 스크롤할 때 자동 저장됩니다.');
      return;
    }
    if (restoreBusy) return;
    restoreBusy = true;
    try {
      // <details><summary> 유형의 접힌 영역은 저장 당시 열린 곳만 복원.
      const openSet = new Set(data.open || []);
      const attempts = manual ? 20 : 24;
      const targetY = Math.max(0, data.y || 0);
      for (let n = 0; n < attempts; n++) {
        const details = document.querySelectorAll('details');
        // 리스트 구조가 비슷한 경우에 한해; 사이트 UI의 다른 토글은 건드리지 않음.
        if (Math.abs(details.length - (data.detailsCount || 0)) <= 2) {
          for (const i of openSet) if (details[i]) details[i].open = true;
        }
        scrollTo({top: targetY, behavior:'instant'});
        await sleep(n < 8 ? 180 : 350);
      }
      if (manual) notify('저장된 스크롤 위치로 이동했습니다.');
    } finally {
      restoreBusy = false;
      savePosition();
    }
  }

  function mount() {
    if (!document.body || document.getElementById(panel.id)) return;
    document.body.append(panel, toast);
    // 자동 저장 및 새로고침 시 복구.
    addEventListener('scroll', scheduleSave, {passive: true});
    addEventListener('pagehide', savePosition);
    addEventListener('visibilitychange', () => { if (document.hidden) savePosition(); });
    document.addEventListener('toggle', scheduleSave, true);
    document.addEventListener('click', () => setTimeout(scheduleSave, 250), true);
    if (getSaved()) restorePosition(false);
    else savePosition();
  }

  if (document.body) mount();
  else document.addEventListener('DOMContentLoaded', mount, {once: true});
})();
