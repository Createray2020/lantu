"use client";

import { useRef, useState } from "react";
import { saveBrandLogo, removeBrandLogo } from "./actions";

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
  const fileRef = useRef<HTMLInputElement>(null);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    setErr(null);
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

        <form
          action={async (fd) => {
            fd.set("logoUrl", logoUrl ?? "");
            fd.set("iconUrl", iconUrl ?? "");
            await saveBrandLogo(fd);
            reset();
          }}
        >
          <button
            type="submit"
            disabled={!logoUrl || !iconUrl || busy}
            className="rounded-md bg-[#c99a5b] text-[#08202a] font-bold px-4 py-1.5 text-sm disabled:opacity-40 disabled:cursor-not-allowed"
          >
            儲存並替換
          </button>
        </form>

        {(logoUrl || iconUrl) && (
          <button
            type="button"
            onClick={reset}
            className="rounded-md border border-white/20 text-[#a9bccf] px-3 py-1.5 text-sm"
          >
            取消
          </button>
        )}

        {currentLogo && !logoUrl && (
          <form action={removeBrandLogo}>
            <button
              type="submit"
              className="rounded-md border border-[#b05a4a]/60 text-[#e08a68] px-3 py-1.5 text-sm"
            >
              移除，還原預設
            </button>
          </form>
        )}
      </div>
    </section>
  );
}
