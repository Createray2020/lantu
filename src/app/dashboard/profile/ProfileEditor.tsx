"use client";

// 教練自填的公開檔案。
// 這一頁的內容會直接出現在官網 /coaches 與客戶選教練的畫面上，
// 所以右邊常駐一張「客戶會看到的樣子」預覽——填的時候就看得到成品，
// 比填完再去別頁確認可靠得多。

import { useMemo, useRef, useState, useTransition } from "react";
import SubmitButton from "@/components/ui/SubmitButton";
import { FIELD_EMPTY, FIELD_SM } from "@/components/ui/Field";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { saveMyProfileAction } from "./actions";
import { DISPLAY_NAME_MAX } from "@/lib/coachName";
import PhotoCropper, { type CropSource } from "./PhotoCropper";
import CoachCard from "@/components/CoachCard";
import SpecialtyChip from "@/components/SpecialtyChip";

const INPUT = FIELD_SM;
const EMPTY = FIELD_EMPTY;
const BTN = "rounded-lg px-3 py-1.5 text-sm border border-line2 text-tx2 hover:bg-panel3 disabled:opacity-40";

const ACCEPT = ["image/png", "image/jpeg", "image/webp"];
const MAX_FILE = 8 * 1024 * 1024;

export type ProfileForm = {
  headline: string;
  bio: string;
  specialties: string[];
  photoUrl: string | null;
  yearsExp: string;
  prevRole: string;
  credentials: string[];
  serviceModes: string[];
  areas: string[];
  /** 教練自己選擇不要把資料放上官網（2026/08/24）。 */
  selfHidden: boolean;
  /** 對外顯示名稱。留空＝沿用登入姓名（2026/08/24）。 */
  displayName: string;
};

/** 讀成 dataURL 再建 Image，裁切期間都用同一個 src，不必管 objectURL 的回收時機。 */
function loadImage(file: File): Promise<CropSource> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = () => reject(new Error("圖片讀取失敗"));
    fr.onload = () => {
      const url = String(fr.result);
      const img = new Image();
      img.onload = () => resolve({
        url, img,
        w: img.naturalWidth || img.width,
        h: img.naturalHeight || img.height,
      });
      img.onerror = () => reject(new Error("圖片讀取失敗"));
      img.src = url;
    };
    fr.readAsDataURL(file);
  });
}

export default function ProfileEditor({
  initial, specialtyOptions, coachName, loginName, rankLabel, published,
}: {
  initial: ProfileForm;
  specialtyOptions: string[];
  /** 目前實際會顯示的名字（自填優先）。預覽卡吃它。 */
  coachName: string;
  /** 登入帳號的姓名（Clerk）。當作姓名欄留空時的 placeholder。 */
  loginName: string;
  /** 對外職級。官網卡片印的就是它，預覽必須一致（所見即所得不是靠人工同步）。 */
  rankLabel: string | null;
  /** 管理員的下架狀態（教練改不了，只用來顯示提示）。 */
  published: boolean;
}) {
  const router = useRouter();
  const [f, setF] = useState<ProfileForm>(initial);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [photoErr, setPhotoErr] = useState<string | null>(null);
  const [crop, setCrop] = useState<CropSource | null>(null);
  const [pending, start] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const set = <K extends keyof ProfileForm>(k: K, v: ProfileForm[K]) =>
    setF((s) => ({ ...s, [k]: v }));

  // 專長已改成「可排序清單」（見 SpecialtyPicker），這裡只剩服務方式在用。
  const toggle = (k: "serviceModes", v: string) =>
    setF((s) => ({
      ...s,
      [k]: s[k].includes(v) ? s[k].filter((x) => x !== v) : [...s[k], v],
    }));

  const dirty = useMemo(() => JSON.stringify(f) !== JSON.stringify(initial), [f, initial]);

  async function onPickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    setPhotoErr(null);
    const file = e.target.files?.[0];
    if (!file) return;
    if (!ACCEPT.includes(file.type)) { setPhotoErr("格式僅接受 PNG／JPG／WebP"); return; }
    if (file.size > MAX_FILE) { setPhotoErr("原始檔太大（上限 8MB）"); return; }
    try {
      setCrop(await loadImage(file));
    } catch (err) {
      setPhotoErr(err instanceof Error ? err.message : "照片處理失敗");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function save() {
    setMsg(null);
    start(async () => {
      const r = await saveMyProfileAction({
        headline: f.headline, bio: f.bio, specialties: f.specialties,
        photoUrl: f.photoUrl,
        yearsExp: f.yearsExp === "" ? null : Number(f.yearsExp),
        prevRole: f.prevRole, credentials: f.credentials,
        serviceModes: f.serviceModes, areas: f.areas,
        selfHidden: f.selfHidden,
        displayName: f.displayName,
      });
      setMsg(r.ok
        ? { ok: true, text: f.selfHidden ? "已儲存，你的檔案不會出現在官網" : "已儲存，官網會立即更新" }
        : { ok: false, text: r.error });
      if (r.ok) router.refresh();
    });
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
      {crop && (
        <PhotoCropper
          src={crop}
          onCancel={() => setCrop(null)}
          onDone={(url) => { set("photoUrl", url); setCrop(null); }}
        />
      )}
      {/* 編輯 */}
      <div className="space-y-4">
        {!published && (
          <div className="rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
            你的檔案目前被管理員下架，不會出現在官網。內容仍可編輯。
          </div>
        )}

        {/* 教練自己的隱藏開關。跟上面那條管理員下架是兩回事：
            勾這個是自己的決定、存檔就生效；被管理員下架的話勾不勾都不會出現在官網。 */}
        <div className="rounded-xl border border-line bg-panel p-4 shadow-e1">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={f.selfHidden}
              disabled={pending}
              onChange={(e) => set("selfHidden", e.target.checked)}
              className="mt-0.5 w-4 h-4 accent-brand shrink-0"
            />
            <span>
              <span className="text-sm font-bold">不要把我的資料放上官網</span>
              <span className="block text-xs text-tx2 mt-1 leading-relaxed">
                勾選後，你不會出現在官網的教練頁，客戶也無法在那裡挑到你。
                <b className="text-brand2">你的教練編號照常有效</b>——
                已經拿到編號的客戶還是可以指定你，一樣要你按接受才會掛上。
              </span>
            </span>
          </label>
          {f.selfHidden && !published && (
            <p className="text-11 text-danger mt-2">
              （你的檔案本來就已經被管理員下架，取消勾選也不會出現在官網。）
            </p>
          )}
        </div>

        <div className="rounded-xl border border-line bg-panel p-4 space-y-3 shadow-e1">
          <h2 className="text-sm font-bold border-l-[3px] border-brand pl-2">顯示名稱</h2>
          <label className="block">
            <input
              value={f.displayName}
              disabled={pending}
              maxLength={DISPLAY_NAME_MAX}
              onChange={(e) => set("displayName", e.target.value)}
              placeholder={loginName || "你的名字"}
              className={`${f.displayName ? INPUT : EMPTY} w-full`}
            />
            <span className="block text-11 text-tx3 mt-1.5 leading-relaxed">
              這是<b className="text-tx2">全站</b>會顯示的名字——官網教練頁、工作台、組織表、客戶看到的都是它。
              留空就沿用登入帳號的姓名{loginName ? `（${loginName}）` : ""}。
              改這裡<b className="text-tx2">不會</b>動到你的登入帳號，最多 {DISPLAY_NAME_MAX} 個字。
            </span>
          </label>
        </div>

        <div className="rounded-xl border border-line bg-panel p-4 space-y-3 shadow-e1">
          <h2 className="text-sm font-bold border-l-[3px] border-brand pl-2">大頭照</h2>
          <div className="flex items-center gap-4">
            {f.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={f.photoUrl} alt="大頭照" className="w-24 h-24 rounded-xl object-cover border border-line2" />
            ) : (
              <div className="w-24 h-24 rounded-xl border border-dashed border-line2 grid place-items-center text-xs text-tx3">
                未上傳
              </div>
            )}
            <div className="space-y-2">
              <input ref={fileRef} type="file" accept={ACCEPT.join(",")} disabled={pending}
                onChange={onPickPhoto}
                className="text-xs text-tx2 file:mr-2 file:rounded-lg file:border file:border-line2 file:bg-transparent file:px-3 file:py-1.5 file:text-tx2" />
              <p className="text-11 text-tx3">
                選好照片後可以拖曳、縮放決定要框哪一塊，再裁成正方形壓縮。清楚的正面照最有效。
              </p>
              {f.photoUrl && (
                <button type="button" className={BTN} disabled={pending}
                  onClick={() => set("photoUrl", null)}>移除照片</button>
              )}
            </div>
          </div>
          {photoErr && <p className="text-sm text-danger">{photoErr}</p>}
        </div>

        <div className="rounded-xl border border-line bg-panel p-4 space-y-3 shadow-e1">
          <h2 className="text-sm font-bold border-l-[3px] border-brand pl-2">你想讓客戶第一眼看到什麼</h2>
          <label className="block">
            <span className="block text-xs text-tx2 mb-1">一句話標語</span>
            <input value={f.headline} disabled={pending} maxLength={60}
              onChange={(e) => set("headline", e.target.value)}
              placeholder="例：陪你把每一筆錢，放到它該去的地方"
              className={`${f.headline ? INPUT : EMPTY} w-full`} />
            <span className="block text-11 text-tx3 mt-0.5">{f.headline.length}/60</span>
          </label>
          <label className="block">
            <span className="block text-xs text-tx2 mb-1">自我介紹</span>
            <textarea rows={7} value={f.bio} disabled={pending} maxLength={1000}
              onChange={(e) => set("bio", e.target.value)}
              placeholder={"你為什麼做這一行、擅長陪什麼樣的人、合作起來會是什麼感覺。\n寫給看不懂財務術語的人看。"}
              className={`${f.bio ? INPUT : EMPTY} w-full leading-relaxed`} />
            <span className="block text-11 text-tx3 mt-0.5">{f.bio.length}/1000</span>
          </label>
        </div>

        <div className="rounded-xl border border-line bg-panel p-4 space-y-3 shadow-e1">
          <h2 className="text-sm font-bold border-l-[3px] border-brand pl-2">專長領域</h2>
          <SpecialtyPicker
            options={specialtyOptions}
            value={f.specialties}
            disabled={pending}
            onChange={(v) => set("specialties", v)}
          />
          <p className="text-11 text-tx3">
            專長同時用於客戶選教練，以及公司派案時挑選合適人選。
          </p>
        </div>

        <div className="rounded-xl border border-line bg-panel p-4 space-y-3 shadow-e1">
          <h2 className="text-sm font-bold border-l-[3px] border-brand pl-2">經歷與服務方式</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="block text-xs text-tx2 mb-1">從業年資</span>
              <input type="number" min={0} max={80} value={f.yearsExp} disabled={pending}
                onChange={(e) => set("yearsExp", e.target.value)} placeholder="未填"
                className={`${f.yearsExp ? INPUT : EMPTY} w-28`} />
            </label>
            <label className="block">
              <span className="block text-xs text-tx2 mb-1">背景／前一份工作</span>
              <input value={f.prevRole} disabled={pending} maxLength={60}
                onChange={(e) => set("prevRole", e.target.value)} placeholder="例：銀行理財專員 8 年"
                className={`${f.prevRole ? INPUT : EMPTY} w-full`} />
            </label>
          </div>
          <ListField label="證照" hint="一行一項，例：CFP、AFP、投信投顧業務員"
            value={f.credentials} disabled={pending}
            onChange={(v) => set("credentials", v)} />
          <div>
            <span className="block text-xs text-tx2 mb-1">服務方式</span>
            <div className="flex flex-wrap gap-2">
              {["線上", "實體"].map((m) => {
                const on = f.serviceModes.includes(m);
                return (
                  <button key={m} type="button" disabled={pending}
                    onClick={() => toggle("serviceModes", m)}
                    className={`rounded-full px-3 py-1.5 text-xs border ${
                      on ? "bg-brand text-onbrand border-brand font-bold"
                         : "border-line2 text-tx2 hover:border-line2"
                    }`}>
                    {m}
                  </button>
                );
              })}
            </div>
          </div>
          <ListField label="服務地區" hint="一行一項，例：台北、新北、線上不限"
            value={f.areas} disabled={pending} onChange={(v) => set("areas", v)} />
        </div>

        <div className="flex items-center gap-3">
          <SubmitButton type="button" disabled={pending || !dirty} onClick={save}
          state={pending ? "pending" : "idle"}
          pendingLabel="儲存中…"
        >
          儲存並公開
        </SubmitButton>
          <Link href="/coaches" className={BTN}>看官網上的樣子 →</Link>
          {msg && (
            <span className={`text-sm ${msg.ok ? "text-ok" : "text-danger"}`}>
              {msg.ok ? `${msg.text} ✓` : `儲存失敗：${msg.text}`}
            </span>
          )}
        </div>
      </div>

      {/* 預覽 */}
      <div className="lg:sticky lg:top-4 h-fit">
        <div className="text-xs text-tx2 mb-2">客戶會看到的樣子</div>
        <CoachCard
          name={f.displayName.trim() || loginName || coachName} rankLabel={rankLabel}
          headline={f.headline} bio={f.bio} specialties={f.specialties}
          photoUrl={f.photoUrl}
          yearsExp={f.yearsExp === "" ? null : Number(f.yearsExp)}
          prevRole={f.prevRole} credentials={f.credentials}
          serviceModes={f.serviceModes} areas={f.areas}
        />
      </div>
    </div>
  );
}

function ListField({
  label, hint, value, disabled, onChange,
}: {
  label: string; hint: string; value: string[]; disabled: boolean;
  onChange: (v: string[]) => void;
}) {
  return (
    <label className="block">
      <span className="block text-xs text-tx2 mb-1">{label}</span>
      <textarea rows={Math.max(2, value.length + 1)} value={value.join("\n")} disabled={disabled}
        onChange={(e) => onChange(e.target.value.split("\n").map((x) => x.trim()).filter(Boolean))}
        placeholder={hint}
        className={`${value.length ? INPUT : EMPTY} w-full leading-snug`} />
    </label>
  );
}

/**
 * 專長領域：可排序的已選清單 ＋ 可加入的候選清單。
 *
 * 為什麼要排序：官網首頁的臉孔牆只印得下**一個**專長，印的是 `specialties[0]`。
 * 改版前這個「第一個」等於教練當初勾選的先後順序，教練自己看不到、也改不了——
 * 等於首頁替他決定了對外的第一印象（Ray 2026/09/07 回報）。
 * 現在排第一個就是主專長，卡片與首頁都用專屬顏色把它點出來。
 *
 * ⚠️ 已選清單直接來自 `value`（教練存過的值），不是從 `options` 過濾出來的——
 *    公司之後把某個專長從制度清單移掉時，教練身上的舊值仍要看得見、拖得動、移得掉。
 *    改成 `options.filter(o => value.includes(o))` 會讓那些值在畫面上人間蒸發，
 *    但存檔時又原封不動寫回去，而且完全不噴錯。
 */
function SpecialtyPicker({
  options, value, disabled, onChange,
}: {
  options: string[]; value: string[]; disabled: boolean;
  onChange: (v: string[]) => void;
}) {
  const [from, setFrom] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const rest = options.filter((o) => !value.includes(o));

  const move = (i: number, j: number) => {
    if (i === j || j < 0 || j >= value.length) return;
    const next = [...value];
    const [x] = next.splice(i, 1);
    next.splice(j, 0, x);
    onChange(next);
  };

  if (options.length === 0 && value.length === 0) {
    return (
      <p className="text-xs text-brand2">
        公司還沒設定專長清單。請管理員到「業務制度 › 個案認定與結案 › 專長領域清單」設定。
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <div className="text-xs text-tx2 mb-1.5">
          已選（拖曳調整順序，<b className="text-tx">排第一個的就是主專長</b>）
        </div>
        {value.length === 0 ? (
          <p className="text-11 text-tx3 border border-dashed border-line2 rounded-lg px-3 py-2">
            還沒選專長。從下面點一個加進來，第一個加進來的就是主專長。
          </p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {value.map((s, i) => {
              const stale = options.length > 0 && !options.includes(s);
              return (
                <li
                  key={s}
                  draggable={!disabled}
                  onDragStart={(e) => {
                    setFrom(i);
                    e.dataTransfer.effectAllowed = "move";
                    // ⚠️ 一定要 setData：Chrome 沒有它也拖得動，但 Firefox / Safari 會直接不啟動拖曳。
                    // 值本身用不到（順序靠 state 的 from），但這個呼叫不能省。
                    try { e.dataTransfer.setData("text/plain", String(i)); } catch { /* 舊瀏覽器可能擋 */ }
                  }}
                  onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setOver(i); }}
                  onDragLeave={() => setOver((o) => (o === i ? null : o))}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (from !== null) move(from, i);
                    setFrom(null); setOver(null);
                  }}
                  onDragEnd={() => { setFrom(null); setOver(null); }}
                  className={
                    "flex items-center gap-0.5 rounded-full border px-1 py-0.5 cursor-grab active:cursor-grabbing " +
                    (over === i && from !== null && from !== i ? "border-brand " : "border-line2 ") +
                    (from === i ? "opacity-50" : "")
                  }
                >
                  {/* 拖曳在手機與鍵盤上都不成立，所以 ←／→ 不是裝飾，是唯一的備援途徑。 */}
                  <button type="button" disabled={disabled || i === 0}
                    onClick={() => move(i, i - 1)}
                    aria-label={`${s} 往前一位`} title="往前一位"
                    className="px-1 text-tx3 hover:text-tx disabled:opacity-25">←</button>
                  <SpecialtyChip name={s} primary={i === 0} className="px-2.5 py-1 text-xs"
                    title={i === 0 ? "主專長：官網首頁與教練卡片會用這個顏色點出來" : undefined} />
                  {stale && (
                    <span className="text-10 text-warn px-0.5"
                      title="這個專長已不在公司的專長清單裡。移除之後就加不回來了。">舊</span>
                  )}
                  <button type="button" disabled={disabled || i === value.length - 1}
                    onClick={() => move(i, i + 1)}
                    aria-label={`${s} 往後一位`} title="往後一位"
                    className="px-1 text-tx3 hover:text-tx disabled:opacity-25">→</button>
                  <button type="button" disabled={disabled}
                    onClick={() => onChange(value.filter((x) => x !== s))}
                    aria-label={`移除 ${s}`} title="移除"
                    className="px-1 text-tx3 hover:text-danger">×</button>
                </li>
              );
            })}
          </ul>
        )}
        <p className="text-11 text-tx3 mt-1.5">
          手機上拖不動時用 ← → 調整。主專長會出現在官網首頁的教練臉孔牆上，並用專屬顏色標示。
        </p>
      </div>

      {rest.length > 0 && (
        <div>
          <div className="text-xs text-tx2 mb-1.5">可加入</div>
          <div className="flex flex-wrap gap-2">
            {rest.map((s) => (
              <button key={s} type="button" disabled={disabled}
                onClick={() => onChange([...value, s])}
                className="rounded-full px-3 py-1.5 text-xs border border-line2 text-tx2 hover:border-brand hover:text-tx disabled:opacity-40">
                ＋ {s}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
