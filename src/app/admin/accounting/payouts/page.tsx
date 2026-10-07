import { acctShell } from "../AcctPage";
import PayoutsBoard from "../PayoutsBoard";

export const dynamic = "force-dynamic";

export default async function AccountingPayoutsPage() {
  return acctShell("分潤匯款", "這個月要匯給誰、匯多少：從收款明細逐筆算出來；匯完標「已匯」，還沒匯的一眼看得到。", (state, today) => <PayoutsBoard initial={state} today={today} />);
}
