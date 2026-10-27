import type { DocTodo } from "./docsStore";
import type { DocTodoRow } from "@/components/DocTodoList";
import { canSignNow } from "./docs";

/** 把 server 端的 DocTodo 壓成 client component 吃的扁平列（不把整份快照送進瀏覽器）。 */
export function toTodoRows(list: DocTodo[]): DocTodoRow[] {
  return list.map((t) => ({
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
