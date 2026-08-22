"use client";

import { useState, useTransition } from "react";
import { markLessonAction } from "../actions";

export type LessonView = {
  id: string;
  seq: number;
  title: string;
  kind: string;
  url: string | null;
  body: string | null;
  durationMin: number | null;
  note: string | null;
  embed: string | null;
  done: boolean;
};

// 課程內頁：左側單元清單、右側單元內容。
//
// 一次只開一個單元，不是全部攤開 —— 課程是「照順序看完」的東西，
// 全部攤開會讓人不知道自己看到哪、也不知道下一步該點哪裡。
export default function CourseView({
  courseId,
  lessons: initial,
}: {
  courseId: string;
  lessons: LessonView[];
}) {
  const [lessons, setLessons] = useState(initial);
  // 預設停在「第一個還沒完成的單元」——每次回來都要重找進度是最惱人的小事。
  const [cur, setCur] = useState(() => {
    const i = initial.findIndex((l) => !l.done);
    return i >= 0 ? i : 0;
  });
  const [busy, start] = useTransition();
  const [err, setErr] = useState("");

  const lesson = lessons[cur];
  const doneCount = lessons.filter((l) => l.done).length;

  function toggle(l: LessonView) {
    setErr("");
    start(async () => {
      const r = await markLessonAction(courseId, l.id, !l.done);
      if (!r.ok) {
        setErr(r.error);
        return;
      }
      setLessons((ls) => ls.map((x) => (x.id === l.id ? { ...x, done: !l.done } : x)));
      // 標記完成後自動往下一個未完成的單元走。
      if (!l.done) {
        const next = lessons.findIndex((x, i) => i > cur && !x.done);
        if (next >= 0) setCur(next);
      }
    });
  }

  if (!lessons.length) {
    return (
      <div className="rounded-xl border border-white/10 bg-[#0c2135] px-5 py-10 text-center text-[#6f869c]">
        這門課還沒有加入任何單元。
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[280px_1fr] items-start">
      <aside className="rounded-xl border border-white/10 bg-[#0c2135] overflow-hidden">
        <div className="px-4 py-2.5 border-b border-white/10 text-xs text-[#a9bccf]">
          單元 <b className="text-[#e0bd8b]">{doneCount}</b> / {lessons.length} 已完成
        </div>
        <ol>
          {lessons.map((l, i) => (
            <li key={l.id}>
              <button
                type="button"
                onClick={() => setCur(i)}
                className={`w-full text-left px-4 py-2.5 flex items-start gap-2 border-b border-white/5 transition ${
                  i === cur ? "bg-[#12334f]" : "hover:bg-white/5"
                }`}
              >
                <span
                  className={`mt-0.5 w-4 h-4 shrink-0 rounded-full border grid place-items-center text-[9px] ${
                    l.done
                      ? "bg-[#6f8f74] border-[#6f8f74] text-[#08202a]"
                      : "border-white/25 text-transparent"
                  }`}
                >
                  ✓
                </span>
                <span className="min-w-0">
                  <span className="block text-sm">{l.title}</span>
                  <span className="block text-[11px] text-[#6f869c]">
                    {KIND_LABEL[l.kind] ?? l.kind}
                    {l.durationMin ? ` · ${l.durationMin} 分鐘` : ""}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ol>
      </aside>

      <section className="rounded-xl border border-white/10 bg-[#0c2135] overflow-hidden">
        <div className="px-5 py-3 border-b border-white/10 flex flex-wrap items-center gap-3">
          <h2 className="font-bold flex-1 min-w-0">{lesson.title}</h2>
          <button
            type="button"
            onClick={() => toggle(lesson)}
            disabled={busy}
            className={`text-sm font-bold rounded-md px-3 py-1.5 disabled:opacity-50 ${
              lesson.done
                ? "border border-[#6f8f74]/60 text-[#9fd0a6] bg-[#6f8f74]/15"
                : "bg-[#c99a5b] text-[#08202a]"
            }`}
          >
            {lesson.done ? "已完成 · 取消標記" : "標記完成"}
          </button>
        </div>

        <div className="p-5 space-y-4">
          {err && <p className="text-sm text-[#ff9d9f]">{err}</p>}

          {lesson.embed && (
            <div className="relative w-full rounded-lg overflow-hidden bg-black" style={{ aspectRatio: "16 / 9" }}>
              <iframe
                src={lesson.embed}
                title={lesson.title}
                className="absolute inset-0 w-full h-full border-0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          )}

          {/* 認不出來的連結不硬塞 iframe —— 那會變成一個永遠轉圈圈、沒有線索的空白框。 */}
          {!lesson.embed && lesson.url && (
            <a
              href={lesson.url}
              target="_blank"
              rel="noreferrer"
              className="inline-block rounded-md border border-[#c99a5b]/50 text-[#e0bd8b] font-bold text-sm px-4 py-2 hover:bg-[#c99a5b]/10"
            >
              用新分頁開啟{KIND_LABEL[lesson.kind] ?? "內容"} ↗
            </a>
          )}

          {lesson.body && (
            <div className="text-sm text-[#cfdae5] leading-relaxed whitespace-pre-wrap">{lesson.body}</div>
          )}

          {lesson.note && (
            <p className="text-xs text-[#6f869c] border-t border-white/10 pt-3">{lesson.note}</p>
          )}

          {!lesson.embed && !lesson.url && !lesson.body && (
            <p className="text-sm text-[#6f869c]">這個單元還沒有內容。</p>
          )}
        </div>
      </section>
    </div>
  );
}

const KIND_LABEL: Record<string, string> = {
  video: "影片",
  doc: "文件",
  link: "外部連結",
  text: "文字講義",
};
