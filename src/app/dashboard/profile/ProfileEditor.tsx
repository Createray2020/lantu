"use client";

// 教練自填的公開檔案。
// 這一頁的內容會直接出現在官網 /coaches 與客戶選教練的畫面上，
// 所以右邊常駐一張「客戶會看到的樣子」預覽——填的時候就看得到成品，
// 比填完再去別頁確認可靠得多。

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { saveMyProfileAction } from "./actions";
import { DISPLAY_NAME_MAX } from "@/lib/coachName";
import PhotoCropper, { type CropSource } from "./PhotoCropper";

const INPUT = "bg-[#0d2b45] border border-white/15 rounded px-2 py-1.5 text-sm text-[#eef2f7] outline-none focus:border-[#c99a5b]";
const EMPTY = "bg-[#0d2b45] border border-dashed border-[#3d5b78] rounded px-2 py-1.5 text-sm text-[#8fa6ba] outline-none focus:border-[#c99a5b]";
const BTN = "rounded-lg px-3 py-1.5 text-sm border border-white/15 text-[#a9bccf] hover:bg-[#17406a] disabled:opacity-40";
const BTN_SOLID = "rounded-lg px-4 py-2 text-sm bg-[#c99a5b] text-[#08202a] font-bold hover:bg-[#e0bd8b] disabled:opacity-40";

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

  const toggle = (k: "specialties" | "serviceModes", v: string) =>
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
          <div className="rounded-xl border border-[#e08b7a]/40 bg-[#e08b7a]/10 px-4 py-3 text-sm text-[#e08b7a]">
            你的檔案目前被管理員下架，不會出現在官網。內容仍可編輯。
          </div>
        )}

        {/* 教練自己的隱藏開關。跟上面那條管理員下架是兩回事：
            勾這個是自己的決定、存檔就生效；被管理員下架的話勾不勾都不會出現在官網。 */}
        <div className="rounded-xl border border-white/10 bg-[#0d2b45] p-4">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={f.selfHidden}
              disabled={pending}
              onChange={(e) => set("selfHidden", e.target.checked)}
              className="mt-0.5 w-4 h-4 accent-[#c99a5b] shrink-0"
            />
            <span>
              <span className="text-sm font-bold">不要把我的資料放上官網</span>
              <span className="block text-[12px] text-[#a9bccf] mt-1 leading-relaxed">
                勾選後，你不會出現在官網的教練頁，客戶也無法在那裡挑到你。
                <b className="text-[#e0bd8b]">你的教練編號照常有效</b>——
                已經拿到編號的客戶還是可以指定你，一樣要你按接受才會掛上。
              </span>
            </span>
          </label>
          {f.selfHidden && !published && (
            <p className="text-[11px] text-[#e08b7a] mt-2">
              （你的檔案本來就已經被管理員下架，取消勾選也不會出現在官網。）
            </p>
          )}
        </div>

        <div className="rounded-xl border border-white/10 bg-[#0d2b45] p-4 space-y-3">
          <h2 className="text-sm font-bold border-l-[3px] border-[#c99a5b] pl-2">顯示名稱</h2>
          <label className="block">
            <input
              value={f.displayName}
              disabled={pending}
              maxLength={DISPLAY_NAME_MAX}
              onChange={(e) => set("displayName", e.target.value)}
              placeholder={loginName || "你的名字"}
              className={`${f.displayName ? INPUT : EMPTY} w-full`}
            />
            <span className="block text-[11px] text-[#6f869c] mt-1.5 leading-relaxed">
              這是<b className="text-[#a9bccf]">全站</b>會顯示的名字——官網教練頁、工作台、組織表、客戶看到的都是它。
              留空就沿用登入帳號的姓名{loginName ? `（${loginName}）` : ""}。
              改這裡<b className="text-[#a9bccf]">不會</b>動到你的登入帳號，最多 {DISPLAY_NAME_MAX} 個字。
            </span>
          </label>
        </div>

        <div className="rounded-xl border border-white/10 bg-[#0d2b45] p-4 space-y-3">
          <h2 className="text-sm font-bold border-l-[3px] border-[#c99a5b] pl-2">大頭照</h2>
          <div className="flex items-center gap-4">
            {f.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={f.photoUrl} alt="大頭照" className="w-24 h-24 rounded-xl object-cover border border-white/15" />
            ) : (
              <div className="w-24 h-24 rounded-xl border border-dashed border-[#3d5b78] grid place-items-center text-xs text-[#6f869c]">
                未上傳
              </div>
            )}
            <div className="space-y-2">
              <input ref={fileRef} type="file" accept={ACCEPT.join(",")} disabled={pending}
                onChange={onPickPhoto}
                className="text-xs text-[#a9bccf] file:mr-2 file:rounded-lg file:border file:border-white/15 file:bg-transparent file:px-3 file:py-1.5 file:text-[#a9bccf]" />
              <p className="text-[11px] text-[#6f869c]">
                選好照片後可以拖曳、縮放決定要框哪一塊，再裁成正方形壓縮。清楚的正面照最有效。
              </p>
              {f.photoUrl && (
                <button type="button" className={BTN} disabled={pending}
                  onClick={() => set("photoUrl", null)}>移除照片</button>
              )}
            </div>
          </div>
          {photoErr && <p className="text-sm text-[#e08b7a]">{photoErr}</p>}
        </div>

        <div className="rounded-xl border border-white/10 bg-[#0d2b45] p-4 space-y-3">
          <h2 className="text-sm font-bold border-l-[3px] border-[#c99a5b] pl-2">你想讓客戶第一眼看到什麼</h2>
          <label className="block">
            <span className="block text-xs text-[#a9bccf] mb-1">一句話標語</span>
            <input value={f.headline} disabled={pending} maxLength={60}
              onChange={(e) => set("headline", e.target.value)}
              placeholder="例：陪你把每一筆錢，放到它該去的地方"
              className={`${f.headline ? INPUT : EMPTY} w-full`} />
            <span className="block text-[11px] text-[#6f869c] mt-0.5">{f.headline.length}/60</span>
          </label>
          <label className="block">
            <span className="block text-xs text-[#a9bccf] mb-1">自我介紹</span>
            <textarea rows={7} value={f.bio} disabled={pending} maxLength={1000}
              onChange={(e) => set("bio", e.target.value)}
              placeholder={"你為什麼做這一行、擅長陪什麼樣的人、合作起來會是什麼感覺。\n寫給看不懂財務術語的人看。"}
              className={`${f.bio ? INPUT : EMPTY} w-full leading-relaxed`} />
            <span className="block text-[11px] text-[#6f869c] mt-0.5">{f.bio.length}/1000</span>
          </label>
        </div>

        <div className="rounded-xl border border-white/10 bg-[#0d2b45] p-4 space-y-3">
          <h2 className="text-sm font-bold border-l-[3px] border-[#c99a5b] pl-2">專長領域</h2>
          {specialtyOptions.length === 0 ? (
            <p className="text-xs text-[#e0bd8b]">
              公司還沒設定專長清單。請管理員到「業務制度 › 個案認定與結案 › 專長領域清單」設定。
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {specialtyOptions.map((s) => {
                const on = f.specialties.includes(s);
                return (
                  <button key={s} type="button" disabled={pending}
                    onClick={() => toggle("specialties", s)}
                    className={`rounded-full px-3 py-1.5 text-xs border ${
                      on ? "bg-[#c99a5b] text-[#08202a] border-[#c99a5b] font-bold"
                         : "border-white/15 text-[#a9bccf] hover:border-white/35"
                    }`}>
                    {s}
                  </button>
                );
              })}
            </div>
          )}
          <p className="text-[11px] text-[#6f869c]">
            專長同時用於客戶選教練，以及公司派案時挑選合適人選。
          </p>
        </div>

        <div className="rounded-xl border border-white/10 bg-[#0d2b45] p-4 space-y-3">
          <h2 className="text-sm font-bold border-l-[3px] border-[#c99a5b] pl-2">經歷與服務方式</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="block text-xs text-[#a9bccf] mb-1">從業年資</span>
              <input type="number" min={0} max={80} value={f.yearsExp} disabled={pending}
                onChange={(e) => set("yearsExp", e.target.value)} placeholder="未填"
                className={`${f.yearsExp ? INPUT : EMPTY} w-28`} />
            </label>
            <label className="block">
              <span className="block text-xs text-[#a9bccf] mb-1">背景／前一份工作</span>
              <input value={f.prevRole} disabled={pending} maxLength={60}
                onChange={(e) => set("prevRole", e.target.value)} placeholder="例：銀行理財專員 8 年"
                className={`${f.prevRole ? INPUT : EMPTY} w-full`} />
            </label>
          </div>
          <ListField label="證照" hint="一行一項，例：CFP、AFP、投信投顧業務員"
            value={f.credentials} disabled={pending}
            onChange={(v) => set("credentials", v)} />
          <div>
            <span className="block text-xs text-[#a9bccf] mb-1">服務方式</span>
            <div className="flex flex-wrap gap-2">
              {["線上", "實體"].map((m) => {
                const on = f.serviceModes.includes(m);
                return (
                  <button key={m} type="button" disabled={pending}
                    onClick={() => toggle("serviceModes", m)}
                    className={`rounded-full px-3 py-1.5 text-xs border ${
                      on ? "bg-[#c99a5b] text-[#08202a] border-[#c99a5b] font-bold"
                         : "border-white/15 text-[#a9bccf] hover:border-white/35"
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
          <button type="button" className={BTN_SOLID} disabled={pending || !dirty} onClick={save}>
            {pending ? "儲存中…" : "儲存並公開"}
          </button>
          <Link href="/coaches" className={BTN}>看官網上的樣子 →</Link>
          {msg && (
            <span className={`text-sm ${msg.ok ? "text-[#7fb894]" : "text-[#e08b7a]"}`}>
              {msg.ok ? `${msg.text} ✓` : `儲存失敗：${msg.text}`}
            </span>
          )}
        </div>
      </div>

      {/* 預覽 */}
      <div className="lg:sticky lg:top-4 h-fit">
        <div className="text-xs text-[#a9bccf] mb-2">客戶會看到的樣子</div>
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
      <span className="block text-xs text-[#a9bccf] mb-1">{label}</span>
      <textarea rows={Math.max(2, value.length + 1)} value={value.join("\n")} disabled={disabled}
        onChange={(e) => onChange(e.target.value.split("\n").map((x) => x.trim()).filter(Boolean))}
        placeholder={hint}
        className={`${value.length ? INPUT : EMPTY} w-full leading-snug`} />
    </label>
  );
}

/** 教練卡片。編輯預覽與官網列表共用同一個元件，所見即所得不是靠人工同步。 */
export function CoachCard({
  name, rankLabel, headline, bio, specialties, photoUrl, yearsExp, prevRole,
  credentials, serviceModes, areas, compact = false,
}: {
  name: string;
  /**
   * 對外只印制度職級（認證教練／資深教練／首席教練／實習教練）。
   * ⚠️ 這裡刻意不是 `title`：教練自填的職稱（「執行長」那種）是對內稱謂，
   *    Ray 2026/08/24 拍板一律不上官網。要改回顯示頭銜之前先跟他確認。
   */
  rankLabel: string | null;
  headline: string | null; bio: string | null;
  specialties: string[]; photoUrl: string | null; yearsExp: number | null;
  prevRole: string | null; credentials: string[]; serviceModes: string[]; areas: string[];
  compact?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#0d2b45] p-5">
      <div className="flex items-start gap-4">
        {photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photoUrl} alt={name} className="w-20 h-20 rounded-xl object-cover border border-white/15 shrink-0" />
        ) : (
          <div className="w-20 h-20 rounded-xl bg-[#12334f] border border-white/10 grid place-items-center text-2xl text-[#c99a5b] shrink-0">
            {name.slice(0, 1)}
          </div>
        )}
        <div className="min-w-0">
          <div className="font-serif text-lg text-[#eef2f7]">{name}</div>
          {rankLabel && <div className="text-xs text-[#a7bacb]">{rankLabel}</div>}
          {headline && <p className="text-sm text-[#e0bd8b] mt-1.5 leading-snug">{headline}</p>}
          <div className="text-[11px] text-[#6f869c] mt-1 space-x-2">
            {yearsExp !== null && !Number.isNaN(yearsExp) && <span>年資 {yearsExp} 年</span>}
            {prevRole && <span>· {prevRole}</span>}
          </div>
        </div>
      </div>

      {specialties.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {specialties.map((s) => (
            <span key={s} className="rounded-full bg-[#12334f] border border-white/10 px-2.5 py-1 text-[11px] text-[#cfdcea]">
              {s}
            </span>
          ))}
        </div>
      )}

      {bio && (
        <p className={`text-sm text-[#a7bacb] mt-3 leading-relaxed whitespace-pre-wrap ${compact ? "line-clamp-4" : ""}`}>
          {bio}
        </p>
      )}

      {(credentials.length > 0 || serviceModes.length > 0 || areas.length > 0) && (
        <div className="mt-3 pt-3 border-t border-white/8 text-[11px] text-[#6f869c] space-y-1">
          {credentials.length > 0 && <div>證照：{credentials.join("、")}</div>}
          {serviceModes.length > 0 && <div>服務方式：{serviceModes.join("、")}</div>}
          {areas.length > 0 && <div>服務地區：{areas.join("、")}</div>}
        </div>
      )}
    </div>
  );
}
