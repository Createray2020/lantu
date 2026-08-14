import LandingView from "@/components/LandingView";

// 官網首頁的常駐公開路由：即使已登入（教練／客戶）也能回來看官網 landing，不自動跳轉。
// 教練端頁首「官網首頁」連結指向這裡。
export default function HomePage() {
  return <LandingView />;
}
