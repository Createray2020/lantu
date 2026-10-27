// Clerk 登入／註冊／使用者選單的外觀（2026/10/28 Ray：第一眼就是嵐途）。
//
// 做法：不用 @clerk/themes、不寫色碼——全部走 globals.css 的 token 工具類（bg-panel、text-tx、bg-brand…），
// 所以深／淺主題切換時 Clerk 的卡片會跟著站方一起換，themeUI.test「字串裡不留色碼」也照過。
// 字尾 `!`（Tailwind v4 的 important）是蓋過 Clerk 自帶樣式用的（它的 class 特異度比工具類高）。
// logo 走 /api/brand/logo（後台上傳的真 logo）；沒上傳就不帶，Clerk 只印標題。
import type { ClerkProvider } from "@clerk/nextjs";

type Appearance = NonNullable<React.ComponentProps<typeof ClerkProvider>["appearance"]>;

export function clerkAppearance(hasLogo: boolean): Appearance {
  return {
    // Clerk 7：原本的 layout 改名 options
    options: {
      ...(hasLogo ? { logoImageUrl: "/api/brand/logo", logoPlacement: "inside" as const } : {}),
      socialButtonsVariant: "blockButton",
      shimmer: false,
    },
    variables: {
      borderRadius: "12px",
      fontFamily: "var(--font-sans-loaded), 'Noto Sans TC', 'PingFang TC', system-ui, sans-serif",
      fontSize: "14px",
    },
    elements: {
      rootBox: "w-full",
      cardBox: "shadow-none! rounded-xl! border! border-line! bg-panel! w-full",
      card: "bg-panel! shadow-none! rounded-xl!",
      logoBox: "h-12! justify-center!",
      logoImage: "h-12! w-auto!",
      headerTitle: "text-tx! font-serif text-xl!",
      headerSubtitle: "text-tx2!",
      socialButtonsBlockButton: "bg-field! border-line2! text-tx! hover:bg-panel2!",
      socialButtonsBlockButtonText: "text-tx!",
      dividerLine: "bg-line!",
      dividerText: "text-tx3!",
      formFieldLabel: "text-tx2!",
      formFieldInput: "bg-field! border-line2! text-tx! focus:border-brand! focus:shadow-none!",
      formFieldInputShowPasswordButton: "text-tx2! hover:text-tx!",
      otpCodeFieldInput: "bg-field! border-line2! text-tx!",
      formFieldErrorText: "text-danger!",
      formFieldSuccessText: "text-ok!",
      formButtonPrimary: "bg-brand! text-onbrand! hover:bg-brand2! shadow-none! border-0! font-bold!",
      formResendCodeLink: "text-brand2!",
      alternativeMethodsBlockButton: "bg-field! border-line2! text-tx! hover:bg-panel2!",
      backLink: "text-brand2!",
      identityPreviewText: "text-tx!",
      identityPreviewEditButton: "text-brand2!",
      footer: "bg-panel! bg-none! border-t! border-line!",
      footerAction: "bg-panel!",
      footerActionText: "text-tx2!",
      footerActionLink: "text-brand2! hover:text-tx!",
      footerPages: "hidden!",
      badge: "bg-field! text-tx2!",
      // 使用者選單（頂欄右上）
      userButtonPopoverCard: "bg-panel! border! border-line! shadow-none! rounded-xl!",
      userButtonPopoverMain: "bg-panel!",
      userButtonPopoverActions: "bg-panel!",
      userButtonPopoverActionButton: "text-tx! hover:bg-panel2!",
      userButtonPopoverActionButtonText: "text-tx!",
      userButtonPopoverActionButtonIcon: "text-tx2!",
      userButtonPopoverFooter: "hidden!",
      userPreviewMainIdentifier: "text-tx!",
      userPreviewSecondaryIdentifier: "text-tx2!",
    },
  };
}
