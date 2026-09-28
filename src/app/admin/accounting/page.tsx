import { acctShell } from "./AcctPage";
import ParamsBoard from "./ParamsBoard";

export const dynamic = "force-dynamic";

export default async function AccountingParamsPage() {
  return acctShell("參數設定", "營業項目、單價與每一筆分給誰，以及營業稅率。目標設定與本月帳務都沿用這裡。", (state) => <ParamsBoard initial={state} />);
}
