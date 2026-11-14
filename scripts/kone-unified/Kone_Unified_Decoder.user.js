// ==UserScript==
// @name         Kone.gg 통합 자동 디코더 + Kiosk Pwd
// @name:ko      코네 통합 디코더 4
// @namespace    https://kone.gg/
// @version      4.0.0
// @updateURL    https://raw.githubusercontent.com/JSW26/scripts/main/scripts/kone-unified/Kone_Unified_Decoder.user.js
// @downloadURL  https://raw.githubusercontent.com/JSW26/scripts/main/scripts/kone-unified/Kone_Unified_Decoder.user.js
// @description  Base64·점자·SecureEncoder 통합 해독, 채널별 암호, 링크 목록, 댓글 인코딩, 키오스크 자동 입력, 빠른 복원
// @author       merged; Rebuilt by OMNI7, original by Laria
// @match        https://kone.gg/*
// @match        https://*.kone.gg/*
// @match        https://kio.ac/*
// @match        https://*.kio.ac/*
// @require      https://cdn.jsdelivr.net/npm/sweetalert2@11.26.3/dist/sweetalert2.all.min.js
// @require      https://cdn.jsdelivr.net/npm/libsodium-sumo@0.7.15/dist/modules-sumo/libsodium-sumo.js
// @require      https://cdn.jsdelivr.net/npm/libsodium-wrappers-sumo@0.7.15/dist/modules-sumo/libsodium-wrappers.js
// @grant        GM.getValue
// @grant        GM.setValue
// @grant        GM.deleteValue
// @grant        GM.registerMenuCommand
// @grant        GM.setClipboard
// @grant        GM.openInTab
// @license      MIT
// @run-at       document-end
// @noframes
// ==/UserScript==

/*
 * Based on Kone base64 autodecoder Rebuilt v3.14.1 by OMNI7 (MIT),
 * originally based on Arca base64 autodecoder by Laria,
 * and the user's Kone Merged Decoder v3.2.0.
 * Sources: https://greasyfork.org/scripts/572318
 *          https://greasyfork.org/scripts/482577
 * Local merged edition. No updateURL/downloadURL points at an upstream script.
 * See LICENSE.txt in the installation archive.
 */
(function () {
'use strict';
// Shared guards also prevent duplicate work in the image recovery iframe.
if (window.top !== window.self) return;
const koneHost = location.hostname.toLowerCase();
if (koneHost === 'kio.ac' || koneHost.endsWith('.kio.ac')) {
  runKioskAutoFill();
  return;
}
if (!(koneHost === 'kone.gg' || koneHost.endsWith('.kone.gg'))) return;
if (document.getElementById('kone-unified-v4')) return;
const unifiedMarker = document.createElement('meta');
unifiedMarker.id = 'kone-unified-v4';
document.head.appendChild(unifiedMarker);

function runKioskAutoFill() {
  let password;
  try {
    const u = new URL(location.href);
    password = u.searchParams.get('pwd') ?? new URLSearchParams(u.hash.slice(1)).get('pwd');
  } catch (_) { return; }
  if (!password) return;
  let done = false;
  const observer = new MutationObserver(fill);
  const timeout = setTimeout(stop, 10000);
  function stop() { observer.disconnect(); clearTimeout(timeout); }
  function fill() {
    if (done) return;
    const field = [...document.querySelectorAll('input')].find(i =>
      !i.disabled && (i.type === 'password' || /비밀번호|password/i.test(i.placeholder || '')));
    if (!field) return;
    done = true;
    stop();
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    if (setter) setter.call(field, password); else field.value = password;
    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.dispatchEvent(new Event('change', { bubbles: true }));
    setTimeout(() => {
      if (!field.isConnected) return;
      const scope = field.form || field.closest('[role="dialog"]') || field.parentElement?.parentElement;
      const button = scope && [...scope.querySelectorAll('button, input[type="submit"]')].find(b =>
        !b.disabled && /확인|입력|다운로드|submit|unlock/i.test(b.textContent || b.value || ''));
      if (button) button.click();
      else if (field.form?.requestSubmit) field.form.requestSubmit();
      else {
        field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
        field.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', bubbles: true }));
      }
    }, 100);
  }
  observer.observe(document.documentElement, { childList: true, subtree: true });
  fill();
}

function decorateKioskUrl(rawUrl) {
  if (!localParameter.kiosk.value) return rawUrl;
  try {
    const u = new URL(rawUrl, location.href);
    if (!(u.hostname === 'kio.ac' || u.hostname.endsWith('.kio.ac'))) return rawUrl;
    const hash = new URLSearchParams(u.hash.slice(1));
    if (u.searchParams.has('pwd') || hash.has('pwd')) return u.href;
    const password = getSecurePasswordMap()[getCurrentChannel()]?.[0];
    if (!password) return u.href;
    // Preserve any existing download fragment verbatim.
    u.hash = (u.hash ? u.hash.slice(1) + '&' : '') + 'pwd=' + encodeURIComponent(password);
    return u.href;
  } catch (_) { return rawUrl; }
}

// Use the same libsodium engine for both encoding and decoding.
let secSodiumPromise;
function getSodium() {
  if (!secSodiumPromise) {
    secSodiumPromise = (async () => {
      const lib = typeof sodium !== 'undefined' ? sodium : globalThis.sodium;
      if (!lib?.ready) throw new Error('SODIUM_UNAVAILABLE');
      await lib.ready;
      if (typeof lib.crypto_pwhash !== 'function') throw new Error('SODIUM_UNAVAILABLE');
      return lib;
    })().catch(e => { secSodiumPromise = null; throw e; });
  }
  return secSodiumPromise;
}

const SEC_CACHE_KEY = 'kone-unified-cache-v4';
const SEC_CACHE_TTL = 60 * 60 * 1000;
const SEC_CACHE_MAX = 80;
const SEC_CACHE_CHARS = 700000;
const _secPlainCache = new Map();
const _secFailCache = new Set();
let secCacheTimer;
let _secQueue = Promise.resolve();
function secEnqueue(job) {
  const p = _secQueue.then(() => new Promise(resolve => setTimeout(resolve, 0))).then(job);
  _secQueue = p.catch(() => {});
  return p;
}
function pruneSecCache() {
  const now = Date.now();
  for (const [key, value] of _secPlainCache) {
    if (now - value.time >= SEC_CACHE_TTL || value.time > now) _secPlainCache.delete(key);
  }
  let size = [..._secPlainCache].reduce((sum, [k, v]) => sum + k.length + v.plain.length, 0);
  while (_secPlainCache.size > SEC_CACHE_MAX || size > SEC_CACHE_CHARS) {
    const key = _secPlainCache.keys().next().value;
    const value = _secPlainCache.get(key);
    size -= key.length + value.plain.length;
    _secPlainCache.delete(key);
  }
}
function getSecCached(norm) {
  const result = _secPlainCache.get(norm);
  if (!result) return undefined;
  if (Date.now() - result.time >= SEC_CACHE_TTL || result.time > Date.now()) {
    _secPlainCache.delete(norm);
    return undefined;
  }
  _secPlainCache.delete(norm);
  _secPlainCache.set(norm, result);
  return result.plain;
}
function persistSecCache() {
  clearTimeout(secCacheTimer);
  if (!localParameter.sessioncache.value) return;
  secCacheTimer = setTimeout(() => {
    pruneSecCache();
    try { sessionStorage.setItem(SEC_CACHE_KEY, JSON.stringify([..._secPlainCache])); } catch (_) {}
  }, 120);
}
function rememberSecPlain(norm, plain) {
  _secPlainCache.delete(norm);
  _secPlainCache.set(norm, { plain, time: Date.now() });
  pruneSecCache();
  persistSecCache();
}
function loadSecCache() {
  if (!localParameter.sessioncache.value) return;
  try {
    const raw = sessionStorage.getItem(SEC_CACHE_KEY);
    if (raw && raw.length <= SEC_CACHE_CHARS * 3) {
      const entries = JSON.parse(raw);
      if (Array.isArray(entries)) for (const item of entries.slice(-SEC_CACHE_MAX)) {
        if (!Array.isArray(item) || item.length !== 2) continue;
        const [norm, value] = item;
        if (typeof norm === 'string' && /^[A-Za-z0-9_-]{75,}$/.test(norm) &&
            typeof value?.plain === 'string' && Number.isFinite(value.time)) _secPlainCache.set(norm, value);
      }
    }
    // Import v3.2's successful results once, without carrying saved passwords.
    const legacy = JSON.parse(sessionStorage.getItem('kone-se-fast-cache-v3') || '[]');
    if (Array.isArray(legacy)) for (const [key, plain, , time] of legacy.slice(-SEC_CACHE_MAX)) {
      if (typeof key !== 'string' || typeof plain !== 'string' || !Number.isFinite(time)) continue;
      const token = key.slice(key.indexOf('\u0000') + 1);
      const parsed = parseSecurencodeToken(token);
      if (parsed && !_secPlainCache.has(parsed.norm)) _secPlainCache.set(parsed.norm, { plain, time });
    }
    sessionStorage.removeItem('kone-se-fast-cache-v3');
    pruneSecCache();
    persistSecCache();
  } catch (_) {}
}
function clearSecCache() {
  clearTimeout(secCacheTimer);
  _secPlainCache.clear();
  _secFailCache.clear();
  try {
    sessionStorage.removeItem(SEC_CACHE_KEY);
    sessionStorage.removeItem('kone-se-fast-cache-v3');
  } catch (_) {}
}
async function secDecryptWith(parsed, password) {
  const failKey = parsed.norm + '\n' + password;
  if (_secFailCache.has(failKey)) return null;
  const lib = await getSodium();
  const pw = lib.from_string(password.normalize('NFC'));
  let key;
  try {
    // A Standard token must always use 64 MiB; changing its KDF parameters
    // on a memory error would derive a different key and cannot decrypt it.
    key = lib.crypto_pwhash(32, pw, parsed.salt, parsed.profile.iterations,
      parsed.profile.memoryKiB * 1024, lib.crypto_pwhash_ALG_ARGON2ID13);
    let bytes;
    try {
      bytes = lib.crypto_aead_xchacha20poly1305_ietf_decrypt(null, parsed.sealed, null, parsed.nonce, key);
    } catch (_) {
      _secFailCache.add(failKey);
      while (_secFailCache.size > 500) _secFailCache.delete(_secFailCache.values().next().value);
      return null;
    }
    try { const decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      return /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(decoded) ? null : decoded; }
    finally { lib.memzero(bytes); }
  } finally {
    if (key) lib.memzero(key);
    lib.memzero(pw);
  }
}
function secTryPasswords(parsed, passwords, isCurrent = () => true) {
  return secEnqueue(async () => {
    if (!isCurrent()) return null;
    const cached = getSecCached(parsed.norm);
    if (cached !== undefined) return cached;
    for (const password of passwords) {
      if (!isCurrent()) return null;
      const plain = await secDecryptWith(parsed, password);
      if (plain !== null) { rememberSecPlain(parsed.norm, plain); return plain; }
    }
    return null;
  });
}

async function encryptText(plaintext, password, compatibility = false) {
  const lib = await getSodium();
  const pt = lib.from_string(plaintext);
  if (pt.length > 1000000) throw new Error('인코딩할 내용은 1MB 이하여야 합니다.');
  const profile = SEC_PROFILES[compatibility ? 1 : 0];
  const salt = lib.randombytes_buf(16);
  salt[15] = (salt[15] & 254) | (compatibility ? 1 : 0);
  const nonce = lib.randombytes_buf(24);
  const pw = lib.from_string(password.normalize('NFC'));
  let key;
  try {
    key = lib.crypto_pwhash(32, pw, salt, profile.iterations, profile.memoryKiB * 1024,
      lib.crypto_pwhash_ALG_ARGON2ID13);
    const sealed = lib.crypto_aead_xchacha20poly1305_ietf_encrypt(pt, null, null, nonce, key);
    const raw = new Uint8Array(40 + sealed.length);
    raw.set(salt); raw.set(nonce, 16); raw.set(sealed, 40);
    const canonical = lib.to_base64(raw, lib.base64_variants.URLSAFE_NO_PADDING);
    const substitutions = { a: 'а', c: 'с', e: 'е', o: 'о', p: 'р', x: 'х', y: 'у' };
    let replaced = false;
    return [...canonical].map(c => {
      if (substitutions[c] && (!replaced || Math.random() < 0.15)) {
        replaced = true; return substitutions[c];
      }
      return c;
    }).join('');
  } finally {
    if (key) lib.memzero(key);
    lib.memzero(pw);
    lib.memzero(pt);
  }
}

const encodeFields = new WeakMap();
function scheduleEncodeButtons() {
  const root = getCommentRoot();
  if (!root) return;
  root.querySelectorAll('textarea, [contenteditable="true"]').forEach(field => {
    if (field.disabled || field.readOnly || field.closest('.abad-generated, .swal2-container')) return;
    if (!field.getClientRects().length) return;
    if (encodeFields.get(field)?.isConnected) return;
    const wrap = document.createElement('div');
    wrap.className = 'kone-se-encode-wrap';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'abad-sec-btn';
    button.textContent = '🔐 댓글 인코딩';
    button.addEventListener('click', async e => {
      e.preventDefault(); e.stopPropagation();
      const plain = field.isContentEditable ? field.innerText : field.value;
      if (!plain?.trim()) { showToast('인코딩할 댓글을 먼저 입력하세요.', 'info'); return; }
      const token = parseSecurencodeToken(plain.trim());
      if (token && !window.confirm('이미 암호문처럼 보입니다. 다시 인코딩할까요?')) return;
      const defaultPassword = getCandidatePasswords()[0] || 'koreanvoice';
      const ids = { pw: createElemID(), compat: createElemID() };
      const result = await swalFire({
        title: '댓글 인코딩',
        html: `<label for="${ids.pw}">사용할 암호</label><input type="password" id="${ids.pw}" class="abad-search-input" autocomplete="off"><label class="abad-sec-check"><input id="${ids.compat}" type="checkbox">호환 모드 (19 MiB · 저사양 기기용)</label><div class="abad-hint">내용을 암호문으로 바꿉니다. 댓글 등록은 직접 눌러주세요.</div>`,
        showCancelButton: true, confirmButtonText: '인코딩', cancelButtonText: '취소',
        didOpen: modal => { modal.querySelector('#' + ids.pw).value = defaultPassword; },
        preConfirm: () => {
          const modal = Swal.getPopup();
          const password = modal.querySelector('#' + ids.pw).value;
          if (!password) { Swal.showValidationMessage('암호를 입력하세요.'); return false; }
          return { password, compatibility: modal.querySelector('#' + ids.compat).checked };
        },
      });
      if (!result.isConfirmed) return;
      button.disabled = true; button.textContent = '인코딩 중…';
      try {
        const encoded = await secEnqueue(() => encryptText(plain, result.value.password, result.value.compatibility));
        if (!field.isConnected) return;
        const current = field.isContentEditable ? field.innerText : field.value;
        if (current !== plain) { showToast('내용이 바뀌어 덮어쓰기를 중단했습니다.', 'info'); return; }
        if (field.isContentEditable) field.innerText = encoded;
        else {
          const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
          if (setter) setter.call(field, encoded); else field.value = encoded;
        }
        field.dispatchEvent(new Event('input', { bubbles: true }));
        field.dispatchEvent(new Event('change', { bubbles: true }));
        showToast('인코딩 완료. 댓글 내용을 확인하고 등록하세요.');
      } catch (error) { showToast('인코딩 실패: ' + escapeHtml(String(error.message || error)), 'error', 4000); }
      finally { button.disabled = false; button.textContent = '🔐 댓글 인코딩'; }
    });
    wrap.appendChild(button);
    field.insertAdjacentElement('afterend', wrap);
    encodeFields.set(field, wrap);
  });
}

let recoveryObserved = null;
let recoveryResize;
function positionUnifiedBadge() {
  const badge = document.getElementById('abad_floating_badge');
  if (!badge) return;
  const panel = document.getElementById('kr03-panel');
  if (panel !== recoveryObserved) {
    recoveryResize?.disconnect();
    recoveryObserved = panel;
    if (panel) recoveryResize?.observe(panel);
  }
  const rect = panel?.getBoundingClientRect();
  badge.style.bottom = rect?.width && rect?.height
    ? Math.max(12, Math.ceil(innerHeight - rect.top + 10)) + 'px' : '12px';
}
function startUnifiedLayout() {
  if (typeof ResizeObserver !== 'undefined') recoveryResize = new ResizeObserver(positionUnifiedBadge);
  new MutationObserver(records => {
    if (records.some(m => [...m.addedNodes, ...m.removedNodes].some(n => n.id === 'kr03-panel'))) positionUnifiedBadge();
  }).observe(document.body, { childList: true });
  window.addEventListener('resize', positionUnifiedBadge, { passive: true });
  positionUnifiedBadge();
}

const regexEncodedPrefixDef = [
    /(aHR0cDovL|aHR0cHM6Ly|bWVnYS5ue|a2lvLmFj)([\w\-+\/=]*)(?=[^\+=\w\/]|$)/g,
    /(YUhSMGNEb3ZM|YUhSMGNITTZMe|YldWbllTVX|YTIsdmJtR)([\w\-+\/=]*)(?=[^\+=\w\/]|$)/g,
    /(WVVoU01HTkViM1pN|WVVoU01HTklUVFpNZ|V1d4V1JteF|V1RJeHNXWm)([\w\-+\/=]*)(?=[^\+=\w\/]|$)/g,
    /(V1ZWb1UwMUhUa1ZpTTFwT|V1ZWb1UwMUhUa2xVVkZwTl|VmpkNFYxSn|VjFSSmVIT)([\w\-+\/=]*)(?=[^\+=\w\/]|$)/g,
    /(VjFaV2IxVXdNVWhVYTFacFRURndU|VjFaV2IxVXdNVWhVYTJ4VlZrWndUb)([\w\-+\/=]*)(?=[^\+=\w\/]|$)/g,
    /(VmpGYVYySXhWWGROVldoVllURmFjRlJVUm5kV|VmpGYVYySXhWWGROVldoVllUSjRWbFpyV25kVW)([\w\-+\/=]*)(?=[^\+=\w\/]|$)/g,
    /(Vm1wR1lWWXlTWGhXV0dST1ZsZG9WbGxVUm1GalJsSlZVbTVrV|Vm1wR1lWWXlTWGhXV0dST1ZsZG9WbGxVU2pSV2JGcHlWMjVrVl)([\w\-+\/=]*)(?=[^\+=\w\/]|$)/g,
    /(Vm0xd1IxbFdXWGxUV0doWFYwZFNUMVpzWkc5V2JHeFZVbTFHYWxKc1NsWlZiVFZyV|Vm0xd1IxbFdXWGxUV0doWFYwZFNUMVpzWkc5V2JHeFZVMnBTVjJKR2NIbFdNalZyVm)([\w\-+\/=]*)(?=[^\+=\w\/]|$)/g,
    /(Vm0weGQxSXhiRmRYV0d4VVYwZG9XRll3WkZOVU1WcHpXa2M1VjJKSGVGWlZiVEZIWVd4S2MxTnNXbFppVkZaeV|Vm0weGQxSXhiRmRYV0d4VVYwZG9XRll3WkZOVU1WcHpXa2M1VjJKSGVGWlZNbkJUVmpKS1IyTkliRmROYWxaeVZt)([\w\-+\/=]*)(?=[^\+=\w\/]|$)/g,
    /(Vm0wd2VHUXhTWGhpUm1SWVYwZDRWVll3Wkc5WFJsbDNXa1pPVlUxV2NIcFhhMk0xVmpKS1NHVkdXbFppVkVaSVdWZDRTMk14VG5OWGJGcHBWa1phZ|Vm0wd2VHUXhTWGhpUm1SWVYwZDRWVll3Wkc5WFJsbDNXa1pPVlUxV2NIcFhhMk0xVmpKS1NHVkdXbFpOYmtKVVZtcEtTMUl5VGtsaVJtUk9ZV3hhZVZad)([\w\-+\/=]*)(?=[^\+=\w\/]|$)/g,
    /(Vm0wd2QyVkhVWGhUV0docFVtMVNXVll3WkRSV1ZsbDNXa2M1V0ZKc2JETlhhMXBQVmxVeFYyTkljRmhoTWsweFZtcEtTMU5IVmtkWGJGcHBWa1ZhU1ZkV1pEUlRNazE0Vkc1T1dHSkdjSEJXYTFwaF|Vm0wd2QyVkhVWGhUV0docFVtMVNXVll3WkRSV1ZsbDNXa2M1V0ZKc2JETlhhMXBQVmxVeFYyTkljRmhoTWsweFZtcEtTMU5IVmtkWGJGcE9ZbXRLVlZadGNFdFRNVWw1Vkd0c2FWSnRVazlaVjNoaFpWWmFk)([\w\-+\/=]*)(?=[^\+=\w\/]|$)/g,
];
const MAX_DECODE_DEPTH = regexEncodedPrefixDef.length;

const abadInternalDB = {
  decodedLink: {}, decodedList: [], hostnameSetRaw: new Set(), hostnameSet: [],
  internalDB: { dragDecodingEnable: false, swal2Enable: false },
};

const abadConstDB = {
  regInvalid: /[^\w\+\/=-]/,
};

abadConstDB.SWAL2Title = `<div class="abad-brand"><span class="abad-brand__icon">🔓</span><span class="abad-brand__name">${('name:ko' in GM.info.script) ? GM.info.script['name:ko'] : GM.info.script.name}</span><span class="abad-brand__version">v${GM.info.script.version}</span></div>`;


function injectStyles() {
  if (document.getElementById('abad-styles')) return;
  const style = document.createElement('style');
  style.id = 'abad-styles';
  style.textContent = `
:root {
  --abad-radius: 14px; --abad-radius-sm: 10px;
  --abad-bg: #ffffff; --abad-bg-soft: #f8fafc; --abad-bg-hover: #eef2f6; --abad-border: #e2e8f0;
  --abad-text: #0f172a; --abad-text-muted: #64748b;
  --abad-primary: #059669; --abad-primary-soft: #d1fae5; --abad-primary-text: #047857;
  --abad-accent: #db2777;
  --abad-shadow: 0 10px 28px rgba(15,23,42,.12), 0 2px 6px rgba(15,23,42,.06);
  --abad-shadow-sm: 0 2px 10px rgba(15,23,42,.08);
}
html.dark, html.abad-dark {
  --abad-bg: #1e293b; --abad-bg-soft: #172033; --abad-bg-hover: #263349; --abad-border: #334155;
  --abad-text: #f1f5f9; --abad-text-muted: #94a3b8;
  --abad-primary: #34d399; --abad-primary-soft: rgba(52,211,153,.16); --abad-primary-text: #6ee7b7;
  --abad-accent: #f472b6;
  --abad-shadow: 0 14px 34px rgba(0,0,0,.5), 0 2px 6px rgba(0,0,0,.3);
  --abad-shadow-sm: 0 2px 12px rgba(0,0,0,.35);
}
.abad-brand { display:flex; align-items:center; justify-content:center; gap:9px; font-family: inherit; }
.abad-brand__icon { font-size:22px; line-height:1; }
.abad-brand__name { font-size:18px; font-weight:800; color: var(--abad-text); }
.abad-brand__version { font-size:12.5px; font-weight:700; color: var(--abad-primary-text); background: var(--abad-primary-soft); padding:2px 9px; border-radius:999px; }
.abad-card { display:flex; align-items:center; gap:12px; background: var(--abad-bg); border:1px solid var(--abad-border); border-radius: var(--abad-radius); padding:14px 18px; margin:14px 0; box-shadow: var(--abad-shadow-sm); cursor:pointer; transition: transform .15s ease, box-shadow .15s ease, border-color .15s ease; font-family: inherit; }
.abad-card:hover { transform: translateY(-1px); box-shadow: var(--abad-shadow); border-color: var(--abad-primary); }
.abad-card__icon { flex:none; width:44px; height:44px; border-radius:50%; background: var(--abad-primary-soft); color: var(--abad-primary-text); display:flex; align-items:center; justify-content:center; font-size:20px; }
.abad-card__body { flex:1; min-width:0; }
.abad-card__title { font-weight:700; font-size:16.5px; color: var(--abad-text); }
.abad-card__title b { color: var(--abad-primary-text); }
.abad-card__meta { font-size:14px; color: var(--abad-text-muted); margin-top:3px; }
.abad-card__chevron { flex:none; color: var(--abad-text-muted); font-size:15px; }
.abad-fab { position:fixed; right:16px; bottom:calc(80px + env(safe-area-inset-bottom, 0px)); z-index:9999; display:none; align-items:center; gap:8px; background: linear-gradient(135deg, var(--abad-primary), #0d9488); color:#fff; font-size:15px; font-weight:700; padding:11px 18px; border-radius:999px; box-shadow: var(--abad-shadow); cursor:pointer; user-select:none; transition: transform .15s ease; font-family: inherit; }
.abad-fab:hover { transform: translateY(-2px) scale(1.02); }
.abad-fab__count { background: rgba(255,255,255,.25); border-radius:999px; padding:1px 9px; font-size:14px; }
.abad-generated { display:inline; }
.abad-decoded-text { display:inline; padding:0.05em 0.35em; border-radius:0.35em; background: var(--abad-primary-soft); color: var(--abad-text); overflow-wrap:anywhere; font: inherit; line-height:inherit; box-decoration-break: clone; -webkit-box-decoration-break: clone; }
.abad-link { color: var(--abad-primary-text); font-weight:700; text-decoration:underline; text-underline-offset:0.15em; }
.abad-link:hover { color: var(--abad-accent); }
.abad-drag-container { display:inline; }
.abad-drag-result { color: var(--abad-primary-text); font-weight:700; cursor:pointer; background: var(--abad-primary-soft); border-radius:0.35em; padding:0 0.2em; font: inherit; box-decoration-break: clone; -webkit-box-decoration-break: clone; }
.abad-drag-result a { cursor:pointer; }
.abad-mobile-btn { position:fixed; bottom:calc(25px + env(safe-area-inset-bottom, 0px)); left:16px; z-index:10000; width:54px; height:54px; border-radius:50%; background: linear-gradient(135deg, var(--abad-primary), #0d9488); color:#fff; font-size:24px; display:none; align-items:center; justify-content:center; box-shadow: var(--abad-shadow); cursor:pointer; user-select:none; }
.abad-swal-popup:not(.swal2-toast) { border-radius:18px !important; font-family: inherit !important; font-size:16px !important; box-shadow: var(--abad-shadow) !important; background: var(--abad-bg) !important; color: var(--abad-text) !important; }
.abad-swal-popup.swal2-toast { border-radius:12px !important; font-family: inherit !important; padding:0.7em 1em !important; box-shadow: var(--abad-shadow-sm) !important; background: var(--abad-bg) !important; color: var(--abad-text) !important; }
.abad-swal-popup .swal2-html-container { color: var(--abad-text); }
.abad-swal-popup.swal2-toast .swal2-html-container { font-size: 13.5px; margin: 0 0.5em; }
.abad-btn { font-size:15px; font-weight:600; padding:9px 20px; border-radius:999px; border:none; cursor:pointer; margin:4px; transition: transform .1s ease, opacity .1s ease; }
.abad-btn:hover { transform: translateY(-1px); }
.abad-btn:active { transform: translateY(0); opacity:.85; }
.abad-btn--primary { background: var(--abad-primary); color:#fff; }
.abad-btn--secondary { background: var(--abad-accent); color:#fff; }
.abad-btn--ghost { background: var(--abad-bg-soft); color: var(--abad-text-muted); border:1px solid var(--abad-border); }
.abad-search-input { width:100%; box-sizing:border-box; padding:10px 14px; margin-bottom:10px; border:1px solid var(--abad-border); border-radius:10px; background: var(--abad-bg-soft); color: var(--abad-text); font-size:15px; outline:none; transition: border-color .12s ease; }
.abad-search-input:focus { border-color: var(--abad-primary); }
.abad-list { overflow:auto; width:100%; height:280px; border-radius:12px; background: var(--abad-bg-soft); border:1px solid var(--abad-border); padding:6px; }
.abad-list-row { display:flex; align-items:center; gap:8px; padding:9px 10px; border-radius:8px; }
.abad-list-row:hover { background: var(--abad-bg-hover); }
.abad-list-row__favicon { width:17px; height:17px; border-radius:3px; flex:none; }
.abad-list-row__link { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color: var(--abad-text); text-decoration:none; font-size:14.5px; font-weight:500; }
.abad-list-row__link:hover { color: var(--abad-primary-text); text-decoration:underline; }
.abad-list-row__goto { flex:none; font-size:13px; font-weight:700; color: var(--abad-primary-text); background: var(--abad-primary-soft); padding:4px 10px; border-radius:999px; text-decoration:none; cursor:pointer; }
.abad-list-empty { text-align:center; color: var(--abad-text-muted); padding:40px 0; font-size:15px; }
.abad-list-header { display:flex; align-items:center; justify-content:space-between; font-size:15px; margin-bottom:8px; text-align:left; }
.abad-list-count { font-size:14px; color: var(--abad-text-muted); }
.abad-settings { text-align:left; font-size:15.5px; }
.abad-settings-row { display:flex; align-items:center; justify-content:space-between; padding:11px 4px; border-bottom:1px solid var(--abad-border); gap:10px; }
.abad-settings-row:last-of-type { border-bottom:none; }
.abad-settings-label { display:flex; align-items:center; gap:9px; color: var(--abad-text); font-weight:600; }
.abad-settings-label__icon { font-size:18px; }
.abad-settings-desc { display:block; margin-top:2px; font-size:12.5px; font-weight:400; color: var(--abad-text-muted); line-height:1.35; }
.abad-switch { position:relative; width:42px; height:24px; flex:none; display:inline-block; }
.abad-switch input { position:absolute; opacity:0; width:100%; height:100%; margin:0; cursor:pointer; z-index:1; }
.abad-switch__track { position:absolute; inset:0; background: var(--abad-border); border-radius:999px; transition: background .15s ease; pointer-events:none; }
.abad-switch__thumb { position:absolute; top:2px; left:2px; width:20px; height:20px; border-radius:50%; background:#fff; box-shadow:0 1px 3px rgba(0,0,0,.3); transition: transform .15s ease; pointer-events:none; }
.abad-switch input:checked + .abad-switch__track { background: var(--abad-primary); }
.abad-switch input:checked ~ .abad-switch__thumb { transform: translateX(18px); }
.abad-depth-block { margin-top:8px; padding-top:12px; text-align:left; }
.abad-depth-value { color: var(--abad-primary-text); font-weight:800; }
.abad-range { width:100%; accent-color: var(--abad-primary); margin-top:8px; }
.abad-hint { margin-top:12px; font-size:13.5px; color: var(--abad-text-muted); background: var(--abad-bg-soft); border-radius:10px; padding:9px 11px; text-align:left; }
.abad-hint b { color: var(--abad-text); }
.abad-code-preview { margin-top:12px; text-align:left; font-size:14.5px; }
.abad-code-preview__box { overflow-y:auto; overflow-wrap:anywhere; margin:6px 0; padding:10px; width:100%; height:150px; background: var(--abad-bg-soft); border:1px solid var(--abad-border); border-radius:10px; box-sizing:border-box; cursor:text; user-select:text; color: var(--abad-text); }
.abad-timer-note { font-size:13px; color: var(--abad-text-muted); }
#abad_summary_box { display:block; }
.abad-card:focus-visible, .abad-fab:focus-visible, .abad-sec-btn:focus-visible, .abad-list-row__goto:focus-visible { outline:2px solid var(--abad-primary); outline-offset:2px; }
@media (hover: none) { .abad-kbd-hint { display:none; } .abad-card:hover, .abad-fab:hover, .abad-btn:hover { transform:none; } }
@media (max-width: 480px) { .abad-card { padding:12px 14px; gap:10px; } .abad-card__icon { width:38px; height:38px; font-size:18px; } .abad-card__title { font-size:15.5px; } .abad-card__meta { font-size:13px; } .abad-fab { font-size:14px; padding:9px 14px; } }
@media (prefers-reduced-motion: reduce) { .abad-card, .abad-fab, .abad-btn, .abad-switch__track, .abad-switch__thumb { transition:none !important; } .abad-flash { animation:none; outline:3px solid var(--abad-accent); } }
@keyframes abad-flash-kf { 0%,100% { box-shadow: 0 0 0 0 transparent; } 30%,70% { box-shadow: 0 0 0 4px var(--abad-accent); } }
.abad-flash { animation: abad-flash-kf 1.2s ease 2; border-radius:0.35em; }
.abad-sec { display:inline; }
.abad-sec__token { opacity:.65; word-break:break-all; }
.abad-sec--pending .abad-sec__token::after { content:' 🔐 복호화 중…'; font-size:.85em; opacity:.9; }
.abad-sec-btn { display:inline-flex; align-items:center; gap:4px; margin-left:6px; padding:1px 10px; border-radius:999px; border:1px solid var(--abad-border); background: var(--abad-bg-soft); color: var(--abad-primary-text); font: inherit; font-size:.85em; font-weight:700; cursor:pointer; vertical-align:baseline; }
.abad-sec-btn:hover { border-color: var(--abad-primary); }
.abad-sec-textarea { width:100%; box-sizing:border-box; min-height:140px; padding:10px; border:1px solid var(--abad-border); border-radius:10px; background: var(--abad-bg-soft); color: var(--abad-text); font-family: ui-monospace, monospace; font-size:14px; }
.abad-sec-check { display:flex; align-items:center; gap:8px; margin-top:10px; font-size:14px; color: var(--abad-text); justify-content:flex-start; }

.abad-fab { right:12px; bottom:12px; z-index:2147483645; border-radius:9px; gap:5px; padding:6px; background:rgba(34,34,34,.74); border:1px solid rgba(160,160,160,.47); backdrop-filter:blur(5px); max-width:calc(100vw - 24px); }
.abad-fab button { border:0; border-radius:5px; background:transparent; color:#f2f4f7; cursor:pointer; font:600 12px/1.4 system-ui,sans-serif; padding:5px 7px; }
.abad-fab button:hover { background:rgba(255,255,255,.13); }
.abad-fab button:focus-visible { outline:2px solid #8ec5ff; }
.abad-mobile-btn { z-index:2147483645; }
.abad-generated .abad-decoded-text { white-space:pre-wrap; }
.kone-se-encode-wrap { margin:5px 0; }
`;
  document.head.appendChild(style);
}

// kone 는 다크 테마일 때 html.dark + style="color-scheme: dark", 라이트일 때 class 없음 + "color-scheme: light" 를 쓴다.
// 사이트가 테마를 명시하면 그것을 따르고, 명시하지 않을 때만 OS 설정을 따른다.
function syncDarkClass() {
  const h = document.documentElement;
  const scheme = (h.style.colorScheme || '').trim();
  const siteLight = h.classList.contains('light') || scheme === 'light';
  const siteDark = h.classList.contains('dark') || scheme === 'dark';
  const osDark = !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  h.classList.toggle('abad-dark', !siteLight && (siteDark || osDark));
}

function swalFire(options) {
  return Swal.fire(Object.assign({
    buttonsStyling: false,
    customClass: {
      popup: 'abad-swal-popup',
      confirmButton: 'abad-btn abad-btn--primary',
      cancelButton: 'abad-btn abad-btn--ghost',
      denyButton: 'abad-btn abad-btn--secondary',
    },
  }, options));
}

function toastPosition() {
  return window.matchMedia('(max-width: 768px)').matches ? 'top' : 'top-end';
}

function showToast(message, icon = 'success', timer = 2200) {
  return swalFire({
    icon,
    html: `<b>${message}</b>`,
    toast: true,
    position: toastPosition(),
    timer,
    timerProgressBar: true,
    showConfirmButton: false,
  });
}

let hindex = 0;

const localParameter = {
  'autodecode': { 'param_name': 'autodecode', 'value': true,  'def_value': true },
  'basedepth':  { 'param_name': 'basedepth',  'value': 3,     'def_value': 3 },
  'draggable':  { 'param_name': 'draggable',  'value': true, 'def_value': true },
  // securencode(Argon2id + XChaCha20-Poly1305) 토큰 자동 복호화
  'securencode': { 'param_name': 'securencode', 'value': true, 'def_value': true },
  'kiosk': { param_name: 'kiosk', value: true, def_value: true },
  'sessioncache': { param_name: 'sessioncache', value: true, def_value: true },
  // 채널별 암호 목록. '*' 는 모든 채널에서 시도하는 공통 암호.
  'securepw':   { 'param_name': 'securepw', 'value': { 'rplay': ['koreanvoice', 'koreavoice'], 'somisoft': ['somisoft'], 'femdom': ['femdom'], '*': ['koreanvoice'] }, 'def_value': { 'rplay': ['koreanvoice', 'koreavoice'], 'somisoft': ['somisoft'], 'femdom': ['femdom'], '*': ['koreanvoice'] } },
};

// Tampermonkey 메뉴는 두 개만 둔다. 나머지 설정은 모두 '설정' 창 안에 있다.
const menuStructure = {
  'settings': { 'name': '⚙️ 설정', 'desc': '자동 디코딩, 드래그 디코딩, securencode, 디코딩 깊이, 기본값 초기화', 'func': openSettingsPanel },
  'securepw': { 'name': '🔐 securencode 암호 관리', 'desc': '채널별 securencode 복호화 암호를 관리합니다.', 'func': menuFunctionSecurePasswords },
  'clearcache': { name: '🧹 해독 캐시 비우기', func: () => { clearSecCache(); showToast('해독 캐시를 비웠습니다.'); } },
  'rescan': { name: '🔄 다시 스캔', func: executeDecoder },
};

const addListener = (node, event, handler, capture = false) => node.addEventListener(event, handler, capture);
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function getLocation(href) {
  const match = href.toString().match(/^(https?\:)\/\/(([^:\/?#]*)(?:\:([0-9]+))?)([\/]{0,1}[^?#]*)(\?[^#]*|)(#.*|)$/);
  return match && { href, hostname: match[3] };
}

function createElemID() {
  try {
    if (self.crypto && typeof self.crypto.randomUUID === 'function') return 'abad_' + self.crypto.randomUUID();
  } catch (_) {}
  return 'abad_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
}

function faviconFor(hostname) { return `https://www.google.com/s2/favicons?sz=32&domain=${hostname}`; }

// kone.gg (SvelteKit 리뉴얼 이후): #post-article > header + div.relative > div.article-prose > div.tiptap
function getPostContainer() {
  return document.querySelector('#post-article') || document.querySelector('main #post_content');
}
function getPostBody() {
  const pc = getPostContainer();
  if (!pc) return null;
  return pc.querySelector('.article-prose') || pc.querySelector('.tiptap') || null;
}
function getPostRoot() {
  const pc = getPostContainer();
  return (pc && pc.shadowRoot) ? pc.shadowRoot : pc;
}
function getCommentRoot() {
  return document.querySelector('#post-comment');
}

function getActiveSelection() {
  const root = getPostRoot();
  if (root && typeof root.getSelection === 'function') {
    const shadowSel = root.getSelection();
    if (shadowSel && shadowSel.toString().trim().length > 0) return shadowSel;
  }
  return window.getSelection();
}

function toElement(node) {
  if (!node) return null;
  return node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
}

function neutralizeFlexParent() { /* Keep the site layout unchanged. */ }
function isWithinDecodableArea(node) {
  const el = toElement(node);
  if (!el || typeof el.closest !== 'function') return false;
  if (el.isContentEditable || el.closest('textarea, input')) return false;
  if (el.closest('.abad-generated, .abad-drag-container, .abad-drag-result')) return false;
  return !!(el.closest('#post-article') || el.closest('#post-comment'));
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function looksLikeRealText(str) {
  if (!str || str.length < 2 || str.includes('\uFFFD')) return false;
  let printable = 0;
  for (const ch of str) {
    const code = ch.codePointAt(0);
    if (code === 0x09 || code === 0x0A || code === 0x0D || code >= 0x20) printable++;
  }
  if (printable / str.length <= 0.9) return false;
  return /[가-힣ㄱ-ㆎ\s]/.test(str) || /^(?:https?:\/\/|mega\.nz|kio\.ac)/i.test(str.trim());
}

const Base64 = {
  decode(input) {
    if (typeof input !== 'string' || input.length > 1500000) return null;
    const normalized = input.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(normalized)) return null;
    const cleaned = normalized.replace(/=+$/, '');
    if (!cleaned || cleaned.length % 4 === 1) return null;
    const padded = cleaned + '='.repeat((4 - cleaned.length % 4) % 4);
    try {
      const binaryString = window.atob(padded);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
      const decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      return /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(decoded) ? null : decoded;
    } catch (e) {
      return null;
    }
  }
};

const brailleMap = {
  '⠁': 'a', '⠃': 'b', '⠉': 'c', '⠙': 'd', '⠑': 'e', '⠋': 'f', '⠛': 'g', '⠓': 'h', '⠊': 'i', '⠚': 'j',
  '⠅': 'k', '⠇': 'l', '⠍': 'm', '⠝': 'n', '⠕': 'o', '⠏': 'p', '⠟': 'q', '⠗': 'r', '⠎': 's', '⠞': 't',
  '⠥': 'u', '⠧': 'v', '⠺': 'w', '⠭': 'x', '⠽': 'y', '⠵': 'z'
};
const brailleNumMap = {
  '⠁': '1', '⠃': '2', '⠉': '3', '⠙': '4', '⠑': '5', '⠋': '6', '⠛': '7', '⠓': '8', '⠊': '9', '⠚': '0'
};

function decodeBraille(str) {
  let result = '';
  let isNum = false, isCaps = false, isCapsLock = false;
  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    if (char === '⠸') {
      if (str[i + 1] === '⠌') { result += '/'; i++; continue; }
      if (str[i + 1] === '⠹') { result += '#'; i++; continue; }
    }
    if (char === '⠠') {
      isNum = false;
      if (str[i + 1] === '⠠') { isCapsLock = true; i++; continue; }
      else if (str[i + 1] === '⠄') { isCapsLock = false; i++; continue; }
      else { isCaps = true; continue; }
    }
    if (char === '⠼') { isNum = true; isCaps = false; isCapsLock = false; continue; }
    if (char === '⠰') { isNum = false; continue; }
    if (char === '⠲') { result += '.'; isNum = false; continue; }
    if (char === '⠒') { result += ':'; isNum = false; continue; }
    if (char === '⠤') { result += '-'; isNum = false; continue; }
    if (char === '⠐' && str[i + 1] === '⠶') { result += '='; i++; isNum = false; continue; }
    if (char === '⠖') { result += '+'; isNum = false; continue; }
    if (char === '⠌') { result += '/'; isNum = false; continue; }
    if (char === '⠹') { result += '#'; isNum = false; continue; }
    if (char === '⠶') { result += '='; isNum = false; continue; }
    if (char === '⠀') { result += ' '; isNum = false; continue; }
    if (isNum && brailleNumMap[char]) { result += brailleNumMap[char]; continue; }
    if (brailleMap[char]) {
      let c = brailleMap[char];
      if (isCaps || isCapsLock) { c = c.toUpperCase(); isCaps = false; }
      result += c;
      isNum = false;
      continue;
    }
    if (char >= '⠀' && char <= '⣿') continue;
    result += char;
    isNum = false;
  }
  return result;
}

function scrollToTarget(id_tmp, target) {
  const root = getPostRoot();
  const targetElem = document.getElementById(id_tmp) || (root && root.getElementById && root.getElementById(id_tmp));
  const fallback = getCommentRoot()?.querySelector('[id="' + CSS.escape(id_tmp) + '"]');
  const actualTarget = targetElem || fallback;
  if (!actualTarget) return;
  if (abadInternalDB.internalDB.swal2Enable) {
    Swal.close();
    showToast(`${(target === undefined) ? '해당' : target} 위치로 이동했습니다.`, 'success', 3500);
  }
  actualTarget.classList.remove('abad-flash');
  void actualTarget.offsetWidth;
  actualTarget.classList.add('abad-flash');
  window.scrollTo({ top: window.pageYOffset + actualTarget.getBoundingClientRect().top - (window.innerHeight / 2), behavior: 'smooth' });
  sleep(2600).then(() => { actualTarget.classList.remove('abad-flash'); });
};

function copyToClipboard(target, cont) {
  const msgHeader = cont != undefined ? `${cont}를 ` : '';
  if (target == undefined) { console.warn('Copy target does not exist'); return; }
  try {
    GM.setClipboard(target);
    if (abadInternalDB.internalDB.swal2Enable) {
      let timerInterval;
      swalFire({
        title: abadConstDB.SWAL2Title,
        html: `<b>${msgHeader}클립보드에 복사했습니다.</b><div class=\"abad-code-preview\">또는 아래 코드를 복사:<div class=\"abad-code-preview__box\">${escapeHtml(target)}</div></div>`,
        confirmButtonText: '확인', icon: 'success', timer: 3000, timerProgressBar: true,
        footer: '<span id="footer" class="abad-timer-note">&nbsp;</span>',
        didOpen: (modal) => {
          let autoClose = true;
          const handleMouseEnter = () => {
            autoClose = false; Swal.stopTimer();
            const footer = modal.querySelector('#footer');
            if (footer) footer.textContent = '창에서 마우스를 떼면 잠시 후 자동으로 닫힙니다.';
          };
          const handleMouseLeave = () => { autoClose = true; Swal.resumeTimer(); };
          modal.onmouseenter = handleMouseEnter;
          modal.onmouseleave = handleMouseLeave;
          if (modal.matches(':hover')) handleMouseEnter();
          timerInterval = setInterval(() => {
            if (autoClose) {
              const timeLeft = Swal.getTimerLeft();
              const seconds = isNaN(Math.floor(timeLeft / 1000)) ? '0' : Math.floor(timeLeft / 1000);
              const footer = modal.querySelector('#footer');
              if (footer) footer.textContent = `약 ${seconds}초 후 창이 자동으로 닫힙니다.`;
            }
          }, 100);
        },
        willClose: () => { clearInterval(timerInterval); },
      });
    } else {
      window.alert(msgHeader + '클립보드에 복사했습니다.');
    }
  } catch (e) { console.warn('Copy failed:', e); }
}


function showDecodeSummary() {
  if (!abadInternalDB.internalDB.swal2Enable) return;
  const listWrapperId = createElemID();
  const searchInputId = createElemID();
  swalFire({
    title: abadConstDB.SWAL2Title,
    width: 560,
    html: `
      <div class="abad-list-header">
        <b>디코딩된 링크 목록</b>
        <span class="abad-list-count">총 ${abadInternalDB.decodedList.length}개</span>
      </div>
      <input id="${searchInputId}" type="text" class="abad-search-input" placeholder="🔍 호스트명으로 검색 (예: mega.nz)">
      <div id="${listWrapperId}" class="abad-list">불러오는중...</div>
    `,
    showCancelButton: true,
    confirmButtonText: '📋 전체 복사',
    cancelButtonText: '닫기',
    showDenyButton: true,
    denyButtonText: '🚀 전체 열기',
    didOpen: (modal) => {
      Swal.showLoading();
      const listEl = modal.querySelector('#' + listWrapperId);
      const searchEl = modal.querySelector('#' + searchInputId);
      const renderList = (filterText) => {
        listEl.innerHTML = '';
        const needle = (filterText || '').trim().toLowerCase();
        abadInternalDB.decodedList.forEach((uuid) => {
          const target = abadInternalDB.decodedLink[uuid];
          if (!target) return;
          if (needle && !target.hostname.toLowerCase().includes(needle)) return;
          const row = document.createElement('div');
          row.className = 'abad-list-row';
          const favicon = document.createElement('img');
          favicon.src = faviconFor(target.hostname);
          favicon.className = 'abad-list-row__favicon';
          favicon.onerror = () => { favicon.style.display = 'none'; };
          const contLink = document.createElement('a');
          contLink.href = target.href;
          contLink.target = '_blank';
          contLink.rel = 'external nofollow noopener noreferrer';
          contLink.textContent = `${target.no}번째 링크 · ${target.hostname}`;
          contLink.className = 'abad-list-row__link';
          const gotoBtn = document.createElement('a');
          gotoBtn.textContent = '이동';
          gotoBtn.href = 'javascript:void(0);';
          gotoBtn.className = 'abad-list-row__goto';
          addListener(gotoBtn, 'click', () => scrollToTarget(target.id, `${target.no}번째 링크`));
          row.appendChild(favicon);
          row.appendChild(contLink);
          row.appendChild(gotoBtn);
          listEl.appendChild(row);
        });
        if (!listEl.childElementCount) {
          listEl.innerHTML = '<div class="abad-list-empty">일치하는 링크가 없습니다.</div>';
        }
      };
      addListener(searchEl, 'input', () => renderList(searchEl.value));
      sleep(80).then(() => { renderList(''); Swal.hideLoading(); });
    },
  }).then((result) => {
    const allLinks = abadInternalDB.decodedList.map(id => abadInternalDB.decodedLink[id]).filter(Boolean);
    if (result.isConfirmed) {
      copyToClipboard(allLinks.map(l => l.href).join('\n'), `링크 ${allLinks.length}개`);
    } else if (result.isDenied) {
      if (allLinks.length === 0) return;
      const openAll = () => allLinks.forEach(l => { try { GM.openInTab(l.href, { active: false, insert: true }); } catch (e) { window.open(l.href, '_blank'); } });
      if (allLinks.length > 5) {
        swalFire({
          title: abadConstDB.SWAL2Title,
          html: `<b>${allLinks.length}개의 링크를 새 탭으로 모두 여시겠습니까?</b>`,
          icon: 'warning', showCancelButton: true, confirmButtonText: '모두 열기', cancelButtonText: '취소',
        }).then(r => { if (r.isConfirmed) openAll(); });
      } else {
        openAll();
      }
    }
  });
}

function toHttpsCandidate(text) {
  if (text.startsWith('mega.nz') || text.startsWith('kio.ac')) return 'https://' + text;
  return text;
}

const BASE64_DETECT_SOURCE = `[A-Za-z0-9+/_-]{8,}={0,2}`;
const BASE64_EMBED_SOURCE = `[A-Za-z0-9+/_-]{8,}={0,2}`;

function fullyDecodeEmbedded(text) {
  let current = text;
  for (let pass = 0; pass < MAX_DECODE_DEPTH + 2; pass++) {
    const regex = new RegExp(BASE64_EMBED_SOURCE, 'g');
    let changed = false;
    const next = current.replace(regex, raw => {
      let probe = raw;
      // An intermediate Base64 layer may contain no spaces/Korean/URL prefix.
      // Follow it without displaying it until the final plaintext is plausible.
      for (let depth = 0; depth < MAX_DECODE_DEPTH + 2; depth++) {
        const decoded = Base64.decode(probe);
        if (decoded === null || decoded === probe) break;
        if (looksLikeRealText(decoded)) { changed = true; return decoded; }
        if (!/^[A-Za-z0-9+/_-]{8,}={0,2}$/.test(decoded)) break;
        probe = decoded;
      }
      return raw;
    });
    current = next;
    if (!changed) break;
  }
  return current;
}

// '비번' 문맥 자동 복호화: 같은 문단(p/li/td 등)에 비밀번호 관련 단어가 있으면,
// 공백 없는 영문/숫자 한 단어(예: koreanvoice)로 풀리는 Base64도 자동 복호화한다.
// 다른 단어의 일부를 잘라 디코딩하지 않도록 앞뒤가 Base64 문자가 아닌 독립된 덩어리만 대상으로 한다.
const PASSWORD_KEYWORD_REGEX = /비번|비밀\s*번호|패스\s*워드|암호(?!화)|password|passwd|pass\s*word|\bpw\b|\bpwd\b/i;
const PASSWORD_TOKEN_SOURCE = '(?<![A-Za-z0-9+/=])[A-Za-z0-9+/]{8,}={0,2}(?![A-Za-z0-9+/=])';
function isPasswordContext(node) {
  const parent = node && node.parentElement;
  if (!parent) return false;
  const block = parent.closest('p, li, td, th, h1, h2, h3, h4, h5, h6, blockquote, pre') || parent;
  return PASSWORD_KEYWORD_REGEX.test(block.textContent || '');
}
function decodesToPasswordLike(sourceStr) {
  const decoded = Base64.decode(sourceStr);
  if (decoded === null || decoded === sourceStr) return false;
  // 출력 가능한 ASCII(공백 제외) 4~64자만 허용 → 평범한 영단어가 깨진 바이트로 오인되는 경우를 걸러낸다.
  return /^[\x21-\x7E]{4,64}$/.test(decoded);
}

function decodesToRealText(sourceStr) {
  const decoded = Base64.decode(sourceStr);
  if (decoded === null) return false;
  const preview = decodeURI(encodeURI(decoded).replaceAll('%00', '')).trim();
  if (looksLikeRealText(preview)) return true;
  const fully = fullyDecodeEmbedded(preview);
  return fully !== preview && looksLikeRealText(fully);
}

function splitTrailingPunctuation(url) {
  let end = url.length;
  while (end > 0) {
    const ch = url[end - 1];
    if ('.,!?;:]'.includes(ch)) { end--; continue; }
    if (ch === ')') {
      const body = url.slice(0, end - 1);
      const opens = (body.match(/\(/g) || []).length;
      const closes = (body.match(/\)/g) || []).length;
      if (closes >= opens) { end--; continue; }
    }
    break;
  }
  return { link: url.slice(0, end), trailing: url.slice(end) };
}


function linkifyDecodedLine(line, genMode) {
  const urlRegex = /https?:\/\/[^\s<>"']+/g;
  let out = '', lastIndex = 0, match;
  while ((match = urlRegex.exec(line))) {
    const { link: trimmedLink, trailing: trailingPunct } = splitTrailingPunctuation(match[0]);
    const url_t = getLocation(decorateKioskUrl(trimmedLink));
    out += escapeHtml(line.slice(lastIndex, match.index));
    if (url_t) {
      if (genMode === 'article' || genMode === 'comment') {
        hindex++;
        const uuid = createElemID();
        abadInternalDB.hostnameSetRaw.add(url_t.hostname);
        abadInternalDB.decodedLink[uuid] = { id: uuid, no: hindex, type: genMode, hostname: url_t.hostname, href: url_t.href };
        abadInternalDB.decodedList.push(uuid);
        out += `<a id="${uuid}" class="abad-link" href="${escapeHtml(url_t.href)}" title="${escapeHtml(url_t.href)} (새 창으로 열기)" target="_blank" rel="external nofollow noopener noreferrer">${escapeHtml(trimmedLink)}</a>${escapeHtml(trailingPunct)}`;
      } else {
        out += `<a class="abad-link" href="${escapeHtml(url_t.href)}" title="${escapeHtml(url_t.href)} (새 창으로 열기)" target="_blank" rel="external nofollow noopener noreferrer">${escapeHtml(trimmedLink)}</a>${escapeHtml(trailingPunct)}`;
      }
    } else {
      out += escapeHtml(match[0]);
    }
    lastIndex = match.index + match[0].length;
  }
  out += escapeHtml(line.slice(lastIndex));
  return out;
}

function replacerGen(genMode) {
  return function (source) {
    const isBraille = /[⠀-⣿]/.test(source);
    try {
      let converted;
      if (isBraille) {
        converted = decodeBraille(source).trim();
        if (!converted) return null;
      } else {
        converted = Base64.decode(source);
        if (converted === null) return null;
      }
      converted = decodeURI(encodeURI(converted).replaceAll('%00', '')).trim();
      if (!converted || converted.includes('\uFFFD')) return null;
      const lines = converted.split(/\r?\n/).map(line => line.trim()).filter(line => line !== '');
      if (!lines.length) return null;
      const resolvedLines = lines.map(line => toHttpsCandidate(fullyDecodeEmbedded(line).trim()));
      const rendered = resolvedLines.map(line => linkifyDecodedLine(line, genMode)).join('<br>');
      return `<span class="abad-decoded-text">${rendered}</span>`;
    } catch (e) {
      return null;
    }
  };
}

// 이미 평문이 된 문자열을 줄 단위로 링크화해서 HTML 로 만든다. (securencode 결과 표시용)
function renderPlainDecodedHTML(text, genMode) {
  return '<span class="abad-decoded-text" style="white-space:pre-wrap">' +
    String(text).split(/\r?\n/).map(line => linkifyDecodedLine(toHttpsCandidate(fullyDecodeEmbedded(line)), genMode)).join('<br>') + '</span>';
}

/* ===================== securencode =====================
   https://securencode.hidencode.workers.dev 형식 (클라이언트 측 암호화)
   토큰 = base64url( salt[16] | nonce[24] | XChaCha20-Poly1305 암호문+태그 )
   키   = Argon2id(암호(NFC, UTF-8), salt, t=2, p=1, 32바이트)
          salt 마지막 바이트의 최하위 비트: 0 → 64 MiB(Standard), 1 → 19 MiB(Compatibility)
   공유 토큰은 일부 영문을 같은 모양의 키릴 문자(а с е о р х у)로 바꿔 둔 것이므로 되돌린 뒤 사용한다.
   Argon2id 및 XChaCha20-Poly1305 는 libsodium-sumo 0.7.15를 사용한다. */
const SEC_SALT_BYTES = 16, SEC_NONCE_BYTES = 24, SEC_TAG_BYTES = 16, SEC_KEY_BYTES = 32;
const SEC_PROFILES = { 0: { memoryKiB: 65536, iterations: 2 }, 1: { memoryKiB: 19456, iterations: 2 } };
const SEC_HOMOGLYPHS = { 'а': 'a', 'с': 'c', 'е': 'e', 'о': 'o', 'р': 'p', 'х': 'x', 'у': 'y' };
const SEC_TOKEN_CHARS = 'A-Za-z0-9_\\-асеорху';
// 최소 길이: salt+nonce+tag(56바이트) + 평문 1바이트 → base64url 76자. 여유를 두고 75자.
const SECURENCODE_TOKEN_SOURCE = `(?<![${SEC_TOKEN_CHARS}])[${SEC_TOKEN_CHARS}]{75,}(?![${SEC_TOKEN_CHARS}])`;


function parseSecurencodeToken(token) {
  const norm = token.replace(/[асеорху]/g, c => SEC_HOMOGLYPHS[c]);
  if (!/^[A-Za-z0-9_-]+$/.test(norm) || norm.length % 4 === 1) return null;
  let b64 = norm.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  let raw;
  try { raw = Uint8Array.from(atob(b64), c => c.charCodeAt(0)); } catch (_) { return null; }
  if (raw.length < SEC_SALT_BYTES + SEC_NONCE_BYTES + SEC_TAG_BYTES + 1) return null;
  return {
    norm,
    salt: raw.slice(0, SEC_SALT_BYTES),
    nonce: raw.slice(SEC_SALT_BYTES, SEC_SALT_BYTES + SEC_NONCE_BYTES),
    sealed: raw.slice(SEC_SALT_BYTES + SEC_NONCE_BYTES),
    profile: SEC_PROFILES[raw[SEC_SALT_BYTES - 1] & 1],
  };
}

function getCurrentChannel() {
  const m = location.pathname.match(/^\/s\/([^/?#]+)/);
  return m ? decodeURIComponent(m[1]) : '';
}
function getSecurePasswordMap() {
  const v = localParameter.securepw.value;
  return (v && typeof v === 'object' && !Array.isArray(v)) ? v : {};
}
function getCandidatePasswords() {
  const map = getSecurePasswordMap();
  const list = [...(map[getCurrentChannel()] || []), ...(map['*'] || [])];
  return list.filter((pw, i) => typeof pw === 'string' && pw !== '' && list.indexOf(pw) === i);
}
async function saveChannelPassword(password) {
  const channel = getCurrentChannel() || '*';
  const map = Object.assign({}, getSecurePasswordMap());
  const list = Array.isArray(map[channel]) ? map[channel].slice() : [];
  if (!list.includes(password)) list.push(password);
  map[channel] = list;
  localParameter.securepw.value = map;
  await GM.setValue(localParameter.securepw.param_name, map);
}

// 토큰 모양 판별: '-', '_', 키릴 문자가 있으면 securencode 토큰으로 보고,
// 순수 영문/숫자 덩어리(일반 Base64 와 구별 불가)는 현재 채널에 암호가 등록돼 있을 때만 대상으로 삼는다.
function isSecurencodeCandidate(token) {
  if (!parseSecurencodeToken(token)) return false;
  if (/[асеорху_-]/.test(token)) return true;
  return getCandidatePasswords().length > 0;
}


function createSecurencodeNode(token, genMode) {
  const wrap = document.createElement('span');
  wrap.className = 'abad-generated abad-sec';
  wrap.dataset.abadSecToken = token;
  wrap.dataset.abadMode = genMode || 'article';
  const tokenEl = document.createElement('span');
  tokenEl.className = 'abad-sec__token';
  tokenEl.textContent = token;
  wrap.appendChild(tokenEl);
  return wrap;
}
function renderSecSuccess(wrap, plain) {
  wrap.classList.remove('abad-sec--pending', 'abad-sec--locked');
  wrap.classList.add('abad-sec--ok');
  wrap.title = 'SecureEncoder 해독 결과';
  wrap.innerHTML = '';
  const output = document.createElement('span');
  output.className = 'abad-sec-plain';
  output.innerHTML = renderPlainDecodedHTML(plain, wrap.dataset.abadMode);
  const original = document.createElement('span');
  original.textContent = wrap.dataset.abadSecToken;
  original.hidden = true;
  original.style.wordBreak = 'break-all';
  const toggle = document.createElement('button');
  toggle.type = 'button'; toggle.className = 'abad-sec-btn'; toggle.textContent = '원본';
  toggle.addEventListener('click', e => {
    e.preventDefault(); e.stopPropagation();
    original.hidden = !original.hidden; output.hidden = !original.hidden;
    toggle.textContent = original.hidden ? '원본' : '해독문';
  });
  wrap.append(output, original, toggle);
  renderSummaryBox();
}

function renderSecLocked(wrap, message) {
  wrap.classList.remove('abad-sec--pending');
  wrap.classList.add('abad-sec--locked');
  wrap.title = message || 'securencode 토큰 · 등록된 암호로 풀리지 않았습니다.';
  if (wrap.querySelector('.abad-sec-btn')) return;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'abad-sec-btn';
  btn.textContent = '🔒 암호 입력';
  btn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); promptSecurencodePassword(wrap); });
  wrap.appendChild(btn);
}
function attemptSecurencode(wrap, { promptOnFail = false, extraPasswords = [] } = {}) {
  const parsed = parseSecurencodeToken(wrap.dataset.abadSecToken || '');
  if (!parsed) return;
  const cached = getSecCached(parsed.norm);
  if (cached !== undefined) { renderSecSuccess(wrap, cached); return; }
  const passwords = [...extraPasswords, ...getCandidatePasswords()].filter((pw, i, a) => a.indexOf(pw) === i);
  if (!passwords.length) { renderSecLocked(wrap, 'securencode 토큰 · 이 채널에 등록된 암호가 없습니다.'); if (promptOnFail) promptSecurencodePassword(wrap); return; }
  wrap.classList.add('abad-sec--pending');
  secTryPasswords(parsed, passwords, () => wrap.isConnected).then((plain) => {
    if (!wrap.isConnected) return;
    if (plain !== null) { renderSecSuccess(wrap, plain); return; }
    renderSecLocked(wrap);
    if (promptOnFail) promptSecurencodePassword(wrap);
  }).catch((err) => {
    const msg = err && err.message === 'SODIUM_UNAVAILABLE'
      ? '암호 라이브러리를 불러오지 못했습니다. 스크립트 재설치 후 확인하세요.'
      : '복호화 중 오류가 발생했습니다. (메모리 부족일 수 있습니다)';
    console.warn('[abad] securencode:', err);
    if (wrap.isConnected) renderSecLocked(wrap, msg);
  });
}
function retryLockedSecurencode(extraPasswords) {
  document.querySelectorAll('.abad-sec--locked').forEach(w => attemptSecurencode(w, { extraPasswords }));
}

function promptSecurencodePassword(wrap) {
  const parsed = parseSecurencodeToken(wrap.dataset.abadSecToken || '');
  if (!parsed) return;
  const channel = getCurrentChannel();
  if (!abadInternalDB.internalDB.swal2Enable) {
    const pw = window.prompt('securencode 토큰의 암호를 입력하세요.');
    if (pw) attemptSecurencode(wrap, { extraPasswords: [pw] });
    return;
  }
  const ids = { pw: createElemID(), save: createElemID() };
  swalFire({
    title: abadConstDB.SWAL2Title,
    html: `<b>🔐 securencode 암호 입력</b>
      <div class="abad-hint">이 토큰의 암호를 입력하세요.<br>복호화는 브라우저 안에서만 이루어지며 암호는 어디에도 전송되지 않습니다.</div>
      <input id="${ids.pw}" type="password" class="abad-search-input" style="margin-top:12px" placeholder="암호" autocomplete="off">
      <label class="abad-sec-check"><input type="checkbox" id="${ids.save}" checked> ${channel ? `이 채널(${escapeHtml(channel)})의 암호로 저장` : '모든 채널 공통 암호로 저장'}</label>`,
    showCancelButton: true, confirmButtonText: '복호화', cancelButtonText: '취소',
    showLoaderOnConfirm: true,
    didOpen: (modal) => { const el = modal.querySelector('#' + ids.pw); if (el) el.focus(); },
    preConfirm: async () => {
      const modal = Swal.getPopup();
      const pw = modal.querySelector('#' + ids.pw).value;
      const save = modal.querySelector('#' + ids.save).checked;
      if (!pw) { Swal.showValidationMessage('암호를 입력하세요.'); return false; }
      try {
        const plain = await secEnqueue(() => secDecryptWith(parsed, pw));
        if (plain === null) { Swal.showValidationMessage('암호가 맞지 않습니다.'); return false; }
        rememberSecPlain(parsed.norm, plain);
        return { pw, save, plain };
      } catch (e) {
        Swal.showValidationMessage('복호화 중 오류가 발생했습니다.');
        return false;
      }
    },
  }).then(async (result) => {
    if (!result.isConfirmed || !result.value) return;
    const { pw, save, plain } = result.value;
    if (wrap.isConnected) renderSecSuccess(wrap, plain);
    if (save) {
      await saveChannelPassword(pw);
      showToast(channel ? `암호를 ${escapeHtml(channel)} 채널에 저장했습니다.` : '암호를 모든 채널 공통으로 저장했습니다.', 'success', 1800);
    }
    retryLockedSecurencode([pw]);
  });
}

function menuFunctionSecurePasswords() {
  if (!abadInternalDB.internalDB.swal2Enable) return;
  const map = getSecurePasswordMap();
  const lines = [];
  Object.keys(map).forEach(ch => (map[ch] || []).forEach(pw => lines.push(`${ch}=${pw}`)));
  const taId = createElemID();
  swalFire({
    title: abadConstDB.SWAL2Title,
    width: 520,
    html: `<b>🔐 securencode 암호 관리</b>
      <div class="abad-hint">한 줄에 하나씩 <b>채널=암호</b> 형식으로 적습니다. 같은 채널에 여러 줄을 적으면 차례로 시도합니다.<br><b>*=암호</b> 는 모든 채널에서 시도합니다. (현재 채널: ${escapeHtml(getCurrentChannel() || '없음')})</div>
      <textarea id="${taId}" class="abad-sec-textarea" style="margin-top:12px" spellcheck="false">${escapeHtml(lines.join('\n'))}</textarea>`,
    showCancelButton: true, confirmButtonText: '저장', cancelButtonText: '취소',
    preConfirm: () => {
      const text = Swal.getPopup().querySelector('#' + taId).value;
      const out = {};
      for (const rawLine of text.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line) continue;
        const eq = line.indexOf('=');
        if (eq <= 0 || eq === line.length - 1) { Swal.showValidationMessage(`형식이 올바르지 않습니다: ${escapeHtml(line)}`); return false; }
        const ch = line.slice(0, eq).trim(), pw = line.slice(eq + 1);
        (out[ch] = out[ch] || []).includes(pw) || out[ch].push(pw);
      }
      return out;
    },
  }).then(async (result) => {
    if (!result.isConfirmed) return;
    clearSecCache();
    localParameter.securepw.value = result.value;
    await GM.setValue(localParameter.securepw.param_name, result.value);
    showToast('securencode 암호를 저장했습니다.', 'success', 1800);
    retryLockedSecurencode([]);
  });
}

function populateWithLinks(container, text) {
  const urlPattern = /(https?:\/\/[^\s]+|(?:[a-zA-Z0-9\-]+\.)+[a-zA-Z]{2,}(?:\/[^\s]*)?)/g;
  const parts = text.split(urlPattern);
  parts.forEach(part => {
    if (!part) return;
    if (/^(https?:\/\/|(?:[a-zA-Z0-9\-]+\.)+[a-zA-Z]{2,})/.test(part)) {
      const a = document.createElement('a');
      a.href = decorateKioskUrl(/^https?:\/\//.test(part) ? part : 'https://' + part);
      a.target = '_blank';
      a.rel = 'noreferrer';
      a.style.textDecoration = 'underline';
      a.textContent = part;
      a.title = '클릭 시 새 창으로 이동';
      container.appendChild(a);
    } else {
      container.appendChild(document.createTextNode(part));
    }
  });
}

function isFocusedInFormField() {
  const active = document.activeElement;
  return !!(active && (active.tagName === 'TEXTAREA' || active.tagName === 'INPUT' || active.isContentEditable));
}

function isDecodableSelection(selText) {
  if (!selText || selText.length < 4) return false;
  const isBraille = /^[⠀-⣿\s]+$/.test(selText);
  return isBraille || !selText.match(abadConstDB.regInvalid);
}

const RESTORE_OBSERVER_TTL_MS = 60000;

function attachRestore(decodedNode, restoreFn, observerParent, selText) {
  decodedNode.title = '드래그해서 디코딩한 결과입니다. 링크가 아닌 부분을 누르면 원본으로 돌아갑니다.';
  decodedNode.addEventListener('mousedown', (e) => { if (e.detail > 1) e.preventDefault(); });
  decodedNode.addEventListener('click', function (e) {
    const t = toElement(e.target);
    if (t && t.closest && t.closest('a')) return;
    const sel = getActiveSelection();
    if (sel && !sel.isCollapsed && sel.toString().trim().length > 0) return;
    e.preventDefault();
    e.stopPropagation();
    restoreFn();
  });
  if (!observerParent) return;
  let ttlTimer = null;
  const mo = new MutationObserver(() => {
    let restored = false;
    observerParent.childNodes.forEach(n => {
      if (n !== decodedNode && n.nodeType === Node.TEXT_NODE && n.nodeValue.includes(selText)) restored = true;
    });
    if (restored) { decodedNode.remove(); mo.disconnect(); if (ttlTimer) clearTimeout(ttlTimer); }
  });
  mo.observe(observerParent, { childList: true, characterData: true, subtree: true });
  ttlTimer = setTimeout(() => { try { mo.disconnect(); } catch (_) {} }, RESTORE_OBSERVER_TTL_MS);
}

// 선택한 문자열 자체를 디코딩한다. 실패하면 null.
function decodeSelectionText(selText) {
  if (!isDecodableSelection(selText)) return null;
  const isBraille = /^[⠀-⣿\s]+$/.test(selText);
  let converted;
  if (isBraille) {
    converted = decodeBraille(selText).trim();
  } else {
    const decoded = Base64.decode(selText);
    if (decoded === null) return null;
    converted = decodeURI(encodeURI(decoded).replaceAll('%00', '')).trim();
  }
  if (!converted || converted === selText) return null;
  converted = fullyDecodeEmbedded(converted).trim();
  if (!converted || converted === selText) return null;
  return converted;
}

// 드래그 보정: 선택이 Base64/점자 덩어리의 일부만 잡았거나 앞뒤의 다른 글자(": ", " 복호화" 등)까지 잡은 경우,
// 선택 범위와 겹치는 덩어리 전체(가장 긴 것)를 찾는다. 선택이 하나의 텍스트 노드 안에 있을 때만 동작한다.
const DRAG_TOKEN_SOURCE = '[⠀-⣿]{4,}|[A-Za-z0-9+/_-]{4,}={0,2}';
function findTokenAroundSelection(selection) {
  if (!selection || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  const node = range.startContainer;
  if (node !== range.endContainer || node.nodeType !== Node.TEXT_NODE) return null;
  const text = node.nodeValue;
  const s = range.startOffset, e = range.endOffset;
  if (s >= e) return null;
  const tokenRegex = new RegExp(DRAG_TOKEN_SOURCE, 'g');
  let best = null, m;
  while ((m = tokenRegex.exec(text))) {
    const ts = m.index, te = ts + m[0].length;
    if (te <= s || ts >= e) continue;
    if (!best || m[0].length > best.text.length) best = { node, start: ts, end: te, text: m[0] };
  }
  return best;
}

function findSecurencodeTokenAroundSelection(selection) {
  if (!selection || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  const node = range.startContainer;
  if (node !== range.endContainer || node.nodeType !== Node.TEXT_NODE) return null;
  const s = range.startOffset, e = range.endOffset;
  const re = new RegExp(SECURENCODE_TOKEN_SOURCE, 'g');
  let m;
  while ((m = re.exec(node.nodeValue))) {
    const ts = m.index, te = ts + m[0].length;
    if (te <= s || ts >= e) continue;
    if (parseSecurencodeToken(m[0])) return { node, start: ts, end: te, text: m[0] };
  }
  return null;
}

function tryDragDecode(event) {
  if (isFocusedInFormField()) return;
  const selection = getActiveSelection();
  if (!selection || selection.toString().trim().length === 0) return;
  if (!isWithinDecodableArea(selection.anchorNode)) return;
  const selText = selection.toString().trim();
  const isBraille = /^[⠀-⣿\s]+$/.test(selText);
  try {
    // 점자가 아니면 선택 위치의 덩어리 전체를 먼저 시도하고(덜/더 잡은 선택 보정), 안 되면 선택 그대로 시도한다.
    let token = isBraille ? null : findTokenAroundSelection(selection);
    let converted = null;
    if (token && token.text !== selText) converted = decodeSelectionText(token.text);
    if (converted === null) { token = null; converted = decodeSelectionText(selText); }
    if (converted === null) {
      // Base64/점자로 풀리지 않으면 securencode 토큰인지 확인한다. (드래그는 사용자가 직접 고른 것이므로 채널 암호 여부와 무관하게 시도)
      const sec = isBraille ? null : findSecurencodeTokenAroundSelection(selection);
      if (!sec) return;
      if (event) { event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation(); }
      const mode = toElement(sec.node).closest('#post-comment') ? 'comment' : 'article';
      const wrap = createSecurencodeNode(sec.text, mode);
      const before = sec.node.nodeValue.substring(0, sec.start);
      const after = sec.node.nodeValue.substring(sec.end);
      const frag = document.createDocumentFragment();
      if (before) frag.appendChild(document.createTextNode(before));
      frag.appendChild(wrap);
      if (after) frag.appendChild(document.createTextNode(after));
      sec.node.replaceWith(frag);
      neutralizeFlexParent(wrap);
      selection.removeAllRanges();
      attemptSecurencode(wrap, { promptOnFail: true });
      return;
    }
    if (event) { event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation(); }
    const makeDecodedNode = () => {
      const node = document.createElement('span');
      node.className = 'abad-generated abad-drag-result';
      populateWithLinks(node, converted);
      return node;
    };
    if (token) {
      const tokenNode = token.node;
      const originalText = tokenNode.nodeValue;
      const container = document.createElement('span');
      container.className = 'abad-drag-container';
      const beforeText = originalText.substring(0, token.start);
      const afterText = originalText.substring(token.end);
      if (beforeText) container.appendChild(document.createTextNode(beforeText));
      const wrapper = makeDecodedNode();
      container.appendChild(wrapper);
      if (afterText) container.appendChild(document.createTextNode(afterText));
      const parent = tokenNode.parentNode;
      tokenNode.replaceWith(container);
      neutralizeFlexParent(container);
      attachRestore(wrapper, () => container.replaceWith(tokenNode), parent, token.text);
      selection.removeAllRanges();
      return;
    }
    const anchorNode = selection.anchorNode;
    if (anchorNode && anchorNode.nodeType === Node.TEXT_NODE) {
      const originalText = anchorNode.textContent;
      const startIdx = originalText.indexOf(selText);
      if (startIdx !== -1) {
        const beforeText = originalText.substring(0, startIdx);
        const afterText = originalText.substring(startIdx + selText.length);
        const container = document.createElement('span');
        container.className = 'abad-drag-container';
        if (beforeText) container.appendChild(document.createTextNode(beforeText));
        const wrapper = makeDecodedNode();
        container.appendChild(wrapper);
        if (afterText) container.appendChild(document.createTextNode(afterText));
        const parent = anchorNode.parentNode;
        anchorNode.replaceWith(container);
        neutralizeFlexParent(container);
        attachRestore(wrapper, () => container.replaceWith(anchorNode), parent, selText);
        selection.removeAllRanges();
        return;
      }
    }
    const range = selection.getRangeAt(0);
    const parent = range.commonAncestorContainer;
    const extractedNodes = range.extractContents();
    const resultNode = makeDecodedNode();
    range.insertNode(resultNode);
    neutralizeFlexParent(resultNode);
    const actualParent = parent.nodeType === Node.TEXT_NODE ? parent.parentNode : parent;
    attachRestore(resultNode, () => resultNode.replaceWith(extractedNodes), actualParent, selText);
    selection.removeAllRanges();
  } catch (e) {}
}

// 드래그 디코딩 끄기: 리스너는 남겨 두고 동작만 멈춘다(다시 켤 때 새로고침 불필요).
function deactivateDragDecoding() {
  abadInternalDB.internalDB.dragDecodingEnable = false;
  const btn = document.getElementById('abad-mobile-decode-btn');
  if (btn) btn.style.display = 'none';
}

let _dragListenersInstalled = false;
function activateDragDecoding() {
  if (abadInternalDB.internalDB.dragDecodingEnable) return;
  abadInternalDB.internalDB.dragDecodingEnable = true;
  if (_dragListenersInstalled) return;
  _dragListenersInstalled = true;
  document.addEventListener('mouseup', function (e) {
    if (e.target && e.target.closest && e.target.closest('#abad-mobile-decode-btn, .abad-generated, .abad-drag-container, .abad-drag-result')) return;
    setTimeout(() => { if (abadInternalDB.internalDB.dragDecodingEnable) tryDragDecode(e); }, 10);
  }, true);
  const isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
  if (isTouchDevice) {
    const mobileBtn = document.createElement('div');
    mobileBtn.id = 'abad-mobile-decode-btn';
    mobileBtn.className = 'abad-mobile-btn';
    mobileBtn.innerHTML = '🔓';
    mobileBtn.title = '선택한 텍스트 디코딩';
    document.body.appendChild(mobileBtn);
    document.addEventListener('selectionchange', () => {
      if (!abadInternalDB.internalDB.dragDecodingEnable || isFocusedInFormField()) { mobileBtn.style.display = 'none'; return; }
      const selection = getActiveSelection();
      if (selection.toString().trim().length > 0 && isWithinDecodableArea(selection.anchorNode)) {
        if (isDecodableSelection(selection.toString().trim()) || findTokenAroundSelection(selection)) { mobileBtn.style.display = 'flex'; return; }
      }
      mobileBtn.style.display = 'none';
    });
    const onMobileBtnClick = (e) => { e.preventDefault(); e.stopPropagation(); tryDragDecode(e); mobileBtn.style.display = 'none'; };
    mobileBtn.addEventListener('mousedown', onMobileBtnClick);
    mobileBtn.addEventListener('touchstart', onMobileBtnClick, { passive: false });
  }
}


function buildDepthSliderHTML(ids, value) {
  return `
    <div class="abad-depth-block">
      🎛 base64 디코딩 깊이: <span class="abad-depth-value" id="${ids.depthLabel}">${value}</span>회
      <input type="range" id="${ids.depth}" class="abad-range" min="1" max="${MAX_DECODE_DEPTH}" step="1" value="${value}">
    </div>
    <div class="abad-hint" id="${ids.warn}" style="display:none;">값을 너무 크게 지정하면 브라우저 성능에 영향을 줄 수 있습니다.</div>`;
}

function wireDepthSlider(modal, ids) {
  const rangeEl = modal.querySelector('#' + ids.depth);
  const labelEl = modal.querySelector('#' + ids.depthLabel);
  const warnEl = modal.querySelector('#' + ids.warn);
  const updateWarn = (v) => { warnEl.style.display = v > 7 ? 'block' : 'none'; };
  updateWarn(rangeEl.value);
  rangeEl.addEventListener('input', (e) => {
    labelEl.textContent = e.target.value;
    updateWarn(e.target.value);
  });
}


// '설정' 창: securencode 암호 관리를 제외한 모든 설정을 한곳에서 바꾼다.
function openSettingsPanel() {
  if (!abadInternalDB.internalDB.swal2Enable) return;
  const ids = {
    autodecode: createElemID(), draggable: createElemID(), securencode: createElemID(), kiosk: createElemID(), sessioncache: createElemID(),
    depth: createElemID(), depthLabel: createElemID(), warn: createElemID(),
  };
  const before = {
    autodecode: localParameter.autodecode.value,
    draggable: localParameter.draggable.value,
    securencode: localParameter.securencode.value,
    basedepth: localParameter.basedepth.value,
    kiosk: localParameter.kiosk.value, sessioncache: localParameter.sessioncache.value,
  };
  const toggleRow = (id, icon, label, desc, checked) => `
    <div class="abad-settings-row">
      <span class="abad-settings-label"><span class="abad-settings-label__icon">${icon}</span><span>${label}<span class="abad-settings-desc">${desc}</span></span>
      <label class="abad-switch">
        <input type="checkbox" id="${id}" ${checked ? 'checked' : ''} aria-label="${label}">
        <span class="abad-switch__track"></span>
        <span class="abad-switch__thumb"></span>
      </label>
    </div>`;
  swalFire({
    title: abadConstDB.SWAL2Title,
    width: 480,
    html: `
      <div class="abad-settings">
        ${toggleRow(ids.autodecode, '🗝', '자동 디코딩', '페이지를 열면 Base64·점자를 자동으로 풉니다.', before.autodecode)}
        ${toggleRow(ids.securencode, '🔐', 'securencode 자동 복호화', '채널에 등록된 암호로 토큰을 자동으로 풉니다.', before.securencode)}
        ${toggleRow(ids.draggable, '🖱', '드래그 디코딩', '선택한 부분을 바로 풉니다. (Alt+K: 이번 접속에서만 켜기)', before.draggable)}
        ${toggleRow(ids.kiosk, '🔑', '키오스크 자동 비밀번호', '해독한 kio.ac 링크에 채널 암호를 전달합니다.', before.kiosk)}
        ${toggleRow(ids.sessioncache, '⚡', '탭 해독 캐시', '최대 80개 · 1시간. 새로고침 후에도 빠르게 복원합니다.', before.sessioncache)}
        ${buildDepthSliderHTML(ids, before.basedepth)}
        <div class="abad-hint"><span class="abad-kbd-hint">단축키 · <b>Alt+L</b> 디코딩된 링크 목록 · <b>Alt+K</b> 드래그 디코딩 임시 켜기<br></span>securencode 암호는 메뉴의 <b>🔐 securencode 암호 관리</b>에서 채널별로 설정합니다.</div>
      </div>
    `,
    showCancelButton: true,
    showDenyButton: true,
    confirmButtonText: '저장',
    cancelButtonText: '취소',
    denyButtonText: '기본값 초기화',
    reverseButtons: false,
    didOpen: (modal) => wireDepthSlider(modal, ids),
    preConfirm: () => {
      const modal = Swal.getPopup();
      return {
        autodecode: modal.querySelector('#' + ids.autodecode).checked,
        draggable: modal.querySelector('#' + ids.draggable).checked,
        securencode: modal.querySelector('#' + ids.securencode).checked,
        basedepth: parseInt(modal.querySelector('#' + ids.depth).value, 10),
        kiosk: modal.querySelector('#' + ids.kiosk).checked,
        sessioncache: modal.querySelector('#' + ids.sessioncache).checked,
      };
    },
  }).then(async (result) => {
    if (result.isDenied) { confirmResetDefaults(); return; }
    if (!result.isConfirmed) return;
    const after = result.value;
    for (const key of Object.keys(after)) {
      localParameter[key].value = after[key];
      await GM.setValue(localParameter[key].param_name, after[key]);
    }

    if (!after.sessioncache) {
      clearTimeout(secCacheTimer);
      try { sessionStorage.removeItem(SEC_CACHE_KEY); sessionStorage.removeItem('kone-se-fast-cache-v3'); } catch (_) {}
    } else persistSecCache();
    document.querySelectorAll('a.abad-link').forEach(a => { a.href = decorateKioskUrl(a.href); });
    // 드래그 디코딩은 새로고침 없이 바로 켜고 끈다.
    if (after.draggable !== before.draggable) {
      if (after.draggable) activateDragDecoding(); else deactivateDragDecoding();
    }
    // 이미 화면에 풀어 놓은 내용을 원래대로 되돌려야 하는 변경만 새로고침이 필요하다.
    const needsReload =
      (before.autodecode && !after.autodecode) ||
      (before.securencode && !after.securencode && after.autodecode) ||
      (after.basedepth < before.basedepth && after.autodecode);
    if (needsReload) {
      menuFuncSubPageReload('설정을 저장했습니다.');
      return;
    }
    executeDecoder();
    showToast('설정을 저장했습니다.', 'success', 1800);
  });
}

function registerMenuCommands() {
  for (const key of Object.keys(menuStructure)) {
    const item = menuStructure[key];
    try { GM.registerMenuCommand(item.name, item.func, { title: item.desc }); } catch (_) {}
  }
}

function menuFuncSubPageReload(showmsg) {
  if (!abadInternalDB.internalDB.swal2Enable) return;
  swalFire({
    title: abadConstDB.SWAL2Title,
    html: `<b>${showmsg}</b><div class="abad-hint">이미 풀어 놓은 내용을 원래대로 되돌리려면 새로고침이 필요합니다. 지금 새로고침할까요?</div>`,
    icon: 'info', showCancelButton: true,
    confirmButtonText: '새로고침', cancelButtonText: '나중에',
  }).then((result) => { if (result.isConfirmed) window.location.reload(); });
}

function confirmResetDefaults() {
  if (!abadInternalDB.internalDB.swal2Enable) return;
  swalFire({
    title: abadConstDB.SWAL2Title,
    html: '<b>모든 설정을 기본값으로 되돌릴까요?</b><div class="abad-hint">채널별 암호 목록도 기본값으로 돌아가고 해독 캐시를 비웁니다. 초기화 후 페이지를 새로고침합니다.</div>',
    icon: 'warning', showCancelButton: true, focusCancel: true,
    confirmButtonText: '초기화', cancelButtonText: '취소',
  }).then(async (result) => {
    if (!result.isConfirmed) return;
    // 'expandmenu' 는 예전 버전의 설정값(메뉴 축소/확장) — 남아 있으면 함께 지운다.
    clearSecCache();
    const keys = [...Object.keys(localParameter).map(k => localParameter[k].param_name), 'expandmenu'];
    await Promise.all(keys.map(k => Promise.resolve(GM.deleteValue(k)).catch(() => {})));
    window.location.reload();
  });
}

// content: HTML 문자열이면 span.abad-generated 로 감싸고, Element 면 그대로 끼워 넣는다.
function wrapMatch(node, start, length, content, genMode) {
  const afterStart = node.splitText(start);
  const afterEnd = afterStart.splitText(length);
  let wrapper;
  if (typeof content === 'string') {
    wrapper = document.createElement('span');
    wrapper.className = 'abad-generated';
    wrapper.innerHTML = content;
  } else {
    wrapper = content;
  }
  afterStart.replaceWith(wrapper);
  neutralizeFlexParent(wrapper);
  // 앞부분(같은 텍스트 노드에서 이번 매치보다 앞에 있던 글자)과 뒷부분을 모두 다시 검사한다.
  if (start > 0) processTextNode(node, genMode);
  processTextNode(afterEnd, genMode);
  return true;
}

function processTextNode(node, genMode) {
  genMode = genMode || 'article';
  const text = node.textContent;
  if (!node.isConnected || !text || !text.trim() || text.length > 1500000) return false;

  if (localParameter.securencode.value) {
    const secRegex = new RegExp(SECURENCODE_TOKEN_SOURCE, 'g');
    let sMatch;
    while ((sMatch = secRegex.exec(text))) {
      const token = sMatch[0];
      if (!isSecurencodeCandidate(token) || decodesToRealText(token)) continue;
      const wrap = createSecurencodeNode(token, genMode);
      wrapMatch(node, sMatch.index, token.length, wrap, genMode);
      attemptSecurencode(wrap);
      return true;
    }
  }


  const brailleRegex = /[⠀-⣿]{4,}/g;
  const bMatch = brailleRegex.exec(text);
  if (bMatch) {
    const sourceStr = bMatch[0];
    const html = replacerGen(genMode)(sourceStr);
    if (html !== null) return wrapMatch(node, bMatch.index, sourceStr.length, html, genMode);
  }

  for (let i = 0; i < localParameter.basedepth.value; i++) {
    const regex = new RegExp(regexEncodedPrefixDef[i].source, regexEncodedPrefixDef[i].flags);
    const match = regex.exec(text);
    if (!match) continue;
    let start = match.index;
    while (start > 0 && /[A-Za-z0-9+/=]/.test(text[start - 1])) start--;
    const sourceStr = text.slice(start, match.index + match[0].length);
    const html = replacerGen(genMode)(sourceStr);
    if (html === null) continue;
    return wrapMatch(node, start, sourceStr.length, html, genMode);
  }

  const genericRegex = new RegExp(BASE64_DETECT_SOURCE, 'g');
  let gMatch;
  while ((gMatch = genericRegex.exec(text))) {
    const sourceStr = gMatch[0];
    if (!decodesToRealText(sourceStr)) continue;
    const html = replacerGen(genMode)(sourceStr);
    if (html === null) continue;
    return wrapMatch(node, gMatch.index, sourceStr.length, html, genMode);
  }

  if (isPasswordContext(node)) {
    const pwRegex = new RegExp(PASSWORD_TOKEN_SOURCE, 'g');
    let pMatch;
    while ((pMatch = pwRegex.exec(text))) {
      const sourceStr = pMatch[0];
      if (!decodesToPasswordLike(sourceStr)) continue;
      const html = replacerGen(genMode)(sourceStr);
      if (html === null) continue;
      return wrapMatch(node, pMatch.index, sourceStr.length, html, genMode);
    }
  }


  return false;
}

// 클릭뿐 아니라 키보드(Tab → Enter/Space)로도 열 수 있게 한다.
function makeActivatable(el, handler, label) {
  el.setAttribute('role', 'button');
  el.tabIndex = 0;
  if (label) el.setAttribute('aria-label', label);
  el.addEventListener('click', handler);
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handler(); }
  });
}

function findSummaryBox() {
  return document.getElementById('abad_summary_box');
}

let _floatingBadge = null;
function ensureFloatingBadge() {
  if (!_floatingBadge?.isConnected) {
    _floatingBadge = document.createElement('div');
    _floatingBadge.id = 'abad_floating_badge';
    _floatingBadge.className = 'abad-fab';
    const links = document.createElement('button');
    links.type = 'button'; links.dataset.unifiedLinks = '';
    links.addEventListener('click', () => hindex ? showDecodeSummary() : executeDecoder());
    const settings = document.createElement('button');
    settings.type = 'button'; settings.textContent = '⚙';
    settings.title = '디코더 설정'; settings.setAttribute('aria-label', '디코더 설정');
    settings.addEventListener('click', openSettingsPanel);
    const passwords = document.createElement('button');
    passwords.type = 'button'; passwords.textContent = '🔑';
    passwords.title = '채널별 암호 관리'; passwords.setAttribute('aria-label', '채널별 암호 관리');
    passwords.addEventListener('click', menuFunctionSecurePasswords);
    _floatingBadge.append(links, settings, passwords);
    document.body.appendChild(_floatingBadge);
  }
  const label = hindex ? '🔓 링크 ' + hindex + '개' : '🔓 디코더 · 재검사';
  const button = _floatingBadge.querySelector('[data-unified-links]');
  if (button.textContent !== label) button.textContent = label;
  _floatingBadge.style.display = 'flex';
  positionUnifiedBadge();
}
function hideFloatingBadge() { ensureFloatingBadge(); }


// 링크 목록을 실제 DOM 기준으로 다시 만든다.
// (SvelteKit SPA 이동/재렌더링으로 본문이 교체되면 예전 링크가 사라지므로, 메모리 상태 대신 DOM을 기준으로 삼는다.)
function syncDecodedState() {
  const pc = getPostContainer();
  const roots = [getPostRoot(), getCommentRoot()].filter(Boolean);
  const anchors = roots.flatMap(root => Array.from(root.querySelectorAll('a.abad-link[id^="abad_"]')));
  const decodedLink = {};
  const decodedList = [];
  abadInternalDB.hostnameSetRaw.clear();
  anchors.forEach((a, i) => {
    const href = a.getAttribute('href');
    const loc = getLocation(href);
    if (!loc) return;
    decodedLink[a.id] = { id: a.id, no: i + 1, type: 'article', hostname: loc.hostname, href };
    decodedList.push(a.id);
    abadInternalDB.hostnameSetRaw.add(loc.hostname);
  });
  abadInternalDB.decodedLink = decodedLink;
  abadInternalDB.decodedList = decodedList;
  abadInternalDB.hostnameSet = Array.from(abadInternalDB.hostnameSetRaw).sort();
  hindex = decodedList.length;
}

function placeSummaryBox(box) {
  const pc = getPostContainer();
  if (!pc) return;
  // 본문(div.article-prose)을 감싸는 #post-article 의 직계 자식 바로 앞에 넣는다.
  let anchor = getPostBody();
  while (anchor && anchor.parentElement !== pc) anchor = anchor.parentElement;
  if (anchor) {
    if (box.parentElement !== pc || box.nextElementSibling !== anchor) pc.insertBefore(box, anchor);
    return;
  }
  if (pc.shadowRoot) {
    if (box.parentNode !== pc.shadowRoot) pc.shadowRoot.insertBefore(box, pc.shadowRoot.firstChild);
    return;
  }
  if (box.parentNode !== pc) pc.insertBefore(box, pc.firstChild);
}

function renderSummaryBox() {
  syncDecodedState();
  let box = findSummaryBox();
  if (hindex === 0) {
    if (box) box.remove();
    hideFloatingBadge();
    return;
  }
  if (!box) {
    box = document.createElement('div');
    box.id = 'abad_summary_box';
    const card = document.createElement('div');
    card.className = 'abad-card';
    card.title = '눌러서 디코딩된 링크를 한 번에 볼 수 있습니다.';
    makeActivatable(card, showDecodeSummary, '디코딩된 링크 목록 열기');
    box.appendChild(card);
  }
  const card = box.firstElementChild;
  const html =
    '<div class="abad-card__icon">🔓</div>' +
    '<div class="abad-card__body">' +
    `<div class="abad-card__title">총 <b>${hindex}개</b>의 링크가 자동 디코딩되었습니다</div>` +
    `<div class="abad-card__meta">감지된 사이트 ${abadInternalDB.hostnameSet.length}개 · 눌러서 전체 목록 보기<span class="abad-kbd-hint"> · 단축키 Alt+L</span></div>` +
    '</div>' +
    '<div class="abad-card__chevron">›</div>';
  if (card.innerHTML !== html) card.innerHTML = html;
  placeSummaryBox(box);
  ensureFloatingBadge(card);
}

// 디코딩 대상이 될 수 있는 글자 덩어리가 하나라도 있는 텍스트 노드만 정밀 검사한다. (대부분의 일반 문장은 여기서 걸러짐)
const CANDIDATE_PREFILTER = /[⠀-⣿]{4}|[A-Za-z0-9+/_\-асеорху]{8}/;
const SKIP_SUBTREE_SELECTOR = '.abad-generated, .abad-drag-container, .kone-se-encode-wrap, #abad_summary_box, textarea, input, select, button, svg, script, style, [contenteditable="true"]';

function collectCandidateTextNodes(root) {
  const out = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode(n) {
      if (n.nodeType === Node.ELEMENT_NODE) return n.matches(SKIP_SUBTREE_SELECTOR) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_SKIP;
      return CANDIDATE_PREFILTER.test(n.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
    },
  });
  let n;
  while ((n = walker.nextNode())) out.push(n);
  return out;
}

function executeDecoder() {
  scheduleEncodeButtons();
  ensureFloatingBadge();
  if (!localParameter.autodecode.value) return;
  const rootDefs = [
    { root: getPostRoot(), mode: 'article' },
    { root: getCommentRoot(), mode: 'comment' },
  ].filter(rd => rd.root);
  // 노드를 먼저 모두 모은 뒤 처리한다(처리 중 DOM 이 바뀌어도 순회가 꼬이지 않도록).
  rootDefs.forEach(({ root, mode }) => {
    collectCandidateTextNodes(root).forEach(node => { if (node.isConnected) processTextNode(node, mode); });
  });
  renderSummaryBox();
}

function debounce(func, delay) {
  let timer;
  return function (...args) { clearTimeout(timer); timer = setTimeout(() => func(...args), delay); };
}

// SvelteKit 하이드레이션이 끝나기 전에 DOM 을 바꾸면 하이드레이션 불일치로 화면이 다시 그려지면서
// 디코딩 결과가 사라질 수 있으므로, 앱이 마운트될 때(#svelte-announcer 생성)까지 기다린다.
function waitForAppReady(timeout = 4000) {
  return new Promise((resolve) => {
    if (document.getElementById('svelte-announcer')) return resolve();
    const mo = new MutationObserver(() => {
      if (document.getElementById('svelte-announcer')) { mo.disconnect(); clearTimeout(t); resolve(); }
    });
    mo.observe(document.body, { childList: true, subtree: true });
    const t = setTimeout(() => { mo.disconnect(); resolve(); }, timeout);
  });
}

function isOwnMutation(record) {
  const t = toElement(record.target);
  if (t && t.closest && t.closest('.swal2-container, #abad_floating_badge, #abad_summary_box, #abad-mobile-decode-btn, .abad-generated, .kone-se-encode-wrap')) return true;
  const nodes = [...record.addedNodes, ...record.removedNodes];
  if (!nodes.length) return false;
  return nodes.every(n => {
    if (n.nodeType !== Node.ELEMENT_NODE) return false;
    if (n.id && n.id.startsWith('abad')) return true;
    if (n.classList && (n.classList.contains('kone-se-encode-wrap') || n.classList.contains('swal2-container') || Array.from(n.classList).some(c => c.startsWith('abad-')))) return true;
    return false;
  });
}

// 본문/댓글 안쪽의 변화이거나, 본문/댓글 영역 자체가 생기거나 사라진 경우만 다시 검사한다.
// (헤더·사이드바·상대 시간 표시 등 페이지의 다른 변화로는 재검사하지 않음)
const CONTENT_SELECTOR = '#post-article, #post-comment';
function isRelevantMutation(record) {
  if (isOwnMutation(record)) return false;
  const t = toElement(record.target);
  if (t && t.closest && t.closest(CONTENT_SELECTOR)) return true;
  for (const n of record.addedNodes) {
    if (n.nodeType === Node.ELEMENT_NODE && (n.matches(CONTENT_SELECTOR) || n.querySelector(CONTENT_SELECTOR))) return true;
  }
  for (const n of record.removedNodes) {
    if (n.nodeType === Node.ELEMENT_NODE && (n.matches(CONTENT_SELECTOR) || n.querySelector(CONTENT_SELECTOR))) return true;
  }
  return false;
}

(async () => {
  injectStyles();
  syncDarkClass();
  try { window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', syncDarkClass); } catch (_) {}
  new MutationObserver(syncDarkClass).observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style'] });
  if (typeof Swal !== 'undefined' && typeof Swal.fire === 'function') {
    const style = document.createElement('style');
    style.textContent = '.swal2-container { z-index:2147483647 !important; }';
    document.head.appendChild(style);
    abadInternalDB.internalDB.swal2Enable = true;
  }
  for (const key of Object.keys(localParameter)) {
    try { localParameter[key].value = await GM.getValue(localParameter[key].param_name, localParameter[key].def_value); }
    catch (_) { localParameter[key].value = localParameter[key].def_value; }
  }
  localParameter.basedepth.value = Math.min(MAX_DECODE_DEPTH, Math.max(1, Number(localParameter.basedepth.value) || 3));
  loadSecCache();
  registerMenuCommands();
  startUnifiedLayout();
  ensureFloatingBadge();
  if (localParameter.draggable.value) activateDragDecoding();
  document.addEventListener('keydown', e => {
    if (isFocusedInFormField()) return;
    if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'd') { e.preventDefault(); executeDecoder(); return; }
    if (!e.altKey) return;
    if (e.code === 'KeyL') { e.preventDefault(); showDecodeSummary(); }
    if (e.code === 'KeyK') { e.preventDefault(); activateDragDecoding(); showToast('드래그 디코딩을 켰습니다.', 'success', 1800); }
  });
  const debouncedExecute = debounce(executeDecoder, 80);
  let path = location.pathname;
  function checkRoute() {
    if (location.pathname === path) return;
    path = location.pathname;
    // Let the site replace its previous DOM; stale nodes are never copied.
    debouncedExecute();
  }
  new MutationObserver(records => {
    checkRoute();
    if (records.some(isRelevantMutation)) debouncedExecute();
  }).observe(document.body, { childList: true, subtree: true, characterData: true });
  window.addEventListener('popstate', debouncedExecute);
  window.addEventListener('pageshow', debouncedExecute);
  window.addEventListener('pagehide', () => {
    clearTimeout(secCacheTimer);
    if (localParameter.sessioncache.value) {
      pruneSecCache();
      try { sessionStorage.setItem(SEC_CACHE_KEY, JSON.stringify([..._secPlainCache])); } catch (_) {}
    }
  });
  setInterval(checkRoute, 1000);
  // On the current light DOM, recover cached plaintext immediately. Defer new
  // crypto work through the queue so Base64/Braille display does not wait.
  await waitForAppReady();
  executeDecoder();
})().catch(error => console.error('[Kone Unified v4]', error));


})();
