"use server";

import { redirect } from "next/navigation";
import { applyAsCoach } from "@/lib/coach";

// 明確申請成為教練。只有這支會建立 coaches 列（status=pending，待後台核准）。
export async function applyAsCoachAction() {
  const row = await applyAsCoach();
  if (!row) redirect("/sign-in");
  redirect("/dashboard");
}
