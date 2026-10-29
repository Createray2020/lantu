import type { ProfileDraft } from "@/components/SignerProfileForm";
import type { SignerProfile } from "./docsStore";

/** DB 的簽約資料 → 表單值（client component 吃的扁平型別）。 */
export function profileDraftOf(p: SignerProfile | null, seed: Partial<ProfileDraft> = {}): ProfileDraft | null {
  if (!p) return null;
  return {
    idNo: p.idNo ?? "", birthDate: p.birthDate ?? "", phone: p.phone ?? "", email: p.email ?? seed.email ?? "", address: p.address ?? "",
    invoiceKind: p.invoiceKind === "company" ? "company" : "personal", invoiceCarrier: p.invoiceCarrier ?? "", invoiceTaxId: p.invoiceTaxId ?? "", invoiceTitle: p.invoiceTitle ?? "",
  };
}
