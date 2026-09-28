import { acctShell } from "../AcctPage";
import TargetsBoard from "../TargetsBoard";

export const dynamic = "force-dynamic";

export default async function AccountingTargetsPage() {
  return acctShell("目標設定", "目標不綁月份：先在工作台設目標淨利、把筆數與固定支出調到過線，再存入哪一個月。目標跟實際帳是兩張表，怎麼改都不動實際數字。", (state, today) => <TargetsBoard initial={state} today={today} />);
}
