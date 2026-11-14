// ==UserScript==
// @name         Kone 이미지 403 자동 복구 (새 주소 갱신)
// @namespace    local.kone.image-renewal
// @version      0.3.5
// @description  시간이 지나 403으로 실패한 Kone 게시글 이미지의 새 주소를 페이지 재방문 없이 가져와 교체합니다.
// @match        https://kone.gg/*
// @match        https://www.kone.gg/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(() => {
  'use strict';
  // 게시글을 새로 읽어오기 위한 숨은 iframe 안에서는 실행하지 않습니다.
  if (window.top !== window.self || window.__koneImageRenewal032) return;
  window.__koneImageRenewal032 = true;

  const CDN_HOST = 'gimel.mittere.io';
  const ARTICLE_SELECTOR = '#post-article';
  const AUTO_DEBOUNCE_MS = 350;
  const REQUEST_TIMEOUT_MS = 12000;
  const FRAME_TIMEOUT_MS = 8500;
  const MIN_REFRESH_GAP_MS = 8000;
  const MAX_ATTEMPTS_PER_IMAGE = 3;

  const failures = new Map();     // 이미지 경로 -> 실패 기록 배열
  let freshUrls = new Map();       // 이미지 경로 -> 최근 발급된 주소
  let running = null;
  let autoTimer = null;
  let lastRefreshAt = 0;
  let articlePath = location.pathname;
  let routeGeneration = 0;
  const seenSources = new WeakMap();
  let lastNearScan = 0;
  let scrollScanTimer = null;
  let stats = { errors: 0, recovered: 0, lastMethod: '-', matched: 0, candidates: 0 };

  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  const info = (...args) => console.info('[Kone 이미지 복구 0.3.5]', ...args);

  function currentArticle() {
    return document.querySelector(ARTICLE_SELECTOR);
  }
  function normalizeUrl(raw) {
    try {
      const url = new URL(raw, location.href);
      return (url.protocol === 'https:' && url.hostname === CDN_HOST) ? url.href : null;
    } catch (_) { return null; }
  }
  function keyOf(raw) {
    const url = normalizeUrl(raw);
    if (!url) return null;
    const u = new URL(url);
    // Kone CDN URL의 ?v=... 인증 부분만 달라지는 경우를 대응합니다.
    return u.origin + u.pathname;
  }
  function stamp(raw) {
    try {
      const v = new URL(raw).searchParams.get('v') || '';
      return Number(/^\d{10}/.exec(v)?.[0] || 0);
    } catch (_) { return 0; }
  }
  function addUrl(map, value) {
    const url = normalizeUrl(value);
    if (!url) return;
    const key = keyOf(url);
    const prev = map.get(key);
    if (!prev || stamp(url) >= stamp(prev)) map.set(key, url);
  }

  function scanHtml(html) {
    // HTML 속성뿐 아니라 React/Next가 script 안에 담아 둔 이미지 주소도 읽습니다.
    const map = new Map();
    if (typeof html !== 'string' || !html.includes('mittere.io')) return map;
    const clean = html
      .replace(/\\u002[fF]/g, '/')
      .replace(/\\u0026/g, '&')
      .replace(/\\u003[dD]/g, '=')
      .replace(/\\u003[fF]/g, '?')
      .replace(/\\\//g, '/')
      .replace(/&amp;/gi, '&')
      .replace(/&#(?:0*38|x0*26);/gi, '&');
    const re = /(?:https?:)?\/\/gimel\.mittere\.io\/[^\s"'<>`{}\[\]\\(),;]+/gi;
    for (const match of clean.matchAll(re)) {
      const candidate = match[0].startsWith('//') ? 'https:' + match[0] : match[0];
      addUrl(map, candidate);
    }
    return map;
  }
  function scanDocument(doc) {
    const map = new Map();
    try {
      // 광고/댓글 이미지와 섞이지 않도록 게시글 본문을 우선으로 합니다.
      const root = doc.querySelector(ARTICLE_SELECTOR) || doc;
      for (const el of root.querySelectorAll('img, source, [data-src], [data-original]')) {
        for (const att of ['src', 'data-src', 'data-original', 'data-lazy-src', 'srcset']) {
          const value = el.getAttribute(att);
          if (!value) continue;
          if (att === 'srcset') {
            for (const part of value.split(',')) addUrl(map, part.trim().split(/\s+/)[0]);
          } else addUrl(map, value);
        }
      }
    } catch (_) {}
    return map;
  }
  function mergeMaps(...maps) {
    const result = new Map();
    for (const map of maps) for (const value of map.values()) addUrl(result, value);
    return result;
  }

  function resetRouteIfChanged() {
    if (articlePath === location.pathname) return;
    articlePath = location.pathname;
    routeGeneration += 1;
    failures.clear();
    freshUrls.clear();
    lastRefreshAt = 0;
    lastNearScan = 0;
    stats = { errors: 0, recovered: 0, lastMethod: '-', matched: 0, candidates: 0 };
    setStatus('다른 게시글로 이동함');
  }
  // 화면 표시 없이 오류·복구 상태를 콘솔에 기록합니다.
  function setStatus(message) {
    info(message);
  }
  function isArticleImage(img) {
    return img instanceof HTMLImageElement && !!img.closest(ARTICLE_SELECTOR);
  }
  function nearScreen(el) {
    if (!el?.isConnected) return false;
    const box = el.getBoundingClientRect();
    return box.width > 5 && box.height > 5 && box.bottom >= -innerHeight && box.top <= innerHeight * 2;
  }
  function collectAncestors(img) {
    const result = [];
    for (let node = img.parentElement, i = 0; node && i < 6; node = node.parentElement, i++) {
      result.push(node);
      if (node.id === 'post-article') break;
    }
    return result;
  }
  // 사이트가 첫 오류 직후 img를 플레이스홀더로 바꿔도 원본 정보를 남깁니다.
  function captureSource(img) {
    if (!(img instanceof HTMLImageElement)) return null;
    const url = normalizeUrl(img.currentSrc || img.getAttribute('src') || img.src);
    if (url) seenSources.set(img, url);
    return url || seenSources.get(img) || null;
  }
  function rememberFailure(img, raw) {
    // SPA 페이지 이동 직후 첫 이미지 오류도 새 게시글 소속으로 기록합니다.
    resetRouteIfChanged();
    const url = normalizeUrl(raw);
    if (!url) return;
    const key = keyOf(url);
    let records = failures.get(key);
    if (!records) { records = []; failures.set(key, records); }
    const found = records.find(r => r.img === img);
    if (found) {
      if (found.original !== url && !found.repaired) found.original = url;
      return;
    }
    const rect = img.getBoundingClientRect();
    const articleImgs = currentArticle()?.querySelectorAll('img');
    const index = articleImgs ? Array.prototype.indexOf.call(articleImgs, img) : -1;
    records.push({
      img, original: url, ancestors: collectAncestors(img),
      index, rect: { x: rect.x, y: rect.y + scrollY, w: rect.width, h: rect.height },
      attempts: 0, repaired: false, lastTried: ''
    });
    if (records.length > 10) records.shift();
    if (failures.size > 500) failures.delete(failures.keys().next().value);
    stats.errors += 1;
    setStatus(`이미지 오류 감지 (${stats.errors}건) · 복구 준비`);
    scheduleAutoRepair();
  }
  // Kone가 onerror 핸들러로 URL을 제거하기 전에 원래 주소를 기억합니다.
  document.addEventListener('error', event => {
    const img = event.target;
    if (!isArticleImage(img)) return;
    const url = captureSource(img);
    if (url) rememberFailure(img, url);
  }, true);
  document.addEventListener('load', event => {
    if (isArticleImage(event.target)) captureSource(event.target);
  }, true);

  // 첫 번째 403이 빠르게 렌더링되어 error 이벤트가 누락된 경우도 보완합니다.
  // 전체 페이지를 반복 검색하지 않도록 화면 근처만, 2초 이상 간격으로 검사합니다.
  function scanBrokenNearViewport(force = false) {
    resetRouteIfChanged();
    if (!force && Date.now() - lastNearScan < 2000) return;
    lastNearScan = Date.now();
    const root = currentArticle();
    if (!root) return;
    for (const img of root.querySelectorAll('img')) {
      if (!nearScreen(img)) continue;
      const url = captureSource(img);
      if (url && img.complete && img.naturalWidth === 0) rememberFailure(img, url);
    }
  }
  window.addEventListener('scroll', () => {
    if (scrollScanTimer) clearTimeout(scrollScanTimer);
    scrollScanTimer = setTimeout(scanBrokenNearViewport, 450);
  }, { passive: true });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      setTimeout(() => scanBrokenNearViewport(true), 350);
      setTimeout(() => scanBrokenNearViewport(true), 1200);
    }
  });
  window.addEventListener('focus', () => {
    setTimeout(() => scanBrokenNearViewport(true), 350);
  });

  function pendingRecords() {
    const result = [];
    for (const [key, list] of failures) {
      for (const rec of list) {
        if (rec.repaired || rec.attempts >= MAX_ATTEMPTS_PER_IMAGE) continue;
        if (rec.img.isConnected || rec.ancestors.some(el => el.isConnected)) result.push({ key, rec });
      }
    }
    // 독서 위치 근처의 이미지부터 복구합니다.
    result.sort((a, b) => {
      const aVisible = nearScreen(a.rec.img) || a.rec.ancestors.some(nearScreen);
      const bVisible = nearScreen(b.rec.img) || b.rec.ancestors.some(nearScreen);
      return Number(bVisible) - Number(aVisible);
    });
    return result;
  }
  function hasNewUrls(map, pending) {
    return pending.some(({key, rec}) => {
      const candidate = map.get(key);
      return !!candidate && candidate !== rec.original && candidate !== rec.lastTried;
    });
  }

  async function fetchFreshPage(bustCache) {
    const url = new URL(location.href);
    if (bustCache) url.searchParams.set('_kr_image_renew', String(Date.now()));
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(url.href, {
        method: 'GET', credentials: 'include', cache: 'no-store', redirect: 'follow',
        headers: { Accept: 'text/html,application/xhtml+xml' }, signal: controller.signal
      });
      if (!response.ok) throw new Error(`게시글 요청 HTTP ${response.status}`);
      const html = await response.text();
      const result = scanHtml(html);
      // script 안에 주소가 없는 사이트 구성이라도 HTML img 속성은 검사합니다.
      const doc = new DOMParser().parseFromString(html, 'text/html');
      return mergeMaps(result, scanDocument(doc));
    } finally { clearTimeout(timer); }
  }

  async function fetchThroughFrame(pending) {
    // SSR에 이미지 주소가 없다면 브라우저가 페이지를 다시 렌더링하도록 합니다.
    // 원래 탭은 이동하지 않습니다. X-Frame-Options/CSP로 막힌 경우 실패할 수 있습니다.
    if (!document.body) return new Map();
    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    frame.tabIndex = -1;
    frame.style.cssText = 'position:fixed!important;left:0!important;top:0!important;width:1000px!important;height:760px!important;opacity:0!important;pointer-events:none!important;border:0!important;clip-path:inset(100%)!important;z-index:-1!important;';
    const page = new URL(location.href);
    page.searchParams.set('_kr_image_renew', String(Date.now()));
    let finished = false;
    let best = new Map();
    return new Promise(resolve => {
      const finish = () => {
        if (finished) return;
        finished = true;
        clearTimeout(timeout);
        try { frame.remove(); } catch (_) {}
        resolve(best);
      };
      const timeout = setTimeout(finish, FRAME_TIMEOUT_MS);
      frame.addEventListener('load', async () => {
        if (finished) return;
        for (let i = 0; i < 18 && !finished; i++) {
          try {
            const doc = frame.contentDocument;
            if (!doc) break;
            best = mergeMaps(best, scanDocument(doc));
            if (hasNewUrls(best, pending)) { finish(); return; }
            // 숨은 페이지에서도 문제의 첫 이미지 위치까지 스크롤하여 lazy load를 트리거합니다.
            // 본래 페이지 스크롤에는 영향을 주지 않습니다.
            if (i === 2 || i === 7 || i === 12) {
              const article = doc.querySelector(ARTICLE_SELECTOR);
              const imgs = article?.querySelectorAll('img');
              if (imgs?.length) {
                for (const {key, rec} of pending.slice(0, 3)) {
                  let target = null;
                  // 같은 경로의 원본 이미지를 우선으로 찾습니다.
                  for (const item of imgs) {
                    if (keyOf(item.getAttribute('src') || item.getAttribute('data-src')) === key) {
                      target = item; break;
                    }
                  }
                  if (!target && rec.index >= 0 && rec.index < imgs.length) target = imgs[rec.index];
                  if (target) target.scrollIntoView({block:'center', behavior:'instant'});
                }
              }
            }
            // 지연 로딩 컴포넌트의 렌더링을 기다립니다.
            if (i === 8 || i === 15) best = mergeMaps(best, scanHtml(doc.documentElement?.outerHTML || ''));
          } catch (_) { break; }
          await delay(350);
        }
        finish();
      }, { once: true });
      frame.src = page.href;
      document.body.appendChild(frame);
    });
  }

  function imagePreload(url) {
    return new Promise(resolve => {
      const img = new Image();
      let ended = false;
      const done = ok => {
        if (ended) return;
        ended = true;
        clearTimeout(t);
        img.onload = img.onerror = null;
        resolve(ok);
      };
      const t = setTimeout(() => done(false), 12000);
      img.onload = () => done(img.naturalWidth > 0);
      img.onerror = () => done(false);
      img.src = url;
    });
  }
  function pickHolder(rec) {
    for (const el of rec.ancestors) {
      if (!el?.isConnected || el.id === 'post-article') continue;
      const box = el.getBoundingClientRect();
      if (box.width >= 130 && box.height >= 120 && box.height <= 4500 && box.width <= 2500) return el;
    }
    // img와 부모가 통째로 교체된 경우 현재 화면의 같은 위치에서 새 상자를 찾습니다.
    if (rec.rect && Number.isFinite(rec.rect.x)) {
      const x = Math.min(innerWidth - 2, Math.max(2, rec.rect.x + Math.min(rec.rect.w / 2, 200)));
      const y = rec.rect.y - scrollY + Math.min(rec.rect.h / 2, 200);
      if (y >= 0 && y < innerHeight) {
        let candidate = document.elementFromPoint(x, y);
        for (let i = 0; candidate && i < 8; i++, candidate = candidate.parentElement) {
          if (candidate.id === 'post-article') break;
          if (!candidate.closest?.(ARTICLE_SELECTOR)) continue;
          const box = candidate.getBoundingClientRect();
          if (box.width >= 130 && box.height >= 120 && box.height <= 4500 && box.width <= 2500) return candidate;
        }
      }
    }
    return null;
  }
  function installOverlay(rec, url) {
    const holder = pickHolder(rec);
    if (!holder) return false;
    // 원본 컨테이너 높이를 그대로 이용하므로 스크롤 위치가 밀리지 않습니다.
    const existing = holder.querySelector(':scope > .kr03-restored');
    if (existing) { existing.src = url; return true; }
    const style = getComputedStyle(holder);
    if (style.position === 'static') holder.style.position = 'relative';
    const image = document.createElement('img');
    image.className = 'kr03-restored';
    image.src = url;
    image.alt = '복구된 이미지';
    image.style.cssText = 'position:absolute!important;inset:0!important;width:100%!important;height:100%!important;object-fit:contain!important;z-index:3!important;background:#292b2d!important;';
    holder.appendChild(image);
    return true;
  }
  async function applyRenewal(rec, newUrl, generation) {
    if (rec.lastTried === newUrl) return false;
    rec.lastTried = newUrl;
    rec.attempts += 1;
    if (!(await imagePreload(newUrl))) return false;
    if (generation !== routeGeneration) return false;
    if (rec.img.isConnected) {
      // 사이트가 src를 원래 값으로 덮어쓰더라도 오버레이 이미지가 유지되도록 합니다.
      const overlay = installOverlay(rec, newUrl);
      rec.img.removeAttribute('srcset');
      if (rec.img.parentElement?.tagName === 'PICTURE') {
        for (const src of rec.img.parentElement.querySelectorAll('source')) src.removeAttribute('srcset');
      }
      rec.img.loading = 'eager';
      rec.img.src = newUrl;
      rec.repaired = true;
      // React의 리렌더링이 기존 URL로 되돌렸는지 검사합니다.
      if (!overlay) setTimeout(() => {
        if (!rec.img.isConnected) return;
        const live = normalizeUrl(rec.img.currentSrc || rec.img.src);
        if (live === rec.original && rec.img.complete && rec.img.naturalWidth === 0) {
          rec.repaired = false;
          rec.lastTried = '';
          scheduleAutoRepair();
        }
      }, 1400);
      return true;
    }
    const displayed = installOverlay(rec, newUrl);
    if (displayed) rec.repaired = true;
    return displayed;
  }
  function scheduleAutoRepair(wait = AUTO_DEBOUNCE_MS) {
    if (autoTimer) clearTimeout(autoTimer);
    autoTimer = setTimeout(() => {
      autoTimer = null;
      const pending = pendingRecords();
      if (!pending.length) return;
      // 이전 버전은 여기서 그냥 종료하여 '첫 이미지'가 영원히 누락될 수 있었습니다.
      if (running) { scheduleAutoRepair(650); return; }
      const cooldown = MIN_REFRESH_GAP_MS - (Date.now() - lastRefreshAt);
      if (cooldown > 0 && !hasNewUrls(freshUrls, pending)) {
        scheduleAutoRepair(cooldown + 80);
        return;
      }
      recover(false).catch(err => setStatus('자동 복구 오류: ' + String(err.message || err)));
    }, Math.max(50, wait));
  }

  async function recover(manual = true) {
    resetRouteIfChanged();
    if (running) return running;
    const generation = routeGeneration;
    running = (async () => {
        // 수동 복구 시 기존 img에서 실패했지만 error 이벤트를 놓친 경우도 수집합니다.
        if (manual) for (const img of currentArticle()?.querySelectorAll('img') || []) {
          const src = captureSource(img);
          if (src && img.complete && img.naturalWidth === 0) rememberFailure(img, src);
        }
        const pending = pendingRecords();
        if (!pending.length) { setStatus('실패한 이미지 기록이 없음 (이미지 오류 후 눌러봐)'); return; }
        setStatus(`${pending.length}개 이미지의 새 주소 확인 중...`);
        lastRefreshAt = Date.now();
        let source = '기존 갱신 주소';
        let found = freshUrls;
        if (manual || !hasNewUrls(found, pending)) {
          try {
            found = mergeMaps(found, await fetchFreshPage(false));
            source = '최신 게시글 HTML';
          } catch (err) { info('HTML 요청 실패', err); }
        }
        if (!hasNewUrls(found, pending)) {
          try {
            found = mergeMaps(found, await fetchFreshPage(true));
            source = '캐시 무시 HTML';
          } catch (err) { info('캐시 무시 요청 실패', err); }
        }
        // 일부 이미지만 갱신된 경우에도 남은 첫 번째 실패 이미지의 위치를
        // 숨은 페이지에서 렌더링하여 최신 주소를 확보합니다.
        const unresolved = pending.filter(({key, rec}) => {
          const candidate = found.get(key);
          return !candidate || candidate === rec.original || candidate === rec.lastTried;
        });
        if (unresolved.length) {
          setStatus(`남은 ${unresolved.length}개 이미지 주소 재생성 중...`);
          try {
            found = mergeMaps(found, await fetchThroughFrame(unresolved));
            source = 'HTML + 숨은 페이지 렌더링';
          } catch (err) { info('프레임 생성 실패', err); }
        }
        // 이전 게시글의 지연 응답이 다음 게시글의 URL 목록을 덮어쓰지 않도록 합니다.
        if (generation !== routeGeneration) return;
        freshUrls = found;
        stats.lastMethod = source;
        stats.candidates = found.size;
        let updated = 0, unmatched = 0, failed = 0;
        // 이미지가 많은 게시글에서도 요청을 한 장씩 기다리지 않도록 4개씩 병렬 처리합니다.
        // 과도한 요청을 막기 위해 한 번에 최대 32개만 복구합니다.
        const jobs = pending.slice(0, 32);
        for (let i = 0; i < jobs.length; i += 4) {
          if (generation !== routeGeneration) return;
          const results = await Promise.all(jobs.slice(i, i + 4).map(async ({key, rec}) => {
            const url = found.get(key);
            if (!url || url === rec.original || url === rec.lastTried) return 'unmatched';
            return (await applyRenewal(rec, url, generation)) ? 'updated' : 'failed';
          }));
          updated += results.filter(r => r === 'updated').length;
          unmatched += results.filter(r => r === 'unmatched').length;
          failed += results.filter(r => r === 'failed').length;
        }
        stats.recovered += updated;
        stats.matched = updated;
        if (updated) setStatus(`이미지 ${updated}개 복구 · 미일치 ${unmatched}개 · 실패 ${failed}개`);
        else setStatus(`복구 실패: 갱신 URL ${found.size}개 발견, 대상 일치 ${pending.length - unmatched}개`);
        info('결과', {...stats, unmatched, failed});
    })();
    try { return await running; } finally { running = null; }
  }

  // 오류 및 페이지 이동 감지는 UI 없이 계속 실행합니다.
  window.addEventListener('load', scanBrokenNearViewport, { once: true });
  window.addEventListener('pageshow', () => {
    resetRouteIfChanged();
    scanBrokenNearViewport(true);
  });
  window.addEventListener('popstate', () => {
    resetRouteIfChanged();
    setTimeout(() => scanBrokenNearViewport(true), 350);
    setTimeout(() => scanBrokenNearViewport(true), 1200);
  });
})();
