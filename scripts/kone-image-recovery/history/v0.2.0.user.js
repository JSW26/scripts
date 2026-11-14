// ==UserScript==
// @name         Kone 이미지 복구 + 읽던 위치 유지 (안전 재시도)
// @namespace    local.kone.image.recovery
// @version      0.2.0
// @description  실패한 이미지 주소를 기록해 재시도하고, 필요하면 펼침/스크롤 상태를 유지하며 새로고침
// @match        https://kone.gg/*
// @match        https://www.kone.gg/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(() => {
  'use strict';
  if (window.__koneImageRecoveryV2) return;
  window.__koneImageRecoveryV2 = true;

  const KEY = () => 'kone-image-recovery-v2:' + location.pathname + location.search;
  const MAX_REQUESTS = 12;
  const failures = new Map();
  let restoring = false;
  let reloading = false;
  let saveTimer = 0;
  let panel;
  const disclosurePaths = new Set();

  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
  const getText = (el) => (el?.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 100);

  // 페이지가 실패한 <img>를 플레이스홀더로 교체하기 전에 원본 주소를 보관한다.
  document.addEventListener('error', (event) => {
    const img = event.target;
    if (!(img instanceof HTMLImageElement)) return;
    const src = img.currentSrc || img.src || img.getAttribute('data-src');
    if (!src || /^(blob:|data:)/i.test(src)) return;
    const parent = img.parentElement;
    const ancestors = [];
    for (let p = parent, i = 0; p && i < 5; p = p.parentElement, i++) ancestors.push(p);
    failures.set(src, {img, ancestors, time: Date.now()});
    if (failures.size > 300) failures.delete(failures.keys().next().value);
  }, true);

  function notice(message) {
    if (!panel) return;
    const status = panel.querySelector('[data-kr-status]');
    if (status) status.textContent = message;
  }

  function near(el) {
    if (!el?.isConnected) return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.bottom > -innerHeight && rect.top < innerHeight * 2;
  }

  function safeUrl(url) {
    try {
      const u = new URL(url, location.href);
      return ['https:', 'http:'].includes(u.protocol) ? u.href : null;
    } catch (_) { return null; }
  }

  function retryOne(url, record) {
    return new Promise((resolve) => {
      const tester = new Image();
      const done = (ok) => { tester.onload = tester.onerror = null; resolve(ok); };
      tester.onload = () => {
        if (record.img?.isConnected && record.img.naturalWidth === 0) {
          // 실제 <img>가 아직 남아 있는 경우 원래 주소로 직접 복원한다.
          record.img.loading = 'eager';
          record.img.src = url;
        } else {
          // 사이트가 <img>를 오류 아이콘으로 교체한 경우: 기존 크기의 컨테이너에 겹쳐 표시.
          const holder = record.ancestors.find(el => {
            if (!el.isConnected) return false;
            const r = el.getBoundingClientRect();
            return r.width >= 100 && r.height >= 100 && r.width <= 2200 && r.height <= 4000;
          });
          if (holder && !holder.querySelector(':scope > .kr-restored-image')) {
            const style = getComputedStyle(holder);
            if (style.position === 'static') holder.style.position = 'relative';
            const im = document.createElement('img');
            im.className = 'kr-restored-image';
            im.src = url;
            im.alt = '복구된 이미지';
            im.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:contain;z-index:2;background:#292b2d;';
            holder.appendChild(im);
            done(true);
            return;
          }
          done(!!holder?.querySelector(':scope > .kr-restored-image'));
          return;
        }
        done(true);
      };
      tester.onerror = () => done(false);
      tester.src = url;
    });
  }

  async function retryVisible() {
    const btn = panel?.querySelector('[data-kr-retry]');
    if (!btn || btn.disabled) return;
    btn.disabled = true;
    let success = 0, fail = 0, checked = 0;
    try {
      // IntersectionObserver, 스크롤 이벤트 양쪽을 사용하는 사이트를 깨운다.
      dispatchEvent(new Event('scroll'));
      dispatchEvent(new Event('resize'));
      for (const img of document.images) {
        if (!near(img)) continue;
        if (img.loading === 'lazy') img.loading = 'eager';
        const url = safeUrl(img.currentSrc || img.src || img.getAttribute('data-src'));
        if (url && img.complete && !img.naturalWidth && !failures.has(url)) {
          failures.set(url, {img, ancestors: [img.parentElement, img.parentElement?.parentElement].filter(Boolean)});
        }
      }
      const candidates = [...failures.entries()].filter(([, r]) =>
        near(r.img) || r.ancestors.some(el => {
          if (!near(el)) return false;
          const box = el.getBoundingClientRect();
          return box.width >= 100 && box.height >= 100 && box.width <= 2200 && box.height <= 4000;
        }));
      for (const [url, record] of candidates.slice(0, MAX_REQUESTS)) {
        checked++;
        if (await retryOne(url, record)) {
          success++;
          failures.delete(url);
        } else fail++;
      }
      notice(checked ? `복구 ${success}개 · 실패 ${fail}개` :
        '재요청할 원본 URL이 없습니다. 아래 새로고침을 사용하세요.');
    } catch (e) {
      notice('재시도 오류: ' + String(e.message || e));
    } finally {
      btn.disabled = false;
    }
  }

  // 사이트의 일반 클릭 버튼이 아닌, 펼침/접힘 계열만 경로를 기억한다.
  function cssPath(el) {
    if (!el?.isConnected) return '';
    const parts = [];
    for (let node = el, i = 0; node && node !== document.body && i < 12; node = node.parentElement, i++) {
      if (node.id && typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
        parts.unshift('#' + CSS.escape(node.id));
        break;
      }
      const tag = node.localName;
      if (!tag) break;
      let index = 1;
      for (let p = node.previousElementSibling; p; p = p.previousElementSibling) {
        if (p.localName === tag) index++;
      }
      parts.unshift(`${tag}:nth-of-type(${index})`);
    }
    return parts.join(' > ');
  }

  document.addEventListener('click', (event) => {
    if (restoring) return;
    const el = event.target.closest?.('summary,[aria-expanded],button,[role="button"]');
    if (!el || el.closest('#kr-image-panel')) return;
    const label = getText(el);
    const expanded = el.getAttribute('aria-expanded');
    const expandable = el.tagName === 'SUMMARY' || expanded === 'true' || expanded === 'false' ||
      /펼치|접기|누르면|이미지 보기|더 보기|더보기|스압|열기/i.test(label);
    if (!expandable) return;
    const path = cssPath(el);
    if (!path) return;
    // 클릭 전 상태를 기준으로 다음 상태를 보관한다.
    if (expanded === 'true' || (el.tagName === 'SUMMARY' && el.parentElement?.open) || disclosurePaths.has(path)) {
      disclosurePaths.delete(path);
    } else disclosurePaths.add(path);
    scheduleSave();
  }, true);

  function saveSnapshot() {
    if (restoring || reloading) return;
    try {
      const details = [...document.querySelectorAll('details')];
      const aria = [...document.querySelectorAll('main [aria-expanded="true"], article [aria-expanded="true"]')].map(cssPath).filter(Boolean);
      sessionStorage.setItem(KEY(), JSON.stringify({
        scrollY: window.scrollY,
        openDetails: details.map((el, i) => el.open ? i : -1).filter(i => i >= 0),
        openAria: aria,
        paths: [...disclosurePaths],
        time: Date.now(),
        restoreOnLoad: false
      }));
    } catch (_) {}
  }

  function scheduleSave() {
    if (restoring) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveSnapshot, 200);
  }

  function refreshSafely() {
    if (restoring) return;
    saveSnapshot();
    try {
      const data = JSON.parse(sessionStorage.getItem(KEY()) || '{}');
      data.restoreOnLoad = true;
      sessionStorage.setItem(KEY(), JSON.stringify(data));
    } catch (_) {}
    reloading = true;
    location.reload();
  }

  async function restoreSnapshot() {
    let saved;
    try { saved = JSON.parse(sessionStorage.getItem(KEY()) || 'null'); } catch (_) {}
    if (!saved?.restoreOnLoad || Date.now() - saved.time > 10 * 60 * 1000) return;
    // 최초 1번만 자동 복원, 실패 시 무한 리로드 방지.
    saved.restoreOnLoad = false;
    sessionStorage.setItem(KEY(), JSON.stringify(saved));
    restoring = true;
    try {
      const closedSelectorsClicked = new Set();
      for (let attempt = 0; attempt < 38; attempt++) {
        const details = document.querySelectorAll('details');
        for (const index of saved.openDetails || []) if (details[index]) details[index].open = true;
        for (const path of [...(saved.openAria || []), ...(saved.paths || [])]) {
          if (closedSelectorsClicked.has(path)) continue;
          let el;
          try { el = document.querySelector(path); } catch (_) { continue; }
          if (!el) continue;
          if (el.tagName === 'SUMMARY') {
            if (!el.parentElement.open) el.parentElement.open = true;
            closedSelectorsClicked.add(path);
          } else if (el.getAttribute('aria-expanded') === 'true') {
            closedSelectorsClicked.add(path);
          } else if (el.getAttribute('aria-expanded') === 'false') {
            el.click();
            closedSelectorsClicked.add(path);
          } else if ((saved.paths || []).includes(path)) {
            // 사용자가 직접 '펼치기'로 눌렀던 버튼에만 재클릭한다.
            el.click();
            closedSelectorsClicked.add(path);
          }
        }
        window.scrollTo(0, Math.max(0, saved.scrollY || 0));
        await sleep(attempt < 12 ? 150 : 280);
      }
      notice('읽던 위치 복원 완료 (펼침 상태는 게시글 구성에 따라 일부 다를 수 있음)');
    } finally {
      restoring = false;
      saveSnapshot();
    }
  }

  function mount() {
    if (!document.body || document.querySelector('#kr-image-panel')) return;
    panel = document.createElement('div');
    panel.id = 'kr-image-panel';
    panel.style.cssText = 'position:fixed;bottom:12px;right:12px;display:flex;flex-direction:column;gap:4px;z-index:2147483646;font:12px sans-serif;max-width:230px;';
    const button = (label, attr, handler) => {
      const b = document.createElement('button');
      b.textContent = label;
      b.setAttribute(attr, '');
      b.style.cssText = 'background:#253044;color:white;border:1px solid #70819a;border-radius:6px;padding:8px;cursor:pointer;';
      b.addEventListener('click', handler);
      panel.append(b);
    };
    button('이미지 재시도', 'data-kr-retry', retryVisible);
    button('위치 유지 새로고침', 'data-kr-refresh', refreshSafely);
    const status = document.createElement('div');
    status.setAttribute('data-kr-status', '');
    status.textContent = '이미지 실패 시 재시도';
    status.style.cssText = 'background:#1d242d;color:#d4dbea;padding:5px 8px;border-radius:5px;';
    panel.append(status);
    document.body.append(panel);
    addEventListener('scroll', scheduleSave, {passive: true});
    addEventListener('pagehide', () => { if (!restoring && !reloading) saveSnapshot(); });
    addEventListener('visibilitychange', () => { if (document.hidden) scheduleSave(); });
    restoreSnapshot();
  }

  if (document.body) mount();
  else document.addEventListener('DOMContentLoaded', mount, {once:true});
})();
