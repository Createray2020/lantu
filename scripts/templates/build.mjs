// 步驟 1：把 cases.ts 的四份個案送進 public/lantu-app.html 的 migrateCase()，
// 再用同一個瀏覽器實地走過每一個分頁與報告書，最後輸出 scripts/templates/built.json。
//
// ⚠️ 為什麼一定要走瀏覽器：migrateCase／syncPremium 只存在於 lantu-app.html，engine.ts 沒有這兩支。
//    沒過這一關的個案，保單保費不會投影進支出表、健保費也不會有那一列——
//    教練打開示範範本第一眼看到的「保費支出比 0%」會是紅字，而那是假的。
//
// ⚠️ 為什麼用 http 不用 file://：file:// 的 location.origin 是 'file://'，
//    但收件端 window 的 origin 是 'null'，postMessage 會被瀏覽器擋掉，
//    embed 模式的握手永遠不會完成，1.5 秒後畫面被換成「資料載入逾時」——
//    而截圖與檢查會若無其事地通過。
//
//   用法：node scripts/templates/build.mjs
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join } from "node:path";
import { execFileSync } from "node:child_process";
import { chromium } from "playwright";

const ROOT = process.cwd();
const HERE = join(ROOT, "scripts/templates");
const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium";

// cases.ts 是 TypeScript 且 import 了引擎，交給 tsx 產出純 JSON 再讀進來。
execFileSync("npx", ["tsx", join(HERE, "dump.ts")], { stdio: "inherit", cwd: ROOT });
const cases = JSON.parse(readFileSync(join(HERE, "raw.json"), "utf8"));

const srv = createServer((req, res) => {
  const f = "public" + decodeURIComponent(req.url.split("?")[0]);
  // ⚠️ 先讀檔再送標頭：反過來的話，讀檔失敗時標頭已經送出去了，
  //    catch 裡的 writeHead(404) 會直接讓整個 process 掛掉（ERR_HTTP_HEADERS_SENT）。
  let body;
  try {
    body = readFileSync(f);
  } catch {
    res.writeHead(404);
    res.end("no");
    return;
  }
  res.writeHead(200, {
    "Content-Type": extname(f) === ".html" ? "text/html; charset=utf-8" : "application/octet-stream",
  });
  res.end(body);
});
await new Promise((r) => srv.listen(0, "127.0.0.1", r));
const BASE = `http://127.0.0.1:${srv.address().port}`;

const browser = await chromium.launch({ executablePath: CHROME });
mkdirSync(join(HERE, "shots"), { recursive: true });
const out = [];
let fail = 0;

for (const item of cases) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errs = [];
  page.on("pageerror", (e) => errs.push("pageerror: " + String(e).slice(0, 200)));
  page.on("console", (m) => {
    const x = m.text();
    // 測試伺服器只服務 public/，/api/* 一定 404 —— 那是測試環境，不是缺陷。
    if (m.type() === "error" && !/CORS|ERR_FAILED|Failed to load resource/.test(x)) {
      errs.push("console: " + x.slice(0, 200));
    }
  });
  await page.goto(`${BASE}/lantu-app.html?embed=1`);
  await page.waitForFunction(() => typeof window.render === "function", null, { timeout: 15000 });

  // 走正式握手（不要直接塞 app.cases，見檔頭）
  await page.evaluate((data) => {
    window.postMessage(
      {
        type: "lantu:init", data, uiScale: 100, readOnly: true,
        readOnlyNote: "示範範本（唯讀）", clientCode: null,
        notes: [], session: null, past: [], noteAccess: "none",
      },
      location.origin,
    );
  }, item.data);
  await page.waitForFunction(() => !!(window.app && window.app.cases && window.app.cases.length), null, { timeout: 10000 });
  await page.waitForTimeout(300);

  const tabs = await page.evaluate(() =>
    Array.from(document.querySelectorAll("[data-tab]")).map((b) => b.getAttribute("data-tab")),
  );
  const seen = [];
  for (const tab of tabs) {
    await page.evaluate((x) => { window.app.activeTab = x; window.render(); }, tab);
    await page.waitForTimeout(80);
    const len = await page.evaluate(() => (document.querySelector(".main") || document.body).innerText.length);
    seen.push(`${tab}:${len}`);
    if (len < 200) errs.push(`分頁 ${tab} 幾乎是空的（${len} 字）`);
    if (tab !== "data") continue;
    // 資料頁還有一層子分頁（地基層五個；企業主體開啟時追加三個；必達目標再追加）
    const subs = await page.evaluate(() =>
      window.baseTabsOf(window.activeCase()).map((b) => b[0])
        .concat((((window.activeCase().intent || {}).mustHave) || [])
          .map((t) => (window.targetMeta(t) || [])[1]).filter(Boolean)));
    for (const sub of subs) {
      await page.evaluate((x) => { window.app.dataTab = x; window.render(); }, sub);
      await page.waitForTimeout(80);
      const n2 = await page.evaluate(() => (document.querySelector(".main") || document.body).innerText.length);
      seen.push(`  ${sub}:${n2}`);
      if (n2 < 200) errs.push(`子分頁 ${sub} 幾乎是空的（${n2} 字）`);
    }
  }

  // 報告書：三份可交付文件裡最長的一份，資料不全時最先炸。
  const rep = await page.evaluate(() => {
    try { return { len: window.reportHTML(window.activeCase()).length, err: null }; }
    catch (e) { return { len: 0, err: String(e).slice(0, 300) }; }
  });
  if (rep.err) errs.push("reportHTML 例外：" + rep.err);
  if (rep.len < 5000) errs.push("reportHTML 太短：" + rep.len);

  await page.evaluate(() => { window.app.activeTab = "analysis"; window.render(); });
  await page.waitForTimeout(200);
  await page.screenshot({ path: join(HERE, `shots/${item.key}-analysis.png`) });

  const r = await page.evaluate(() => {
    const c = window.activeCase();
    const m = window.metrics(c);
    return {
      data: c, net: m.net, expTotal: m.expTotal, grade: window.health(c).grade,
      autoRows: (c.expenses || []).filter((e) => e.premAuto || e.nhiAuto).map((e) => ({ name: e.name, amount: e.amount })),
    };
  });
  out.push({ key: item.key, name: item.name, label: item.label, lifeStage: item.lifeStage, data: r.data });

  console.log(`${errs.length ? "✗" : "✓"} ${item.name}　${r.grade}　淨值 ${Math.round(r.net).toLocaleString()}　年支 ${Math.round(r.expTotal).toLocaleString()}　報告書 ${rep.len} 字`);
  console.log(`   自動列：${r.autoRows.map((x) => `${x.name} ${Math.round(x.amount).toLocaleString()}`).join(" ｜ ") || "（無）"}`);
  console.log(`   分頁：${seen.join("  ")}`);
  if (errs.length) { fail++; errs.slice(0, 8).forEach((e) => console.log("   ⚠️ " + e)); }
  await page.close();
}

await browser.close();
srv.close();

if (fail) {
  console.log(`\n${fail} 份有問題——不寫 built.json，先把上面的問題修掉。`);
  process.exit(1);
}
writeFileSync(join(HERE, "built.json"), JSON.stringify(out));
console.log("\n四份都乾淨 → scripts/templates/built.json（接著跑 npx tsx scripts/templates/seed.ts）");
