import { acctShell } from "../AcctPage";
import ReceiptsBoard from "../ReceiptsBoard";

export const dynamic = "force-dynamic";

export default async function AccountingReceiptsPage() {
  return acctShell("收款明細", "對帳表的每一列：誰在哪一天匯了多少、分潤人是誰；每一筆照參數設定的拆分算出匯給誰、公司實收多少，並自動進本月帳務。", (state, today) => <ReceiptsBoard initial={state} today={today} />);
}
