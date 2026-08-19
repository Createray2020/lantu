"use server";

import { revalidatePath } from "next/cache";
import { ensureCoach, isAdmin } from "@/lib/coach";
import {
  addExternalTraining, createTrainingSession, markAttendance, setTrainingStatus,
} from "@/lib/comp/caseRepo";
import { ensureActiveVersion, loadParams } from "@/lib/comp/repo";

export type ActionResult = { ok: true } | { ok: false; error: string };

const MSG: Record<string, string> = {
  forbidden: "沒有後台權限",
  "session-not-found": "找不到場次",
  "no-topic": "請填主題",
  "no-date": "請填日期",
};

function fail(e: unknown): ActionResult {
  const raw = e instanceof Error ? e.message : String(e);
  return { ok: false, error: MSG[raw] ?? raw };
}

async function guard() {
  const me = await ensureCoach();
  if (!(await isAdmin(me))) throw new Error("forbidden");
  return me!;
}

function touch() {
  revalidatePath("/admin/training");
  revalidatePath("/admin/advisors");
  revalidatePath("/dashboard/my-business");
}

export async function createSessionAction(input: {
  heldOn: string; topic: string; mode?: string; hours?: number | null; speakerId?: string | null;
}): Promise<ActionResult> {
  try {
    await guard();
    if (!input.heldOn) throw new Error("no-date");
    if (!input.topic?.trim()) throw new Error("no-topic");
    await createTrainingSession({ ...input, topic: input.topic.trim() });
    touch();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function markAttendanceAction(sessionId: string, coachIds: string[]): Promise<ActionResult> {
  try {
    await guard();
    const v = await ensureActiveVersion();
    await markAttendance(sessionId, coachIds, await loadParams(v.id));
    touch();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function addExternalAction(input: {
  coachId: string; year: number; hours: number; title: string; approved?: boolean;
}): Promise<ActionResult> {
  try {
    await guard();
    await addExternalTraining(input);
    touch();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function reviewExternalAction(id: string, approve: boolean): Promise<ActionResult> {
  try {
    await guard();
    await setTrainingStatus(id, approve ? "approved" : "rejected");
    touch();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
