// ==UserScript==
// @name         Kone.gg 통합 자동 디코더 + Kiosk Pwd
// @namespace    https://kone.gg/
// @version      3.0.1
// @description  SecureEncoder + Base64 자동 해독, kio.ac 링크 비밀번호 전달/자동 입력
// @author       merged
// @match        https://kone.gg/*
// @match        https://www.kone.gg/*
// @match        https://*.kone.gg/*
// @match        https://kio.ac/*
// @match        https://*.kio.ac/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  // ============================================================
  // kio.ac: URL의 #pwd= / ?pwd= 값을 비밀번호 칸에 자동 입력
  // ============================================================
  function runKioskAutoFill() {
    const match = window.location.href.match(/[#?&]pwd=([^&]+)/);
    if (!match) return;

    const password = decodeURIComponent(match[1]);
    console.log('[Kiosk-AutoPwd] 비밀번호 발견');

    const findAndFill = setInterval(() => {
      const inputs = Array.from(document.querySelectorAll('input'));
      const pwdInput = inputs.find((i) =>
        i.type === 'password' ||
        (i.placeholder && i.placeholder.includes('비밀번호'))
      );

      if (!pwdInput) return;
      clearInterval(findAndFill);

      try {
        const nativeSetter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          'value'
        )?.set;

        if (nativeSetter) nativeSetter.call(pwdInput, password);
        else pwdInput.value = password;

        pwdInput.dispatchEvent(new Event('input', { bubbles: true }));
        pwdInput.dispatchEvent(new Event('change', { bubbles: true }));
      } catch (e) {
        console.error('[Kiosk-AutoPwd] 입력 실패', e);
        return;
      }

      setTimeout(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const submitBtn =
          buttons.find((b) => {
            const t = (b.textContent || '').trim();
            return t.includes('확인') || t.includes('입력') || t.includes('다운로드');
          }) || pwdInput.nextElementSibling;

        if (submitBtn && typeof submitBtn.click === 'function') {
          submitBtn.click();
        } else {
          pwdInput.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true
          }));
          pwdInput.dispatchEvent(new KeyboardEvent('keyup', {
            key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true
          }));

          // 일반 form일 경우 마지막 보조 수단
          if (pwdInput.form && typeof pwdInput.form.requestSubmit === 'function') {
            try { pwdInput.form.requestSubmit(); } catch (_) {}
          }
        }
      }, 100);
    }, 300);

    setTimeout(() => clearInterval(findAndFill), 5000);
  }

  const host = location.hostname.toLowerCase();
  if (host === 'kio.ac' || host.endsWith('.kio.ac')) {
    runKioskAutoFill();
    return;
  }
  if (!(host === 'kone.gg' || host.endsWith('.kone.gg'))) return;

  const ENCODE_PASSWORD = 'koreanvoice';

  // 예전 스크립트에서 쓰던 페이지별 비밀번호는 유지하되,
  // 복호화 엔진은 StegCloak가 아니라 SecureEncoder 방식만 사용한다.
  const SECTION_PASSWORDS = {
    rplay: ['koreanvoice', 'koreavoice'],
    somisoft: ['somisoft'],
    femdom: ['femdom'],
  };

  const MIN_TOKEN_LEN = 40;
  const DECRYPT_TIMEOUT_MS = 25000;
  const SCAN_DEBOUNCE_MS = 500;
  // 인코딩 프로필: 'standard' (64MiB) | 'compatibility' (19MiB, 더 빠름)
  const ENCODE_PROFILE = 'standard';

  const SODIUM_CORE =
    'https://cdn.jsdelivr.net/npm/libsodium-sumo@0.7.15/dist/modules-sumo/libsodium-sumo.js';
  const SODIUM_WRAPPERS =
    'https://cdn.jsdelivr.net/npm/libsodium-wrappers-sumo@0.7.15/dist/modules-sumo/libsodium-wrappers.js';

  const PROFILES = {
    standard:      { memoryKiB: 65536, iterations: 2, bit: 0 },
    compatibility: { memoryKiB: 19456, iterations: 2, bit: 1 },
  };

  const CYR_TO_LAT = {
    'а': 'a', 'с': 'c', 'е': 'e', 'о': 'o',
    'р': 'p', 'х': 'x', 'у': 'y',
  };
  const LAT_TO_CYR = {
    a: 'а', c: 'с', e: 'е', o: 'о',
    p: 'р', x: 'х', y: 'у',
  };

  const TOKEN_RE = /[A-Za-z0-9_\-асеорху]{40,}/g;

  let sodium = null;
  let ready = false;
  let processedNodes = new WeakSet();
  let base64ProcessedNodes = new WeakSet();
  let scanTimer = null;
  let decryptCount = 0;
  let lastPath = location.pathname;
  const tokenHomePath = new Map();

  function isTargetPage() {
    return /^\/s\/[^/]+(\/[^/]+)?\/?$/.test(location.pathname);
  }

  function getSectionName() {
    const m = location.pathname.match(/^\/s\/([^/]+)/);
    return m ? m[1].toLowerCase() : '';
  }

  function getDecodePasswords() {
    const section = getSectionName();
    return SECTION_PASSWORDS[section] || [ENCODE_PASSWORD];
  }

  function getKioskPassword() {
    const section = getSectionName();
    const list = SECTION_PASSWORDS[section];
    return list && list.length ? list[0] : '';
  }

  function decorateKioskUrl(rawUrl) {
    const currentPwd = getKioskPassword();
    if (!currentPwd) return rawUrl;

    try {
      const u = new URL(rawUrl, location.href);
      if (!(u.hostname === 'kio.ac' || u.hostname.endsWith('.kio.ac'))) return rawUrl;

      if (u.searchParams.has('pwd') || /(?:^|&)pwd=/.test(u.hash.replace(/^#/, ''))) {
        return u.href;
      }

      const hash = u.hash.replace(/^#/, '');
      u.hash = hash
        ? hash + '&pwd=' + encodeURIComponent(currentPwd)
        : 'pwd=' + encodeURIComponent(currentPwd);

      return u.href;
    } catch (_) {
      return rawUrl;
    }
  }

  // ========== 뱃지 ==========
  function ensureBadge() {
    let el = document.getElementById('kone-se-badge');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'kone-se-badge';
    el.style.cssText = `
      position: fixed; bottom: 72px; right: 16px; z-index: 99998;
      background: #1a2744; color: #e8eef7;
      padding: 12px 16px;
      border: 1px solid #3d5a80; border-radius: 10px;
      font: 600 14px/1.4 system-ui, sans-serif;
      box-shadow: 0 2px 12px rgba(0,0,0,.4); cursor: pointer;
      max-width: 320px;
    `;
    el.title = '클릭 = 다시 스캔';
    el.addEventListener('click', () => scan());
    (document.body || document.documentElement).appendChild(el);
    return el;
  }

  function setBadge(text, color) {
    try {
      const el = ensureBadge();
      el.textContent = text;
      if (color) el.style.background = color;
    } catch (_) {}
  }

  // ========== sodium ==========
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      if ([...document.scripts].some((s) => s.src === src)) {
        resolve();
        return;
      }
      const s = document.createElement('script');
      s.src = src;
      s.async = false;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('script load failed: ' + src));
      (document.head || document.documentElement).appendChild(s);
    });
  }

  async function initSodium() {
    setBadge('⏳ sodium 로딩 중…', '#243556');
    try {
      await loadScript(SODIUM_CORE);
      await loadScript(SODIUM_WRAPPERS);

      const maxWait = 20000;
      const start = Date.now();
      while (!window.sodium || !window.sodium.ready) {
        if (Date.now() - start > maxWait) {
          throw new Error('window.sodium 생성 안 됨');
        }
        await new Promise((r) => setTimeout(r, 50));
      }

      await window.sodium.ready;
      sodium = window.sodium;

      if (typeof sodium.crypto_pwhash !== 'function') {
        throw new Error('crypto_pwhash 없음 (sumo 필요)');
      }
      if (typeof sodium.crypto_aead_xchacha20poly1305_ietf_encrypt !== 'function') {
        throw new Error('xchacha encrypt 없음');
      }

      ready = true;
      setBadge('🔓 SE 준비됨', '#1a2744');
      console.log('[Kone-SE] sodium ready OK');
      scheduleScan();
      scheduleEncodeButtons();
    } catch (e) {
      console.error('[Kone-SE] init failed', e);
      setBadge('❌ SE 실패: ' + (e && e.message ? e.message : e), '#5c1a1a');
    }
  }

  // ========== 인코딩 (securencode와 동일) ==========
  function bytesToB64url(bytes) {
    let s = '';
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  /** 사이트와 같이 일부 문자를 키릴로 치환 */
  function obfuscateToken(token) {
    const chars = [...token];
    const candidates = [];
    for (let i = 0; i < chars.length; i++) {
      if (LAT_TO_CYR[chars[i]]) candidates.push(i);
    }
    if (!candidates.length) return token;

    let minN = token.length < 50 ? 4 : token.length <= 200 ? 6 : 12;
    minN = Math.min(minN, candidates.length);
    const n = Math.min(
      Math.max(minN, Math.round(candidates.length * (0.1 + Math.random() * 0.1))),
      candidates.length
    );

    const shuffled = [...candidates];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const pick = new Set(shuffled.slice(0, n));
    return chars.map((ch, i) => (pick.has(i) && LAT_TO_CYR[ch] ? LAT_TO_CYR[ch] : ch)).join('');
  }

  async function encryptText(plaintext, profileName) {
    if (!ready) throw new Error('sodium not ready');
    const profile = PROFILES[profileName] || PROFILES.standard;
    const pt = new TextEncoder().encode(plaintext);
    if (pt.byteLength > 1e6) throw new Error('1MB 초과');

    const pw = ENCODE_PASSWORD.normalize('NFC');
    const pwBytes = sodium.from_string(pw);

    const salt = sodium.randombytes_buf(16);
    salt[15] = (salt[15] & 254) | (profile.bit & 1);

    const key = sodium.crypto_pwhash(
      32,
      pwBytes,
      salt,
      profile.iterations,
      profile.memoryKiB * 1024,
      sodium.crypto_pwhash_ALG_ARGON2ID13
    );

    const nonce = sodium.randombytes_buf(24);
    let ct;
    try {
      ct = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
        pt, null, null, nonce, key
      );
    } finally {
      try { sodium.memzero(key); } catch (_) {}
      try { sodium.memzero(pwBytes); } catch (_) {}
    }

    const out = new Uint8Array(16 + 24 + ct.length);
    out.set(salt, 0);
    out.set(nonce, 16);
    out.set(ct, 40);

    const canonical = bytesToB64url(out);
    return obfuscateToken(canonical);
  }

  // ========== 댓글 인코딩 버튼 ==========
  function getInputText(el) {
    if (!el) return '';
    if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') return el.value;
    if (el.isContentEditable) return el.innerText || el.textContent || '';
    return '';
  }

  function setInputText(el, value) {
    if (!el) return;
    if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
      el.value = value;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }
    if (el.isContentEditable) {
      el.focus();
      el.innerText = value;
      el.dispatchEvent(new InputEvent('input', { bubbles: true, data: value }));
    }
  }

  function findCommentFields() {
    const list = [];
    document.querySelectorAll('textarea').forEach((t) => {
      // 너무 작은/숨은 필드 제외
      if (t.offsetParent === null && t.getClientRects().length === 0) return;
      if (t.disabled || t.readOnly) return;
      list.push(t);
    });
    // contenteditable 댓글 에디터
    document.querySelectorAll('[contenteditable="true"]').forEach((el) => {
      if (el.closest('.kone-se-decrypted')) return;
      if (el.offsetParent === null && el.getClientRects().length === 0) return;
      list.push(el);
    });
    return list;
  }

  function attachEncodeButton(field) {
    if (field.dataset.koneSeBtn) return;
    field.dataset.koneSeBtn = '1';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'kone-se-encode-btn';
    btn.textContent = '암호: koreanvoice 인코딩';
    btn.style.cssText = `
      display: inline-block;
      margin: 6px 0 8px;
      padding: 6px 12px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      border-radius: 6px;
      border: 1px solid #3d5a80;
      background: #1a2744;
      color: #7eb6ff;
    `;

    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!ready) {
        alert('암호화 라이브러리 로딩 중입니다. 잠시 후 다시 시도하세요.');
        return;
      }
      const plain = getInputText(field).trim();
      if (!plain) {
        alert('인코딩할 내용을 먼저 입력하세요.');
        return;
      }
      // 이미 토큰처럼 보이면 확인
      if (plain.length >= MIN_TOKEN_LEN && isProbablyToken(plain) && !/\s/.test(plain)) {
        if (!confirm('이미 암호문처럼 보입니다. 그래도 다시 인코딩할까요?')) return;
      }

      const prevLabel = btn.textContent;
      btn.disabled = true;
      btn.textContent = '인코딩 중… (수 초 걸릴 수 있음)';

      try {
        const token = await encryptText(plain, ENCODE_PROFILE);
        setInputText(field, token);
        btn.textContent = '✓ 인코딩 완료';
        setTimeout(() => {
          btn.textContent = prevLabel;
          btn.disabled = false;
        }, 1500);
      } catch (err) {
        console.error('[Kone-SE] encode failed', err);
        alert('인코딩 실패: ' + (err && err.message ? err.message : err));
        btn.textContent = prevLabel;
        btn.disabled = false;
      }
    });

    // 필드 바로 아래에 버튼 배치
    const wrap = document.createElement('div');
    wrap.className = 'kone-se-encode-wrap';
    wrap.style.cssText = 'margin-top: 4px;';
    wrap.appendChild(btn);

    if (field.parentNode) {
      field.parentNode.insertBefore(wrap, field.nextSibling);
    }
  }

  function scheduleEncodeButtons() {
    if (!ready) return;
    try {
      findCommentFields().forEach(attachEncodeButton);
    } catch (e) {
      console.debug('[Kone-SE] encode btn', e);
    }
  }

  // ========== 해독 ==========
  function normalizeToken(raw) {
    let out = '';
    for (const ch of raw) {
      if (CYR_TO_LAT[ch]) out += CYR_TO_LAT[ch];
      else if (/[A-Za-z0-9_-]/.test(ch)) out += ch;
      else throw new Error('invalid char');
    }
    return out;
  }

  function b64urlToBytes(str) {
    let s = str.replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    const bin = atob(s);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return arr;
  }

  async function decryptToken(token, password) {
    const clean = normalizeToken(token);
    const buf = b64urlToBytes(clean);
    const SALT = 16, NONCE = 24, TAG = 16;
    if (buf.length < SALT + NONCE + TAG) throw new Error('too short');

    const salt = buf.slice(0, SALT);
    const nonce = buf.slice(SALT, SALT + NONCE);
    const ct = buf.slice(SALT + NONCE);

    const isCompat = (salt[SALT - 1] & 1) === 1;
    const profile = isCompat ? PROFILES.compatibility : PROFILES.standard;

    const pwBytes = sodium.from_string(password.normalize('NFC'));
    let key;
    try {
      key = sodium.crypto_pwhash(
        32,
        pwBytes,
        salt,
        profile.iterations,
        profile.memoryKiB * 1024,
        sodium.crypto_pwhash_ALG_ARGON2ID13
      );
    } catch (e) {
      if (!isCompat) {
        key = sodium.crypto_pwhash(
          32,
          pwBytes,
          salt,
          PROFILES.compatibility.iterations,
          PROFILES.compatibility.memoryKiB * 1024,
          sodium.crypto_pwhash_ALG_ARGON2ID13
        );
      } else throw e;
    }

    let plain;
    try {
      plain = sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
        null, ct, null, nonce, key
      );
    } finally {
      try { sodium.memzero(key); } catch (_) {}
      try { sodium.memzero(pwBytes); } catch (_) {}
    }
    return sodium.to_string(plain);
  }

  async function decryptWithKnownPasswords(token) {
    let lastError = null;

    for (const password of getDecodePasswords()) {
      try {
        const plain = await decryptToken(token, password);
        return { plain, password };
      } catch (e) {
        lastError = e;
      }
    }

    throw lastError || new Error('decrypt failed');
  }

  function isProbablyToken(str) {
    if (str.length < MIN_TOKEN_LEN) return false;
    return /[асеорху]/.test(str) || /^[A-Za-z0-9_-]+$/.test(str);
  }

  function createDecryptedNode(original, plaintext, password) {
    const wrap = document.createElement('div');
    wrap.className = 'kone-se-decrypted';
    wrap.dataset.seOriginal = original;
    wrap.dataset.sePath = location.pathname;
    wrap.style.cssText = `
      display: block;
      background: #1a2744 !important;
      border: 1px solid #3d5a80 !important;
      border-radius: 8px;
      padding: 12px 14px;
      margin: 6px 0;
      font-family: inherit;
      font-size: 0.8em;
      white-space: pre-wrap;
      word-break: break-all;
      line-height: 1.6;
      color: #e8eef7 !important;
    `;

    const label = document.createElement('div');
    label.style.cssText = `
      font-size: 0.85em;
      color: #7eb6ff !important;
      margin-bottom: 8px;
      font-weight: 700;
    `;
    label.textContent = '🔓 SecureEncoder 해독됨 (' + password + ')';

    const text = document.createElement('div');
    text.style.cssText = 'color: #e8eef7 !important; font-size: 0.8em;';
    fillPlain(text, plaintext);

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.textContent = '원본 토큰 보기';
    toggle.style.cssText = `
      margin-top: 10px;
      font-size: 0.85em;
      padding: 4px 10px;
      cursor: pointer;
      border: 1px solid #3d5a80;
      border-radius: 4px;
      background: #243556 !important;
      color: #c5d4eb !important;
    `;
    let showingOrig = false;
    toggle.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      showingOrig = !showingOrig;
      if (showingOrig) {
        text.textContent = original;
        text.style.color = '#e8eef7';
        toggle.textContent = '해독문 보기';
      } else {
        fillPlain(text, plaintext);
        toggle.textContent = '원본 토큰 보기';
      }
    };

    wrap.appendChild(label);
    wrap.appendChild(text);
    wrap.appendChild(toggle);
    return wrap;
  }

  // ========== Base64 + 링크 처리 ==========
  const B64_RE = /[A-Za-z0-9+/=]{16,}/g;

  function decodeBase64Safe(str) {
    try {
      if (!str || str.length < 16 || str.length > 500000) return null;
      if (str.length % 4 !== 0) return null;
      if (!/^[A-Za-z0-9+/]+={0,2}$/.test(str)) return null;
      if (/=/.test(str.slice(0, -2))) return null;

      const bin = atob(str);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);

      const decodedText = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      if (!decodedText) return null;
      if (/[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(decodedText)) return null;

      return decodedText;
    } catch (_) {
      return null;
    }
  }

  function decodeNestedBase64(text) {
    B64_RE.lastIndex = 0;
    return text.replace(B64_RE, (match) => {
      const decoded = decodeBase64Safe(match);
      return decoded ? ('\n[🔒중첩 Base64 해독됨]\n' + decoded) : match;
    });
  }

  function appendLinkedText(el, text, textColor) {
    const parts = text.split(/(https?:\/\/[^\s]+)/g);

    parts.forEach((part) => {
      if (/^https?:\/\//.test(part)) {
        const a = document.createElement('a');
        a.href = decorateKioskUrl(part);
        a.textContent = part;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.style.cssText =
          'color: #8ec5ff !important; text-decoration: underline; font-size: inherit;';
        el.appendChild(a);
      } else {
        const span = document.createElement('span');
        span.style.cssText = 'color: ' + (textColor || '#e8eef7') + '; font-size: inherit;';
        span.textContent = part;
        el.appendChild(span);
      }
    });
  }

  function fillPlain(el, plaintext) {
    el.innerHTML = '';
    el.style.color = '#e8eef7';
    el.style.fontSize = '1em';

    // SecureEncoder 해독 결과 안의 Base64도 1회 추가 해독
    appendLinkedText(el, decodeNestedBase64(plaintext), '#e8eef7');
  }

  function createBase64Node(decoded) {
    const span = document.createElement('span');
    span.className = 'kone-base64-decoded';
    span.style.cssText = `
      padding: 4px 8px !important;
      border-radius: 4px !important;
      white-space: pre-wrap !important;
      word-break: break-all !important;
      display: inline-block !important;
      background: #112a46 !important;
      color: #91d5ff !important;
      border-left: 4px solid #177ddc !important;
      margin: 4px 0 !important;
    `;
    appendLinkedText(span, decoded, '#91d5ff');
    return span;
  }

  function processBase64TextNode(node) {
    if (!node || base64ProcessedNodes.has(node)) return;

    const text = node.nodeValue;
    if (!text || text.length < 16) return;

    const parent = node.parentElement;
    if (!parent) return;

    if (parent.closest && (
      parent.closest('.kone-se-decrypted') ||
      parent.closest('.kone-se-host') ||
      parent.closest('.kone-se-encode-wrap') ||
      parent.closest('.kone-base64-decoded') ||
      parent.closest('#kone-se-badge')
    )) return;

    if (['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT', 'NOSCRIPT'].includes(parent.tagName)) return;
    if (!/[A-Za-z0-9+/=]{16,}/.test(text)) {
      base64ProcessedNodes.add(node);
      return;
    }

    B64_RE.lastIndex = 0;
    let match;
    let lastIndex = 0;
    let changed = false;
    const fragment = document.createDocumentFragment();

    while ((match = B64_RE.exec(text)) !== null) {
      const decoded = decodeBase64Safe(match[0]);
      if (!decoded) continue;

      changed = true;
      if (match.index > lastIndex) {
        fragment.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
      }

      fragment.appendChild(createBase64Node(decoded));
      lastIndex = B64_RE.lastIndex;
    }

    if (!changed) {
      base64ProcessedNodes.add(node);
      return;
    }

    if (lastIndex < text.length) {
      fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
    }

    if (node.parentNode) node.parentNode.replaceChild(fragment, node);
  }

  function scanGeneralBase64(root) {
    if (!root) return;

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        const p = n.parentElement;
        if (!p) return NodeFilter.FILTER_REJECT;
        if (['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT', 'NOSCRIPT'].includes(p.tagName)) {
          return NodeFilter.FILTER_REJECT;
        }
        if (p.closest && (
          p.closest('.kone-se-decrypted') ||
          p.closest('.kone-se-host') ||
          p.closest('.kone-se-encode-wrap') ||
          p.closest('.kone-base64-decoded') ||
          p.closest('#kone-se-badge')
        )) {
          return NodeFilter.FILTER_REJECT;
        }
        if (!n.nodeValue || n.nodeValue.length < 16) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });

    const nodes = [];
    let n;
    while ((n = walker.nextNode())) nodes.push(n);
    nodes.forEach(processBase64TextNode);
  }

  async function processTextNode(node) {
    if (processedNodes.has(node)) return;
    const text = node.nodeValue;
    if (!text || text.length < MIN_TOKEN_LEN) return;

    const parent = node.parentElement;
    if (!parent) return;
    if (parent.closest && parent.closest('.kone-se-decrypted')) return;
    if (parent.classList.contains('kone-se-host')) return;
    if (parent.closest && parent.closest('.kone-se-encode-wrap')) return;

    TOKEN_RE.lastIndex = 0;
    const matches = [...text.matchAll(TOKEN_RE)];
    if (!matches.length) return;

    matches.sort((a, b) => b[0].length - a[0].length);

    const path = location.pathname;
    let best = null;

    for (const m of matches) {
      const candidate = m[0];
      if (!isProbablyToken(candidate)) continue;
      const home = tokenHomePath.get(candidate);
      if (home && home !== path) continue;

      try {
        const result = await Promise.race([
          decryptWithKnownPasswords(candidate),
          new Promise((_, rej) =>
            setTimeout(() => rej(new Error('timeout')), DECRYPT_TIMEOUT_MS)
          ),
        ]);
        tokenHomePath.set(candidate, path);
        best = {
          original: candidate,
          plain: result.plain,
          password: result.password,
        };
        break;
      } catch (e) {
        console.debug('[Kone-SE] skip', candidate.slice(0, 20), e.message);
      }
    }

    if (!best) {
      processedNodes.add(node);
      return;
    }

    if (
      parent.nextElementSibling &&
      parent.nextElementSibling.classList.contains('kone-se-decrypted')
    ) {
      processedNodes.add(node);
      return;
    }

    parent.classList.add('kone-se-host');
    parent.dataset.sePath = path;
    parent.dataset.sePrevDisplay = parent.style.display || '';
    parent.style.display = 'none';

    const box = createDecryptedNode(best.original, best.plain, best.password);
    parent.insertAdjacentElement('afterend', box);

    processedNodes.add(node);
    decryptCount++;
    setBadge('🔓 SE 해독 ' + decryptCount + '개', '#1a2744');
  }

  function collectTextNodes(root) {
    const list = [];
    try {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode(n) {
          const p = n.parentElement;
          if (!p) return NodeFilter.FILTER_REJECT;
          const tag = p.tagName;
          if (
            tag === 'SCRIPT' || tag === 'STYLE' ||
            tag === 'TEXTAREA' || tag === 'INPUT' || tag === 'NOSCRIPT'
          ) {
            return NodeFilter.FILTER_REJECT;
          }
          if (p.closest && (p.closest('.kone-se-decrypted') || p.closest('.kone-se-encode-wrap'))) {
            return NodeFilter.FILTER_REJECT;
          }
          if (p.classList && p.classList.contains('kone-se-host')) {
            return NodeFilter.FILTER_REJECT;
          }
          if (!n.nodeValue || n.nodeValue.length < MIN_TOKEN_LEN) {
            return NodeFilter.FILTER_REJECT;
          }
          return NodeFilter.FILTER_ACCEPT;
        },
      });
      let cur;
      while ((cur = walker.nextNode())) list.push(cur);
    } catch (e) {
      console.debug('[Kone-SE] walker error', e);
    }
    return list;
  }

  function restoreAllHosts() {
    try {
      document.querySelectorAll('.kone-se-decrypted').forEach((el) => el.remove());
      document.querySelectorAll('.kone-se-host').forEach((el) => {
        el.style.display = el.dataset.sePrevDisplay || '';
        el.classList.remove('kone-se-host');
        delete el.dataset.sePath;
        delete el.dataset.sePrevDisplay;
      });
    } catch (_) {}
  }

  function cleanupOnRouteChange() {
    restoreAllHosts();
    processedNodes = new WeakSet();
    base64ProcessedNodes = new WeakSet();
    // 목록 -> 게시글처럼 SPA 경로가 바뀌어도 같은 토큰을 다시 해독할 수 있게 초기화
    tokenHomePath.clear();
    decryptCount = 0;
  }

  async function scan() {
    if (!ready) {
      setBadge('⏳ 아직 준비 안 됨', '#243556');
      return;
    }
    if (!isTargetPage()) {
      setBadge('🔓 SE 대기 (대상 페이지 아님)', '#243556');
      return;
    }

    setBadge('🔓 SE 스캔 중…', '#243556');
    scheduleEncodeButtons();

    const path = location.pathname;
    try {
      document.querySelectorAll('.kone-se-decrypted').forEach((el) => {
        if (el.dataset.sePath && el.dataset.sePath !== path) el.remove();
      });
      document.querySelectorAll('.kone-se-host').forEach((el) => {
        if (el.dataset.sePath && el.dataset.sePath !== path) {
          el.style.display = el.dataset.sePrevDisplay || '';
          el.classList.remove('kone-se-host');
        }
      });
    } catch (_) {}

    const roots = new Set([document.body || document.documentElement]);
    try {
      document.querySelectorAll('*').forEach((el) => {
        if (el.shadowRoot) roots.add(el.shadowRoot);
      });
    } catch (_) {}

    for (const root of roots) {
      for (const n of collectTextNodes(root)) {
        await processTextNode(n);
      }
    }

    // SecureEncoder 처리 뒤 남아 있는 일반 Base64 텍스트도 처리
    for (const root of roots) {
      scanGeneralBase64(root);
    }

    setBadge(
      decryptCount > 0
        ? '🔓 SE 해독 ' + decryptCount + '개'
        : '🔓 SE 대기 (토큰 없음)',
      '#1a2744'
    );
  }

  function scheduleScan() {
    clearTimeout(scanTimer);
    scanTimer = setTimeout(scan, SCAN_DEBOUNCE_MS);
  }

  function onRouteChange() {
    if (location.pathname === lastPath) return;
    lastPath = location.pathname;
    cleanupOnRouteChange();
    setBadge('🔓 SE 이동됨 · 대기', '#243556');
    clearTimeout(scanTimer);
    [500, 1200, 2500, 4000].forEach((ms) => {
      setTimeout(() => {
        if (location.pathname === lastPath) {
          scan();
          scheduleEncodeButtons();
        }
      }, ms);
    });
  }

  window.addEventListener('popstate', onRouteChange);
  const _pushState = history.pushState;
  const _replaceState = history.replaceState;
  history.pushState = function () {
    _pushState.apply(this, arguments);
    onRouteChange();
  };
  history.replaceState = function () {
    _replaceState.apply(this, arguments);
    onRouteChange();
  };

  setInterval(() => {
    if (location.pathname !== lastPath) onRouteChange();
    if (ready) scheduleEncodeButtons();
  }, 1000);

  try {
    const observer = new MutationObserver(() => {
      if (isTargetPage()) {
        scheduleScan();
        scheduleEncodeButtons();
      }
    });
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  } catch (_) {}

  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey && (e.key === 'D' || e.key === 'd')) {
      e.preventDefault();
      scan();
    }
  });

  console.log('[Kone-Merged] v3.0.1 starting…');
  initSodium();
})();
