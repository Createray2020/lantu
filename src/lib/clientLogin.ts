// 教練端客戶頁「客戶登入」面板要的資料：這一筆客戶接上了哪個登入帳號、或還在等客戶開啟的專用碼。
import { eq } from "drizzle-orm";
import { db } from "@/Shared/db";
import { clients, clientUsers } from "@/Shared/db/schema";
import { activeClientInvite } from "@/lib/coachLink";
import { formatClaimCode } from "@/lib/joinFlow";

export type ClientLoginInfo = {
  linked: boolean;
  email: string | null;
  lastLoginAt: string | null;
  pendingCode: string | null;
  /** 開通碼（客戶編號-6 位數）；舊連結沒有 pin → null，重新產生就有 */
  claimCode: string | null;
};

export async function clientLoginInfo(clientId: string): Promise<ClientLoginInfo> {
  const rows = await db
    .select({ clientUserId: clients.clientUserId, code: clients.code, email: clientUsers.email, lastLoginAt: clientUsers.lastLoginAt })
    .from(clients)
    .leftJoin(clientUsers, eq(clientUsers.id, clients.clientUserId))
    .where(eq(clients.id, clientId))
    .limit(1);
  const r = rows[0];
  if (r?.clientUserId) {
    return { linked: true, email: r.email ?? null, lastLoginAt: r.lastLoginAt ? r.lastLoginAt.toISOString().slice(0, 10) : null, pendingCode: null, claimCode: null };
  }
  const inv = await activeClientInvite(clientId);
  return { linked: false, email: null, lastLoginAt: null, pendingCode: inv?.code ?? null, claimCode: inv?.pin && r?.code ? formatClaimCode(r.code, inv.pin) : null };
}
