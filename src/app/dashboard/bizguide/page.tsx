import { redirect } from "next/navigation";
import { ensureCoach } from "@/lib/coach";
import DashboardHeader from "@/app/dashboard/DashboardHeader";
import { headerProps } from "@/app/dashboard/headerProps";
import {
  BIZ_TAX_BASIS, PROFIT_TAX_RATE, UNDISTRIBUTED_RATE, DIVIDEND_SEPARATE_RATE,
  DIVIDEND_CREDIT_RATE, DIVIDEND_CREDIT_CAP, NHI_SUPP_RATE, NHI_SUPP_MIN,
  RENT_EXPENSE_RATE, VAT_RATE, CAR_DEPRECIATION_CAP, CAR_LEASE_DEPRECIATION_CAP,
  CAR_RENTAL_BIZ_CAP, PENALTY_EVASION, PENALTY_ASSIST, PENALTY_FALSE_BOOK,
  PENALTY_VAT_MULT, ASSESSMENT_YEARS, CORP_RESERVE_MONTHS, OWNER_EMERGENCY_MONTHS,
} from "@/lib/bizTax";

export const dynamic = "force-dynamic";

// 企業主財務規劃 · 作業手冊（唯讀知識庫）。
//
// 為什麼放在這裡而不是做成規劃案的欄位：
// 第一部 0–5 章（記帳流程、四大報表、401、營所稅）是**顧問要具備的背景知識**，
// 不是每個案子都要輸入的資料。把它做成欄位，只會讓輸入癱瘓——
// 而輸入一癱瘓，整個企業主模組就會空轉。
//
// 所有法規數字一律從 @/lib/bizTax 讀，不在本頁寫死。

const money = (v: number) => v.toLocaleString("zh-TW");
const pct = (v: number) => `${+(v * 100).toFixed(2)}%`;

function Card({ id, title, sub, children }: { id?: string; title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="rounded-xl border border-white/10 bg-[#0d2b45] p-5 scroll-mt-20">
      <h2 className="text-sm font-bold border-l-[3px] border-[#e0bd8b] pl-2 mb-1">{title}</h2>
      {sub && <p className="text-xs text-[#6f869c] mb-3">{sub}</p>}
      <div className="text-sm text-[#cfdcea] leading-relaxed space-y-3">{children}</div>
    </section>
  );
}

function Table({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse min-w-[520px]">
        <thead>
          <tr>{head.map((h) => <th key={h} className="px-3 py-2 font-semibold text-xs text-[#a9bccf] text-left whitespace-nowrap">{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>{r.map((cell, j) => (
              <td key={j} className={`px-3 py-2 border-t border-white/8 align-top ${j === 0 ? "font-semibold text-[#eef2f7] whitespace-nowrap" : ""}`}>{cell}</td>
            ))}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const NAV = [
  ["ask", "20 題提問清單"],
  ["flow", "六步會談流程"],
  ["data", "三批資料索取"],
  ["traps", "五個誤區"],
  ["scope", "專業邊界"],
  ["vat", "401 與 40 系列"],
  ["channel", "五條資金通道"],
  ["cal", "年度稅務行事曆"],
  ["red", "紅線與代價"],
  ["car", "租賃車的真相"],
  ["legal", "合法的替代路徑"],
  ["glossary", "名詞速查"],
];

export default async function BizGuidePage() {
  const me = await ensureCoach();
  if (!me) redirect("/dashboard");
  if (me.status !== "active") redirect("/dashboard");
  const hp = await headerProps(me);

  return (
    <main className="min-h-dvh bg-[#081a2b] text-[#eef2f7]">
      <DashboardHeader {...hp} />
      <section className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-4">
        <div>
          <h1 className="font-serif text-2xl">企業主財務規劃 · 作業手冊</h1>
          <p className="text-xs text-[#6f869c] mt-1">
            顧問的背景知識與現場工具。資料基準 {BIZ_TAX_BASIS}，法規數字統一維護於 <code className="text-[#e0bd8b]">src/lib/bizTax.ts</code>。
            本頁不構成稅務或法律建議。
          </p>
        </div>

        <nav className="flex flex-wrap gap-2">
          {NAV.map(([id, label]) => (
            <a key={id} href={`#${id}`} className="text-xs px-3 py-1.5 rounded-full border border-white/12 text-[#a9bccf] hover:border-[#e0bd8b] hover:text-[#e0bd8b]">
              {label}
            </a>
          ))}
        </nav>

        <Card title="核心命題" sub="所有提案的總綱">
          <p className="text-[#eef2f7]">
            企業主的財務規劃，本質是「把一個高度集中、不流動、與人身高度綁定的資產，
            逐步轉換成分散、流動、與人身脫鉤的資產」的過程。
          </p>
          <p>
            五個結構性差異讓受薪客戶那一套會失準：資產高度集中且不流動、
            <b className="text-[#eef2f7]">收入與資產同源（沒有分散效果）</b>、公私財務交纏、
            現金流由他自己決定、退休等於事業退場。
          </p>
        </Card>

        <Card id="ask" title="20 題提問清單" sub="B 組是核心；第 16、20 題答不出來，本身就是規劃需求成立的證明">
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <h3 className="text-xs text-[#a9bccf] mb-1">A. 公司面（暖身，建立專業感）</h3>
              <ol className="list-decimal list-inside space-y-1 text-[13px]">
                <li>公司是哪一年成立的？當初為什麼想做這一行？</li>
                <li>現在的營收大概是什麼量級？這三年的趨勢？</li>
                <li>主要客戶集中度如何？最大的一家佔多少營收？</li>
                <li>帳是誰在管？多久看一次財報？</li>
                <li>最近一次覺得資金緊張是什麼時候？</li>
              </ol>
            </div>
            <div>
              <h3 className="text-xs text-[#e0bd8b] mb-1">B. 公私交界面（核心，最有價值的一組）</h3>
              <ol className="list-decimal list-inside space-y-1 text-[13px]" start={6}>
                <li>公司的借款，你個人有簽連帶保證嗎？總金額大概多少？</li>
                <li>你自己在公司領多少薪水？當初怎麼決定這個數字的？</li>
                <li>這幾年有分配過股利嗎？如果沒有，是基於什麼考量？</li>
                <li>有沒有股東往來？是你借給公司，還是公司借給你？</li>
                <li>公司名下有沒有不動產、車輛或保單？</li>
                <li>你個人的存款，跟公司的備用金分得開嗎？</li>
              </ol>
            </div>
            <div>
              <h3 className="text-xs text-[#a9bccf] mb-1">C. 個人與家庭面</h3>
              <ol className="list-decimal list-inside space-y-1 text-[13px]" start={12}>
                <li>如果公司三個月沒有進帳，你家裡的開銷撐得住嗎？</li>
                <li>你目前的保險是什麼時候買的？有沒有重新檢視過？</li>
                <li>除了公司，你個人還有哪些資產？</li>
                <li>家人有參與公司經營嗎？</li>
              </ol>
            </div>
            <div>
              <h3 className="text-xs text-[#e0bd8b] mb-1">D. 未來面（最能打開規劃需求）</h3>
              <ol className="list-decimal list-inside space-y-1 text-[13px]" start={16}>
                <li className="text-[#eef2f7] font-semibold">如果明天你想退休，這家公司在沒有你的情況下，還值多少錢？</li>
                <li>你希望幾歲的時候可以不用每天進公司？</li>
                <li>有想過交棒給誰嗎？他準備好了嗎？</li>
                <li>如果你發生意外，公司會怎麼樣？家人拿得到什麼？</li>
                <li className="text-[#eef2f7] font-semibold">你把多少比例的身家放在這家公司？這個比例你安心嗎？</li>
              </ol>
            </div>
          </div>
        </Card>

        <Card id="flow" title="六步會談流程" sub="心態校正：你不是來查帳的，是來找出他還沒被服務到的缺口">
          <Table
            head={["步驟", "做什麼", "要點"]}
            rows={[
              ["1 建立信任", "從公司聊起，不談產品", "第一次會談不出示任何商品資料"],
              ["2 索取與解讀", "第一、二批資料", "用「我幫你做一份整合分析」當理由——這是給予，不是索取"],
              ["3 整合式資產表", "做出他從沒看過的那張表", "當他看到「流動性淨值」那個數字時，需求會自己浮現"],
              ["4 缺口診斷", "十二個訊號逐項掃描", "一次不要講超過三個缺口。講太多會癱瘓，不會行動"],
              ["5 分階段提案", "止血 → 優化 → 傳承", "3 個月 / 6–12 個月 / 1–3 年"],
              ["6 定期檢視", "綁定他既有的財務節奏", "每兩個月（401）、每季（財報）、每年五月（結算與分配決策）。搭他的班車，不要另外約時間"],
            ]}
          />
          <p className="text-xs text-[#6f869c]">
            關鍵句型：把「診斷」包裝成「確認」——「我看到 X，想跟你確認一下 Y」，這個句型幾乎不會引起防衛。
          </p>
        </Card>

        <Card id="data" title="三批資料索取" sub="不要一次全要。依敏感度分三批，隨信任度推進">
          <Table
            head={["批次", "要什麼", "用途"]}
            rows={[
              ["第一批\n低敏感度", "近三年財務報表、公司登記資料、產業與商業模式口頭說明", "體質與趨勢、收入穩定度與集中風險"],
              ["第二批\n中敏感度", "近三年營所稅結算申報書、近 6～12 期 401、現金流量表、股權結構表、銀行借款明細與保證條件", "最高效的兩份是「營所稅申報書 + 401」——前者顯示稅務風險，後者顯示真實營收，而且都已送進國稅局"],
              ["第三批\n高敏感度", "個人綜所稅申報書、現有保單、勞健保與勞退紀錄、個人資產負債概況、家庭狀況與接班意向", "整合式資產表、保障缺口、傳承規劃"],
            ]}
          />
          <p className="text-xs text-[#6f869c]">
            系統對應：E1「公司概況」的第一批只要五個數字（年營收／稅後淨利／總資產／總負債／持股%）就能產出整合式個人資產負債表。
          </p>
        </Card>

        <Card id="traps" title="規劃師常見的五個誤區">
          <Table
            head={["誤區", "後果", "正確做法"]}
            rows={[
              ["只看個人，不看公司", "看不到真實的資產與風險結構", "一律要求公司財報，這是企業主客戶的必要條件"],
              ["把公司股權當成流動資產", "高估可動用淨值，做出他執行不了的規劃", "放進資產表但獨立標註「不流動」，另算流動性淨值"],
              ["忽略個人連帶保證", "嚴重低估負債，保障額度算錯", "主動詢問每一筆借款的保證條件"],
              ["太早談產品", "客戶立刻進入防衛狀態，關係結束", "前三次會談的目標是「讓他覺得被理解」"],
              ["只做稅務或保險，不碰治理", "治標；客戶明年還是同樣的問題", "能指出「你要先整理帳」的顧問，才是長期夥伴"],
            ]}
          />
        </Card>

        <Card id="scope" title="專業邊界" sub="企業主客戶最容易辨識的，就是「這個人是來幫我，還是來賣我東西」">
          <Table
            head={["財務規劃師可以做", "應轉介給專業人士"]}
            rows={[
              ["解讀財報、指出結構性缺口", "記帳、稅務申報、稅務代理"],
              ["整合式資產負債表與現金流分析", "出具財務簽證、稅務簽證"],
              ["提出報酬結構的試算框架與取捨", "認定特定稅務處理的合法性"],
              ["保障缺口分析與規劃", "法律文件撰擬（股東協議、家族憲章）"],
              ["退休與傳承的議題盤點與時程規劃", "公司架構的法律設立與變更"],
              ["整合會計師、律師的協作", "代客戶做投資決策"],
            ]}
          />
          <p className="text-xs text-[#6f869c]">
            財報切入法之所以有效，正是因為它先給價值（一份他從沒有過的整合分析），才談需求。順序反了，工具再好也沒用。
          </p>
        </Card>

        <Card id="vat" title="401 與營業稅 40 系列" sub="401 只是一個減法：銷項稅額 − 進項稅額 = 應納或溢付">
          <Table
            head={["代號", "欄位", "怎麼讀"]}
            rows={[
              ["101 / 103", "銷售額（應稅 / 零稅率）", "真實營收趨勢線。二聯式發票金額是含稅的，換算時要除以 1.05"],
              ["107", "銷項稅額合計", "應稅銷售額 × " + pct(VAT_RATE)],
              ["108 / 110", "進項稅額（得扣抵 / 不得扣抵）", "交際費、酬勞員工個人、非供本業使用、自用小客車等六類不得扣抵"],
              ["111", "本期應納稅額", "如果只有 30 秒，看這個和 115"],
              ["112", "本期溢付稅額", "銷項小於進項時出現"],
              ["113", "得退稅限額", "零稅率銷售額 × 5% ＋ 固定資產進項稅額。這是溢付能退多少的天花板"],
              ["114", "本期應退稅額", "min(112, 113)"],
              ["115", "累積留抵稅額", "退不掉、只能留著抵未來的錢——這是一筆卡在國稅局的公司現金"],
            ]}
          />
          <p>
            <b className="text-[#eef2f7]">40 系列速記</b>：沒有 402 這個編號。401 是一般稅額計算（加值型）、403 是特種稅額計算、
            404 是總繳單位彙總、405/406 是外國事業或跨境電商相關；401／403／404 兼具申報書與繳款書功能。
          </p>
          <p className="text-xs text-[#6f869c]">
            401 與損益表對不起來是正常的（開票時點差異、零稅率、非營業收入、預收款、視為銷貨…）。
            <b className="text-[#cfdcea]">對不起來不是罪，說不出理由才是</b>——建議每年結帳時做一張「401 與帳載收入差異調節表」，被函查時可以直接交出去。
          </p>
        </Card>

        <Card id="channel" title="五條資金通道" sub="公司的錢合法變成你的錢只有這五條路，不能有第六種">
          <Table
            head={["通道", "公司端", "個人端", "附帶考量"]}
            rows={[
              ["薪資／董監酬勞", "可列費用", "薪資所得", "勞健保、勞退、二代健保；但也建立退休年資與貸款能力"],
              ["盈餘分配（股利）", "不可列費用", `合併計稅（可抵減 ${pct(DIVIDEND_CREDIT_RATE)}，上限 ${money(DIVIDEND_CREDIT_CAP)}）或分開計稅 ${pct(DIVIDEND_SEPARATE_RATE)}`, `單筆達 ${money(NHI_SUPP_MIN)} 扣二代健保補充保費 ${pct(NHI_SUPP_RATE)}`],
              ["租金", "可列費用", `租賃所得（必要費用可減除 ${pct(RENT_EXPENSE_RATE)}）`, "需有租賃契約與合理租金"],
              ["借款（股東往來）", "負債", "不課稅", "方向錯誤會有設算利息問題"],
              ["費用報銷", "可列費用", "不課稅", "必須是真實公司支出"],
            ]}
          />
          <p className="text-xs text-[#6f869c]">
            營所稅 {pct(PROFIT_TAX_RATE)}、未分配盈餘加徵 {pct(UNDISTRIBUTED_RATE)}。
            規劃師的價值在於把五條放在一起做「總稅負 ＋ 總保障 ＋ 總退休準備」的最適化，而不是單看某一條。
            涉及具體稅額與申報，應與客戶的記帳士／會計師共同確認。
          </p>
          <p className="text-xs text-[#6f869c]">
            雙層流動性：公司週轉金 {CORP_RESERVE_MONTHS[0]}～{CORP_RESERVE_MONTHS[1]} 個月固定支出；
            個人緊急預備金 {OWNER_EMERGENCY_MONTHS[0]}～{OWNER_EMERGENCY_MONTHS[1]} 個月家庭支出。兩層必須分開。
          </p>
        </Card>

        <Card id="cal" title="年度稅務行事曆" sub="這些都是可預測的大額現金流出，卻最常被漏掉">
          <Table
            head={["月份", "要做什麼"]}
            rows={[
              ["1 月", "401（11–12 月期）、各類所得扣繳憑單申報"],
              ["2 月", "扣繳憑單寄發給所得人"],
              ["3 月", "401（1–2 月期）"],
              ["5 月", "營所稅結算申報、未分配盈餘申報、個人綜所稅、401（3–4 月期）"],
              ["7 月", "401（5–6 月期）"],
              ["9 月", "營所稅暫繳、401（7–8 月期）"],
              ["11 月", "401（9–10 月期）"],
            ]}
          />
          <p className="text-xs text-[#6f869c]">
            暫繳有替代方式：當年度大幅衰退時，可依「當期實際營業結果」申報，少繳一些。
            申報方式（查帳 / 書審）每年五月前應重新試算，而不是沿用去年——實際純益率低於書審標準時用書審，等於多繳稅。
          </p>
        </Card>

        <Card id="red" title="紅線：節稅、避稅、逃稅" sub="最重要的一列是「事實基礎」">
          <Table
            head={["", "節稅", "避稅", "逃稅"]}
            rows={[
              ["事實基礎", "真實", "真實，但形式與實質不符", "虛假"],
              ["法律地位", "完全合法", "灰色，可能被依實質課稅原則調整補稅", "違法，有刑事責任"],
              ["後果", "無", "補稅，可能加罰", "補稅 ＋ 重罰 ＋ 刑責"],
              ["例子", "研發投資抵減、選擇有利的申報方式、未分配盈餘實質投資減除", "無實質的境外公司、不合常規的關係人交易", "買發票、虛列人頭薪資、收入不入帳"],
            ]}
          />
          <p>
            節稅與避稅的爭議在「解釋」——可以主張、可以爭訟，輸了頂多補稅。
            <b className="text-[#eef2f7]">逃稅的問題在「事實」——這件事根本沒發生，沒有辯論空間。</b>
          </p>
          <Table
            head={["層級", "依據", "代價"]}
            rows={[
              ["行政罰", "營業稅法 §51", `虛報進項稅額：追繳稅款外，按所漏稅額處 ${PENALTY_VAT_MULT} 倍以下罰鍰，並得停止營業`],
              ["刑事", PENALTY_EVASION.law, `${PENALTY_EVASION.jail}，併科 ${money(PENALTY_EVASION.fine)} 元以下罰金（110 年修法後大幅提高，網路上大量文章仍寫舊法的 6 萬）`],
              ["刑事", PENALTY_ASSIST.law, `教唆或幫助：${PENALTY_ASSIST.jail}，併科 ${money(PENALTY_ASSIST.fine)} 元以下罰金——介紹買賣發票的中間人也在射程內`],
              ["刑事", PENALTY_FALSE_BOOK.law, `${PENALTY_FALSE_BOOK.jail}，併科 ${money(PENALTY_FALSE_BOOK.fine)} 元以下罰金。處罰對象包含「依法受託代他人處理會計事務之人員」——記帳士與會計師也在射程之內`],
              ["連帶效應", "—", "銀行抽銀根、投標資格、上市櫃計畫終結、專業人士終止委任、DD 破局；補稅罰鍰是公司的，刑責是負責人個人的"],
            ]}
          />
          <p className="text-xs text-[#6f869c]">
            真正的問題不是「我會不會被抓」，而是「上游什麼時候爆」——而這完全不在你的控制範圍內。
            核課期間 {ASSESSMENT_YEARS.join(" 或 ")} 年，今年做的事可能五年後才被翻出來，屆時是累積數年一起補。
          </p>
        </Card>

        <Card id="car" title="租賃車：被誤解最深的一個做法" sub="這不是「買或租」的技術問題，是「這台車是不是真的營業用」的事實問題">
          <Table
            head={["情形", "營業稅進項稅額", "營所稅"]}
            rows={[
              ["自購自用小客車", "不得扣抵", `折舊實際成本上限 ${money(CAR_DEPRECIATION_CAP)} 元`],
              ["營業租賃（純租）", "准予扣抵", "租金可列為費用"],
              ["融資租賃", "不得扣抵（實質是分期付款買賣）", "依實質認定"],
              ["承租但以使用權資產入帳提折舊", "依上述判斷", `自 112 年度起上限亦為 ${money(CAR_LEASE_DEPRECIATION_CAP)} 元`],
              ["（租賃業者本身購車）", "—", `上限 ${money(CAR_RENTAL_BIZ_CAP)} 元——這是出租方的優惠，不是承租企業的`],
            ]}
          />
          <p>
            財政部 111 年 1 月令釋：承租自用乘人小客車，有下列任一情形<b className="text-[#eef2f7]">核屬分期付款買賣性質，進項稅額不得扣抵</b>——
            ①期滿所有權移轉 ②承租人得行使購買選擇權 ③租期達經濟年限 3/4
            ④最低租賃給付現值達公允價值 90% ⑤其他足資證明已移轉所有權風險與報酬者。
          </p>
          <p className="text-xs text-[#6f869c]">
            白話：如果這份「租約」實質上就是分期買車，稅法就當作買車處理。形式上叫租賃，不會改變實質。
            而如果實際是老闆或家人私用，本來就屬於「非供本業使用」——進項不得扣抵，費用也會被剔除。
          </p>
        </Card>

        <Card id="legal" title="合法的替代路徑" sub="只講風險不給出路，是沒有用的">
          <ol className="list-decimal list-inside space-y-2">
            <li><b className="text-[#eef2f7]">憑證管理制度化</b>（解決 80% 的問題）：能開發票的供應商優先——表面上貴 5%，但那 5% 可以扣抵；小額支出有法定的替代憑證方式；臨時工可納保、可辦扣繳，外包可簽約並申報執行業務所得。<b className="text-[#cfdcea]">付了錢就一定有合法的認列方式，差別只在流程有沒有做。</b>當下就分類，不要年底回頭補——回頭補的過程本身就是虛列的溫床。</li>
            <li><b className="text-[#eef2f7]">申報方式的年度試算</b>：書審 vs 查帳，每年五月前重新試算，不要沿用去年。</li>
            <li><b className="text-[#eef2f7]">合法的費用結構設計</b>：薪資、董監酬勞、租金的合理配置。前提是要有契約、要辦扣繳、要有合理性。</li>
            <li><b className="text-[#eef2f7]">租稅優惠盤點</b>：產創條例研發投資抵減、智慧機械／5G／資安設備投資抵減、中小企業增僱員工薪資加成減除、未分配盈餘實質投資減除（產創 §23-3）、產業專法優惠。這些都是稅法明文給的，用了不會有任何風險。</li>
            <li><b className="text-[#eef2f7]">資本支出的時點規劃</b>：固定資產進項稅額可計入得退稅限額，是少數能把留抵轉為現金退稅的合法途徑。</li>
            <li><b className="text-[#eef2f7]">主動補正（稅捐稽徵法 §48-1）</b>：自動補報並補繳所漏稅款者，凡屬未經檢舉、未經調查之案件，處罰一律免除，涉及刑事責任者並得免除其刑（補繳稅款須加計利息）。<b className="text-[#e0bd8b]">這是一扇會關上的門</b>——一旦被檢舉或已進入調查程序就不能用了。</li>
          </ol>
        </Card>

        <Card id="glossary" title="名詞速查">
          <Table
            head={["名詞", "白話"]}
            rows={[
              ["進項 / 銷項", "你買東西付的稅 / 你賣東西收的稅"],
              ["留抵稅額", "進項比銷項多，退不掉的部分先掛著，抵未來的營業稅"],
              ["設算利息", "公司把錢借給股東卻沒收利息，稅法「當作」你有收，要為它繳稅"],
              ["股東往來", "老闆與公司之間的借貸。掛資產方＝公司借你，掛負債方＝你借公司"],
              ["三欄式", "營所稅申報書的「帳載結算金額 / 自行依法調整後金額 / 核定」，差距大＝稅務風險集中"],
              ["未分配盈餘", "賺了但沒發給股東的部分，隔年加徵 " + pct(UNDISTRIBUTED_RATE)],
              ["書審", "書面審核，依同業純益率標準核定。省事但不一定省稅"],
              ["實質課稅原則", "看經濟實質而不是法律形式，避稅被調整補稅的依據"],
              ["CFC", "受控外國企業制度。已上路——符合定義又不符豁免者，境外公司不分配也要課稅"],
              ["PEM", "實際管理處所。立法完成、尚未施行；一旦適用，境外公司會被當本國公司課稅"],
              ["現金轉換循環", "應收天數 ＋ 存貨天數 − 應付天數。負數代表你在用別人的錢做生意"],
              ["自由現金流", "營業活動現金流 − 資本支出。正數才有能力分紅、還債、擴張"],
            ]}
          />
        </Card>

        <p className="text-xs text-[#6f869c] pb-6">
          本手冊為實務架構整理，依 {BIZ_TAX_BASIS} 台灣現行法規環境撰寫。稅法與相關法規時有修正，個別企業與家庭情況差異極大。
          文中所有稅務、法律相關內容<b>僅供理解架構之用，不構成稅務、法律或投資建議</b>。
          實際執行請與客戶的會計師、律師及相關專業人士共同確認。
        </p>
      </section>
    </main>
  );
}
