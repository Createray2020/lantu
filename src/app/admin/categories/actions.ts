"use server";

import { revalidatePath } from "next/cache";
import { ensureCoach, isAdmin } from "@/lib/coach";
import {
  createCategory,
  updateCategory,
  deleteCategory,
  setCategoryActive,
  seedDefaultCategories,
  type CatInput,
} from "@/lib/financeCategories";
import { saveEduCost, resetEduCosts, type EduCostInput } from "@/lib/eduCosts";
import { saveBizTaxParam, resetBizTaxParam, type BizTaxInput } from "@/lib/bizTaxParams";

export type ActionResult = { ok: true } | { ok: false; error: string };

const MSG: Record<string, string> = {
  forbidden: "沒有後台權限",
  "invalid-kind": "類別種類不正確",
  "empty-label": "細類名稱不能空白",
  "label-too-long": "細類名稱太長（上限 30 字）",
  "invalid-parent": "所屬大類不正確",
  "invalid-liquidity": "流動性只能是「流動」或「固定」",
  "system-category": "系統預設類別不可刪除；請改成「停用」（既有客戶資料還指著這個名稱）",
  "not-found": "找不到這筆類別",
  "empty-stage": "學段名稱不能空白",
  "invalid-years": "年數要介於 1~12",
  "unknown-key": "不認得這個常數（只能改內建清單裡的項目）",
  "rate-must-be-decimal": "比率要填小數（20% 請填 0.2，不是 20）",
  "invalid-value": "數值要是 0 以上的數字",
};

function fail(e: unknown): ActionResult {
  const raw = e instanceof Error ? e.message : String(e);
  // 唯一索引撞名：Postgres 的原文對使用者沒有意義，換成看得懂的話。
  if (/finance_categories_kind_label_uq|duplicate key/.test(raw)) {
    return { ok: false, error: "同一類別下已經有同名的細類了" };
  }
  return { ok: false, error: MSG[raw] ?? raw };
}

async function guard() {
  const me = await ensureCoach();
  if (!(await isAdmin(me))) throw new Error("forbidden");
  return me!;
}

function refresh() {
  revalidatePath("/admin/categories");
}

export async function addCategoryAction(input: CatInput): Promise<ActionResult> {
  try {
    await guard();
    await createCategory(input);
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function updateCategoryAction(id: string, input: CatInput): Promise<ActionResult> {
  try {
    await guard();
    await updateCategory(id, input);
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteCategoryAction(id: string): Promise<ActionResult> {
  try {
    await guard();
    await deleteCategory(id);
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function toggleCategoryAction(id: string, active: boolean): Promise<ActionResult> {
  try {
    await guard();
    await setCategoryActive(id, active);
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function seedCategoriesAction(): Promise<ActionResult> {
  try {
    await guard();
    await seedDefaultCategories();
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function saveEduCostAction(input: EduCostInput): Promise<ActionResult> {
  try {
    await guard();
    await saveEduCost(input);
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function resetEduCostsAction(): Promise<ActionResult> {
  try {
    await guard();
    await resetEduCosts();
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function saveBizTaxAction(input: BizTaxInput): Promise<ActionResult> {
  try {
    await guard();
    await saveBizTaxParam(input);
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function resetBizTaxAction(key: string): Promise<ActionResult> {
  try {
    await guard();
    await resetBizTaxParam(key);
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
