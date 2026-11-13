// ==UserScript==
// @name         Base64 Drag Decoder (Recreated)
// @namespace    local.base64.drag.decoder
// @version      1.0.0
// @description  Highlight Base64 text and click the decode bubble to view or copy decoded text.
// @match        http://*/*
// @match        https://*/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(() => {
  'use strict';
  let popup;
  const hide = () => { if (popup) { popup.remove(); popup = null; } };

  const decode = (text) => {
    let normalized = text.trim().replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
    if (!normalized || !/^[A-Za-z0-9+/]*={0,2}$/.test(normalized) || normalized.length % 4 === 1) return null;
    normalized = normalized.replace(/=+$/, '');
    const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
    try {
      const binary = atob(padded);
      const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
      return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch { return null; }
  };

  document.addEventListener('mousedown', (e) => {
    if (popup && !popup.contains(e.target)) hide();
  }, true);

  document.addEventListener('mouseup', (e) => {
    if (e.button !== 0 || popup?.contains(e.target)) return;
    const selection = window.getSelection();
    const chosen = selection?.toString()?.trim();
    if (!chosen || chosen.length > 100000) return;
    const decoded = decode(chosen);
    if (decoded === null) return;
    hide();
    popup = document.createElement('div');
    popup.style.cssText = 'position:fixed;z-index:2147483647;max-width:min(420px,90vw);background:#20232a;color:#fff;border:1px solid #697487;border-radius:9px;padding:10px;box-shadow:0 4px 20px #0008;font:14px/1.4 sans-serif;';
    const rect = selection.rangeCount ? selection.getRangeAt(0).getBoundingClientRect() : null;
    const x = rect?.left ?? e.clientX;
    const y = rect?.bottom ?? e.clientY;
    popup.style.left = Math.max(8, Math.min(innerWidth - 280, x)) + 'px';
    popup.style.top = Math.max(8, Math.min(innerHeight - 130, y + 8)) + 'px';
    const label = document.createElement('div');
    label.textContent = 'Base64 디코딩 결과';
    label.style.cssText = 'font-weight:bold;margin-bottom:5px';
    const result = document.createElement('div');
    result.textContent = decoded;
    result.style.cssText = 'white-space:pre-wrap;overflow-wrap:anywhere;max-height:220px;overflow:auto;margin-bottom:8px';
    const copy = document.createElement('button');
    copy.textContent = '복사';
    copy.style.cssText = 'cursor:pointer;margin-right:8px;padding:4px 10px';
    copy.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(decoded); copy.textContent = '복사됨'; }
      catch { copy.textContent = '복사 실패'; }
    });
    const close = document.createElement('button');
    close.textContent = '닫기';
    close.style.cssText = 'cursor:pointer;padding:4px 10px';
    close.addEventListener('click', hide);
    popup.append(label, result, copy, close);
    document.body.append(popup);
  }, true);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hide(); });
})();
