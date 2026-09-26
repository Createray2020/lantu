/*
 * 數字欄守衛（2026/09/26）。
 *
 * 問題：注音輸入法開著的時候，數字鍵會被輸入法接走變成「ㄅㄉˇˋㄓˊ˙ㄚㄞㄢ」，
 * 使用者得先切成英數才能在金額／年齡／比例欄打數字。瀏覽器沒有「強制關輸入法」的正規做法
 * （inputmode 只影響手機鍵盤），所以這裡在文件層掛一個攔截層，三道保險：
 *
 *  1. 組字一開始（compositionupdate）就強制收掉：blur → 用組字前的值＋對應後的數字覆寫 → focus 回來，
 *     注音鍵位對應回數字（ㄅ→1 … ㄢ→0、全形→半形），其他字元丟掉。macOS／Windows 同一條路。
 *  2. 組字若是自己結束（compositionend）也走同一套對應。
 *  3. 手機／平板靠 inputmode="numeric|decimal" 直接彈數字鍵盤，不會碰到輸入法。
 *
 * 適用欄位：<input type="number">、inputmode="numeric"（金額）、inputmode="decimal"。
 * 寫值一律走原生 setter ＋ 派發 input 事件，所以 lantu-app.html 的 oninput／amtKey
 * 與 React 的 onChange 都照常收到。用 onchange 綁定的欄位，離開欄位時若原生 change 沒來就補一發。
 *
 * 單一來源：lantu-app.html 用 <script src="/numguard.js">，React 端由 layout 用 next/script 載入。
 * 同時掛在 window.LantuNumGuard 給測試打。
 */
(function (root) {
  'use strict';
  // 注音標準鍵盤的數字列：1ㄅ 2ㄉ 3ˇ 4ˋ 5ㄓ 6ˊ 7˙ 8ㄚ 9ㄞ 0ㄢ；「-」→ㄦ、「.」→ㄡ。
  var BPMF = {
    'ㄅ': '1', 'ㄉ': '2', 'ˇ': '3', 'ˋ': '4', 'ㄓ': '5',
    'ˊ': '6', '˙': '7', 'ㄚ': '8', 'ㄞ': '9', 'ㄢ': '0',
    'ㄦ': '-', 'ㄡ': '.', '。': '.', '．': '.', '－': '-'
  };

  function fieldKind(el) {
    if (!el || el.tagName !== 'INPUT' || el.readOnly || el.disabled) return null;
    var t = (el.getAttribute('type') || 'text').toLowerCase();
    if (t === 'number') return 'number';
    var im = (el.getAttribute('inputmode') || '').toLowerCase();
    if (im === 'numeric') return 'numeric';
    if (im === 'decimal') return 'decimal';
    return null;
  }
  function allowDot(kind) { return kind === 'number' || kind === 'decimal'; }

  /** 把輸入法吐出來的字串對應回數字。numeric（金額）不收小數點。 */
  function mapText(s, kind) {
    var out = '';
    var chars = Array.from(String(s == null ? '' : s));
    for (var i = 0; i < chars.length; i++) {
      var c = chars[i];
      var code = c.charCodeAt(0);
      if (code >= 0xFF10 && code <= 0xFF19) c = String.fromCharCode(code - 0xFF10 + 48);
      else if (BPMF[c] != null) c = BPMF[c];
      if (c >= '0' && c <= '9') out += c;
      else if (c === '.' && allowDot(kind)) out += c;
      else if (c === '-') out += c;
    }
    return out;
  }

  var nativeSet = null;
  try {
    var d = Object.getOwnPropertyDescriptor(root.HTMLInputElement.prototype, 'value');
    nativeSet = d && d.set;
  } catch { /* 非瀏覽器環境 */ }

  function setValue(el, v, caret) {
    if (nativeSet) nativeSet.call(el, v); else el.value = v;
    if (caret != null) { try { el.setSelectionRange(caret, caret); } catch { /* number 型不支援 */ } }
    el.__nfDirty = true;
    el.dispatchEvent(new root.Event('input', { bubbles: true }));
  }

  function selection(el) {
    var v = el.value, s = null, e = null;
    try { s = el.selectionStart; e = el.selectionEnd; } catch { /* number 型會丟 */ }
    if (s == null) s = v.length;
    if (e == null) e = s;
    return { v: v, s: s, e: e };
  }

  /* 組字流程：輸入法一開始組字（compositionstart）就記下「組字前的值與游標」，
     第一個組字更新（compositionupdate）一到就強制收掉組字：blur 讓輸入法交出控制權、
     用「組字前的值 ＋ 對應後的數字」覆寫、再 focus 回來。
     為什麼不在 keydown 攔：macOS Chrome 的第一個按鍵在 keydown 時看起來就是普通的「1」，
     preventDefault 也擋不住輸入法接著開組字；Windows 的輸入法更是在 keydown 之前就吃掉按鍵。
     只認組字事件，三個平台一條路。 */
  function onCompositionStart(e) {
    var el = e.target, kind = fieldKind(el);
    if (!kind) return;
    var st = selection(el);
    st.last = '';
    el.__nfComp = st;
  }
  function onCompositionUpdate(e) {
    var el = e.target, st = el.__nfComp;
    if (!st) return;
    st.last = e.data || st.last;
    if (!st.scheduled) { st.scheduled = true; root.setTimeout(function () { forceEnd(el); }, 0); }
  }
  function onCompositionEnd(e) {
    var el = e.target, st = el.__nfComp;
    if (!st) return;
    if (e.data) st.last = e.data;
    finish(el);
  }
  function finish(el) {
    var st = el.__nfComp;
    if (!st) return;
    el.__nfComp = null;
    var kind = fieldKind(el);
    if (!kind) return;
    var mapped = mapText(st.last, kind);
    setValue(el, st.v.slice(0, st.s) + mapped + st.v.slice(st.e), st.s + mapped.length);
  }
  function forceEnd(el) {
    var st = el.__nfComp;
    if (!st) return;
    var kind = fieldKind(el), mapped = mapText(st.last, kind || 'number');
    var caret = st.s + mapped.length;
    el.__nfSilent = true;            // blur 是我們自己做的，focusout 別補發 change
    try { el.blur(); } catch { /* ignore */ }
    if (el.__nfComp) finish(el);     // blur 沒帶出 compositionend 的話自己收
    try { el.focus(); } catch { /* ignore */ }
    // lantu-app.html 聚焦後會 setTimeout 全選（初值 0 的欄位打第一個字直接取代），排在它後面把游標放回去
    root.setTimeout(function () {
      el.__nfSilent = false;
      if (root.document.activeElement === el) { try { el.setSelectionRange(caret, caret); } catch { /* number 型 */ } }
    }, 0);
  }

  // 程式塞值不會讓瀏覽器在離開欄位時發原生 change；只靠 onchange 綁定的欄位會漏存，所以補發。
  function onChange(e) { if (e.target) e.target.__nfDirty = false; }
  function onFocusOut(e) {
    var el = e.target;
    if (el && el.__nfDirty && !el.__nfSilent) {
      el.__nfDirty = false;
      el.dispatchEvent(new root.Event('change', { bubbles: true }));
    }
  }
  function onEnter(e) {
    var el = e.target;
    if (e.key === 'Enter' && el && el.__nfDirty && fieldKind(el)) {
      el.__nfDirty = false;
      el.dispatchEvent(new root.Event('change', { bubbles: true }));
    }
  }

  function install(doc) {
    doc = doc || root.document;
    if (!doc || doc.__nfInstalled) return;
    doc.__nfInstalled = true;
    doc.addEventListener('keydown', onEnter, true);
    doc.addEventListener('compositionstart', onCompositionStart, true);
    doc.addEventListener('compositionupdate', onCompositionUpdate, true);
    doc.addEventListener('compositionend', onCompositionEnd, true);
    doc.addEventListener('change', onChange, true);
    doc.addEventListener('focusout', onFocusOut, true);
  }

  root.LantuNumGuard = { mapText: mapText, fieldKind: fieldKind, install: install, isComposing: function (el) { return !!(el && el.__nfComp); } };
  if (root.document) install(root.document);
})(typeof window !== 'undefined' ? window : this);
