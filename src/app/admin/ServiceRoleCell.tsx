"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SERVICE_ROLES, SERVICE_ROLE_LABEL, type ServiceRole } from "@/lib/caseScope";
import { setServiceRoles } from "./actions";

// 服務角色（2026/10/28 案件進度）：客戶關係／行政財法。可兼多個；與組織職級、制度職級都獨立。
export default function ServiceRoleCell({ id, roles }: { id: string; roles: string[] }) {
  const router = useRouter();
  const [cur, setCur] = useState<string[]>(roles);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const toggle = (r: ServiceRole) => {
    const next = cur.includes(r) ? cur.filter((x) => x !== r) : [...cur, r];
    setCur(next); setErr(null);
    start(async () => { const res = await setServiceRoles(id, next); if (!res.ok) { setErr(res.error); setCur(cur); } else router.refresh(); });
  };
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1 text-11">
      {SERVICE_ROLES.map((r) => (
        <label key={r} className="inline-flex items-center gap-1 text-tx2">
          <input type="checkbox" checked={cur.includes(r)} disabled={pending} onChange={() => toggle(r)} />{SERVICE_ROLE_LABEL[r]}
        </label>
      ))}
      {err && <span className="text-danger">{err}</span>}
    </div>
  );
}
