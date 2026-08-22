"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LESSON_KINDS } from "@/lib/learn";
import {
  createCourseAction, saveCourseAction, deleteCourseAction,
  createLessonAction, saveLessonAction, deleteLessonAction, moveLessonAction,
  type CoursePatch, type LessonPatch,
} from "./actions";

export type LessonRow = {
  id: string; seq: number; title: string; kind: string;
  url: string | null; body: string | null; durationMin: number | null; note: string | null;
};

export type CourseRow = {
  id: string; title: string; summary: string | null; category: string;
  coverUrl: string | null; minRankSeq: number | null; trainingHours: number | null;
  sortOrder: number; published: boolean;
  lessons: LessonRow[];
  /** 完成了這門課全部單元的教練姓名。 */
  completedBy: string[];
  /** 進行中（有進度但沒完成）的教練姓名 → 已完成單元數。 */
  inProgress: { name: string; done: number }[];
};

const F = "w-full bg-[#081a2b] border border-white/15 rounded px-2 py-1.5 text-sm";
const BTN = "rounded-md border border-white/20 text-[#a9bccf] text-xs px-2.5 py-1 hover:text-white";

export default function LearnBoard({
  courses,
  rankOptions,
}: {
  courses: CourseRow[];
  /** 級別下拉：{ seq, label }，seq 拿來比對 minRankSeq。 */
  rankOptions: { seq: number; label: string }[];
}) {
  const router = useRouter();
  const [openId, setOpenId] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, start] = useTransition();

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setMsg("");
    start(async () => {
      const r = await fn();
      setMsg(r.ok ? "已儲存" : (r.error ?? "操作失敗"));
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <input
          className="bg-[#0c2135] border border-white/15 rounded px-3 py-1.5 text-sm w-64"
          placeholder="新課程名稱"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
        />
        <button
          type="button"
          disabled={busy || !newTitle.trim()}
          onClick={() =>
            run(async () => {
              const r = await createCourseAction(newTitle);
              if (r.ok) setNewTitle("");
              return r;
            })
          }
          className="rounded-md bg-[#c99a5b] text-[#08202a] font-bold text-sm px-3.5 py-1.5 disabled:opacity-40"
        >
          ＋ 新增課程
        </button>
        {msg && <span className="text-xs text-[#e0bd8b]">{msg}</span>}
      </div>

      {courses.length === 0 && (
        <div className="rounded-xl border border-white/10 bg-[#0c2135] px-5 py-10 text-center text-[#6f869c]">
          還沒有任何課程。先新增一門，再往裡面加單元。
        </div>
      )}

      {courses.map((c) => (
        <CourseCard
          key={c.id}
          course={c}
          rankOptions={rankOptions}
          open={openId === c.id}
          onToggle={() => setOpenId(openId === c.id ? null : c.id)}
          busy={busy}
          run={run}
        />
      ))}
    </div>
  );
}

function CourseCard({
  course, rankOptions, open, onToggle, busy, run,
}: {
  course: CourseRow;
  rankOptions: { seq: number; label: string }[];
  open: boolean;
  onToggle: () => void;
  busy: boolean;
  run: (fn: () => Promise<{ ok: boolean; error?: string }>) => void;
}) {
  const [p, setP] = useState<CoursePatch>({
    title: course.title,
    summary: course.summary,
    category: course.category,
    coverUrl: course.coverUrl,
    minRankSeq: course.minRankSeq,
    trainingHours: course.trainingHours,
    sortOrder: course.sortOrder,
    published: course.published,
  });
  const [newLesson, setNewLesson] = useState("");

  return (
    <div className="rounded-xl border border-white/10 bg-[#0c2135] overflow-hidden">
      <div className="px-4 py-3 flex flex-wrap items-center gap-3">
        <button type="button" onClick={onToggle} className="text-left flex-1 min-w-0">
          <span className="font-bold">{course.title}</span>
          <span className="text-xs text-[#6f869c] ml-2">
            {course.lessons.length} 單元 · {course.category || "未分類"}
          </span>
        </button>
        <span
          className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
            course.published
              ? "border-[#6f8f74]/60 text-[#9fd0a6] bg-[#6f8f74]/15"
              : "border-white/20 text-[#6f869c]"
          }`}
        >
          {course.published ? "已上架" : "未上架"}
        </span>
        <span className="text-xs text-[#a9bccf]">
          完課 <b className="text-[#e0bd8b]">{course.completedBy.length}</b> 人
        </span>
        <button type="button" onClick={onToggle} className={BTN}>
          {open ? "收合" : "編輯"}
        </button>
      </div>

      {open && (
        <div className="px-4 pb-4 space-y-4 border-t border-white/10 pt-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs text-[#a9bccf]">課程名稱</span>
              <input className={F} value={p.title} onChange={(e) => setP({ ...p, title: e.target.value })} />
            </label>
            <label className="block">
              <span className="text-xs text-[#a9bccf]">分類（新人必修／保障／企業主…）</span>
              <input className={F} value={p.category} onChange={(e) => setP({ ...p, category: e.target.value })} />
            </label>
            <label className="block sm:col-span-2">
              <span className="text-xs text-[#a9bccf]">簡介</span>
              <textarea className={F} rows={2} value={p.summary ?? ""} onChange={(e) => setP({ ...p, summary: e.target.value })} />
            </label>
            <label className="block">
              <span className="text-xs text-[#a9bccf]">封面圖網址（選填）</span>
              <input className={F} value={p.coverUrl ?? ""} onChange={(e) => setP({ ...p, coverUrl: e.target.value })} />
            </label>
            <label className="block">
              <span className="text-xs text-[#a9bccf]">最低可見級別（留空＝全部教練）</span>
              <select
                className={F}
                value={p.minRankSeq ?? ""}
                onChange={(e) => setP({ ...p, minRankSeq: e.target.value === "" ? null : Number(e.target.value) })}
              >
                <option value="">全部教練</option>
                {rankOptions.map((r) => (
                  <option key={r.seq} value={r.seq}>{r.label} 以上</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs text-[#a9bccf]">完課認列訓練時數（留空＝不認列）</span>
              <input
                type="number" step="0.5" min="0" className={F}
                value={p.trainingHours ?? ""}
                onChange={(e) => setP({ ...p, trainingHours: e.target.value === "" ? null : Number(e.target.value) })}
              />
            </label>
            <label className="block">
              <span className="text-xs text-[#a9bccf]">排序（小的在前）</span>
              <input
                type="number" className={F}
                value={p.sortOrder}
                onChange={(e) => setP({ ...p, sortOrder: Number(e.target.value) })}
              />
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={p.published}
                onChange={(e) => setP({ ...p, published: e.target.checked })}
              />
              上架（教練端看得到）
            </label>
            <div className="flex-1" />
            <button
              type="button"
              disabled={busy}
              onClick={() => run(() => saveCourseAction(course.id, p))}
              className="rounded-md bg-[#c99a5b] text-[#08202a] font-bold text-sm px-3.5 py-1.5 disabled:opacity-40"
            >
              儲存課程
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                if (
                  confirm(
                    `刪除「${course.title}」？\n\n這門課的 ${course.lessons.length} 個單元與所有教練的完課紀錄會一起被刪除，無法復原。\n若只是不想讓人看到，請改成「未上架」。`,
                  )
                ) {
                  run(() => deleteCourseAction(course.id));
                }
              }}
              className="rounded-md border border-[#e5484d]/50 text-[#ff9d9f] text-sm px-3 py-1.5 disabled:opacity-40"
            >
              刪除課程
            </button>
          </div>

          {/* ── 單元 ── */}
          <div className="border-t border-white/10 pt-4">
            <h3 className="text-xs tracking-[0.2em] text-[#6b7d8f] mb-2">單元</h3>
            <div className="space-y-2">
              {course.lessons.map((l, i) => (
                <LessonEditor
                  key={l.id}
                  courseId={course.id}
                  lesson={l}
                  first={i === 0}
                  last={i === course.lessons.length - 1}
                  busy={busy}
                  run={run}
                />
              ))}
              {course.lessons.length === 0 && (
                <p className="text-sm text-[#6f869c]">還沒有單元。</p>
              )}
            </div>
            <div className="flex gap-2 mt-3">
              <input
                className="bg-[#081a2b] border border-white/15 rounded px-3 py-1.5 text-sm flex-1"
                placeholder="新單元名稱"
                value={newLesson}
                onChange={(e) => setNewLesson(e.target.value)}
              />
              <button
                type="button"
                disabled={busy || !newLesson.trim()}
                onClick={() =>
                  run(async () => {
                    const r = await createLessonAction(course.id, newLesson);
                    if (r.ok) setNewLesson("");
                    return r;
                  })
                }
                className={BTN}
              >
                ＋ 新增單元
              </button>
            </div>
          </div>

          {/* ── 完課名單 ── */}
          <div className="border-t border-white/10 pt-4 text-xs">
            <h3 className="tracking-[0.2em] text-[#6b7d8f] mb-2">完課紀錄</h3>
            <p className="text-[#a9bccf]">
              已完成：{course.completedBy.length ? course.completedBy.join("、") : <span className="text-[#6f869c]">尚無</span>}
            </p>
            {course.inProgress.length > 0 && (
              <p className="text-[#6f869c] mt-1">
                進行中：{course.inProgress.map((x) => `${x.name}（${x.done}/${course.lessons.length}）`).join("、")}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function LessonEditor({
  courseId, lesson, first, last, busy, run,
}: {
  courseId: string;
  lesson: LessonRow;
  first: boolean;
  last: boolean;
  busy: boolean;
  run: (fn: () => Promise<{ ok: boolean; error?: string }>) => void;
}) {
  const [open, setOpen] = useState(false);
  const [p, setP] = useState<LessonPatch>({
    title: lesson.title,
    kind: lesson.kind,
    url: lesson.url,
    body: lesson.body,
    durationMin: lesson.durationMin,
    note: lesson.note,
  });
  const kind = LESSON_KINDS.find((k) => k.value === p.kind);

  return (
    <div className="rounded-lg border border-white/10 bg-[#081a2b]">
      <div className="px-3 py-2 flex items-center gap-2">
        <span className="text-[#6f869c] text-xs w-5">{lesson.seq}</span>
        <button type="button" onClick={() => setOpen(!open)} className="flex-1 text-left text-sm">
          {lesson.title}
          <span className="text-[#6f869c] text-xs ml-2">
            {LESSON_KINDS.find((k) => k.value === lesson.kind)?.label ?? lesson.kind}
          </span>
        </button>
        <button type="button" disabled={busy || first} onClick={() => run(() => moveLessonAction(courseId, lesson.id, -1))} className="px-1 text-[#a9bccf] disabled:opacity-30">↑</button>
        <button type="button" disabled={busy || last} onClick={() => run(() => moveLessonAction(courseId, lesson.id, 1))} className="px-1 text-[#a9bccf] disabled:opacity-30">↓</button>
        <button type="button" onClick={() => setOpen(!open)} className={BTN}>{open ? "收合" : "編輯"}</button>
      </div>
      {open && (
        <div className="px-3 pb-3 space-y-2 border-t border-white/10 pt-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs text-[#a9bccf]">單元名稱</span>
              <input className={F} value={p.title} onChange={(e) => setP({ ...p, title: e.target.value })} />
            </label>
            <label className="block">
              <span className="text-xs text-[#a9bccf]">型態</span>
              <select className={F} value={p.kind} onChange={(e) => setP({ ...p, kind: e.target.value })}>
                {LESSON_KINDS.map((k) => (
                  <option key={k.value} value={k.value}>{k.label}</option>
                ))}
              </select>
            </label>
          </div>
          {kind && <p className="text-[11px] text-[#6f869c]">{kind.hint}</p>}
          {p.kind !== "text" && (
            <label className="block">
              <span className="text-xs text-[#a9bccf]">連結網址</span>
              <input className={F} value={p.url ?? ""} placeholder="https://…" onChange={(e) => setP({ ...p, url: e.target.value })} />
            </label>
          )}
          {(p.kind === "text" || p.body) && (
            <label className="block">
              <span className="text-xs text-[#a9bccf]">講義內容</span>
              <textarea className={F} rows={5} value={p.body ?? ""} onChange={(e) => setP({ ...p, body: e.target.value })} />
            </label>
          )}
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs text-[#a9bccf]">時長（分鐘，選填）</span>
              <input
                type="number" min="0" className={F}
                value={p.durationMin ?? ""}
                onChange={(e) => setP({ ...p, durationMin: e.target.value === "" ? null : Number(e.target.value) })}
              />
            </label>
            <label className="block">
              <span className="text-xs text-[#a9bccf]">備註（選填）</span>
              <input className={F} value={p.note ?? ""} onChange={(e) => setP({ ...p, note: e.target.value })} />
            </label>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => run(() => saveLessonAction(lesson.id, p))}
              className="rounded-md bg-[#c99a5b] text-[#08202a] font-bold text-xs px-3 py-1.5 disabled:opacity-40"
            >
              儲存單元
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                if (confirm(`刪除單元「${lesson.title}」？教練在這個單元的完成紀錄會一起消失。`)) {
                  run(() => deleteLessonAction(lesson.id));
                }
              }}
              className="rounded-md border border-[#e5484d]/50 text-[#ff9d9f] text-xs px-3 py-1.5 disabled:opacity-40"
            >
              刪除
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
