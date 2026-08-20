"use client";

// 大頭照裁切：選完照片先進這裡拖曳／縮放決定要框哪一塊，再輸出 400px 正方形。
//
// 原本是直接取中央硬裁——人站左邊、或半身照頭在上方時，臉會被切掉。
// 預覽用 CSS 定位、輸出用 canvas，兩邊吃同一組 (zoom, ox, oy)，所以看到什麼就存到什麼。

import { useRef, useState } from "react";

const VIEW = 320;   // 預覽視窗邊長（CSS px）
const OUT = 400;    // 輸出邊長
const MAX_ZOOM = 4;

export type CropSource = { url: string; w: number; h: number; img: HTMLImageElement };

/** 把裁切結果畫成 JPEG dataURL，逐步降品質壓到 300KB 以內（這串會跟著公開列表送給每個訪客）。 */
export function renderCrop(src: CropSource, zoom: number, ox: number, oy: number): string {
  const base = VIEW / Math.min(src.w, src.h);
  const s = base * zoom;
  const sSide = VIEW / s;
  const sx = -ox / s;
  const sy = -oy / s;

  const c = document.createElement("canvas");
  c.width = OUT;
  c.height = OUT;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#0d2b45";
  ctx.fillRect(0, 0, OUT, OUT);
  ctx.drawImage(src.img, sx, sy, sSide, sSide, 0, 0, OUT, OUT);

  for (const q of [0.82, 0.7, 0.6, 0.5, 0.4]) {
    const url = c.toDataURL("image/jpeg", q);
    if (url.length <= 300_000) return url;
  }
  throw new Error("照片壓縮後仍過大，請換一張");
}

export default function PhotoCropper({
  src, onCancel, onDone,
}: {
  src: CropSource;
  onCancel: () => void;
  onDone: (dataUrl: string) => void;
}) {
  const base = VIEW / Math.min(src.w, src.h);
  const [zoom, setZoom] = useState(1);
  // 起始位置＝置中（等同舊行為），使用者要移再移
  const initial = () => ({
    x: (VIEW - src.w * base) / 2,
    y: (VIEW - src.h * base) / 2,
  });
  const [off, setOff] = useState(initial);
  const [err, setErr] = useState<string | null>(null);
  const drag = useRef<{ px: number; py: number; ox: number; oy: number } | null>(null);

  const dispW = src.w * base * zoom;
  const dispH = src.h * base * zoom;

  // 夾住：圖片永遠要蓋滿整個視窗，不留空邊
  const clamp = (x: number, y: number) => ({
    x: Math.min(0, Math.max(VIEW - dispW, x)),
    y: Math.min(0, Math.max(VIEW - dispH, y)),
  });

  function onPointerDown(e: React.PointerEvent) {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { px: e.clientX, py: e.clientY, ox: off.x, oy: off.y };
  }
  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    setOff(clamp(d.ox + (e.clientX - d.px), d.oy + (e.clientY - d.py)));
  }
  function onPointerUp() { drag.current = null; }

  // 以視窗中心為錨點縮放，手感才不會跑掉
  function setZoomAnchored(z: number) {
    const nz = Math.min(MAX_ZOOM, Math.max(1, z));
    const k = nz / zoom;
    const nx = VIEW / 2 - (VIEW / 2 - off.x) * k;
    const ny = VIEW / 2 - (VIEW / 2 - off.y) * k;
    const nw = src.w * base * nz, nh = src.h * base * nz;
    setZoom(nz);
    setOff({
      x: Math.min(0, Math.max(VIEW - nw, nx)),
      y: Math.min(0, Math.max(VIEW - nh, ny)),
    });
  }

  function confirm() {
    try {
      onDone(renderCrop(src, zoom, off.x, off.y));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "照片處理失敗");
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" role="presentation">
      <div className="w-full max-w-md rounded-xl border border-white/15 bg-[#0c2135] p-5 text-[#eef2f7]">
        <div className="mb-1 font-serif text-lg tracking-[0.08em]">調整大頭照</div>
        <p className="mb-3 text-[12px] text-[#8fa6ba]">拖曳移動、下方滑桿縮放；框內的範圍就是客戶會看到的樣子。</p>

        <div
          className="relative mx-auto overflow-hidden rounded-xl border border-white/15 bg-[#0d2b45] touch-none select-none cursor-grab active:cursor-grabbing"
          style={{ width: VIEW, height: VIEW }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src.url}
            alt="裁切預覽"
            draggable={false}
            className="absolute max-w-none"
            style={{ width: dispW, height: dispH, left: off.x, top: off.y }}
          />
          {/* 安全框：提醒中間這塊一定在畫面內 */}
          <div className="pointer-events-none absolute inset-0 rounded-xl ring-1 ring-inset ring-white/20" />
          <div className="pointer-events-none absolute inset-[12%] rounded-lg border border-dashed border-[#c99a5b]/50" />
        </div>

        <div className="mt-3 flex items-center gap-3">
          <span className="text-[12px] text-[#a7bacb]">縮放</span>
          <input
            type="range" min={1} max={MAX_ZOOM} step={0.01} value={zoom}
            onChange={(e) => setZoomAnchored(parseFloat(e.target.value))}
            className="flex-1 accent-[#c99a5b]"
          />
          <span className="w-10 text-right text-[12px] tabular-nums text-[#e0bd8b]">{zoom.toFixed(1)}×</span>
        </div>

        {err && <p className="mt-2 text-sm text-[#e08b7a]">{err}</p>}

        <div className="mt-4 flex items-center gap-2">
          <button type="button"
            onClick={() => { setZoom(1); setOff(initial()); }}
            className="rounded-lg border border-white/15 px-3 py-1.5 text-sm text-[#a9bccf] hover:bg-[#17406a]">
            重設
          </button>
          <div className="flex-1" />
          <button type="button" onClick={onCancel}
            className="rounded-lg border border-white/15 px-3 py-1.5 text-sm text-[#a9bccf] hover:bg-[#17406a]">
            取消
          </button>
          <button type="button" onClick={confirm}
            className="rounded-lg bg-[#c99a5b] px-4 py-2 text-sm font-bold text-[#08202a] hover:bg-[#e0bd8b]">
            使用這個範圍
          </button>
        </div>
      </div>
    </div>
  );
}
