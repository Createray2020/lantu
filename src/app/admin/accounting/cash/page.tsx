import { acctShell } from "../AcctPage";
import CashBoard from "../CashBoard";

export const dynamic = "force-dynamic";

export default async function AccountingCashPage() {
  return acctShell("現金帳", "公司帳戶裡實際進了多少、出了多少、現在應該有多少：收款（已確認）與分潤已匯自動進來，固定支出與其他收支付了才記一筆。", (state, today) => <CashBoard initial={state} today={today} />);
}
