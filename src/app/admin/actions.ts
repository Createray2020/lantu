"use server";

import { revalidatePath } from "next/cache";
import { ensureCoach, isAdmin, setCoachStatus } from "@/lib/coach";

async function guard() {
  const me = await ensureCoach();
  if (!(await isAdmin(me))) throw new Error("forbidden");
}

export async function approveCoach(id: string) {
  await guard();
  await setCoachStatus(id, "active");
  revalidatePath("/admin");
}

export async function suspendCoach(id: string) {
  await guard();
  await setCoachStatus(id, "suspended");
  revalidatePath("/admin");
}

export async function resetCoach(id: string) {
  await guard();
  await setCoachStatus(id, "pending");
  revalidatePath("/admin");
}
