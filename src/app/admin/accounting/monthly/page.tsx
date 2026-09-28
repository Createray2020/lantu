import { acctShell } from "../AcctPage";
import MonthlyBoard from "../MonthlyBoard";

export const dynamic = "force-dynamic";

export default async function AccountingMonthlyPage() {
  return acctShell("本月帳務", "這個月實際賣了幾筆、固定支出多少，扣完拆分與營業稅剩多少；有目標的月份可以對照差在哪。", (state, today) => <MonthlyBoard initial={state} today={today} />);
}
