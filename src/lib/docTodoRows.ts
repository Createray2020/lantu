import type { DocTodo, Identity } from "./docsStore";
import type { DocTodoRow } from "@/components/DocTodoList";
import { canSignNow, isSigner } from "./docs";

/** 把 server 端的 DocTodo 壓成 client component 吃的扁平列（不把整份快照送進瀏覽器）。 */
export function toTodoRows(list: DocTodo[], me: Identity | null = null): DocTodoRow[] {
  return list.map((t) => ({
    // 輪到的人裡有「不是我」的才有人可催（教練自己的補簽文件卡住＝該催的是自己）
    canRemind: t.instance.signers.some((s) => canSignNow(s, t.instance.signers) && !(me && isSigner(s, me))),
    id: t.instance.id,
    title: t.instance.title,
    caseType: t.instance.caseType,
    kind: t.kind,
    waitingOn: t.waitingOn,
    days: t.days,
    expiresAt: t.instance.expiresAt,
    remindCount: t.instance.signers.filter((s) => canSignNow(s, t.instance.signers)).reduce((a, s) => a + (s.remindCount ?? 0), 0),
  }));
}
