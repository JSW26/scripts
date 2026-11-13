// ==UserScript==
// @name         Kone.gg 통합 자동 디코더 + Kiosk Pwd
// @namespace    https://kone.gg/
// @version      3.2.0
// @description  SecureEncoder + Base64 자동 해독, kio.ac 비밀번호 자동 입력, 반투명 상태 UI 및 이미지 복구 패널 겹침 방지
// @author       merged
// @match        https://kone.gg/*
// @match        https://www.kone.gg/*
// @match        https://*.kone.gg/*
// @match        https://kio.ac/*
// @match        https://*.kio.ac/*
// @grant        none
// @run-at       document-end
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

  // 암호문의 최소 길이: salt(16) + nonce(24) + tag(16) = 56 bytes -> Base64URL 75 chars
  const MIN_TOKEN_LEN = 75;
  const DECRYPT_TIMEOUT_MS = 25000;
  const SCAN_DEBOUNCE_MS = 30;
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

  const TOKEN_RE = /[A-Za-z0-9_\-асеорху]{75,}/g;

  let sodium = null;
  let ready = false;
  let processedNodes = new WeakSet();
  let base64ProcessedNodes = new WeakSet();
  let processingNodes = new WeakSet();
  let scanTimer = null;
  let scanRunning = false;
  const pendingRoots = new Set();
  let decryptCount = 0;
  let lastPath = location.pathname;
  const tokenHomePath = new Map();

  // 탭 단위 캐시: 뒤로가기 / 앞으로가기 시 복호화 연산 없이 즉시 표시.
  // 개인정보가 포함된 글에서 사용한다면 false로 바꾸면 메모리 캐시만 사용.
  const CACHE_TO_SESSION = true;
  const CACHE_STORAGE_KEY = 'kone-se-fast-cache-v3';
  const CACHE_TTL_MS = 60 * 60 * 1000;
  const CACHE_MAX_ITEMS = 80;
  const CACHE_MAX_CHARS = 700000;
  const decodedCache = new Map();
  const rejectedTokens = new Set(); // 동일한 실패 토큰의 반복 Argon2 연산 차단
  let cacheSaveTimer = null;

  function cacheKey(path, token) {
    return path + '\u0000' + token;
  }

  function readCache() {
    if (!CACHE_TO_SESSION) return;
    try {
      const saved = JSON.parse(sessionStorage.getItem(CACHE_STORAGE_KEY) || '[]');
      const now = Date.now();
      if (!Array.isArray(saved)) return;
      for (const entry of saved) {
        if (!Array.isArray(entry) || entry.length !== 4) continue;
        const [key, plain, password, time] = entry;
        if (typeof key === 'string' && typeof plain === 'string' &&
            typeof password === 'string' && Number.isFinite(time) &&
            now - time < CACHE_TTL_MS && time <= now) {
          decodedCache.set(key, { plain, password, time });
        }
      }
    } catch (_) { /* 세션 저장소 비활성화 환경 */ }
  }

  function getCached(path, token) {
    const key = cacheKey(path, token);
    const result = decodedCache.get(key);
    if (!result) return null;
    if (Date.now() - result.time >= CACHE_TTL_MS) {
      decodedCache.delete(key);
      return null;
    }
    // 최근 사용 값을 끝으로 이동 (LRU)
    decodedCache.delete(key);
    decodedCache.set(key, result);
    return result;
  }

  function saveCacheSoon() {
    if (!CACHE_TO_SESSION) return;
    clearTimeout(cacheSaveTimer);
    cacheSaveTimer = setTimeout(() => {
      try {
        let entries = [...decodedCache].map(([key, v]) =>
          [key, v.plain, v.password, v.time]);
        entries = entries.filter(e => Date.now() - e[3] < CACHE_TTL_MS);
        entries = entries.slice(-CACHE_MAX_ITEMS);
        // quota 및 크기 제한. 오래된 것부터 제거.
        let size = entries.reduce((n, e) => n + e[0].length + e[1].length, 0);
        while (size > CACHE_MAX_CHARS && entries.length) {
          const e = entries.shift();
          size -= e[0].length + e[1].length;
        }
        sessionStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify(entries));
      } catch (_) { /* storage quota/접근 실패는 성능에만 영향 */ }
    }, 150);
  }

  function rememberDecrypted(path, token, plain, password) {
    const key = cacheKey(path, token);
    decodedCache.delete(key);
    decodedCache.set(key, { plain, password, time: Date.now() });
    while (decodedCache.size > CACHE_MAX_ITEMS) {
      decodedCache.delete(decodedCache.keys().next().value);
    }
    saveCacheSoon();
  }

  readCache();

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

  // ========== 반투명 상태 뱃지 + 이미지 복구 UI 겹침 방지 ==========
  // 이미지 복구 v0.3.0을 바꾸지 않고, #kr03-panel의 실제 크기에 맞춰
  // 이 배지만 위로 이동시킵니다. 패널을 닫으면 원래 아래 자리로 돌아옵니다.
  let badgeLayoutStarted = false;
  let badgeObservedPanel = null;
  let badgeResizeObserver = null;

  function positionBadge() {
    const badge = document.getElementById('kone-se-badge');
    if (!badge) return;
    const recoveryPanel = document.getElementById('kr03-panel');
    if (!recoveryPanel || !recoveryPanel.isConnected) {
      badge.style.bottom = '12px';
      return;
    }
    const rect = recoveryPanel.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      badge.style.bottom = '12px';
      return;
    }
    // 화면 아래쪽 기준: 이미지 복구 패널의 윗변보다 10px 위에 배치.
    const clearance = Math.ceil(window.innerHeight - rect.top + 10);
    badge.style.bottom = `${Math.max(12, clearance)}px`;
  }

  function syncRecoveryPanel() {
    const panel = document.getElementById('kr03-panel');
    if (panel !== badgeObservedPanel) {
      if (badgeResizeObserver) badgeResizeObserver.disconnect();
      badgeObservedPanel = panel;
      if (panel && badgeResizeObserver) badgeResizeObserver.observe(panel);
    }
    positionBadge();
  }

  function startBadgeLayout() {
    if (badgeLayoutStarted || !document.body) return;
    badgeLayoutStarted = true;
    if (typeof ResizeObserver !== 'undefined') {
      badgeResizeObserver = new ResizeObserver(positionBadge);
    }
    // body 직계 자식의 패널 추가/제거만 관찰하므로 게시글 본문 변경에는 반응하지 않습니다.
    const observer = new MutationObserver((mutations) => {
      const changed = mutations.some(m =>
        [...m.addedNodes, ...m.removedNodes].some(node =>
          node.nodeType === 1 && node.id === 'kr03-panel'));
      if (changed) syncRecoveryPanel();
    });
    observer.observe(document.body, { childList: true });
    window.addEventListener('resize', positionBadge, { passive: true });
    syncRecoveryPanel();
  }

  function ensureBadge() {
    let el = document.getElementById('kone-se-badge');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'kone-se-badge';
    el.style.cssText = `
      position: fixed; bottom: 12px; right: 12px; z-index: 2147483645;
      background: rgba(34,34,34,.74); color: #f2f4f7;
      padding: 9px 12px;
      border: 1px solid rgba(160,160,160,.47); border-radius: 9px;
      font: 600 12px/1.4 system-ui, sans-serif;
      box-shadow: 0 3px 14px rgba(0,0,0,.33); cursor: pointer;
      max-width: min(280px, calc(100vw - 24px)); box-sizing: border-box;
    `;
    el.title = '클릭 = 다시 스캔';
    el.addEventListener('click', () => scheduleScan(document.body || document.documentElement, 0));
    (document.body || document.documentElement).appendChild(el);
    startBadgeLayout();
    return el;
  }

  function setBadge(text, color) {
    try {
      const el = ensureBadge();
      el.textContent = text;
      // 상태별 강조는 테두리만 변경하고, 배경은 항상 반투명하게 유지.
      if (color) el.style.borderColor = color === '#243556'
        ? 'rgba(126,164,210,.55)' : 'rgba(160,160,160,.47)';
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
      scheduleScan(document.body || document.documentElement, 0);
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
    // sodium 준비 전에는 암호문 일부를 일반 Base64로 오인해 손상시키지 않음.
    if (!ready && getCandidates(node).length) return;

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

  function showDecrypted(node, original, plain, password, path) {
    const parent = node.parentElement;
    if (!parent || !parent.isConnected || path !== location.pathname) return false;
    if (parent.classList.contains('kone-se-host') || parent.closest('.kone-se-decrypted')) return false;
    if (parent.nextElementSibling?.classList.contains('kone-se-decrypted')) return false;

    parent.classList.add('kone-se-host');
    parent.dataset.sePath = path;
    parent.dataset.sePrevDisplay = parent.style.display || '';
    parent.style.display = 'none';

    const box = createDecryptedNode(original, plain, password);
    parent.insertAdjacentElement('afterend', box);
    processedNodes.add(node);
    decryptCount++;
    setBadge('🔓 SE 해독 ' + decryptCount + '개', '#1a2744');
    return true;
  }

  function getCandidates(node) {
    if (!node || processedNodes.has(node) || processingNodes.has(node)) return [];
    const value = node.nodeValue;
    if (!value || value.length < MIN_TOKEN_LEN) return [];
    const p = node.parentElement;
    if (!p || p.closest('.kone-se-decrypted, .kone-se-encode-wrap, .kone-se-host, .kone-base64-decoded')) return [];
    TOKEN_RE.lastIndex = 0;
    const matches = [...value.matchAll(TOKEN_RE)];
    return matches.map(m => m[0]).filter(isProbablyToken).sort((a, b) => {
      // SecureEncoder에서 섞어 쓰는 키릴 문자가 포함된 암호문 우선.
      const difference = Number(/[асеорху]/.test(b)) - Number(/[асеорху]/.test(a));
      return difference || b.length - a.length;
    });
  }

  // 캐시 복원은 crypto/sodium 라이브러리와 관계없이 즉시 실행한다.
  function tryCachedTextNode(node) {
    if (!node?.isConnected || processedNodes.has(node)) return false;
    const path = location.pathname;
    for (const token of getCandidates(node)) {
      const cached = getCached(path, token);
      if (cached && showDecrypted(node, token, cached.plain, cached.password, path)) return true;
    }
    return false;
  }

  async function processTextNode(node) {
    if (!ready || !node?.isConnected || processedNodes.has(node) || processingNodes.has(node)) return;
    const candidates = getCandidates(node);
    if (!candidates.length) {
      processedNodes.add(node);
      return;
    }

    const path = location.pathname;
    processingNodes.add(node);
    try {
      for (const candidate of candidates) {
        if (location.pathname !== path || !node.isConnected) return;
        // 빠른 캐시는 앞선 패스에서 처리하지만, 동시에 저장된 경우도 재확인.
        const cached = getCached(path, candidate);
        if (cached) {
          showDecrypted(node, candidate, cached.plain, cached.password, path);
          return;
        }

        const home = tokenHomePath.get(candidate);
        if (home && home !== path) continue;
        const rejectedKey = cacheKey(path, candidate);
        if (rejectedTokens.has(rejectedKey)) continue;

        let timeoutId;
        try {
          const result = await Promise.race([
            decryptWithKnownPasswords(candidate),
            new Promise((_, reject) => {
              timeoutId = setTimeout(() => reject(new Error('timeout')), DECRYPT_TIMEOUT_MS);
            }),
          ]);
          tokenHomePath.set(candidate, path);
          rememberDecrypted(path, candidate, result.plain, result.password);
          showDecrypted(node, candidate, result.plain, result.password, path);
          return;
        } catch (e) {
          if (e.message !== 'timeout') {
            rejectedTokens.add(rejectedKey);
            if (rejectedTokens.size > 500) rejectedTokens.delete(rejectedTokens.values().next().value);
          }
          console.debug('[Kone-SE] skip', candidate.slice(0, 20), e.message);
        } finally {
          clearTimeout(timeoutId);
        }
      }
      processedNodes.add(node); // 실패한 토큰을 매 DOM 변경마다 복호화하지 않음
    } finally {
      processingNodes.delete(node);
    }
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
          if (p.closest && (p.closest('.kone-se-decrypted') || p.closest('.kone-se-encode-wrap') || p.closest('.kone-base64-decoded'))) {
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
    processingNodes = new WeakSet();
    // 목록 -> 게시글처럼 SPA 경로가 바뀌어도 같은 토큰을 다시 해독할 수 있게 초기화
    tokenHomePath.clear();
    decryptCount = 0;
  }

  async function scan(root) {
    if (!isTargetPage()) return;
    if (!root || !root.isConnected) return;

    const path = location.pathname;
    const roots = [root];
    // Shadow DOM 처리 유지하되 변경된 영역만 탐색.
    try {
      if (root.shadowRoot) roots.push(root.shadowRoot);
      if (root.querySelectorAll) {
        root.querySelectorAll('*').forEach(el => {
          if (el.shadowRoot) roots.push(el.shadowRoot);
        });
      }
    } catch (_) {}

    for (const r of roots) {
      if (location.pathname !== path) return;
      const nodes = collectTextNodes(r);
      // 기존에 해독했던 글은 첫 패스에서 지연 없이 모두 렌더링.
      for (const node of nodes) tryCachedTextNode(node);
      // 암호문을 먼저 식별한 뒤, 남은 일반 Base64를 처리한다.
      // sodium 로딩 중에도 일반 Base64 표시는 지연시키지 않는다.
      if (ready) {
        for (const node of nodes) {
          if (location.pathname !== path) return;
          await processTextNode(node);
        }
      }
      scanGeneralBase64(r);
    }
    if (ready) scheduleEncodeButtons();
  }

  function scheduleScan(root = document.body || document.documentElement, delay = SCAN_DEBOUNCE_MS) {
    if (root && root.nodeType === 3) root = root.parentElement;
    if (root && (root.nodeType === 1 || root.nodeType === 11)) pendingRoots.add(root);
    clearTimeout(scanTimer);
    scanTimer = setTimeout(flushScans, delay);
  }

  async function flushScans() {
    if (scanRunning) return;
    scanRunning = true;
    try {
      while (pendingRoots.size) {
        const roots = [...pendingRoots];
        pendingRoots.clear();
        // 한 번에 중복되는 부모/자식 영역을 중복 스캔하지 않음.
        const simplified = roots.filter((r, i) => !roots.some((other, j) =>
          i !== j && other !== r && typeof other.contains === 'function' && other.contains(r)));
        for (const root of simplified) await scan(root);
      }
      if (ready) {
        setBadge(decryptCount ? '🔓 SE 해독 ' + decryptCount + '개' :
          '🔓 SE 대기 (토큰 없음)', '#1a2744');
      }
    } catch (e) {
      console.error('[Kone-SE] scan failed', e);
    } finally {
      scanRunning = false;
      if (pendingRoots.size) scheduleScan(undefined, 0);
    }
  }

  function onRouteChange() {
    if (location.pathname === lastPath) return;
    lastPath = location.pathname;
    pendingRoots.clear();
    cleanupOnRouteChange();
    setBadge('🔓 SE 이동됨 · 대기', '#243556');
    // 기존의 500/1200/2500/4000ms 중복 스캔 제거.
    scheduleScan(document.body || document.documentElement, 0);
  }

  window.addEventListener('popstate', onRouteChange);
  window.addEventListener('pageshow', () => scheduleScan(document.body || document.documentElement, 0));
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

  // history API 없이 URL만 변경하는 사이트 대비용 경량 확인.
  setInterval(() => {
    if (location.pathname !== lastPath) onRouteChange();
  }, 1000);

  try {
    const observer = new MutationObserver((mutations) => {
      if (!isTargetPage()) return;
      for (const mutation of mutations) {
        if (mutation.type === 'characterData') {
          const node = mutation.target;
          if (node.parentElement?.closest('.kone-se-decrypted, .kone-se-host, .kone-se-encode-wrap, #kone-se-badge')) continue;
          processedNodes.delete(node);
          base64ProcessedNodes.delete(node);
          scheduleScan(node.parentElement);
        } else {
          for (const node of mutation.addedNodes) {
            const el = node.nodeType === 3 ? node.parentElement : node;
            if (!el || !el.isConnected) continue;
            if (el.nodeType === 1 && (
              el.matches?.('.kone-se-decrypted, .kone-se-host, .kone-se-encode-wrap, .kone-base64-decoded, #kone-se-badge') ||
              el.closest?.('.kone-se-decrypted, .kone-se-host, .kone-se-encode-wrap, .kone-base64-decoded, #kone-se-badge')
            )) continue;
            scheduleScan(el);
          }
        }
      }
    });
    observer.observe(document.documentElement, {
      childList: true, subtree: true, characterData: true,
    });
  } catch (_) {}

  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey && (e.key === 'D' || e.key === 'd')) {
      e.preventDefault();
      scheduleScan(document.body || document.documentElement, 0);
    }
  });

  console.log('[Kone-Merged] v3.2.0 UI starting…');
  // 저장한 해독 결과는 sodium 로딩 전에 표시 가능.
  scheduleScan(document.body || document.documentElement, 0);
  initSodium();
})();
