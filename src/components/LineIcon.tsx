// 線條圖示（2026/11/01 介面整理第一波）。
//
// 首頁區塊標題原本用表情符號（📅 ✅ 🎯 …）：每台電腦長得不一樣、顏色不受主題控制，跟襯線標題也不搭。
// 換成同一套 1.6px 細線圖示，顏色吃 currentColor，深淺兩套主題都跟著走。
// 呼叫端可以繼續傳原本的表情符號字串（iconFor 會對應），不用一次改完所有地方。

const P: Record<string, string> = {
  calendar: "M4 6.5h16v13.5H4zM4 10.5h16M8.5 3.5v4M15.5 3.5v4",
  check: "M5 12.5l4.5 4.5L19 7.5",
  target: "M12 4a8 8 0 1 0 0 16 8 8 0 1 0 0-16zM12 8a4 4 0 1 0 0 8 4 4 0 1 0 0-8z",
  shield: "M12 3.5l7 3v5c0 4.6-2.9 7.6-7 9.5-4.1-1.9-7-4.9-7-9.5v-5z",
  users: "M9 11.5a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4zM3.5 19.5c.6-3 2.8-4.8 5.5-4.8s4.9 1.8 5.5 4.8M16 5.3a3 3 0 0 1 0 5.6M17.5 14.7c1.6.6 2.7 2.2 3 4.6",
  megaphone: "M4 10v4h3l7 4V6L7 10zM17.5 9.5a3.5 3.5 0 0 1 0 5",
  money: "M3.5 7h17v10h-17zM12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM6.5 7v10M17.5 7v10",
  bank: "M3.5 9.5L12 4.5l8.5 5M5.5 10v7M10 10v7M14 10v7M18.5 10v7M3.5 19.5h17",
  doc: "M7 3.5h7l4 4V20.5H7zM14 3.5v4h4M9.5 12h6M9.5 15.5h6",
  compass: "M12 4a8 8 0 1 0 0 16 8 8 0 1 0 0-16zM15 9l-2 4.5L9 15l2-4.5z",
  trophy: "M8 4.5h8v4a4 4 0 0 1-8 0zM8 6H5a3 3 0 0 0 3 3.5M16 6h3a3 3 0 0 1-3 3.5M12 12.5v4M8.5 20h7M10 16.5h4",
  funnel: "M4 5h16l-6 7v6l-4 2v-8z",
  chart: "M4 19.5h16M6 16l4-5 3.5 3L19 7",
  building: "M5 20.5V4.5h9v16M14 9.5h5v11M8 8h3M8 11.5h3M8 15h3M3.5 20.5h17",
  medal: "M12 13a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM9 13.5L6.5 3.5h4l1.5 4 1.5-4h4L15 13.5",
  card: "M4 6.5h16v11H4zM7.5 10.5h4M7.5 13.5h9",
  handshake: "M3.5 11l4-4 3 2 3-2 4 4-5.5 5.5a1.5 1.5 0 0 1-2 0zM3.5 11l-1 1M20.5 11l1 1",
  diamond: "M7 4.5h10l3.5 5L12 20 3.5 9.5zM3.5 9.5h17M9.5 4.5L8 9.5l4 10.5 4-10.5-1.5-5",
  bell: "M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15zM10 20.5h4",
  dot: "M12 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4z",
};

const EMOJI: Record<string, keyof typeof P> = {
  "📅": "calendar", "✅": "check", "🎯": "target", "🛡️": "shield", "🛡": "shield", "👥": "users", "📢": "megaphone",
  "💵": "money", "💰": "money", "🏦": "bank", "📄": "doc", "🧭": "compass", "🏆": "trophy", "🧲": "funnel",
  "📈": "chart", "🏢": "building", "🏅": "medal", "📇": "card", "🤝": "handshake", "💎": "diamond", "🔔": "bell",
};

export type IconName = keyof typeof P;

export function iconFor(emojiOrName: string): IconName {
  return (emojiOrName in P ? emojiOrName : EMOJI[emojiOrName] ?? EMOJI[emojiOrName.replace(/️/g, "")] ?? "dot") as IconName;
}

/** 把「📅 近期行程」拆成圖示＋文字；沒有表情符號開頭就原樣回傳。 */
export function splitIconTitle(title: string): { icon: IconName | null; text: string } {
  const m = title.match(/^(\p{Extended_Pictographic}️?)\s*(.*)$/u);
  return m ? { icon: iconFor(m[1]), text: m[2] } : { icon: null, text: title };
}

export default function LineIcon({ name, size = 16, className = "" }: { name: string; size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" className={`shrink-0 ${className}`}
      fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <path d={P[iconFor(name)]} />
    </svg>
  );
}
