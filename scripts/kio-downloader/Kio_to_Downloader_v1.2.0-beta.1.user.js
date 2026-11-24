// ==UserScript==
// @name         Kio → Kiosk Downloader (Windows Bridge)
// @namespace    https://kio.ac/
// @version      1.2.0-beta.1
// @updateURL    https://raw.githubusercontent.com/JSW26/scripts/beta/kio-selection/scripts/kio-downloader/update.meta.js
// @downloadURL  https://raw.githubusercontent.com/JSW26/scripts/beta/kio-selection/scripts/kio-downloader/Kio_to_Downloader_v1.2.0-beta.1.user.js
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
      return u.origin + u.pathname;
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

  // Kiosk virtualizes rows. Its drag payload includes every selected node,
  // even when some of those rows are outside the viewport.
  function dragIds(row) {
    const dataTransfer = new DataTransfer();
    row.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer }));
    row.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer }));
    const ids = JSON.parse(dataTransfer.getData('x-node-list') || 'null');
    if (!Array.isArray(ids) || !ids.length) throw Error('웹 파일 선택 상태를 읽을 수 없습니다.');
    return ids;
  }

  function selectedNames() {
    const explorer = document.querySelector('[data-explorer-frontend]');
    if (!explorer) return [];
    const grid = Boolean(explorer.querySelector('.data-grid-item'));
    const rows = [...explorer.querySelectorAll(grid ? '.data-grid-item[data-index]' : '.data-table-row[data-index]')];
    if (!rows.length) return [];
    let checked;
    if (grid) {
      const folder = explorer.querySelector('[data-node-id][draggable="true"]');
      if (!folder) throw Error('선택을 확인하려면 표 보기로 바꿔 주세요.');
      const count = dragIds(folder).length - 1;
      if (!count) return [];
      checked = rows.filter(row => dragIds(row).length === count);
      if (checked.length !== count) throw Error('선택한 항목이 모두 보이게 한 뒤 다시 눌러 주세요.');
    } else {
      checked = rows.filter(row => row.dataset.state === 'selected');
    }
    const ids = dragIds(checked[0] || rows[0]);
    if (ids.length !== (checked.length || 1)) {
      throw Error('화면 밖에 선택한 파일이 있습니다. 선택한 파일이 모두 보이게 한 뒤 다시 눌러 주세요.');
    }
    if (!checked.length) return [];
    const current = rows[0].closest('[data-node-id]');
    const root = explorer.querySelector('[data-node-id]');
    if (!current || current.dataset.nodeId !== root?.dataset.nodeId) {
      throw Error('이 베타는 공유 최상위 목록에서 선택한 항목을 지원합니다.');
    }
    const names = checked.map(row => (grid ? row.querySelector('.text-ellipsis') : row.cells?.[1])?.textContent?.trim());
    if (names.some(name => !name) || new Set(names).size !== names.length) {
      throw Error('파일 이름을 구분할 수 없습니다. 표 보기에서 이름 열을 표시해 주세요.');
    }
    return names;
  }

  function protocolUrl(url) {
    const names = selectedNames();
    if (!names.length) return `${SCHEME}://open/${encodeUrl(url)}`;
    const title = document.querySelector('meta[property="og:title"]')?.content || document.title;
    const payload = encodeUrl(JSON.stringify({ url, names, title }));
    if (payload.length > 16000) throw Error('선택 목록이 너무 깁니다. 파일을 나눠서 보내 주세요.');
    return `${SCHEME}://selection/${payload}`;
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
    let target;
    try { target = protocolUrl(url); } catch (error) { showStatus(error.message); return; }
    showStatus('Windows 연결 프로그램 실행을 요청했습니다. Firefox가 외부 앱 실행을 물으면 허용하세요.');
    // A click-triggered top-level navigation keeps a real user activation.
    window.location.href = target;
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
