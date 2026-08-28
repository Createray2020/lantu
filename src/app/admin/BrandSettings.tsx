"use client";

import { useRef, useState, useTransition } from "react";
import { saveBrandLogo, removeBrandLogo } from "./actions";

// saveBrandLogo 會 throw（例如 missing-logo），而正式環境會把訊息換成無意義的 digest——
// 這裡把技術性代碼換成看得懂的一句話，其餘照原訊息顯示。
const MSG: Record<string, string> = {
  "missing-logo": "沒有可儲存的圖：請先選一張圖片再按儲存",
  forbidden: "只有管理員可以改品牌設定",
};
function reason(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e);
  return MSG[raw] ?? raw ?? "未知錯誤";
}

const ACCEPT = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];
const MAX_FILE = 5 * 1024 * 1024; // 5MB 原始檔上限

// 讀圖成 HTMLImageElement（含 SVG）。
function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("圖片讀取失敗"));
    };
    img.src = url;
  });
}

// 由來源圖產出：①橫式 logo（透明底，最長邊 ≤512）②512 方形 icon（深藍底置中）。
function renderBrand(img: HTMLImageElement): { logoUrl: string; iconUrl: string } {
  const w = img.naturalWidth || img.width || 512;
  const h = img.naturalHeight || img.height || 512;
  // 橫式 logo：等比縮到最長邊 512（不放大）。
  const scale = Math.min(1, 512 / Math.max(w, h));
  const lw = Math.max(1, Math.round(w * scale));
  const lh = Math.max(1, Math.round(h * scale));
  const lc = document.createElement("canvas");
  lc.width = lw;
  lc.height = lh;
  lc.getContext("2d")!.drawImage(img, 0, 0, lw, lh);
  const logoUrl = lc.toDataURL("image/png");

  // 方形 icon：512×512 深藍底，logo 置中佔 ~72%（maskable 安全區）。
  const ic = document.createElement("canvas");
  ic.width = 512;
  ic.height = 512;
  const ctx = ic.getContext("2d")!;
  ctx.fillStyle = "#0d2b45";
  ctx.fillRect(0, 0, 512, 512);
  const box = 512 * 0.72;
  const s2 = Math.min(box / w, box / h);
  const dw = w * s2;
  const dh = h * s2;
  ctx.drawImage(img, (512 - dw) / 2, (512 - dh) / 2, dw, dh);
  const iconUrl = ic.toDataURL("image/png");
  return { logoUrl, iconUrl };
}

export default function BrandSettings({ currentLogo }: { currentLogo: string | null }) {
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [iconUrl, setIconUrl] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // 這一頁是後台唯一沒有存檔回饋的頁：按下去畫面完全沒變化，分不出「存好了」還是「壞了」。
  // 照 CategoriesBoard 的 run() 模式補上。
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  function run(fn: () => Promise<void>, okText: string, after?: () => void) {
    setMsg(null);
    start(async () => {
      try {
        await fn();
        setMsg({ ok: true, text: okText });
        after?.();
      } catch (e) {
        setMsg({ ok: false, text: reason(e) });
      }
    });
  }

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    setErr(null);
    setMsg(null);
    const file = e.target.files?.[0];
    if (!file) return;
    if (!ACCEPT.includes(file.type)) {
      setErr("格式僅接受 PNG／JPG／WebP／SVG");
      return;
    }
    if (file.size > MAX_FILE) {
      setErr("檔案過大（上限 5MB）");
      return;
    }
    setBusy(true);
    try {
      const img = await loadImage(file);
      const out = renderBrand(img);
      // 伺服器端上限 ~3.5MB base64；這裡先擋。
      if (out.logoUrl.length > 3_400_000 || out.iconUrl.length > 3_400_000) {
        setErr("處理後圖片仍過大，請換一張較單純的圖");
        setLogoUrl(null);
        setIconUrl(null);
      } else {
        setLogoUrl(out.logoUrl);
        setIconUrl(out.iconUrl);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "處理失敗");
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setLogoUrl(null);
    setIconUrl(null);
    setErr(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <section className="mt-8 rounded-xl border border-white/10 bg-[#0d2b45]/40 p-5 max-w-4xl">
      <div className="flex items-center gap-3 mb-1">
        <h2 className="text-lg font-bold">品牌 Logo</h2>
        <span className="text-xs text-[#a9bccf]">全組織共用 · 套用到頂欄、報告書、分頁 icon 與 PWA 安裝圖示</span>
      </div>
      <p className="text-xs text-[#6f869c] mb-4">
        上傳後即時替換所有人看到的 Logo；未上傳時顯示嵐途預設標記。建議用去背 PNG，寬高比不限（系統自動產出橫式與方形兩種）。
      </p>

      <div className="flex flex-wrap items-start gap-6">
        {/* 目前 */}
        <div className="flex flex-col gap-2">
          <span className="text-xs text-[#a9bccf]">目前</span>
          <div className="w-40 h-20 rounded-lg border border-white/10 bg-gradient-to-r from-[#081a2b] to-[#0d2b45] flex items-center justify-center overflow-hidden">
            {currentLogo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={currentLogo} alt="目前 Logo" className="max-h-14 max-w-[140px] object-contain" />
            ) : (
              <span className="text-[#6f869c] text-xs">嵐途預設標記</span>
            )}
          </div>
        </div>

        {/* 預覽新的 */}
        {logoUrl && (
          <div className="flex flex-col gap-2">
            <span className="text-xs text-[#e0bd8b]">預覽（新）</span>
            <div className="flex items-center gap-3">
              <div className="w-40 h-20 rounded-lg border border-[#c99a5b]/40 bg-gradient-to-r from-[#081a2b] to-[#0d2b45] flex items-center justify-center overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={logoUrl} alt="新 Logo 預覽" className="max-h-14 max-w-[140px] object-contain" />
              </div>
              {iconUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={iconUrl} alt="icon 預覽" className="w-14 h-14 rounded-lg border border-[#c99a5b]/40" title="分頁 / PWA icon" />
              )}
            </div>
          </div>
        )}
      </div>

      {err && <p className="mt-3 text-xs text-[#e08a68]">{err}</p>}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <input
          ref={fileRef}
          type="file"
          accept={ACCEPT.join(",")}
          onChange={onPick}
          disabled={busy}
          className="text-xs text-[#a9bccf] file:mr-3 file:rounded-md file:border-0 file:bg-[#12334f] file:px-3 file:py-1.5 file:text-[#e0bd8b] file:font-bold file:cursor-pointer"
        />
        {busy && <span className="text-xs text-[#a9bccf]">處理中…</span>}

        <button
          type="button"
          disabled={!logoUrl || !iconUrl || busy || pending}
          onClick={() => {
            const fd = new FormData();
            fd.set("logoUrl", logoUrl ?? "");
            fd.set("iconUrl", iconUrl ?? "");
            run(() => saveBrandLogo(fd), "已儲存", reset);
          }}
          className="rounded-md bg-[#c99a5b] text-[#08202a] font-bold px-4 py-1.5 text-sm disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {pending ? "儲存中…" : "儲存並替換"}
        </button>

        {(logoUrl || iconUrl) && (
          <button
            type="button"
            onClick={reset}
            disabled={pending}
            className="rounded-md border border-white/20 text-[#a9bccf] px-3 py-1.5 text-sm disabled:opacity-40"
          >
            取消
          </button>
        )}

        {currentLogo && !logoUrl && (
          <button
            type="button"
            disabled={pending}
            // 這一顆影響全組織每一個人看到的 Logo，而且沒有復原鍵——按錯就要重新上傳原圖。
            onClick={() => {
              if (confirm("移除後全組織會回到嵐途預設標記，確定？")) {
                run(() => removeBrandLogo(), "已移除，已還原成嵐途預設標記");
              }
            }}
            className="rounded-md border border-[#b05a4a]/60 text-[#e08a68] px-3 py-1.5 text-sm disabled:opacity-40"
          >
            移除，還原預設
          </button>
        )}

        {msg && (
          <span className={`text-sm ${msg.ok ? "text-[#6f8f74]" : "text-[#e08a7a]"}`}>
            {msg.ok ? `${msg.text} ✓` : `儲存失敗：${msg.text}`}
          </span>
        )}
      </div>
    </section>
  );
}
