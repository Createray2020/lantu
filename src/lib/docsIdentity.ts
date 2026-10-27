// 簽署用的「我是誰」：同一個 Clerk 帳號可能同時是教練列（任何狀態，含待審的申請人）與客戶帳號。
// 簽署人比對只看 id（isSigner），所以這裡兩種身分都帶齊，不做取捨。
import { ensureCoach, isAdmin } from "./coach";
import { ensureClientUser } from "./clientUser";
import type { Identity } from "./docsStore";

export type SignIdentity = Identity & { name: string; admin: boolean; coachStatus: string | null };

export async function currentSignIdentity(): Promise<SignIdentity | null> {
  const coach = await ensureCoach();
  const cu = await ensureClientUser();
  if (!coach && !cu) return null;
  return {
    coachId: coach?.id ?? null,
    clientUserId: cu?.id ?? null,
    name: coach?.name || cu?.name || "",
    admin: coach ? await isAdmin(coach) : false,
    coachStatus: coach?.status ?? null,
  };
}
