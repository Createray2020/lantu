// 簽署用的「我是誰」：同一個 Clerk 帳號可能同時是教練列（任何狀態，含待審的申請人）與客戶帳號。
// 簽署人比對只看 id（isSigner），所以這裡兩種身分都帶齊，不做取捨。
// ⚠️ 客戶身分這裡**唯讀**查 client_users，不走 ensureClientUser()——那一支會建列、記登入、套推薦 cookie，
//    管理員或教練開一次 /sign 就會被記成外部客戶（2026/10/28 稽核）。
import { currentUser } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { db } from "@/Shared/db";
import { clientUsers } from "@/Shared/db/schema";
import { ensureCoach, isAdmin } from "./coach";
import type { Identity } from "./docsStore";

export type SignIdentity = Identity & { name: string; admin: boolean; coachStatus: string | null };

export async function currentSignIdentity(): Promise<SignIdentity | null> {
  const user = await currentUser();
  if (!user) return null;
  const [coach, cuRows] = await Promise.all([
    ensureCoach(),
    db.select({ id: clientUsers.id, name: clientUsers.name, status: clientUsers.status }).from(clientUsers).where(eq(clientUsers.id, user.id)).limit(1),
  ]);
  const cu = cuRows[0] && cuRows[0].status !== "suspended" ? cuRows[0] : null;
  if (!coach && !cu) return null;
  return {
    coachId: coach?.id ?? null,
    clientUserId: cu?.id ?? null,
    name: coach?.name || cu?.name || "",
    admin: coach ? await isAdmin(coach) : false,
    coachStatus: coach?.status ?? null,
  };
}
