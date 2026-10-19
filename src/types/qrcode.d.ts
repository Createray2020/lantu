// qrcode 沒有內建型別；只宣告我們用到的那一支。
declare module "qrcode" {
  export function toString(
    text: string,
    opts?: { type?: "svg" | "utf8" | "terminal"; margin?: number; width?: number; errorCorrectionLevel?: "L" | "M" | "Q" | "H"; color?: { dark?: string; light?: string } },
  ): Promise<string>;
  const _default: { toString: typeof toString };
  export default _default;
}
