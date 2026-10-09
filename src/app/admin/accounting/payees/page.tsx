import { acctShell } from "../AcctPage";
import PayeesBoard from "../PayeesBoard";

export const dynamic = "force-dynamic";

export default async function AccountingPayeesPage() {
  return acctShell("受款人", "分潤要匯給誰：每位教練一列（教練可在「我的檔案」自填收款設定，這裡也能改），外部受款人（系統商、講師、場地）在這裡新增。稅務方式決定實匯怎麼算。", (state) => <PayeesBoard initial={state} />);
}
