/* eslint-disable */
// @ts-nocheck
// 嵐途財務引擎 — 由 v12 單檔原型移植的純函式（無 DOM/狀態）。
//
// ⚠️ 雙實作：本檔與 public/lantu-app.html 是同一套邏輯的兩份實作。
//    engine.ts 算的是「寫進 DB 的快照」(planSnapshot/planMetrics)，
//    lantu-app.html 算的是「使用者在 iframe 看到的數字」。兩邊漂移＝列表與畫面對不上。
//    src/lib/engine.test.ts 有一組「雙實作對拍」測試會正則比對關鍵公式，改任何計算務必兩邊一起改。
import { defaultIntent, PURPOSES, TARGETS } from "@/lib/intent";
import {
  TAX_BR, EXEMPT_PER_PERSON, STD_DED_MARRIED, STD_DED_SINGLE, SALARY_SPECIAL,
  EST_BR, ESTATE_EXEMPT, ESTATE_SPOUSE_DED, ESTATE_LINEAL_DED, ESTATE_FUNERAL_DED,
  LABOR_INS_GRADES, LABOR_PENSION_RATE, LABOR_INS_ANNUITY_RATE, LABOR_PENSION_CAP,
  LABOR_INS_ANNUITY_RATE_A, LABOR_INS_ANNUITY_BONUS_A, LABOR_ANNUITY_MIN_YEARS,
  LABOR_PENSION_FUND_RATE, yearsSinceYm,
  laborInsSalary, laborPensionSalary,
  NP_YEAR, NP_INSURED_MONTHLY, NP_RATE_A, NP_BONUS_A, NP_RATE_B, LABOR_LIKE_INS,
  JOB_TYPES, NO_EMPLOYER_JOBS, isNoEmployerJob, jobInsType, ageFromBirth,
  PROF_EXPENSE, profStdRate, profExpenseRate,
  HOUSE_TAX_RATE, LAND_TAX_RATE,
  NHI_YEAR, NHI_RATE, NHI_SALARY_MIN, NHI_SALARY_MAX, NHI_SALARY_GRADES, NHI_DEP_CAP,
  NHI_CATS, nhiSelfRatio, nhiJobCat, nhiSalaryOf,
} from "@/lib/taiwan";
// 二代健保補充保費與產險基準參數（後台 biz_tax_params 可調）。
import {
  NHI_SUPP_RATE, NHI_SUPP_MIN, NHI_SUPP_YEAR, NHI_SUPP_CAP, NHI_SUPP_BONUS_MULT, NHI_SUPP_WAGE_MIN,
  PROP_INS_YEAR, QUAKE_BASIC_SUM, QUAKE_LODGING, PROP_PING_COST, PROP_BUILDING_RATIO,
  CAR_LIAB_BODILY, CAR_LIAB_PROPERTY, CALI_DEATH, CALI_MEDICAL,
  EMPLOYER_COMP_MONTHS, PUBLIC_LIAB_STD,
} from "@/lib/bizTax";

// 保障險種。2026/08 對齊 Excel 需求分析三大塊（責任／重病重殘／醫療）：
//  ・「意外險」更名「意外傷殘」——需求分析問的是傷殘失能，不是意外醫療雜支。
//  ・新增「醫療雜費」（住院雜費，實支實付的主戰場）與「薪資補償」（失能所得）。
//  ・「癌症住院」保留不刪：既有案子已經填了值，拿掉會靜默歸零；UI 收進選填區。
// 舊資料的 coverages[].kind 仍可能是「意外險」，由 KIND_ALIAS 正規化，不會對不上。
//  ・2026/08/29「薪資補償」拆成「薪資補償（日）」「薪資補償（月）」兩個險種（Ray 拍板）：
//    改版前需求端標「日額」、保單端標「(月)」、單位表寫「元/月」，三種說法卻直接對減。
//    拆開之後日對日、月對月，缺口表出兩列，刻意**不做任何隱藏換算**。
//    舊資料的 kind='薪資補償' 由 KIND_ALIAS 一律歸到「月」（見 KIND_ALIAS 的註解）。
var KINDS=['壽險','意外傷殘','住院醫療','醫療雜費','薪資補償（日）','薪資補償（月）','初次罹癌','癌症住院','重病給付','每月照護'];
// 舊值正規化。'薪資補償' → 月額：保單端的欄位本來就標 (月)、引擎的單位表也是元/月，
// 這是多數慣例；⚠️ 刻意不依金額大小猜單位（3,000 看起來像日額，但那是猜的）。
var KIND_ALIAS={'意外險':'意外傷殘','薪資補償':'薪資補償（月）'};
function kindNorm(k){return KIND_ALIAS[k]||k;}
// ===== 險種的給付單位：一次性給付（元）／日額（元/日）／月額（元/月）=====
// ⚠️⚠️ 這是「保障缺口三個總額怎麼分堆」（gapTotals）與五欄表單位欄的**唯一**依據。
//    改版前 totalGap() 把三種單位直接相加，示範案 5,629,396 裡混著住院醫療 3,000 元/日、
//    癌症住院 2,000 元/日、每月照護 30,000 元/月——那個數字沒有任何意義。
var KIND_UNIT={'壽險':'元','意外傷殘':'元','住院醫療':'元/日','醫療雜費':'元',
 '薪資補償（日）':'元/日','薪資補償（月）':'元/月','初次罹癌':'元','癌症住院':'元/日',
 '重病給付':'元','每月照護':'元/月'};
function kindUnit(k){return KIND_UNIT[kindNorm(k)]||'元';}

var EDU_STAGES=['嬰兒','幼稚園','小學','國中','高中職','大學','研究所','博士班'];

let __uidSeq=0;
function uid(){return 'c'+Date.now().toString(36)+(__uidSeq++).toString(36)+Math.floor(Math.random()*1e6).toString(36)}

function sampleCase(){return {
 id:uid(),
 profile:{name:'王大明(示範)',gender:'男',birth:'',age:40,retireAge:65,lifeExp:85,credit:700,jobTypeOther:''},
 // ⚠️ 2026/08/29 移除 params.freeSaving（自由儲蓄%）：全庫 61 份一律是範本預設的 1，
 //    沒有任何人改過，也沒有任何一支函式讀它——一個填得進去卻不影響任何結果的欄位，
 //    留著只會讓教練以為自己在調整什麼。UI 的輸入框一併拿掉。
 params:{inflation:1.5,salaryGrowth:2,invReturn:5,tuitionGrowth:3,planSaving:0,emergencyMonths:6,horizon:85,invReturnStd:12,inflationStd:1,salaryStd:1},
 tracking:[{year:2024,age:40,net:9500000},{year:2025,age:41,net:9950000}],
 riskQuiz:{ans:{0:1,1:2,2:2,3:2,4:1,5:2,6:2,7:2,8:2,9:2,10:2,11:2}},
 members:[
  {name:'王大明',role:'本人',gender:'男',age:40,worked:15,insType:'勞保',insSalary:45800,depRatio:100,expRatio:40,indepAge:''},
  {name:'王太太',role:'配偶',gender:'女',age:38,worked:12,insType:'勞保',insSalary:40100,depRatio:0,expRatio:30,indepAge:''},
  {name:'王小寶',role:'子女',gender:'男',age:6,worked:0,insType:'健保眷屬',insSalary:0,depRatio:0,expRatio:15,indepAge:26}
 ],
 incomes:[{owner:'王大明',type:'工作',amount:1200000,growth:2,start:40,end:65},{owner:'王太太',type:'工作',amount:700000,growth:2,start:40,end:60}],
 expenses:[
  {name:'生活費用',cat:'生活',amount:720000,infl:true,start:40,end:85,cut:10},
  {name:'孝親費',cat:'孝親',amount:240000,infl:false,start:40,end:70,cut:20},
  {name:'保險費',cat:'保險',amount:120000,infl:false,start:40,end:85,cut:0},
  {name:'綜合所得稅',cat:'稅賦',amount:150000,infl:false,start:40,end:85,cut:0}
 ],
 assets:[
  {name:'現金與活存',owner:'王大明',mainCat:'自用資產',type:'現金',cls:'流動',region:'台灣',currency:'台幣',fxRate:1,cost:2000000,value:2000000,ret:0.5,income:0,movable:true},
  {name:'定存',owner:'王大明',mainCat:'可投資資產',type:'定存',cls:'流動',region:'台灣',currency:'台幣',fxRate:1,cost:2000000,value:2000000,ret:1.2,income:24000,movable:true},
  {name:'美股組合',owner:'王大明',mainCat:'可投資資產',type:'股票',cls:'流動',region:'美國',currency:'美金',fxRate:32,cost:120000,value:140000,ret:6,income:2800,movable:true},
  {name:'投資型保單',owner:'王大明',mainCat:'可投資資產',type:'基金',cls:'流動',region:'台灣',currency:'台幣',fxRate:1,cost:3000000,value:3000000,ret:5,income:120000,movable:true},
  {name:'自住房',owner:'王大明',mainCat:'自用資產',type:'不動產',cls:'固定',region:'台灣',currency:'台幣',fxRate:1,cost:14000000,value:15000000,ret:0,income:0,movable:false}
 ],
 liabilities:[{name:'房貸',owner:'王大明',mainCat:'房貸',currency:'台幣',fxRate:1,balance:10000000,rate:2,repay:'本息攤還',pay:42000,months:300,grace:0,startAge:38}],
 retire:{monthLiving:55000,replaceRate:75,retireReturn:4,retireInflation:1.5,prepared:[{item:'勞退',age:65,amount:3000000,method:'一次領'}]},
 // 退休期支出＝「賺薪成員都退休後」的家庭年支出；每列可各自設起訖歲。
 retireExpenses:[
  {name:'退休生活費',cat:'生活',subCat:'餐食',period:'年',amount:480000,infl:true,startAge:'',endAge:''},
  {name:'醫療與保健',cat:'生活',subCat:'醫療/健康',period:'年',amount:120000,infl:true,startAge:'',endAge:''},
  {name:'退休旅遊(前十年)',cat:'消費',subCat:'旅遊',period:'年',amount:200000,infl:true,startAge:65,endAge:75},
  {name:'長期照護',cat:'生活',subCat:'醫療/健康',period:'年',amount:360000,infl:true,startAge:80,endAge:''}
 ],
 education:[
  {child:'王小寶',stage:'大學',annual:250000,years:4,startIn:12},
  {child:'王小寶',stage:'研究所',annual:280000,years:2,startIn:16}
 ],
 goals:[
  {name:'購車',type:'購車',present:1000000,minPresent:600000,start:45,end:45,freq:0,growth:'固定',imp:3,prepared:0,loanRatio:0,appreciation:0},
  {name:'換屋',type:'購屋',present:12000000,minPresent:10000000,start:50,end:50,freq:0,growth:'固定',imp:4,prepared:0,loanRatio:70,appreciation:2}
 ],
 travel:[
  {cat:'國內',sub:'認知旅遊',start:40,end:80,freq:3,amount:20000,minAmount:15000,imp:4},
  {cat:'國外',sub:'認知旅遊',start:40,end:80,freq:1,amount:150000,minAmount:100000,imp:4}
 ],
 hobby:[{sub:'體能類',start:40,end:75,freq:12,amount:3000,minAmount:2000,imp:2}],
 luxury:[{sub:'首飾配件',start:41,end:41,freq:1,amount:300000,minAmount:0,imp:2}],
 needs:[
  {member:'王大明',funeral:600000,protectYears:5,estateTax:0,room:2000,selfPay:1500,nursing:1500,miscDaily:3000,incomeCompDay:0,incomeCompMonth:50000,disability:3000000,firstCancer:300000,cancerHosp:2000,critical:2000000,monthCare:30000,careMonths:120}
 ],
 coverages:[
  {member:'王大明',kind:'壽險',comm:0,social:0},
  {member:'王大明',kind:'住院醫療',comm:0,social:0}
 ],
 policies:[
  // ⚠️ 示範案原本的保單表只有 76,500，卻在支出寫「保險費 120,000」——自己跟自己對不上。
  // 保費改由保單表投影之後這個矛盾會直接顯示出來，所以補一張儲蓄壽險把差額補齊，
  // 順便讓理財金三角的「理財型保費」在示範案裡不再是 0。
  {insured:'王大明',name:'增額儲蓄壽險',subtype:'增額/儲蓄壽險',premium:43500,life:0,accident:0,medical:0,medMisc:0,incomeCompDay:0,incomeCompMonth:0,firstCancer:0,cancerHosp:0,critical:0,monthCare:0,cashValue:300000},
  {insured:'王大明',name:'國泰終身醫療',premium:47536,life:0,accident:0,medical:2000,medMisc:100000,incomeCompDay:0,incomeCompMonth:0,firstCancer:0,cancerHosp:0,critical:0,monthCare:0,cashValue:0},
  {insured:'王大明',name:'重大傷病定期',premium:20100,life:0,accident:0,medical:0,firstCancer:0,cancerHosp:0,critical:2000000,monthCare:0,cashValue:0},
  {insured:'王大明',name:'定期壽險',premium:8864,life:3000000,accident:1000000,medical:0,firstCancer:0,cancerHosp:0,critical:0,monthCare:0,cashValue:0}
 ],
 intent:{purposes:['想增加收入','想進行投資、活化資產','有節稅需求，想進行節稅'],targets:['退休生活規劃','子女教養規劃','購屋規劃','孝親規劃'],mustHave:['退休生活規劃','子女教養規劃']},
 savings:[
  {name:'定期定額 ETF',subCat:'定期定額ETF/基金',period:'月',amount:120000},
  {name:'儲蓄險保費',subCat:'儲蓄保險保費',period:'年',amount:60000}
 ],
 legacy:{on:true,heirs:2,perHeirCash:20000000,perHeirNote:'每人一間房',feedEstate:true},
 nextReview:'2025-06-01',
 career:{plan:'無',switchAge:'',switchFund:'',startupType:'',startupBudget:'',importance:2},
 marriage:{plan:'否',age:'',budget:'',minBudget:'',importance:0},
 credit:{cards:7,payFull:'是',firstCardOver1yr:'是',installment:'無',badRecord5yr:'否',recentApply:'有辦卡',score:''},
 overseas:{hasAssets:'是',identity:'否',purpose:'投資',assetTypes:'股票'},
 taxParams:{married:true,dependents:1,otherDeduction:0,houseAssessed:1200000,landAssessed:3000000,carTax:18010},
 plan:{retireDelay:5,movableToOverseas:20000000,allocations:[
  {name:'海外保單(現金流)',pct:37,ret:5,benefit:'增加理財收入、傳承、節稅'},
  {name:'外匯/程式交易',pct:30,ret:6,benefit:'月現金流、節稅'},
  {name:'美國股票',pct:16,ret:7,benefit:'資產增值'},
  {name:'台灣投資型保單',pct:11,ret:8,benefit:'壽險保障+月現金流'},
  {name:'生活預備金',pct:6,ret:1,benefit:'流動安全網'}
 ]}
};}

function defaultCompany(){return {name:'',taxId:'',industry:'',role:'負責人',sharePct:100,annualRevenue:0,netProfit:0,ownerLoan:0,note:''};}

function newCase(){var c=sampleCase();c.id=uid();c.profile.name='新客戶';['incomes','expenses','savings','retireExpenses','assets','liabilities','education','goals','needs','coverages','policies','tracking','travel','hobby','luxury'].forEach(function(k){c[k]=[]});c.params.invReturnStd=12;c.params.inflationStd=1;c.params.salaryStd=1;c.members=[{name:'本人',role:'本人',gender:'男',age:40,worked:0,insType:'勞保',insSalary:0,depRatio:100,expRatio:100,indepAge:''}];c.retire={monthLiving:0,retireReturn:4,retireInflation:1.5,prepared:[]};c.taxParams={married:false,dependents:0,otherDeduction:0,estateDeduction:0};c.plan={retireDelay:0,movableToOverseas:0,allocations:[]};
 // profile.credit 是信用評分的舊欄位（與 credit.score 雙寫）。sampleCase 帶 700 分，
 // 這裡若不一併清掉，新客戶會憑空拿到示範資料的評分並白送約 12.5 分財務安全度。
 c.profile.credit='';
 c.intent=defaultIntent();c.career={plan:'無',switchAge:'',switchFund:'',startupType:'',startupBudget:'',importance:0};c.marriage={plan:'否',age:'',budget:'',minBudget:'',importance:0};c.credit={cards:0,payFull:'是',firstCardOver1yr:'否',installment:'無',badRecord5yr:'否',recentApply:'無',score:''};c.overseas={hasAssets:'否',identity:'否',purpose:'',assetTypes:''};c.legacy={on:true,heirs:0,perHeirCash:0,perHeirNote:'',feedEstate:false};c.nextReview='';c.riskQuiz={ans:{}};
 // 與 lantu-app.html 的 newCase() 對齊：少了這幾個欄位，新客戶進 iframe 後價值輪與報告備註會是 undefined。
 c.profile.birth='';c.profile.jobType='一般就業者';c.profile.jobTypeOther='';c.profile.monthlySalary=0;c.profile.jobCompany='';c.profile.jobTitle='';c.profile.jobNote='';c.company=defaultCompany();c.lifeGoals=[];c.reportNote='';
 return c}

// 「本人」成員；找不到就退回第一位。壽險缺口的流動資產抵充、勞保勞退概算都以他為準。
function primaryMember(c){return ((c&&c.members)||[]).filter(function(m){return m.role==='本人'})[0]||((c&&c.members)||[])[0];}

// 信用評分有兩個輸入口（家庭/參數的 profile.credit、信用/海外的 credit.score），已雙寫同步。
function creditScoreOf(c){return n(((c||{}).credit||{}).score)||n(((c||{}).profile||{}).credit);}

function n(v){v=Number(v);return isNaN(v)?0:v}

function sum(a,f){return (a||[]).reduce(function(s,x){return s+f(x)},0)}
// 風險性資產 / 消費性負債的判定。
// 後台細類（/admin/categories）帶的旗標在選類別時就寫進資料列了，優先採用；
// 舊資料沒有旗標，退回改版前的字串比對，既有客戶的數字不會變。
// public/lantu-app.html 有一份對照實作（engine.drift.test.ts 對拍），改這裡要一起改。
function isRiskAsset(a){if(a&&(a.risk===true||a.risk===false))return a.risk;
 return !!a&&(a.type==='股票'||a.type==='基金'||a.type==='債券'||(a.type==='不動產'&&a.mainCat==='可投資資產'));}
function isConsumerDebt(l){if(l&&(l.consumerDebt===true||l.consumerDebt===false))return l.consumerDebt;
 return !!l&&(l.mainCat==='信貸'||/信|卡|消費/.test(l.name||''));}

// Infinity 不擋的話會原字串印到畫面上（例：月數為 0 的貸款試算 → 「月繳 Infinity」）。
function fmt(v){v=n(v);if(!isFinite(v))return '—';v=Math.round(v);return v.toString().replace(/\B(?=(\d{3})+(?!\d))/g,',')}

function esc(s){return (s==null?'':String(s)).replace(/[&<>"]/g,function(m){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]})}

function pct(x){x=Number(x);if(!isFinite(x))return '—';return (x*100).toFixed(2)+'%'}

// 年利息負擔＝現齡當年的應計利息。⚠️ 刻意維持「原始餘額 × 年利率」的既有口徑
// （不改成 lRemain，那會動到每一個既有個案的利息數字，是另一件事）。
// 只付利息 → 這正好就是實付；暫緩還款 → 利息照樣發生，只是沒付、滾進本金。
function annualDebtInterest(c){var a0=n(c.profile.age);return sum(c.liabilities,function(l){var sa=n(l.startAge)||a0;return (a0>=sa)?lBal(l)*n(l.rate)/100:0})}

// 年應付本息。⚠️ 走 debtPayAt()，攤還方式與寬限期在這裡生效。
function annualDebtPay(c){var a0=n(c.profile.age);return sum(c.liabilities,function(l){return debtPayAt(l,a0,a0)})}

function familyAnnualLiving(c){return sum(c.expenses,function(e){return (e.cat==='生活'||e.cat==='消費')?n(e.amount):0})}

// 父母奉養費。責任遞減圖一直有把它算進身故責任，但 lifeNeed() 的需求反推漏了，
// 兩張圖對同一個客戶會給出不同的壽險缺口。2026/08 補進 lifeNeed。
function familyAnnualParentSupport(c){return sum(c.expenses,function(e){return e.cat==='孝親'?n(e.amount):0})}

// 支出側手動登錄的貸款支出（大類「貸款」）。
// 負債表那邊由 annualDebtPay() 反推，兩者相加＝家庭貸款總支出；
// 手動列是給「沒登在負債表的貸款」用的，UI 會標出可能重複的細類。
// ⚠️ 與 annualDebtPay 一樣只算現齡有效的列（貸款壓力比的分子，口徑要跟分母一致）。
function manualLoanPay(c){return sum(c.expenses,function(e){return (e.cat==='貸款'&&activeNow(c,e))?n(e.amount):0})}

// 儲蓄理財投入（c.savings[]）。不進總支出——在原表它就放在總支出之外。
// ⚠️ 2026/08/29 接上每一列的起訖（start/end）：範本本來就寫 start/end，
//    改版前 savingInvest() 卻只加總 amount，等於「30 歲存到 65 歲」與「一輩子都在存」
//    在有效儲蓄率上一模一樣。走既有的 activeNow()／inSpan()——留空＝全期間有效。
function savingInvest(c){return sum(c.savings,function(x){return activeNow(c,x)?n(x.amount):0})}

// ===== 起訖（start / end）語意的唯一真相 =====
// ⚠️ 留空一律當「全期間有效」，不是 0–0（＝立刻失效）。
//    起訖欄位走 set(...,'num')，教練把欄位清空存進去的是數字 0；
//    舊資料（syncPremium 自動建的人身保費列）存的是空字串。兩種都代表「沒設這個界線」，
//    舊寫法 age<n(e.start)||age>n(e.end) 會被 n('')===0 判成 age>0 → 整列一毛都不計。
// ⚠️ 收支加總（metrics / ratios / crossTable）與逐年投影（projection）一律走這一支，
//    這就是「同一份資料只有一套口徑」的保證。engine.drift.test.ts 逐字對拍。
function inSpan(x,age){
 var s=n(x&&x.start),e=n(x&&x.end);
 if(s>0&&age<s)return false;
 if(e>0&&age>e)return false;
 return true;
}
// 比率／體檢的「現齡」＝ projection 第 0 年的那個年齡（含 ||40 的退回），兩邊才對得上。
function nowAge(c){return n((c&&c.profile||{}).age)||40;}
// 現齡有效：metrics / ratios / crossTable 的每一筆收支都要過這一關。
function activeNow(c,x){return inSpan(x,nowAge(c));}

// ===== 模擬到幾歲（horizon）：預設綁死「預估壽命」，可手動覆寫 =====
// 舊版兩個欄位互不校驗：壽命改 85→95、horizon 留 85，退休總需求跳了 740 萬，
// 投影卻還是只跑到 85 → shortPV 一動也不動。
// ⚠️ 相容舊資料：params.horizonManual 不存在時，horizon 與 lifeExp 相同視為「未覆寫」、
//    不同視為「已覆寫」——既有那 7 份不一致的個案數字一位不動。
function horizonManual(c){
 var p=(c&&c.params)||{},pr=(c&&c.profile)||{};
 if(p.horizonManual===true)return true;
 if(p.horizonManual===false)return false;
 var h=n(p.horizon),le=n(pr.lifeExp);
 return h>0&&le>0&&h!==le;
}
// 投影／蒙地卡羅／時間軸圖一律吃這個值，不要再直接讀 params.horizon。
function effHorizon(c){
 var p=(c&&c.params)||{},pr=(c&&c.profile)||{};
 if(horizonManual(c))return n(p.horizon)||85;
 return n(pr.lifeExp)||n(p.horizon)||85;
}

// 資產布局（Excel「資產布局規劃」）：核心／衛星／短期保留／生活用。
// 預設由既有欄位推導，a.layer 有值才視為顧問手動覆寫。
// 只用於呈現，不改任何既有比率的分母分子——換算法會讓所有舊案的指標跳動。
function assetLayer(a){
 if(a&&a.layer)return a.layer;
 if(!a)return '核心';
 if(a.mainCat==='自用資產')return '生活用';
 return isRiskAsset(a)?'衛星':'核心';
}
function assetLayout(c){
 var out={'核心':0,'衛星':0,'短期保留':0,'生活用':0};
 (c.assets||[]).forEach(function(a){var k=assetLayer(a);if(out[k]==null)out[k]=0;out[k]+=aVal(a);});
 return out;
}

function aVal(a){return n(a.value)*(n(a.fxRate)||1)}

function aInc(a){return n(a.income)*(n(a.fxRate)||1)}

function lBal(l){return n(l.balance)*(n(l.fxRate)||1)}

function lPay(l){return n(l.pay)*(n(l.fxRate)||1)}

// ===== 攤還方式（liabilities[].repay）與寬限期（liabilities[].grace）=====
// ⚠️⚠️ 改版前 lRemain()／annualDebtPay() 一律套「本息攤還」＋ pay×12：
//    選「只付利息」「暫緩還款」跟選「本息攤還」算出來一模一樣，grace（寬限期月數）
//    更是全站沒有任何讀取點。實測庫內有 5 筆（李育鏷 2 筆、零 3 筆）在裸奔。
// 語意（台灣實務）：
//  ・只付利息：每期只繳息，本金一毛不減 → 剩餘本金恆等於原始餘額，年現金流＝餘額 × 年利率。
//  ・暫緩還款：本息都不付，**利息滾入本金**（緩繳／展期銀行不會白送這段利息，
//    到期一次結清或重新攤還）→ 本金以複利長大，該年現金流＝0。
//    ⚠️ 這是「本金會變大」的唯一一種模式，生涯藍圖的淨資產會因此往下修——那是實話。
//  ・寬限期 grace（月）：前 N 個月只繳息、本金不動，第 N 個月之後才開始攤本金。
//    ⚠️ 判斷粒度是「年」（跨越寬限期結束的那一年整年算只繳息），與 projection 逐年一格
//       的解析度一致，不做月內插值。
// ⚠️ 未填 repay（或填「本息攤還」）＝維持改版前語意，既有個案一位不動。
// ⚠️ 選單裡的「本金平均」這一輪**不接**（全庫 0 筆在用），仍照本息攤還算；
//    要接得讓 annualDebtPay 逐年變動（本金固定、利息遞減），是另一件事，已在回報提出。
function repayMode(l){var r=(l&&l.repay)||'';return (r==='只付利息'||r==='暫緩還款')?r:'本息攤還';}
function graceMonths(l){var g=n(l&&l.grace);return g>0?Math.round(g):0;}

// 貸款剩餘本金。舊版用「餘額 − 月繳×12×年數」線性遞減，把每期利息也當本金攤掉，
// 2% 的 1000 萬房貸第 10 年會少算約 170 萬負債，生涯藍圖的淨資產因此系統性樂觀。
function lRemain(l,age,a0){
 var sa=n(l.startAge)||a0; if(age<sa)return 0;
 var P=lBal(l); if(P<=0)return 0;
 var k=Math.max(0,Math.round((age-sa)*12));
 var total=n(l.months); if(total>0)k=Math.min(k,total);
 var i=n(l.rate)/12/100, pay=lPay(l);
 var mode=repayMode(l);
 if(mode==='只付利息')return P;                                  // 本金一毛不減
 if(mode==='暫緩還款')return (i<=0)?P:P*Math.pow(1+i,k);          // 利息滾入本金
 var g=graceMonths(l); if(g>0)k=Math.max(0,k-g);                  // 寬限期內本金不動
 if(pay<=0)return P;
 if(i<=0)return Math.max(0,P-pay*k);
 var f=Math.pow(1+i,k);
 return Math.max(0,Math.min(P,P*f-pay*(f-1)/i));
}
// 某一年要付出去的負債現金流。
// ⚠️⚠️ annualDebtPay()／projection()／monteCarlo() 三邊一律走這一支——
//    改版前三處各自寫了一模一樣的 `(age>=sa&&months-el>0)?lPay(l)*12:0`，
//    攤還方式一接上就會變成「投影照本息付、比率表只付息」這種對不上的狀態。
function debtPayAt(l,age,a0){
 var sa=n(l.startAge)||a0; if(age<sa)return 0;
 var el=(age-sa)*12;
 if(!(n(l.months)-el>0))return 0;                                 // 已經還完
 var mode=repayMode(l);
 if(mode==='暫緩還款')return 0;                                    // 本息都不付
 if(mode==='只付利息')return lBal(l)*n(l.rate)/100;                // 只繳息
 if(el<graceMonths(l))return lRemain(l,age,a0)*n(l.rate)/100;      // 寬限期內只繳息
 return lPay(l)*12;
}

// ===== 資產被動現金流：收益金額（income）優先，其次報酬率（assets[].ret）=====
// ⚠️⚠️ 改版前的判斷是「income 為 null/'' 才看 ret」，而 addRow 的資產範本**一律寫 income:0**
//    → 新建的資產列永遠走不到 ret 那一支，41 筆填了報酬率的資產（現金活存 0.5%、
//      儲蓄型保單現值 2% …）一毛被動收入都沒產生。教練填了一個純裝飾的欄位。
// 新語意：**收益金額有正值就用收益金額，否則有填報酬率就用「現值 × ret%」**。
//  ・也不再限定股票/基金/債券——活存利息、儲蓄險增值一樣是被動現金流。
//  ・addRow 的資產範本同步改成 income:''，讓「沒填收益」與「真的填 0」分得開。
//  ⚠️ 這一項會讓既有客戶的理財收入、財務自由度、投影收入全部往上動——見乾跑報告。
function assetPassive(c){return sum(c.assets,function(a){
 if(aMatured(c,a))return 0;          // 到期之後就不再生錢（債權還本、租約結束）
 var inc=aInc(a);
 if(inc>0)return inc;
 return n(a.ret)>0?aVal(a)*n(a.ret)/100:0;})}

// ⚠️⚠️ 資產的流動性有時間性：私人債權還完款、租約到期之後，那筆錢就變成可動用的現金。
//    全站吃 cls 的地方一律走這支，不要再直接讀 a.cls。
//    ⚠️ 這些呼叫點**全部都是現值快照**（沒有 age 參數），所以「到期年齡」的效果會在
//    實際過了那一歲之後才反映，不會出現在逐年模擬裡。這是刻意的：把流動性也做成
//    逐年是另一件大工程，而緊急預備金月數、核心資產比本來就是現值指標。
function aCls(a,curAge){
 if(!a)return '固定';
 var m=n(a.matureAge);
 if(m>0&&n(curAge)>=m)return '流動';
 return a.cls==='流動'?'流動':'固定';
}
function aLiquid(c,a){return aCls(a,n(((c||{}).profile||{}).age))==='流動';}
// 到期之後這筆資產就不再生錢了（債權還本、租約結束）。
function aMatured(c,a){var m=n((a||{}).matureAge);return m>0&&n(((c||{}).profile||{}).age)>=m;}
function liquidMovable(c){return sum(c.assets,function(a){return (aLiquid(c,a)&&a.movable)?aVal(a):0})}

// ---------- 願景選定閘 ----------
// 財務規劃的第一步是「先選定要執行哪些願景」，沒選的完全不進計算：
// 不進一生需求、不上時間軸、也不會被壓縮槓桿動到。
// ⚠️⚠️ 一定要用 `on!==false` 判斷，不可以寫成 `!!x.on`：
//     舊資料完全沒有 on 欄位（undefined），必須視為「已選定」，
//     否則既有客戶的願景會在改版當下全部消失、缺口一夜歸零。
function visionOn(x){return !x||x.on!==false}

function lifestyleFactor(c,age,factor){var s=0;[c.travel,c.hobby,c.luxury].forEach(function(arr){(arr||[]).forEach(function(it){if(!visionOn(it))return;if(inSpan(it,age))s+=n(it.amount)*(n(it.freq)||1)*factor})});return s;}

function lifestyleAnnualNow(c){return lifestyleFactor(c,n(c.profile.age),1);}

function eduTotal(c){var g=n(c.params.tuitionGrowth)/100;
 return sum(c.education,function(e){return n(e.annual)*n(e.years)*Math.pow(1+g,n(e.startIn))})}

// ===== 退休期：三段式金流 =====
// 家庭的生活/消費支出不是「某一天整批切換」——本人先退、配偶後退，中間有一段混合期。
// 權重 w = 已退休賺薪成員的支出比例合計 ÷ 全體賺薪成員的支出比例合計（0→1）：
//   家庭該年支出 = 非生活類（各自照起訖歲）＋ 工作期生活消費×(1−w) ＋ 退休期支出×w
// 舊版的錯：生活費列跑到 85 歲，retire.monthLiving 又疊一次 → 退休後的生活費被算兩次。
// 降級路徑（既有客戶不會壞）：配偶沒填退休年齡／支出比例全空 → 只剩本人一個切換點，w 直接 0→1。
function isEarnerRole(r){return r==='本人'||r==='配偶';}
function isLivingCat(cat){return cat==='生活'||cat==='消費';}
// 每位賺薪成員的退休，換算成「本人幾歲時發生」——投影的時間軸是本人年齡。
function earnerRetirePoints(c){
 var a0=n((c.profile||{}).age),out=[];
 ((c||{}).members||[]).forEach(function(m){
  if(!m||!isEarnerRole(m.role))return;
  var isP=(m.role==='本人');
  var ra=isP?n((c.profile||{}).retireAge):n(m.retireAge);
  var ma=isP?a0:n(m.age);
  if(!(ra>0))return;
  out.push({name:m.name||'',primary:isP,share:Math.max(0,n(m.expRatio)),at:a0+(ra-ma)});
 });
 return out;
}
// 沒有任何賺薪成員填退休年齡時的預設切換點。
// ⚠️ 舊版在 pts 為空時 retiredWeight 一律回 0 → retireDraw 永遠 0、工作期生活費照 (1−0) 全額算，
//    退休期支出整段從投影裡消失，畫面上還一聲不吭。有數字總比靜靜歸零好，
//    但一定要讓 UI 明說「這 65 是系統假設的、不是客戶填的」→ retireAgeAssumed()。
var DEFAULT_RETIRE_AGE=65;
// 沒有任何賺薪成員填退休年齡 → true（UI 據此顯示假設提示）。
function retireAgeAssumed(c){return earnerRetirePoints(c).length===0;}
// 給 retiredWeight 用的退休時點：真的一個都沒有時，退回「本人 65 歲一次切換」。
function retirePoints(c){
 var pts=earnerRetirePoints(c);
 if(pts.length)return pts;
 return [{name:((primaryMember(c)||{}).name)||'',primary:true,share:0,at:DEFAULT_RETIRE_AGE,assumed:true}];
}
// 某一年的「已退休權重」0~1。
function retiredWeight(c,age){
 var pts=retirePoints(c);
 if(!pts.length)return 0;
 var tot=0;pts.forEach(function(p){tot+=p.share;});
 if(tot<=0){
  // 支出比例% 沒填 → 退回「本人退休即全面切換」，不要除以零
  var p0=null;pts.forEach(function(p){if(p.primary)p0=p;});p0=p0||pts[0];
  return age>p0.at?1:0;
 }
 var done=0;pts.forEach(function(p){if(age>p.at)done+=p.share;});
 return done/tot;
}
// 退休期支出（＝賺薪成員都退休後的家庭年支出）。
// c.retireExpenses[] 有列就逐列算（可各自設起訖歲：照護費 80 歲後才上來、旅遊前十年高），
// 沒有就退回舊的 retire.monthLiving×12——既有客戶的數字不變。
function retireAnnual(c,age,inflFactor){
 var list=(c||{}).retireExpenses||[];
 var ra=n((c.profile||{}).retireAge),le=n((c.profile||{}).lifeExp)||n((c.params||{}).horizon)||999;
 if(!list.length)return n(c.retire&&c.retire.monthLiving)*12*inflFactor;
 var s=0;
 list.forEach(function(e){
  var st=n(e.startAge)||ra, en=n(e.endAge)||le;
  if(age<st||age>en)return;
  s+=n(e.amount)*(e.infl===false?1:inflFactor);
 });
 return s;
}
// 工作期側的家庭支出：非生活類照舊，生活＋消費只算「還沒退休的那部分」。
function workPhaseExpense(c,age,inflFactor,w){
 var s=0;
 ((c||{}).expenses||[]).forEach(function(e){
  if(!inSpan(e,age))return;
  var v=n(e.amount)*(e.infl?inflFactor:1);
  s+=isLivingCat(e.cat)?v*(1-w):v;
 });
 return s;
}

// 成長型年金現值：每期成長 g、折現 rr、共 m 期，第 1 期落在 1 年後年底。
// ⚠️ 與 retireNeed() 算 total 用的是同一條公式——需求端與已備端用同一把尺，
//    「月領剛好等於每月需求」的個案才會乾淨地相消。
// ⚠️ 名字不可以叫 annuityPV——那個名字已經被「追蹤表的定期定額現值」佔用了
//    （annuityPV(pmt,yrs,ratePct)，簽章完全不同）。html 是同一個全域命名空間，
//    撞名會讓後宣告的那一支靜靜蓋掉前面那一支。
function growingAnnuityPV(annual,rr,g,m){
 annual=n(annual);m=n(m);
 if(!(m>0)||!annual)return 0;
 if(Math.abs(rr-g)<1e-6)return annual*m/(1+rr);
 return annual*(1-Math.pow((1+g)/(1+rr),m))/(rr-g);
}
// ===== 已準備退休金的「領取方式」（retire.prepared[].method）=====
// ⚠️⚠️ 改版前 retireNeed() 只 sum(amount)：填「月領 30,000」被當成「一次領 3 萬」，
//    UI 上那個下拉選單從頭到尾沒有任何讀取點。
// 語意（Ray 2026/08/29 拍板「全部接上」）：
//  ・一次領（含未填）＝退休當下就位的一筆錢，原值計入。
//  ・月領＝**每月**領取金額，換算成退休期的年金現值：年領＝amount×12，
//    以退休期報酬率 retire.retireReturn 折現、退休通膨 retire.retireInflation 成長，
//    期數＝預估壽命 − 起領年齡。起領年齡（p.age）晚於退休年齡時，再折回退休年。
//  ・自提＝勞退自提。專戶累積的是一筆本金，退休時可一次領也可月退，
//    欄位本身沒有交代是哪一種 → **當一次領**（原值計入）。已列入回報請 Ray 拍板。
// ⚠️⚠️ 金額單位的坑：這個欄位的 label 只寫「金額」，庫內 30 筆「月領」裡有 26 筆
//    填的是六、七位數（勞退新制 2,707,500、商業年金 6,300,000）——那是**總額**不是月額。
//    引擎照拍板的語意做（月領＝月額），刻意**不依金額大小猜單位**（與 KIND_ALIAS 同一條原則）；
//    UI 改成當場顯示「≈ 換算總額」讓錯的資料自己現形，並已在回報裡請 Ray 拍板要不要加單位欄。
// ⚠️⚠️ 月額合理性守門員（PREPARED_MONTHLY_MAX）。
//    這**不是**「依金額大小猜單位」（那是 KIND_ALIAS 明文禁止的事——猜的是「這個值屬於
//    哪一個險種」）。這是**輸入合理性驗證**：每月 30 萬以上的退休月退金在台灣不存在
//    （勞保老年年金上限約 2.8 萬／月），這種數字只可能是把「總額」填進了月額欄。
//    2026/08/29 乾跑實測：庫內 30 筆「月領」有 26 筆填的是 1,147,500 ~ 7,560,000，
//    照月額換算會得出 2.2 億 ~ 17.9 億的現值，20 位客戶的退休缺口一夜歸零——
//    那不是「大幅改變」，那是把還差 1,200 萬的客戶報成「已經準備好了」。
//    所以超過上限的月領列**不換算**：維持改版前的原值計入（數字一位不動），
//    同時標 suspect=true 讓 UI 當場示警，請教練把金額改成月額。
//    ⚠️ 一定要留活路：教練確認「這真的是月額」時，在該列勾「確認為月額」（monthlyOk）
//       就會照常換算，不會有資料永遠算不出來。
var PREPARED_MONTHLY_MAX=300000;
function preparedSuspect(p){
 return ((p&&p.method)||'')==='月領'&&!(p&&p.monthlyOk)&&n(p&&p.amount)>PREPARED_MONTHLY_MAX;
}
function preparedPV(c,p){
 var r=(c&&c.retire)||{},pr=(c&&c.profile)||{};
 var amt=n(p&&p.amount);
 if(((p&&p.method)||'一次領')!=='月領')return amt;        // 一次領／自提／未填
 if(preparedSuspect(p))return amt;                        // 金額看起來是總額不是月額 → 不換算，等教練確認
 var ra=n(pr.retireAge),le=n(pr.lifeExp);
 var from=n(p&&p.age)||ra;                                 // 起領年齡，沒填就從退休年起算
 if(from<ra)from=ra;                                       // 早於退休年的一律從退休年起算
 var rr=n(r.retireReturn)/100,g=n(r.retireInflation)/100;
 var pv=growingAnnuityPV(amt*12,rr,g,Math.max(0,le-from));
 var back=from-ra;
 return (back>0&&rr>-1)?pv/Math.pow(1+rr,back):pv;
}

function retireNeed(c){
 var r=c.retire||{},age=n(c.profile.age),ra=n(c.profile.retireAge),le=n(c.profile.lifeExp);
 var infl=n(c.params.inflation)/100, g=n(r.retireInflation)/100, rr=n(r.retireReturn)/100;
 var years=Math.max(0,ra-age), m=Math.max(0,le-ra);
 // 分子改吃「退休期支出表」：退休當年的家庭年支出（終值）。沒填明細表就退回 monthLiving。
 var hasList=!!((c.retireExpenses||[]).length);
 var annualFV=hasList?retireAnnual(c,ra,Math.pow(1+infl,years)):n(r.monthLiving)*12*Math.pow(1+infl,years);
 var monthFV=annualFV/12;
 var total;
 if(hasList){
  // 退休期支出可以逐列設起訖歲（照護費 80 歲後才上來、旅遊只到 75），
  // 年金封閉式公式吃不到這種分段 → 逐年折現加總。
  // 註：金額一律相同時，這個迴圈的結果與下面的封閉式完全等價。
  // 第 k+1 期在退休後第 k+1 年年底 → 對應年齡 ra+1+k（與封閉式年金的期數定義一致，
  // 也與 projection() 的「age > 退休年齡才計退休期支出」對得上）。
  total=0;
  for(var k=0;k<m;k++){
   total+=retireAnnual(c,ra+1+k,Math.pow(1+infl,years)*Math.pow(1+g,k))/Math.pow(1+rr,k+1);
  }
 }
 else if(Math.abs(rr-g)<1e-6){total=annualFV*m/(1+rr);}
 else{total=annualFV*(1-Math.pow((1+g)/(1+rr),m))/(rr-g);}
 // 已備退休金：逐列依「領取方式」換算成退休當下的現值（見 preparedPV）。
 // preparedRows 給 UI 用：月領那一列旁邊要顯示「≈ 換算總額」，教練才看得懂那一列被當成什麼在算。
 var preparedRows=(r.prepared||[]).map(function(p){
  var method=(p&&p.method)||'一次領';
  var sus=preparedSuspect(p);
  return {item:(p&&p.item)||'',age:n(p&&p.age),amount:n(p&&p.amount),method:method,
   pv:preparedPV(c,p),converted:method==='月領'&&!sus,suspect:sus};
 });
 var prepared=sum(preparedRows,function(p){return p.pv});
 // valid=false 代表「退休年齡 ≥ 預期壽命」，余年 0 → total/gap 都是 0。
 // 呼叫端要據此顯示「參數有誤」而不是「沒有退休缺口」。
 return {years:years,余年:m,monthFV:monthFV,total:total,prepared:prepared,preparedRows:preparedRows,gap:Math.max(0,total-prepared),valid:m>0};
}

// 某位成員簽下的連帶保證餘額。沒指定保證人的舊列一律歸給「本人」。
// ⚠️ 這一份算的是寫進 DB 的快照（plans.health_grade / net_worth），
//    必須和 public/lantu-app.html 的同名函式保持一致，engine.drift.test.ts 會擋。
function guaranteeFor(c,member){var pm=(primaryMember(c)||{}).name;
 return sum(c.guarantees,function(g){return ((g.owner||pm)===member)?n(g.balance):0})}

// ⚠️⚠️ 這一支回的是「淨缺口」，不是「需求」。
// 毛需求在 grossLifeNeed()，這裡再扣掉已備壽險與家庭可變現流動資產。
// 絕對不可以把它拿去當 coverageGaps() / coverageCheckupRows() 的 need——
// 那兩支自己還會再扣一次已備，已備被扣兩次，壽險缺口會整個消失
// （2026/08/24 實測示範案：需求被報成 324 萬、已備 1,448 萬，缺口 −1,123 萬＝「無缺口」，
//  但同一份資料的保障準備度是 82%、五欄表說還差 324 萬）。
function lifeNeed(c,nd){
 return Math.max(0,grossLifeNeed(c,nd) - existingCover(c,nd.member,'壽險') - liquidMovable(c));
}

function medicalDailyNeed(nd){return n(nd.room)+n(nd.selfPay)+n(nd.nursing)}

function memberDep(c,name){var m=(c.members||[]).find(function(x){return x.name===name});return m?n(m.depRatio):100}

var POLICY_MAP={'壽險':'life','意外傷殘':'accident','住院醫療':'medical','醫療雜費':'medMisc','薪資補償（日）':'incomeCompDay','薪資補償（月）':'incomeCompMonth','初次罹癌':'firstCancer','癌症住院':'cancerHosp','重病給付':'critical','每月照護':'monthCare'};

// 需求列／保單列上的保額欄位取值，含舊欄位相容。
// ⚠️⚠️ 舊的單一欄位 incomeComp 一律讀成「月額」（保單端的欄位本來就標 (月)、單位表也是元/月）。
//    migrateCase() 會把它搬成 incomeCompMonth 並標 incomeCompLegacy，但那只跑在瀏覽器端；
//    engine.ts 這一份跑在伺服器（planSnapshot 寫 plans.health_grade），拿到的是 plans.data
//    原封不動的舊資料，不會經過 migrateCase——所以相容一定要做在「讀取」這一層。
function coverAmt(x,f){
 if(f==='incomeCompMonth'){var v=x&&x.incomeCompMonth;return (v==null||v==='')?n(x&&x.incomeComp):n(v);}
 return n(x&&x[f]);
}

function existingCover(c,member,kind){
 var fromCov=sum(c.coverages,function(cv){return (cv.member===member&&kindNorm(cv.kind)===kindNorm(kind))?(n(cv.comm)+n(cv.social)):0});
 var f=POLICY_MAP[kindNorm(kind)];var fromPol=f?sum(c.policies,function(p){return (policyActive(p)&&p.insured===member)?coverAmt(p,f):0}):0;
 return fromCov+fromPol;
}

// 調整動作提供的保額。⚠️ 只算啟用中的，而且要同時對到「成員」與「險種」。
// 動作沒指定成員時算在主要成員身上（教練最常排的就是本人的家庭責任保障）。
function actionCover(c,member,kind){
 var pm=(primaryMember(c)||{}).name;
 return sum(planActionsOn(c),function(a){
  if(a.cat!=='insure')return 0;
  if((a.coverKind||'壽險')!==kind)return 0;
  return (((a.member||'').trim()||pm)===member)?n(a.cover):0;
 });
}
// 綜合保障缺口＝毛需求 − 毛已備。
// ⚠️ 壽險走 grossLifeNeed()，與 coverageReadiness()／coverageCheckupRows() 同一條分子；
//    三處的「需求」必須是同一個數字，coverageGap.test.ts 釘住。
function coverageGaps(c){
 var rows=[];
 (c.needs||[]).forEach(function(nd){
  var map={
   '壽險':grossLifeNeed(c,nd),
   '意外傷殘':n(nd.disability),
   '住院醫療':medicalDailyNeed(nd),
   '醫療雜費':n(nd.miscDaily),
   '薪資補償（日）':coverAmt(nd,'incomeCompDay'),
   '薪資補償（月）':coverAmt(nd,'incomeCompMonth'),
   '初次罹癌':n(nd.firstCancer),
   '癌症住院':n(nd.cancerHosp),
   '重病給付':n(nd.critical),
   '每月照護':n(nd.monthCare)
  };
  Object.keys(map).forEach(function(k){
   var need=map[k],ex=existingCover(c,nd.member,k);
   // 已備來源擴充：本人的壽險一次性需求，可由家庭流動資產支應（與 lantu-app.html:453 一致）。
   if(k==='壽險'&&nd.member===(primaryMember(c)||{}).name)ex+=liquidMovable(c);
   // 調整動作裡的保障類：保額算進「已備」。
   // ⚠️ 不接這一條的話，買保險在試算上永遠只是「保費讓缺口變大」，
   //    教練排了保障動作卻看到情況更糟——那是錯的訊號。
   ex+=actionCover(c,nd.member,k);
   var row={member:nd.member,kind:k,need:need,have:ex,gap:need-ex};
   // 「每月照護」多帶長照月數與換算總額（見 careMonthsOf）。⚠️ 只是佐證欄位，
   //    gapTotals()／health()／shortPV 一律不看它們。
   if(k==='每月照護'){
    var cm=careMonthsOf(nd);
    row.months=cm.months;row.monthsAssumed=cm.assumed;
    row.needTotal=need*cm.months;row.haveTotal=ex*cm.months;
    row.gapTotal=Math.max(0,need-ex)*cm.months;
   }
   rows.push(row);
  });
 });
 return rows;
}

// ===== 長照月數（needs[].careMonths）：把「每月照護」換算成長照總需求 =====
// ⚠️⚠️ 改版前 careMonths 完全沒有讀取點：教練填的「每月 3 萬 × 120 個月 ＝ 360 萬」
//    這個長照總需求從來沒在畫面上出現過，缺口只比得出「每月 3 萬」的月額。
// ⚠️⚠️ 缺口已經拆成 {lump, daily, monthly} 三堆（gapTotals），「每月照護」屬 monthly。
//    careMonths 換算出來的總額**刻意不併進 lump**——那會違反 Ray 2026/08/29
//    「三種給付單位不相加」的拍板。它的定位是月額那一列旁邊的**佐證數字**：
//    「每月缺口 30,000 元/月 × 120 個月 ≈ 3,600,000 元」，讓月額有重量感，但不進任何分數。
var DEFAULT_CARE_MONTHS=120;   // 未填時的假設：10 年。庫內 60 筆有填的眾數就是 120，也是長照規劃的慣用期間。
// 回 {months, assumed}：assumed=true 代表這 120 是系統假設的、不是客戶填的，UI 一定要標出來。
function careMonthsOf(nd){
 var m=n(nd&&nd.careMonths);
 return m>0?{months:m,assumed:false}:{months:DEFAULT_CARE_MONTHS,assumed:true};
}
// 每一位被保人的長照換算列。⚠️ 全部是佐證數字，不進 gapTotals / health / shortPV。
function careNeedRows(c){
 return coverageGaps(c).filter(function(g){return g.kind==='每月照護';}).map(function(g){
  return {member:g.member,monthly:g.need,have:g.have,gap:g.gap,
   months:g.months,assumed:g.monthsAssumed,
   needTotal:g.needTotal,haveTotal:g.haveTotal,gapTotal:g.gapTotal};
 });
}

// ===== 保障缺口總額：一次性給付 vs 定期給付，刻意不相加（Ray 2026/08/29 拍板）=====
// 改版前 totalGap() 把「元」「元/日」「元/月」直接相加：示範案的 5,629,396 裡混著
// 住院醫療 3,000 元/日、癌症住院 2,000 元/日、每月照護 30,000 元/月——那個數字沒有意義。
// ⚠️ 分堆的依據只有 KIND_UNIT 一份（kindUnit），不要在呼叫端各自判斷險種名稱。
// 文案原則（Ray 的核心命題）：缺口是常態，是「還沒被安排到的那一段」，不是不及格。
function gapTotals(c){
 var t={lump:0,daily:0,monthly:0};
 coverageGaps(c).forEach(function(g){
  var v=Math.max(0,g.gap);if(v<=0)return;
  var u=kindUnit(g.kind);
  if(u==='元/日')t.daily+=v;else if(u==='元/月')t.monthly+=v;else t.lump+=v;
 });
 return t;
}
// 各單位的「需求」基數，給準備度／riskCover 當分母用（分子分母一定要同一堆）。
function gapNeedBase(c){
 var t={lump:0,daily:0,monthly:0};
 coverageGaps(c).forEach(function(g){
  var u=kindUnit(g.kind),v=n(g.need);
  if(u==='元/日')t.daily+=v;else if(u==='元/月')t.monthly+=v;else t.lump+=v;
 });
 return t;
}
// ⚠️ 向後相容的呼叫方式：仍然回一個數字，但語意已收斂成「一次性給付缺口」。
//    src/lib/snapshot.ts（不在本輪可改範圍）用它寫 plans 快照的 gap 欄位；
//    那一欄本來就該是與保額同維度、可以直接比的數字，日額／月額不該混進去。
function totalGap(c){return gapTotals(c).lump}
// 保障準備度用的「毛需求」：與 lifeNeed() 同一條分子，但**不扣已備**。
// html 端一直有這一支（coverageReadiness 用它），engine.ts 之前缺席；
// 2026/08/24 保單檢查報告的五欄表要毛對毛，兩邊都得有。
// ===== 財務獨立歲（members[].indepAge）：責任遞減 =====
// ⚠️⚠️ UI 一直明說「到 N 歲後，其『支出比例』份額會自動從壽險保障需求中移除」，
//    但改版前只有 deathProjection()（那張責任遞減圖）真的照做，grossLifeNeed() 完全沒看它
//    → 同一份資料「圖上責任遞減、需求數字不遞減」，UI 的承諾是空的。
// ⚠️ 篩選條件與 deathProjection() 的 deps 逐字一致：不是被保人自己、indepAge 有填、支出比例 > 0。
function indepDeps(c,name){
 return ((c||{}).members||[]).filter(function(x){
  // ⚠️ indepAge 留空／0 ＝「沒設財務獨立歲」＝全程都算進責任，與全站 start/end 的
  //    「≤0 代表不設界線」同一條規則（inSpan）。0 絕對不能讀成「一出生就獨立」。
  return !!x&&x.name!==name&&n(x.indepAge)>0&&n(x.expRatio)>0;});
}
// 家庭生活費實際要保障幾「年」：protectYears 年裡逐年扣掉當年已經財務獨立的成員份額。
// ⚠️ 沒有任何成員填 indepAge（或都還沒到獨立歲）→ 等於 protectYears，既有個案一位不動。
// ⚠️ 只作用在「家庭生活費」那一項。孝親（父母奉養）不套用——父母不會財務獨立。
function protectYearsEff(c,nd){
 var yrs=Math.max(0,n(nd&&nd.protectYears));
 var deps=indepDeps(c,nd&&nd.member);
 if(!deps.length||!yrs)return yrs;
 var s=0;
 for(var y=0;y<yrs;y++){
  var frac=0;
  for(var j=0;j<deps.length;j++){var d=deps[j];if(n(d.age)+y>=n(d.indepAge))frac+=n(d.expRatio)/100;}
  s+=Math.max(0,1-Math.min(1,frac));
 }
 return s;
}
// ===== 「清償負債」與「準備教育金」該不該算進這個人的壽險需求 =====
// ⚠️⚠️ 2026/08/30 Ray 拍板。改版前 grossLifeNeed() 把全部負債餘額與全部教育金加進
//    **每一位**被保人的需求，不分他有沒有在賺錢——3 歲的孩子會被算出
//    「房貸 920 萬 ＋ 兩個孩子的學費 ＋ 喪葬」＝ 1,436 萬的壽險缺口，
//    而教練得當著客戶的面解釋那個數字。
//    需求分析問的是「這個人走了，家裡少掉什麼」：孩子走了，家庭收入沒有減少，
//    房貸不會需要立刻清償、學費也不會突然變成缺口。
// ⚠️ 判定順序：手動勾選 > 角色。needs 列上的 payDebt／fundEdu 只要是布林就聽它
//    （成年子女是主要經濟來源這種情況，教練自己勾）；沒設才依角色。
// ⚠️ 成員名字對不上（打錯字、改名還沒同步）一律回 true，維持改版前的行為。
//    一個字打錯就把整筆需求靜默歸零，比「算多了」難發現得多。
function needRoleOf(c,name){
 var m=((c||{}).members||[]).filter(function(x){return !!x&&x.name===name})[0];
 return m?(m.role||''):null;
}
function needCoversDebt(c,nd){
 if(typeof (nd&&nd.payDebt)==='boolean')return nd.payDebt;
 var r=needRoleOf(c,nd&&nd.member);
 return r===null?true:isEarnerRole(r);
}
function needCoversEdu(c,nd){
 if(typeof (nd&&nd.fundEdu)==='boolean')return nd.fundEdu;
 var r=needRoleOf(c,nd&&nd.member);
 return r===null?true:isEarnerRole(r);
}
// 父母奉養（孝親）同一條規則。它跟前兩項的差別是：孝親本來就有資料層的解法
// （保障年數填 0 就沒了），所以改版前不算「沒有出口」；但語意上是同一件事——
// 孩子走了，家裡不會因此少一筆給阿嬤的錢。
function needCoversParents(c,nd){
 if(typeof (nd&&nd.supportParents)==='boolean')return nd.supportParents;
 var r=needRoleOf(c,nd&&nd.member);
 return r===null?true:isEarnerRole(r);
}
function grossLifeNeed(c,nd){var famLiving=familyAnnualLiving(c);
 return n(nd.depRatioOverride!=null?nd.depRatioOverride:memberDep(c,nd.member))/100*famLiving*protectYearsEff(c,nd)
  +(needCoversParents(c,nd)?familyAnnualParentSupport(c)*n(nd.protectYears):0)
  +(needCoversDebt(c,nd)?sum(c.liabilities,function(l){return lBal(l)}):0)
  +(needCoversEdu(c,nd)?eduTotal(c):0)+n(nd.funeral)+n(nd.estateTax)
  +guaranteeFor(c,nd.member);}


// ===== 保單檢查報告：HAVE vs NEED vs 狀況 vs 調整方向 =====
// 2026/08/24 對齊 insure80 的五欄比對表（項目｜現在保單 HAVE｜現在需求 NEED｜狀況｜調整方向 READJUST）。
// 刻意只做「比對與判定」三張表（保費／保障／$領回）——給付明細那 90+ 項屬於「呈現」，
// 走 policyBenefitRows()／benefitsByGroup()，不進這裡的比對，也不進 coverageGaps()。
// 為什麼不把 KINDS 從 9 擴到 90：coverageGaps() 的長度是 needs.length × KINDS.length，
// 下游 totalGap／health 的 riskCover／advice／報告書全部吃它；而 needs 那張表也會從 15 欄變 90 欄。
// insure80 自己的健檢也只比三項，生命資產表才是 90+ 項——兩者本來就是兩套東西。
var CHECKUP_BAND=10;      // %：|have−need|÷need 落在此帶內視為「適中」
var TRIANGLE_RISK=10;     // 理財金三角：保障型保費佔年收入 %
var TRIANGLE_INVEST=30;   // 理財金三角：理財型保費佔年收入 %
// 後台 /admin/categories「保單健檢」群組（走 bizTaxParams 同一張表）一存就覆蓋。
function applyCheckupParams(values){
 if(!values||typeof values!=='object')return;
 var setters={CHECKUP_BAND:function(x){CHECKUP_BAND=x},TRIANGLE_RISK:function(x){TRIANGLE_RISK=x},TRIANGLE_INVEST:function(x){TRIANGLE_INVEST=x}};
 Object.keys(setters).forEach(function(k){
  var x=Number(values[k]);
  if(isFinite(x)&&values[k]!==null&&values[k]!==undefined&&values[k]!=='')setters[k](x);
 });
}
var CHECKUP_LABEL={low:'偏低',high:'偏高',mid:'適中'};
// need 為 0 時：有保額＝偏高（買了不需要的），沒保額＝適中（沒需求也沒買，不必動）。
function checkupState(have,need,band){
 var b=(band==null?CHECKUP_BAND:n(band))/100;
 have=n(have);need=n(need);
 if(need<=0)return have>0?'high':'mid';
 var r=(have-need)/need;
 return r>b?'high':(r<-b?'low':'mid');
}
function checkupRow(item,have,need,unit,band){
 var st=checkupState(have,need,band);
 return {item:item,have:n(have),need:n(need),unit:unit||'元',state:st,label:CHECKUP_LABEL[st],
  delta:st==='mid'?0:Math.abs(n(need)-n(have)),
  dir:st==='low'?'可增加':(st==='high'?'可減少':'不須調整')};
}

// ── 保費類型：保障歸保障、理財歸理財 ──
// 舊保單沒有 premiumType 欄位，由險種細分推；教練可在保單卡上覆寫。
var INVEST_SUBS=['增額/儲蓄壽險','投資型壽險','年金'];
function premiumType(p){
 if(p&&p.premiumType)return p.premiumType;
 return (p&&INVEST_SUBS.indexOf(p.subtype)>=0)?'理財型':'保障型';
}
function policyActive(p){return !!p&&p.status!=='失效'&&p.status!=='停效';}
function annualPremiumBy(c,type){
 return sum(c.policies,function(p){return (policyActive(p)&&premiumType(p)===type)?n(p.premium):0;});
}
// 1 保費：兩列。NEED 走理財金三角佔家庭年收入的比例。
function premiumCheckup(c){
 var inc=n((crossTable(c)||{}).incTotal);
 var prot=annualPremiumBy(c,'保障型'),inv=annualPremiumBy(c,'理財型');
 return {income:inc,total:prot+inv,protect:prot,invest:inv,
  ratio:inc>0?(prot+inv)/inc:0,
  rows:[checkupRow('保障型保費',prot,inc*TRIANGLE_RISK/100),
        checkupRow('理財型保費',inv,inc*TRIANGLE_INVEST/100)]};
}

// 2 保障：依險種跨成員加總後套五欄。
// ⚠️⚠️ 這裡刻意**不能**直接用 coverageGaps 的 need：
// lifeNeed() 回的是「已經扣掉已備與流動資產之後的淨缺口」，而 have 是毛的已備。
// 拿淨需求去對毛已備，壽險會被判成「偏高、可減少 1,123 萬」——但客戶其實還差 324 萬。
// 五欄表一定要毛對毛，所以壽險走 grossLifeNeed()（與 coverageReadiness 同一條式子）。
function coverageCheckupRows(c){
 var by={},ord=[],pm=(primaryMember(c)||{}).name;
 (c.needs||[]).forEach(function(nd){
  var map={
   '壽險':grossLifeNeed(c,nd),
   '意外傷殘':n(nd.disability),
   '住院醫療':medicalDailyNeed(nd),
   '醫療雜費':n(nd.miscDaily),
   '薪資補償（日）':coverAmt(nd,'incomeCompDay'),
   '薪資補償（月）':coverAmt(nd,'incomeCompMonth'),
   '初次罹癌':n(nd.firstCancer),
   '癌症住院':n(nd.cancerHosp),
   '重病給付':n(nd.critical),
   '每月照護':n(nd.monthCare)
  };
  Object.keys(map).forEach(function(k){
   var have=existingCover(c,nd.member,k);
   if(k==='壽險'&&nd.member===pm)have+=liquidMovable(c);
   // 調整動作的保障類保額也算「已備」——與 coverageGaps 同一套語意（見 actionCover 的註解）。
   have+=actionCover(c,nd.member,k);
   if(!by[k]){by[k]={need:0,have:0};ord.push(k);}
   by[k].need+=map[k];by[k].have+=have;
  });
 });
 return ord.map(function(k){
  var o=by[k];
  return checkupRow(k,o.have,o.need,kindUnit(k));
 });
}

// ── $領回：保單可領回的五個型別 ──
// 逐張保單自己帶 paybacks[]，因為「哪一張保單、什麼時候、領給誰」是保單的屬性，不是家庭的。
var PAYBACK_TYPES=['$生存','$滿期','$祝壽','$年金','$投資'];
function policyPaybacks(c){
 var out=[];
 (c.policies||[]).forEach(function(p,pi){
  (p.paybacks||[]).forEach(function(b,bi){
   out.push({pi:pi,bi:bi,policy:p.name||p.subtype||'（未命名保單）',insurer:p.insurer||'',
    type:b.type||'$生存',receiver:b.receiver||p.insured||'',
    ageFrom:n(b.ageFrom),ageTo:n(b.ageTo)||n(b.ageFrom),
    freq:n(b.freq),amount:n(b.amount),note:b.note||''});
  });
 });
 return out;
}
// 一筆領回在 [a1,a2] 這段年齡內可領到的合計。freq>0＝每 freq 年領一次。
function paybackInSpan(b,a1,a2){
 if(b.freq>0){var t=0;for(var a=b.ageFrom;a<=b.ageTo;a+=b.freq){if(a>=a1&&a<=a2)t+=b.amount;}return t;}
 return (b.ageFrom>=a1&&b.ageFrom<=a2)?b.amount:0;
}
function paybackTotal(b){return paybackInSpan(b,-1e9,1e9);}
function policyPaybackBetween(c,a1,a2){
 if(!(n(a2)>=n(a1)))return 0;
 return sum(policyPaybacks(c),function(b){return paybackInSpan(b,n(a1),n(a2));});
}
// 3 $領回：退休養老金一列 ＋ 每個「選定」的理財目標一列。
function paybackCheckupRows(c){
 var rows=[],A=n(c.profile&&c.profile.age);
 var rt=retireNeed(c);
 if(rt&&n(rt.total)>0){
  var rA=n(c.profile.retireAge)||65,lA=n(c.profile.lifeExp)||85;
  var rr=checkupRow('退休養老金',n(rt.prepared)+policyPaybackBetween(c,rA,lA),n(rt.total),'元');
  rr.span=rA+'~'+lA+' 歲';rows.push(rr);
 }
 (c.goals||[]).forEach(function(g){
  if(g.on===false)return;
  var s=n(g.start)||A,e=n(g.end)||s;
  var times=(n(g.freq)>0&&e>s)?Math.floor((e-s)/n(g.freq))+1:1;
  var r=checkupRow(g.name||g.type||'（未命名目標）',n(g.prepared)+policyPaybackBetween(c,s,e),n(g.present)*Math.max(1,times),'元');
  r.span=s+'~'+e+' 歲';rows.push(r);
 });
 return rows;
}

// ── 保費排程：生效日 ＋ 繳別 → 各年／各月 ──
// effDate 在 2026/08/24 之前只是一個純字串、沒有進過任何計算，這裡開始 parse 它。
// 民國年（三碼）自動 +1911，因為保單登錄實務上兩種寫法都有。
function effYear(p){var m=String((p&&p.effDate)||'').match(/(\d{3,4})/);if(!m)return 0;var y=+m[1];return y<1911?y+1911:y;}
function effMonth(p){var m=String((p&&p.effDate)||'').match(/\d{3,4}\D+(\d{1,2})/);return m?(+m[1]||0):0;}
var PAY_MODES=['年繳','半年繳','季繳','月繳'];
var PAY_TIMES={'年繳':1,'半年繳':2,'季繳':4,'月繳':12};
function payTimes(mode){return PAY_TIMES[mode||'年繳']||1;}
function premiumPerPay(p){return n(p&&p.premium)/payTimes(p&&p.payMode);}
// 繳費月份：以生效日的月份起算，依繳別平均分佈。
function premiumMonths(p){
 var m0=effMonth(p);if(!m0)return [];
 var t=payTimes(p.payMode),step=12/t,out=[];
 for(var i=0;i<t;i++)out.push(((m0-1+step*i)%12)+1);
 return out.sort(function(a,b){return a-b;});
}
// 繳費年期留空＝視為仍在繳（多數終身險登錄時不會填到期年）。
function payingInYear(p,year){
 if(!policyActive(p))return false;
 var y0=effYear(p);if(!y0||year<y0)return false;
 var yrs=n(p.payYears);
 return yrs>0?(year<y0+yrs):true;
}
function premiumByYear(c,fromYear,years){
 var out=[],N=Math.max(1,n(years)||1);
 for(var i=0;i<N;i++){
  var y=n(fromYear)+i,tot=0,prot=0,inv=0;
  (c.policies||[]).forEach(function(p){
   if(!payingInYear(p,y))return;
   var a=n(p.premium);tot+=a;
   if(premiumType(p)==='理財型')inv+=a;else prot+=a;
  });
  out.push({year:y,total:tot,protect:prot,invest:inv});
 }
 return out;
}
function premiumByMonth(c,year){
 var out=[];for(var m=1;m<=12;m++)out.push({month:m,amount:0});
 (c.policies||[]).forEach(function(p){
  if(!payingInYear(p,n(year)))return;
  var per=premiumPerPay(p);
  premiumMonths(p).forEach(function(mm){out[mm-1].amount+=per;});
 });
 return out;
}
function premiumByPayer(c){
 var by={},ord=[];
 (c.policies||[]).forEach(function(p){
  if(!policyActive(p))return;
  var k=p.owner||p.insured||'（未指定）';
  if(!by[k]){by[k]={payer:k,total:0,count:0};ord.push(k);}
  by[k].total+=n(p.premium);by[k].count++;
 });
 return ord.map(function(k){return by[k];});
}

// ── 生命資產表：給付明細（只呈現，不比對）──
var BENEFIT_GROUPS=['壽險','意外','住院醫療','防癌','失能長照','其他'];
function policyBenefitRows(c,member){
 var out=[];
 (c.policies||[]).forEach(function(p){
  if(member&&p.insured!==member)return;
  if(!policyActive(p))return;
  (p.benefits||[]).forEach(function(b){
   out.push({group:(BENEFIT_GROUPS.indexOf(b.group)>=0?b.group:'其他'),item:b.item||'',
    amount:n(b.amount),unit:b.unit||'元',
    policy:p.name||p.subtype||'',insurer:p.insurer||'',insured:p.insured||''});
  });
 });
 return out;
}
function benefitsByGroup(c,member){
 var rows=policyBenefitRows(c,member),by={};
 BENEFIT_GROUPS.forEach(function(g){by[g]=[];});
 rows.forEach(function(r){by[r.group].push(r);});
 return BENEFIT_GROUPS.map(function(g){return {group:g,rows:by[g]};}).filter(function(x){return x.rows.length>0;});
}

// ── 解約金與主約效益分析 ──
// 解約金是唯一需要人工逐年輸入的數列（保險公司給的附表），一律記「保單年度末」的金額。
// 保單年度：自保單生效日起的第一年為第 1 保單年度；年度末＝保單周年日的前一日。
function policyYearAt(p,calYear){var y0=effYear(p);return y0?Math.max(0,n(calYear)-y0+1):0;}
function surrenderAt(p,polYear){
 var r=((p&&p.surrender)||[]).filter(function(x){return n(x.year)===n(polYear);})[0];
 return r?n(r.amount):0;
}
// 主約效益分析：累計已繳保費 vs（身故給付＋可領回），用倍數說話。
function masterAnalysis(c,calYear){
 var Y=n(calYear);
 return (c.policies||[]).filter(function(p){return p.policyKind!=='附約';}).map(function(p){
  var polY=policyYearAt(p,Y);
  // ⚠️ 沒填生效日 → policyYearAt() 回不出保單年度（0）→ paid=0、ratio=0，整張效益分析空白。
  //    備援：教練填的「已繳年數」（policies[].paidYears）。
  //    生效日永遠優先——它是可驗證的事實，已繳年數是人填的記憶。兩個都沒有才是真的算不出來。
  if(polY<=0)polY=Math.max(0,Math.round(n(p.paidYears)));
  var yrs=n(p.payYears);
  var paid=polY>0?n(p.premium)*(yrs>0?Math.min(polY,yrs):polY):0;
  var sur=surrenderAt(p,polY)||n(p.cashValue);
  var back=sum(p.paybacks||[],function(b){return paybackTotal({freq:n(b.freq),ageFrom:n(b.ageFrom),ageTo:n(b.ageTo)||n(b.ageFrom),amount:n(b.amount)});});
  return {name:p.name||p.subtype||'',insurer:p.insurer||'',insured:p.insured||'',
   effDate:p.effDate||'',polYear:polY,paid:paid,death:n(p.life),surrender:sur,payback:back,
   ratio:paid>0?(n(p.life)+back)/paid:0};
 });
}


// ═══ 二代健保：一般保險費 ＋ 補充保費 ═══════════════════════════════
// 改版前 members[].nhiSalary / nhiDeps 是純死欄位（填得進去、全站沒有任何計算，
// 全庫 61 份 0 筆有填）。這一段把它算出來，並經由 syncNHI() 進支出表影響現金流。
//
// 一般保費公式（健保署「保險費計算公式」原文）：
//   投保金額 × 保險費率 × 負擔比率 × (本人 ＋ 眷屬人數)，眷屬超過三口以三口計。
// ⚠️ 負擔比率依身分別差到 3.3 倍（受僱者 30%、雇主/自營 100%），不能只用一個數字。
//    身分別的預設由既有的 JOB_TYPES 推（nhiJobCat），不另開一套工作分類。
//
// 補充保費：六類所得各自的門檻與計費基礎。
// ⚠️⚠️ 薪資本身（'薪資'/'加班費'/'差旅補貼'）**不扣補充保費**——它已經在投保金額裡，
//    再扣一次就是把同一筆錢課兩遍。所以判定一律用白名單（NHI_SUPP_KINDS），不是黑名單。
var NHI_SUPP_KINDS=[
 // mode:'excess' ＝ 只就「超過門檻的部分」計費；mode:'each' ＝ 單次給付達門檻就按**全額**計費。
 // ⚠️ 這兩種計費基礎差很多：領 19,999 元股利扣 0、領 20,000 元扣 422（不是扣 0.02 元）。
 {key:'bonus',label:'高額獎金',mode:'excess',subs:['年終獎金','三節獎金','績效/季獎金','佣金/業績獎金','股票/員工分紅']},
 {key:'parttime',label:'兼職薪資',mode:'each',subs:['兼職']},
 {key:'prof',label:'執行業務收入',mode:'each',subs:['執行業務所得']},
 {key:'dividend',label:'股利所得',mode:'each',subs:['股利/利息','事業盈餘分配','基金/ETF 配息']},
 {key:'interest',label:'利息所得',mode:'each',subs:['存款利息','債券配息']},
 {key:'rent',label:'租金收入',mode:'each',subs:['租金收入']}
];
function nhiSuppKindOf(subType){
 for(var i=0;i<NHI_SUPP_KINDS.length;i++){if(NHI_SUPP_KINDS[i].subs.indexOf(subType)>=0)return NHI_SUPP_KINDS[i];}
 return null;
}
// 一年幾次給付。incomes[].amount 一律是**年額**，period 只是輸入單位——
// 「月」＝一年 12 次給付，「年」＝一次。補充保費是按「單次給付」判門檻的，這個換算不能省。
function nhiPayTimes(x){return (x&&x.period==='月')?12:1;}
// 單次給付的起扣門檻：兼職薪資是基本工資，其餘五類是 20,000。
function nhiSuppMinOf(k){return (k&&k.key==='parttime')?NHI_SUPP_WAGE_MIN:NHI_SUPP_MIN;}

// 某位成員的一般保費。未填 nhiSalary（rawSalary<=0）→ 一律回 0，不猜。
function nhiGeneral(c,m){
 var jt=(m&&m.jobType)||(((c||{}).profile)||{}).jobType||'一般就業者';
 var cat=(m&&m.nhiCat)||nhiJobCat(jt);
 var r=nhiSelfRatio(cat),ratioAssumed=(r==null);
 if(r==null)r=30;                       // 認不得的身分別退回受僱者，並標成假設值
 var raw=n(m&&m.nhiSalary),salary=nhiSalaryOf(raw);
 var deps=Math.max(0,Math.round(n(m&&m.nhiDeps)));
 var depsCounted=Math.min(deps,NHI_DEP_CAP);
 // ⚠️ 進位順序照健保署公告的負擔金額表：**先算一口的保費四捨五入到元、再乘口數**，
 //    不是「乘完再進位」。差 1 元看起來沒事，但教練拿系統的數字對客戶的繳費單會對不起來
 //    （官方釋例：雇主 57,800 × 5.17% × 100% × (1+1) 印的是 5,976，先乘後進位會得到 5,977）。
 var perUnit=(raw>0)?Math.round(salary*NHI_RATE*(r/100)):0;
 var monthly=perUnit*(1+depsCounted);
 return {member:(m&&m.name)||'',cat:cat,ratio:r,ratioAssumed:ratioAssumed,perUnit:perUnit,
  rawSalary:raw,salary:salary,clamped:(raw>0&&salary!==Math.round(raw)),
  deps:deps,depsCounted:depsCounted,depsCut:(deps>depsCounted),units:1+depsCounted,
  monthly:monthly,annual:monthly*12};
}

// 某位成員的補充保費明細（逐列對到 c.incomes[]）。
function nhiSuppRows(c,m){
 var name=(m&&m.name)||'',pm=(primaryMember(c)||{}).name;
 var base=nhiSalaryOf(n(m&&m.nhiSalary))||NHI_SALARY_MIN;
 var baseAssumed=!(n(m&&m.nhiSalary)>0);
 var bonusCap=base*NHI_SUPP_BONUS_MULT,out=[];
 ((c||{}).incomes||[]).forEach(function(x){
  if(!x)return;
  if(((x.owner||'').trim()||pm)!==name)return;
  var k=nhiSuppKindOf(x.subType);if(!k)return;
  var annual=n(x.amount);if(annual<=0)return;
  var times=nhiPayTimes(x),per=annual/times,charged=0,threshold;
  if(k.mode==='excess'){
   threshold=bonusCap;
   charged=Math.min(Math.max(0,annual-bonusCap),NHI_SUPP_CAP);
  }else{
   threshold=nhiSuppMinOf(k);
   if(per>=threshold)charged=Math.min(per,NHI_SUPP_CAP)*times;
  }
  out.push({member:name,kind:k.key,label:k.label,mode:k.mode,
   name:(x.name||'').trim()||x.subType||'',subType:x.subType||'',
   annual:annual,times:times,per:per,threshold:threshold,charged:charged,
   fee:Math.round(charged*NHI_SUPP_RATE),baseAssumed:baseAssumed});
 });
 return out;
}

// 全家健保費。⚠️ filled=false（沒有任何一位成員填健保投保薪資）時一切回 0，
//    而且 syncNHI() 不會產生支出列——「沒填」不等於「零保費」，是「還沒問」。
function nhiFamily(c){
 var mems=((c||{}).members)||[];
 var gen=mems.map(function(m){return nhiGeneral(c,m);});
 var supp=[];mems.forEach(function(m){supp=supp.concat(nhiSuppRows(c,m));});
 var filled=gen.some(function(g){return g.rawSalary>0;});
 var gm=filled?gen.reduce(function(s,g){return s+g.monthly;},0):0;
 var sa=filled?supp.reduce(function(s,r){return s+r.fee;},0):0;
 return {rows:gen,supp:supp,filled:filled,
  generalMonthly:gm,generalAnnual:gm*12,suppAnnual:sa,annual:gm*12+sa,
  year:NHI_YEAR,rate:NHI_RATE,suppRate:NHI_SUPP_RATE};
}

// ── 支出表同步：比照 syncPremium()，一列「全民健康保險」════════════
// ⚠️ 穩定標記 nhiAuto（比照 birthBid 的作法）：重按是**更新**不是複製。
// ⚠️ 教練可以關掉（c.nhiExpenseOff）——關掉就把那一列收回去，不留殘骸。
// ⚠️ subCat 用既有的「勞健保自付」，它在 PREM_KEEP 名單裡，syncPremium() 不會把它接管掉。
var NHI_AUTO_NAME='全民健康保險（系統試算）';
function nhiExpenseOn(c){return !((c||{}).nhiExpenseOff);}
function syncNHI(c){
 if(!c||!Array.isArray(c.expenses))return;
 var idx=-1;
 for(var i=0;i<c.expenses.length;i++){if(c.expenses[i]&&c.expenses[i].nhiAuto){idx=i;break;}}
 var f=nhiFamily(c);
 if(!f.filled||!nhiExpenseOn(c)){if(idx>=0)c.expenses.splice(idx,1);return;}
 var row=(idx>=0)?c.expenses[idx]:null;
 if(!row){
  // 起訖預設「現齡 → 預估壽命」，與 syncPremium() 同一套（留空在 inSpan() 下是全期間有效，
  // 但預設仍要給一段看得見、改得動的區間）。建立之後不再覆蓋，教練改了就是他的。
  row={cat:'保險',subCat:'勞健保自付',name:NHI_AUTO_NAME,period:'年',infl:false,cut:0,
   start:n((c.profile||{}).age)||'',end:n((c.profile||{}).lifeExp)||effHorizon(c)||'',nhiAuto:true};
  c.expenses.push(row);
 }
 row.cat='保險';row.subCat='勞健保自付';row.name=NHI_AUTO_NAME;
 row.period='年';row.infl=false;row.nhiAuto=true;row.amount=f.annual;
}

// ═══ 產險比對線（平行於 KINDS 的產險骨幹）═══════════════════════════
// ⚠️⚠️ 刻意**不**把產險塞進 KINDS：那會讓「保障準備度」「全家保障地圖」「五欄表」
//    全部多出不相干的列（那三張表的骨架是「成員 × 人身險種」）。產險的需求端是
//    **資產與責任**，不是人；缺口也刻意不併進 gapTotals()／health().riskCover——
//    與 Ray 2026/08/29「單位不同不相加」是同一條原則。
var PKINDS=['住宅火險','住宅地震基本保險','汽車第三人責任（體傷·每人）','汽車第三人責任（財損·每次事故）','車體損失險','雇主責任（每人）','公共意外責任（每一事故體傷）'];
// Ray 拍板的四項 → 上面七列的分組。
var PKIND_GROUP={'住宅火險':'住宅火險＋地震險','住宅地震基本保險':'住宅火險＋地震險',
 '汽車第三人責任（體傷·每人）':'第三人責任險（車）','汽車第三人責任（財損·每次事故）':'第三人責任險（車）',
 '車體損失險':'車體險','雇主責任（每人）':'雇主／公共意外責任','公共意外責任（每一事故體傷）':'雇主／公共意外責任'};
var PGROUPS=['住宅火險＋地震險','第三人責任險（車）','車體險','雇主／公共意外責任'];
// 保單端：險種細分（POLICY_SUB['產物']）→ 取哪一個保額欄位。
// pAmount 是既有欄位（保額/主要限額）；pBodily / pProperty 是這一批新增的體傷／財損限額。
var PPOLICY_MAP={
 '住宅火險':{subs:['住宅火險','居家綜合'],field:'pAmount'},
 '住宅地震基本保險':{subs:['地震險'],field:'pAmount'},
 '汽車第三人責任（體傷·每人）':{subs:['汽車第三人責任','機車第三人'],field:'pBodily'},
 '汽車第三人責任（財損·每次事故）':{subs:['汽車第三人責任','機車第三人'],field:'pProperty'},
 '車體損失險':{subs:['汽車車體'],field:'pAmount'},
 '雇主責任（每人）':{subs:['雇主責任'],field:'pBodily'},
 '公共意外責任（每一事故體傷）':{subs:['公共意外'],field:'pBodily'}
};
// 保單險種細分 → 它會對到產險比對的哪幾列（保單卡上直接告訴教練）。
function propKindsOfSub(sub){
 return PKINDS.filter(function(k){return PPOLICY_MAP[k].subs.indexOf(sub)>=0;});
}
// 需求端覆寫欄位（住在 plans.data 的 c.propNeed，不需要 migration）。
var PNEED_FIELD={'住宅火險':'fire','住宅地震基本保險':'quake',
 '汽車第三人責任（體傷·每人）':'liabBodily','汽車第三人責任（財損·每次事故）':'liabProperty',
 '車體損失險':'ownDamage','雇主責任（每人）':'employer','公共意外責任（每一事故體傷）':'publicLiab'};
function propNeedOf(c){var o=(c&&c.propNeed);return (o&&typeof o==='object')?o:{};}

// 不動產（建物）與車輛的挑選。
// ⚠️ 「土地」與「車位」刻意排除：土地不會燒掉也不需要重置，把它算進火險保額
//    等於系統性高估保額（也是實務上最常見的超額投保原因）。
var PROP_REALTY_TYPES=['自住不動產','不動產','出租不動產'];
function propRealty(c){return (((c||{}).assets)||[]).filter(function(a){
 if(!a||a.type==='土地'||a.type==='車位')return false;
 return PROP_REALTY_TYPES.indexOf(a.type)>=0||/房|宅/.test(String(a.name||''));});}
function propVehicles(c){return (((c||{}).assets)||[]).filter(function(a){
 if(!a||a.type==='車位')return false;
 return a.type==='自用車輛'||/車/.test(String(a.type||'')+String(a.name||''));});}
function propRealtyValue(c){return sum(propRealty(c),function(a){return aVal(a);});}
function propVehicleValue(c){return sum(propVehicles(c),function(a){return aVal(a);});}
// 企業側：員工數與平均月薪（雇主責任／公共意外的推估基礎）。
function propEmployees(c){
 var pn=propNeedOf(c),v=n(pn.employees);
 if(v>0)return v;
 return sum(((c||{}).companies)||[],function(co){return n(co&&co.employees);});
}
function propAvgWage(c){var v=n(propNeedOf(c).avgWage);return v>0?v:NHI_SALARY_MIN;}

// 需求端自動帶入。回 {need, auto, src}：auto=true 代表這個數字是系統估的，UI 一定要標。
function propAutoNeed(c,kind){
 var pn=propNeedOf(c),hasHouse=propRealty(c).length>0,hasCar=propVehicles(c).length>0;
 var emp=propEmployees(c),hasBiz=(((c||{}).companies)||[]).length>0||emp>0;
 if(kind==='住宅火險'){
  if(!hasHouse)return {need:0,auto:true,src:'資產表沒有不動產'};
  var ping=n(pn.ping),unit=n(pn.pingPrice)||PROP_PING_COST;
  if(ping>0)return {need:Math.round(ping*unit),auto:true,src:'建坪 '+ping+' 坪 × 每坪重置單價 '+fmt(unit)+' 元（不含土地）'};
  var ratio=n(pn.buildRatio)>0?n(pn.buildRatio)/100:PROP_BUILDING_RATIO;
  return {need:Math.round(propRealtyValue(c)*ratio),auto:true,
   src:'未填建坪 → 由不動產市價 '+fmt(propRealtyValue(c))+' × 建物佔比 '+Math.round(ratio*100)+'% 粗估（請改填建坪會準得多）'};
 }
 if(kind==='住宅地震基本保險'){
  var units=propRealty(c).length;
  return {need:units*QUAKE_BASIC_SUM,auto:true,
   src:units?('住宅 '+units+' 戶 × 法定基本保額 '+fmt(QUAKE_BASIC_SUM)+' 元／戶（另有臨時住宿費用 '+fmt(QUAKE_LODGING)+' 元，非保額）'):'資產表沒有不動產'};
 }
 if(kind==='汽車第三人責任（體傷·每人）')
  return {need:hasCar?CAR_LIAB_BODILY:0,auto:true,src:hasCar?('市場級距建議值（強制險身故／失能上限僅 '+fmt(CALI_DEATH)+' 元，超過的部分靠任意險）'):'資產表沒有車輛'};
 if(kind==='汽車第三人責任（財損·每次事故）')
  return {need:hasCar?CAR_LIAB_PROPERTY:0,auto:true,src:hasCar?'市場級距建議值（強制險完全不賠財損）':'資產表沒有車輛'};
 if(kind==='車體損失險'){
  var v=Math.round(propVehicleValue(c));
  return {need:v,auto:true,src:v?('車輛資產現值合計 '+fmt(v)+' 元'):'資產表沒有車輛'};
 }
 if(kind==='雇主責任（每人）')
  return {need:hasBiz?Math.round(propAvgWage(c)*EMPLOYER_COMP_MONTHS):0,auto:true,
   src:hasBiz?('平均月薪 '+fmt(propAvgWage(c))+' × '+EMPLOYER_COMP_MONTHS+' 個月（勞基法 §59 職災死亡補償 40 個月＋喪葬費 5 個月）'):'沒有登錄公司或員工數'};
 if(kind==='公共意外責任（每一事故體傷）')
  return {need:hasBiz?PUBLIC_LIAB_STD[1]:0,auto:true,
   src:hasBiz?('多數縣市自治條例的最低投保基準：每人 '+fmt(PUBLIC_LIAB_STD[0])+'／每一事故 '+fmt(PUBLIC_LIAB_STD[1])+'／財損 '+fmt(PUBLIC_LIAB_STD[2])+'／期間總額 '+fmt(PUBLIC_LIAB_STD[3])):'沒有登錄公司或員工數'};
 return {need:0,auto:true,src:''};
}

// 已備：有效的產物保單，依險種細分對到欄位。
function propHave(c,kind){
 var mp=PPOLICY_MAP[kind];if(!mp)return 0;
 return sum(((c||{}).policies)||[],function(p){
  if(!p||p.bigCat!=='產物'||!policyActive(p))return 0;
  return (mp.subs.indexOf(p.subtype)>=0)?n(p[mp.field]):0;
 });
}

// 產險比對表。⚠️ 單位全部是「元」的保險金額，但**刻意不併進 gapTotals()**：
//    人身缺口的分母是「人的責任」，產險的分母是「資產與責任限額」，加起來沒有意義。
function propGaps(c){
 return PKINDS.map(function(k){
  var a=propAutoNeed(c,k),ov=n(propNeedOf(c)[PNEED_FIELD[k]]);
  var need=ov>0?ov:a.need,have=propHave(c,k);
  return {kind:k,group:PKIND_GROUP[k],need:need,have:have,gap:need-have,
   auto:!(ov>0),src:(ov>0?'教練手動指定':a.src),autoNeed:a.need};
 });
}
// 產險缺口總額。⚠️ 獨立呈現，不進 gapTotals()／health().riskCover／shortPV。
function propGapTotals(c){
 var t={need:0,have:0,gap:0,rows:0};
 propGaps(c).forEach(function(g){
  if(g.need<=0&&g.have<=0)return;
  t.rows++;t.need+=g.need;t.have+=g.have;t.gap+=Math.max(0,g.gap);
 });
 return t;
}

// ═══ 購置目標的貸款：把「那一年一次付清」拆成頭期款 ＋ 逐年還款 ═══════════
// ⚠️⚠️ 2026/08/30 Ray 拍板。改版前 projection() 完全沒有讀 goals[].loanRatio（只有
//    propertyGaps() 讀），所以填總價 1,100 萬的購屋目標，那一年就整整扣 1,100 萬：
//    貸款不存在、月付不存在、房子也沒進資產——同一筆目標，一生金流與購屋缺口
//    兩張表講兩件不一樣的事。當時不改的理由是「會動到所有含購屋目標的既有客戶」，
//    正式站清空之後那個理由消失了。
//
// ⚠️ 合成一筆**與 liabilities 同形狀**的虛擬負債，直接餵既有的 debtPayAt()／lRemain()。
//    攤還數學（本息攤還／只付利息／寬限期）已經有一份寫好的，不要再寫第二套——
//    兩套攤還公式遲早會漂移，而漂移的那一天沒有人看得出來。
//
// ⚠️ 觸發條件嚴格，任一項不成立就**完全退回改版前的行為**（那一年扣全額）：
//    ・有納入、類型是購屋／置產（UI 只在這兩種類型給利率與年期欄位；車貸不適用，
//      車子也不該被算成保值資產）
//    ・非週期性（freq ≤ 0）：一份目標對一筆貸款
//    ・貸款成數／利率／年期三個都 > 0 —— 只填成數就當有貸款，會讓房子看起來免費，
//      那比「一次付清」更危險
//    ・購置年不早於現齡（已經發生過的購置不再生成新貸款）
// ⚠️ 刻意**不扣 g.prepared**：那筆「已備」本來就躺在資產池裡，這裡再扣一次等於免費。
function goalLoans(c){
 var a0=n(((c||{}).profile||{}).age),infl=n(((c||{}).params||{}).inflation)/100;
 var sg=n(((c||{}).params||{}).salaryGrowth)/100;
 var out=[];
 ((c||{}).goals||[]).forEach(function(g,idx){
  if(!g||!visionOn(g))return;
  if(g.type!=='購屋'&&g.type!=='置產')return;
  if(n(g.freq)>0)return;
  var ratio=n(g.loanRatio),rate=n(g.loanRate),yrs=n(g.loanYears);
  if(!(ratio>0&&rate>0&&yrs>0))return;
  var buyAge=n(g.start);if(!(buyAge>=a0))return;
  var t=Math.max(0,buyAge-a0);
  // ⚠️ 成長依據與 projection() 的 goalOut 逐字相同，否則頭期款與總價會對不上。
  var gr=g.growth==='通膨'?infl:(g.growth==='薪資'?sg:(g.type==='購屋'?n(g.appreciation)/100:0));
  var price=n(g.present)*Math.pow(1+gr,t);
  var loan=price*Math.min(100,ratio)/100;
  var months=Math.round(yrs*12);
  out.push({idx:idx,buyAge:buyAge,price:price,loan:loan,down:Math.max(0,price-loan),
   // pay 是**月付**（debtPayAt 回 lPay(l)*12）。startAge 就是購置年：
   // 那一年頭期款與第一年還款一起發生，比「隔年才開始還」保守，也不會讓
   // 淨值曲線在購置當年只看到房子、看不到貸款。
   liab:{balance:loan,rate:rate,pay:pmt(loan,rate,months),months:months,
         startAge:buyAge,grace:0,repay:'本息攤還',fxRate:1}});
 });
 return out;
}

function propertyGaps(c){
 return (c.goals||[]).filter(function(g){return g.type==='購屋'||g.type==='置產'}).map(function(g){
  var years=n(g.start)-n(c.profile.age);
  var fv=n(g.present)*Math.pow(1+n(g.appreciation)/100,Math.max(0,years));
  var loan=fv*n(g.loanRatio)/100;
  var gap=Math.max(0,fv-loan-n(g.prepared));
  return {name:g.name,fv:fv,loan:loan,gap:gap};
 });
}

function metrics(c){
 // ⚠️⚠️ 收支加總一律「只算現齡有效的列」，與 projection 第 0 年同一套判斷（inSpan）。
 //    舊版把整張表加總、完全不看每列起訖 → 同一份資料兩套口徑：
 //    現齡 70、收入列 40–65 全部結束，incTotal 仍是 190 萬、所得穩定度 100%、階段判 C，
 //    而同一年的 projection().rows[0] 是 work:0 / bal:−1,322,400（正解是 D）。
 //    真的需要「表面總額」（不看起訖、教練打字打了什麼就是什麼）的地方，用 incTotalRaw / expTotalRaw。
 var incTotalRaw=sum(c.incomes,function(i){return n(i.amount)});
 var incTotal=sum(c.incomes,function(i){return activeNow(c,i)?n(i.amount):0});
 var passive=assetPassive(c);
 var incFinancial=sum(c.incomes,function(i){return (i.type==='理財'&&activeNow(c,i))?n(i.amount):0})+passive;
 var living=familyAnnualLiving(c);
 var tax=sum(c.expenses,function(e){return (e.cat==='稅賦'&&activeNow(c,e))?n(e.amount):0});
 var ins=sum(c.expenses,function(e){return (e.cat==='保險'&&activeNow(c,e))?n(e.amount):0});
 // annualDebtPay() 本來就只算「現齡還在攤還中」的負債，語意不變。
 var expTotalRaw=sum(c.expenses,function(e){return n(e.amount)})+annualDebtPay(c);
 var expTotal=sum(c.expenses,function(e){return activeNow(c,e)?n(e.amount):0})+annualDebtPay(c);
 var saveInvest=savingInvest(c);
 var cash=sum(c.assets,function(a){return (a.type==='現金'||a.type==='定存')?aVal(a):0});
 var liquid=sum(c.assets,function(a){return aLiquid(c,a)?aVal(a):0});
 var assetTotal=sum(c.assets,function(a){return aVal(a)});
 var debtTotal=sum(c.liabilities,function(l){return lBal(l)});
 var net=assetTotal-debtTotal, save_=incTotal-expTotal, interest=annualDebtInterest(c), monthExp=expTotal/12;
 var proj=projection(c);
 return {incTotal:incTotal,incFinancial:incFinancial,living:living,tax:tax,ins:ins,expTotal:expTotal,saveInvest:saveInvest,cash:cash,liquid:liquid,
  incTotalRaw:incTotalRaw,expTotalRaw:expTotalRaw,retireAgeAssumed:retireAgeAssumed(c),
  assetTotal:assetTotal,debtTotal:debtTotal,net:net,save:save_,interest:interest,monthExp:monthExp,visionNeed:proj.totalOutflow,proj:proj};
}

// 協會標準財務比率體檢：收支流量 13 項 + 資產負債 12 項，各帶 ideal（理想值）與 status 紅黃綠燈。
// 與 public/lantu-app.html:663 的 ratios() 逐項一致（項目名稱與判燈門檻由對拍測試守著）。
function ratios(c){var m=metrics(c),r={};
 var inc=m.incTotal||1, at=m.assetTotal||1;
 // 收支流量子聚合
 // ⚠️ 分母 inc / m.expTotal 已經是「現齡有效」，這些分子也一定要同一個口徑，
 //    否則現齡 70、收入列都結束的個案會算出「所得穩定度 190000%」這種東西。
 var incWork=sum(c.incomes,function(i){return (i.type==='工作'&&activeNow(c,i))?n(i.amount):0});
 var livingCore=sum(c.expenses,function(e){return (e.cat==='生活'&&activeNow(c,e))?n(e.amount):0});
 var discretionary=sum(c.expenses,function(e){return ((e.cat==='消費'||e.cat==='其他')&&activeNow(c,e))?n(e.amount):0});
 var rent=sum(c.expenses,function(e){return (e.cat==='生活'&&activeNow(c,e)&&/租/.test((e.name||'')+(e.subCat||'')))?n(e.amount):0});
 var insAll=sum(c.expenses,function(e){return (e.cat==='保險'&&activeNow(c,e))?n(e.amount):0});
 var social=sum(c.expenses,function(e){return (e.cat==='保險'&&activeNow(c,e)&&/(勞保|健保|勞健保|社會|國保|國民年金)/.test((e.name||'')+(e.subCat||'')))?n(e.amount):0});
 var premium=Math.max(0,insAll-social);
 var loanPay=annualDebtPay(c)+manualLoanPay(c);
 var eduNow=sum(c.education,function(e){var s=n(e.startIn);return (s<=0&&0<s+n(e.years))?n(e.annual):0});
 var support=sum(c.expenses,function(e){return (e.cat==='孝親'&&activeNow(c,e))?n(e.amount):0})+eduNow;
 // 有效儲蓄率的分子：有登錄「儲蓄理財投入」就用它（對齊原表），
 // 沒有才退回舊的參數欄／年結餘——既有案子的數字不變。
 var saveActive=m.saveInvest>0?m.saveInvest:(n(c.params.planYearly)||Math.max(0,m.save));
 // 資產負債子聚合
 var selfUse=sum(c.assets,function(a){return a.mainCat==='自用資產'?aVal(a):0});
 var coreAsset=sum(c.assets,function(a){return a.mainCat==='可投資資產'?aVal(a):0});
 var riskAsset=sum(c.assets,function(a){return isRiskAsset(a)?aVal(a):0});
 var conserv=sum(c.assets,function(a){return (a.type==='現金'||a.type==='定存'||/儲蓄|保單/.test(a.name||''))?aVal(a):0});
 var emReq=m.monthExp*6;
 var flow=m.save; // 年度(結餘+儲蓄+投資)：本模型合併為年結餘
 var tr=(c.tracking||[]).slice().sort(function(x,y){return n(x.year)-n(y.year)});
 // 判燈：band=越低越好、bandLow=越高越好、bandRange=落在區間最佳
 function band(v,hi){return v<hi?'good':v<hi*1.3?'warn':'bad'}
 function bandLow(v,lo){return v>=lo?'good':v>=lo*0.5?'warn':'bad'}
 function bandRange(v,lo,hi){if(v>=lo&&v<=hi)return 'good';if(v>=lo*0.5&&v<=hi*1.35)return 'warn';return 'bad'}
 function add(g,name,val,ideal,f,status){r[name]={v:val,ideal:ideal,f:f,status:status,ok:status==='good',group:g}}
 var g1='收支流量',g2='資產負債';
 add(g1,'所得穩定度',pct(incWork/inc),'>50%','工作收入 ÷ 總收入',bandLow(incWork/inc*100,50));
 add(g1,'支出收入比',pct(m.expTotal/inc),'<70%','年度支出 ÷ 總收入',band(m.expTotal/inc*100,70));
 add(g1,'生活費用比',pct(livingCore/inc),'<55%','生活費支出 ÷ 總收入',band(livingCore/inc*100,55));
 add(g1,'貸款壓力比',pct(loanPay/inc),'<30%','貸款本息 ÷ 總收入',band(loanPay/inc*100,30));
 add(g1,'租金壓力比',pct(rent/inc),'<20%','租金支出 ÷ 總收入',band(rent/inc*100,20));
 add(g1,'保費支出比',pct(premium/inc),'10%~15%','(保費−社會保險) ÷ 總收入',bandRange(premium/inc*100,10,15));
 add(g1,'低彈性支出比',pct((loanPay+rent+insAll)/inc),'<40%','(貸款+租金+保費) ÷ 總收入',band((loanPay+rent+insAll)/inc*100,40));
 add(g1,'撫養壓力比',pct(support/inc),'—（越高責任越大）','扶養(孝親+教育) ÷ 總收入','na');
 add(g1,'消費隨興比',pct(discretionary/inc),'<10%','消費/雜費 ÷ 總收入',band(discretionary/inc*100,10));
 add(g1,'名目儲蓄率',pct(m.save/inc),'20%~30%','年結餘 ÷ 總收入',bandLow(m.save/inc*100,20));
 add(g1,'有效儲蓄率',pct(saveActive/inc),'20%~30%','儲蓄理財投入 ÷ 總收入',bandLow(saveActive/inc*100,20));
 add(g1,'理財收入比',pct(m.incFinancial/inc),'—','理財收入 ÷ 總收入','na');
 add(g1,'財務自由度',m.expTotal>0?pct(m.incFinancial/m.expTotal):'—（現齡沒有有效支出）','≥100% 即財務自由','理財收入 ÷ 總支出',m.expTotal<=0?'na':(m.incFinancial>=m.expTotal?'good':(m.incFinancial>=m.expTotal*0.3?'warn':'na')));
 add(g2,'資產變現性',pct(m.liquid/at),'>30%','流動資產 ÷ 總資產',bandLow(m.liquid/at*100,30));
 add(g2,'生活準備金適足',fmt(emReq)+' 元','6 個月支出','(年支出/12)×6','na');
 add(g2,'超額現金比率',emReq?pct(m.cash/emReq):'—','50%~100%','現金 ÷ 生活準備金',emReq?bandRange(m.cash/emReq*100,50,100):'na');
 add(g2,'自用資產比',pct(selfUse/at),'<50%','自用資產 ÷ 總資產',band(selfUse/at*100,50));
 add(g2,'核心資產比',pct(coreAsset/at),'愈高愈好','可投資資產 ÷ 總資產',bandLow(coreAsset/at*100,40));
 add(g2,'風險資產比',pct(riskAsset/at),'>20%','(股票+基金+債券+投資性不動產) ÷ 總資產',m.net<0?'na':bandLow(riskAsset/at*100,20));
 add(g2,'保守資產比',pct(conserv/at),'<20%','(現金+定存+儲蓄型保單) ÷ 總資產',band(conserv/at*100,20));
 add(g2,'負債比率',pct(m.debtTotal/at),'<50%','總負債 ÷ 總資產',band(m.debtTotal/at*100,50));
 var repayIdx=m.debtTotal>0?Math.max(0,1-flow/m.debtTotal):null;
 add(g2,'償債壓力指數',repayIdx==null?'—（無負債）':pct(repayIdx),'<50%','1 −（年結餘 ÷ 總負債）',repayIdx==null?'na':band(repayIdx*100,50));
 var growth=m.net!==0?flow/Math.abs(m.net):0;
 add(g2,'資產成長動力比',pct(growth),'>10%','年結餘 ÷ 資產淨值',bandLow(growth*100,10));
 if(tr.length>=2){var pv=n(tr[tr.length-2].net),cv=n(tr[tr.length-1].net);var gr=pv?(cv-pv)/Math.abs(pv):0;add(g2,'資產淨值增長率',pct(gr),'愈高愈好','(今年淨值−去年淨值) ÷ 去年淨值',bandLow(gr*100,0.01));}
 else add(g2,'資產淨值增長率','—（需兩年度資料）','愈高愈好','需連續兩年淨值','na');
 var _vr=visionRateOf(m.proj);
 add(g2,'願景達成率',pct(_vr/100),'≥100%','1 −（現值缺口 ÷ 一生需求現值）',bandLow(_vr,100));
 /* ⚠️ A1 之後 incTotal 真的可能是 0（現齡不落在任何一列收入的起訖內）。
    以收入為分母的那幾項這時全都是「除以 1」的假數字（−50,400,000% 之類，示範案林曉薇就是），
    一律換成「—」並熄燈——沒有有效收入就算不出收入比，硬給一個數字比留白更誤導。
    是哪幾列的起訖不含現齡，由「比率計算原料」那一段點名。
    ⚠️ 只在「有收入列、但沒有一列涵蓋現齡」時才換（incTotalRaw>0）——
       整張收入表本來就空白的個案維持改版前的顯示，不要順手改動不相干的數字。*/
 if(m.incTotal<=0&&m.incTotalRaw>0){
  ['所得穩定度','支出收入比','生活費用比','貸款壓力比','租金壓力比','保費支出比','低彈性支出比','撫養壓力比','消費隨興比','名目儲蓄率','有效儲蓄率','理財收入比'].forEach(function(k){
   if(r[k]){r[k].v='—（現齡沒有有效收入）';r[k].status='na';r[k].ok=false;}
  });
 }
 return r;
}

function projection(c,lump,rateOverride){
 var a0=n(c.profile.age)||40,aEnd=effHorizon(c),infl=n(c.params.inflation)/100;
 // rateOverride＝求解器拿「同一份個案、換一個報酬率假設」再跑一次時用；lump＝今天先塞一筆錢進去。
 var ret=((rateOverride!==undefined&&rateOverride!==null&&rateOverride!=='')?n(rateOverride):effReturn(c))/100;
 var invest=sum(c.assets,function(a){return aLiquid(c,a)?aVal(a):0})+n(lump);
 var fixedAssets=sum(c.assets,function(a){return aLiquid(c,a)?0:aVal(a)});
 // 購置目標的貸款（見 goalLoans 上方）。空陣列時下面每一行都退化成改版前的算式。
 var gLoans=goalLoans(c);
 var rows=[],turnNeg=null,totalOut=0;
 var eduByYear={}; var g=n(c.params.tuitionGrowth)/100;
 (c.education||[]).forEach(function(e){var s=a0+n(e.startIn);for(var yy=0;yy<n(e.years);yy++){var ag=s+yy;eduByYear[ag]=(eduByYear[ag]||0)+n(e.annual)*Math.pow(1+g,n(e.startIn)+yy)}});
 var rn=retireNeed(c);
 // 無條件複利路徑（負餘額也照樣計息）。現值缺口＝這條路徑上最深的一筆負值折現回今天，
 //   shortPV = max over t ( −raw_t ÷ (1+r)^(t+1) )。實際路徑永遠比它好看，所以這是保守上界。
 var raw=invest,shortPV=0,shortAge=null,negAge=null,needPV=0;
 var pvOut={base:0,debt:0,goal:0,edu:0,life:0,retire:0},pvLate={base:0,debt:0,goal:0,edu:0,life:0,retire:0};

 // ---------- 調整動作：分離池 ----------
 // 被動作指定的錢用「該動作自己的 growth」滾，全域 ret 只管沒被指定的剩餘資產。
 // ⚠️⚠️ acts 為空時 pots 全空、actIn/actOut/actPay 全 0，下面每一行都退化成改版前的算式
 //     ——「沒有動作時既有客戶數字一位不動」靠這個等價性，有測試守著，不要破壞它。
 var acts=planActionsOn(c), pots={};
 acts.forEach(function(x){pots[x.id]=0});
 var evts=[], legacyTarget=legacyNeed(c);
 for(var age=a0;age<=aEnd;age++){
  var t=age-a0;
  var workIncome=sum(c.incomes,function(i){return (i.type==='工作'&&inSpan(i,age))?n(i.amount)*Math.pow(1+n(i.growth)/100,t):0});
  var finIncome=sum(c.incomes,function(i){return (i.type==='理財'&&inSpan(i,age))?n(i.amount)*Math.pow(1+n(i.growth)/100,t):0})+assetPassive(c);
  var otherIncome=sum(c.incomes,function(i){return (i.type!=='工作'&&i.type!=='理財'&&inSpan(i,age))?n(i.amount)*Math.pow(1+n(i.growth)/100,t):0});
  var income=workIncome+finIncome+otherIncome;
  // 三段式：w＝已退休賺薪成員的支出比例權重。生活/消費依 w 從工作期換到退休期。
  var inflF=Math.pow(1+infl,t);
  var w=retiredWeight(c,age);
  var expense=workPhaseExpense(c,age,inflF,w);
  var debt=sum(c.liabilities,function(l){return debtPayAt(l,age,a0)})+sum(gLoans,function(L){return debtPayAt(L.liab,age,a0)});
  // 有貸款計畫的那幾筆只扣頭期款，貸款那一段走上面的 debt。
  var goalOut=0;
  (c.goals||[]).forEach(function(gg,gi){
   if(!visionOn(gg))return;if(!inSpan(gg,age))return;
   var hit=(n(gg.freq)<=0)?(age===n(gg.start)):(((age-n(gg.start))%n(gg.freq))===0);if(!hit)return;
   var gl=null;for(var li=0;li<gLoans.length;li++)if(gLoans[li].idx===gi)gl=gLoans[li];
   if(gl){goalOut+=gl.down;return;}
   var gr=gg.growth==='通膨'?infl:(gg.growth==='薪資'?n(c.params.salaryGrowth)/100:(gg.type==='購屋'?n(gg.appreciation)/100:0));
   goalOut+=n(gg.present)*Math.pow(1+gr,t);});
  var edu=eduByYear[age]||0;
  var life=lifestyleFactor(c,age,Math.pow(1+infl,t));
  var retireDraw=retireAnnual(c,age,inflF)*w;

  // ---- 調整動作 ----
  // 一致性規則：所有流出走 pay*、所有流入走 get*。
  // 保費與貸款月付是「支出」不是投資，所以走 actOut 不進池子。
  var actIn=0,actOut=0,actPay=0;
  acts.forEach(function(x){
   var pf=n(x.payFrom),pt=n(x.payTo)||aEnd,gf=n(x.getFrom),gt=n(x.getTo)||aEnd;
   if(x.cat==='insure'||x.cat==='loan'){
    if(n(x.payMonthly)&&age>=pf&&age<=pt)actOut+=n(x.payMonthly)*12;
    if(n(x.getLump)&&age===pf)actIn+=n(x.getLump);          // 貸款撥款
    return;                                                  // 這兩類沒有自己的資金池
   }
   if(x.cat==='income'||x.cat==='expense'){
    if(n(x.getMonthly)&&age>=gf&&age<=gt)actIn+=n(x.getMonthly)*12;
    return;                                                  // 加薪／省下的錢直接進主池
   }
   if(x.cat==='liquidate'){
    if(n(x.getLump)&&age===pf)actIn+=n(x.getLump);           // 淨變現金額
    return;
   }
   // regular／lump：真的有一個自己的資金池
   var k=x.id;pots[k]=(pots[k]||0)*(1+n(x.growth)/100);
   if(n(x.payMonthly)&&age>=pf&&age<=pt){var mv=n(x.payMonthly)*12;pots[k]+=mv;actPay+=mv;}
   if(n(x.payLump)&&age===pf){pots[k]+=n(x.payLump);actPay+=n(x.payLump);}
   if(n(x.divYear)&&age>=pf){if(x.divMode==='payout')actIn+=n(x.divYear);else pots[k]+=n(x.divYear);}
   if(n(x.getMonthly)&&age>=gf&&age<=gt){var tk=Math.min(pots[k],n(x.getMonthly)*12);pots[k]-=tk;actIn+=tk;}
   if(n(x.getLump)&&age===gt){var tl=Math.min(pots[k],n(x.getLump));pots[k]-=tl;actIn+=tl;}
  });
  var potSum=0;for(var _pk in pots){if(pots.hasOwnProperty(_pk))potSum+=pots[_pk];}

  var bal=income-expense-debt-goalOut-edu-life-retireDraw+actIn-actOut-actPay;
  invest=(invest>0?invest*(1+ret):invest)+bal;
  raw=raw*(1+ret)+bal;
  var df=Math.pow(1+ret,t+1);
  // ⚠️ 缺口一定要看「主池＋分離池」的合計：只看主池，等於分離池裡的錢不存在。
  var rawTot=raw+potSum;
  if(rawTot<0){if(negAge===null)negAge=age;var need_=-rawTot/df;if(need_>shortPV){shortPV=need_;shortAge=age;}}
  // 折現後的支出組成：pvOut 供「一生需求現值」，pvLate 只累計第一個不足年之後的，供缺口歸因。
  var comp={base:expense,debt:debt,goal:goalOut,edu:edu,life:life,retire:retireDraw};
  for(var ck in comp){if(!comp.hasOwnProperty(ck))continue;var cv=comp[ck]/df;pvOut[ck]+=cv;needPV+=cv;if(negAge!==null)pvLate[ck]+=cv;}
  totalOut+=expense+debt+goalOut+edu+life+retireDraw;
  var totalInv=invest+potSum;
  if(turnNeg===null&&totalInv<0)turnNeg=age;
  var remDebt=sum(c.liabilities,function(l){return lRemain(l,age,a0)})+sum(gLoans,function(L){return lRemain(L.liab,age,a0)});
  // 買下來的房子從購置年起進固定資產。⚠️ 以購置當年的價格計、之後不再增值——
  // 保守，也避免「房價自己漲出淨值」這種一被問就站不住的數字。
  var fixedAt=fixedAssets+sum(gLoans,function(L){return age>=L.buyAge?L.price:0});
  var netEst=totalInv+fixedAt-remDebt;

  // 願景事件的可負擔性標記。
  // ⚠️ 刻意**不改變現金流**（維持「照付、餘額可以轉負」的既有語意，否則所有既有客戶
  //    的數字都會變）。✕ 的意思是「做完這件事之後總資產掉到零以下」＝要靠借錢才做得到。
  //    這正是 Ray 說的「按時間先到先付」的直接後果：早期的先花掉，晚期的就做不到了。
  (c.goals||[]).forEach(function(gg){
   if(!visionOn(gg))return;
   if(age!==n(gg.start))return;
   evts.push({kind:'goal',age:age,name:(gg.name||gg.type||'目標'),amount:n(gg.present),ok:totalInv>=0});
  });

  rows.push({age:age,income:income,work:workIncome,fin:finIncome,other:otherIncome,expense:expense+edu+retireDraw,debt:debt,goal:goalOut,life:life,bal:bal,invest:invest,pot:potSum,total:totalInv,net:netEst});
 }
 // 子女教育是連續好幾年的支出，不是單一事件——逐年插旗會在圖上排出六支「子女教育」，
 // 把整張時間軸擠爆。合併成一個區段：起於第一個繳費年，全程不轉負才算做得到。
 var eduAges=Object.keys(eduByYear).map(Number).filter(function(a){return eduByYear[a]>0}).sort(function(x,y){return x-y});
 if(eduAges.length){
  var eFrom=eduAges[0],eTo=eduAges[eduAges.length-1],eSum=0;
  eduAges.forEach(function(a){eSum+=eduByYear[a]});
  var eBad=rows.some(function(r){return r.age>=eFrom&&r.age<=eTo&&r.total<0});
  evts.push({kind:'edu',age:eFrom,span:eTo,name:'子女教育',amount:eSum,ok:!eBad});
 }

 // 退休生活：不是單一事件，判定是「退休後到預估壽命，資產全程不轉負」。
 var rAge=n(c.profile.retireAge)||65;
 if(rAge<=aEnd){
  var badRetire=rows.some(function(r){return r.age>=rAge&&r.total<0});
  evts.push({kind:'retire',age:rAge,name:'退休生活',amount:0,span:aEnd,ok:!badRetire});
 }
 // 傳承是願景的一部分（客戶可勾選不處理），判定用期末總資產。
 var lastRow=rows[rows.length-1]||{total:0};
 // ⚠️ 傳承只做「旗子標記」，**刻意不進 shortPV**。
 //    legacyNeed 動輒幾千萬（sampleCase 就是 4,000 萬），一旦併進缺口會讓所有既有客戶
 //    的數字一夜暴增。傳承要不要進一生需求是區塊 4 的題目，要先有客戶勾選的動線。
 if(legacyTarget>0){
  evts.push({kind:'legacy',age:aEnd,name:'傳承',amount:legacyTarget,ok:lastRow.total>=legacyTarget});
 }
 evts.sort(function(x,y){return x.age-y.age});
 var firstFail=null;for(var _e=0;_e<evts.length;_e++){if(!evts[_e].ok){firstFail=evts[_e];break;}}

 return {rows:rows,turnNeg:turnNeg,totalOutflow:totalOut,
  shortPV:shortPV,shortAge:shortAge,negAge:negAge,needPV:needPV,pvOut:pvOut,pvLate:pvLate,rate:ret*100,
  events:evts,firstFail:firstFail,urgAge:(negAge!=null?negAge:shortAge),hasActions:acts.length>0};
}

// 啟用中的調整動作。id 缺失的補一個，免得分離池的 key 互相蓋掉。
function planActionsOn(c){
 var out=[],seq=0;
 ((c||{}).actions||[]).forEach(function(x){
  if(!x||x.on===false)return;
  if(!x.id)x.id='_a'+(seq++);
  out.push(x);
 });
 return out;
}

// ===== 調整方案：缺口求解器 =====
//
// 地基語意（動這一段之前務必讀完）：
//
// 1)「現值缺口 shortPV」＝為了讓一生的可投資資產永遠不落到負值，**今天**必須額外
//    放進去的一筆錢。它不是把退休缺口、保障缺口、目標缺口硬加起來——那三個是
//    不同時點、不同性質的數字，相加沒有意義（這是改版前最大的錯）。
//    解法是封閉解，不需要疊代：
//        shortPV = max over t ( −raw_t ÷ (1+r)^(t+1) )，全程為正時取 0
//    其中 raw_t 是 projection() 裡「負餘額也照樣計息」的那條路徑。
//    實際路徑（負餘額不計息）永遠比 raw 好看，所以 shortPV 是保守上界——
//    寧可高估缺口，也不要讓教練規劃不足。
//
// 2) 缺口帳分兩區，**刻意不相加**：
//    ・現金流缺口（flow[]）＝ shortPV 依「第一個負值年之後的折現支出組成」歸因，
//      各列加總＝shortPV，可以放心加。
//    ・即時缺口（now[]）＝保障缺口與緊急預備金。它們是「事件發生才要的錢」與
//      「隨時要能動用的錢」，不是一生現金流的一部分，另列不進總額。
//
// 3) 報酬率假設會自我實現：假設拉高、缺口自然變小。兩道防線——
//    ・CAP_RATE 是求解器能開到的天花板，超過就判「此路不通」。
//    ・同時用保守情境折現率 PLAN_DISCOUNT 再算一次（conservative），
//      兩個數字並列給教練看，假設風險攤在陽光下。
//
// 4) 願景的彈性度**不需要新欄位**——goals 的 minPresent（金額最低）與 imp（重要度）、
//    travel/hobby/luxury 的 minAmount 與 imp 早就存在，只是從來沒有進過計算。
//    goalFloor()/wishFloor() 就是把這批既有資料接上引擎。

// 後台 /admin/categories「規劃求解參數」可覆蓋（走 bizTaxParams 同一張表，grp='規劃求解'）。
var PLAN_DISCOUNT=2.5;      // 保守情境折現率 %（不採客戶自己的預期報酬）
var CAP_INCOME_UP=30;       // 工作收入可調升上限 %
var CAP_EXPENSE_CUT=30;     // 生活/消費可削減上限 %
var CAP_RATE=8;             // 投資報酬率假設上限 %
var CAP_RETIRE_DELAY=10;    // 延後退休上限（年）
var CAP_RETIRE_CUT=25;      // 退休生活水準可調降上限 %
var CAP_VISION_CUT=100;     // 願景下修上限 %（100＝一路走到「金額(最低)」）
var CAP_RATE_STARTER=6;     // 啟程期(C) 的報酬率上限，比一般更保守

// 目前這份規劃實際採用的報酬率假設。
// c.plan.useAllocReturn 打開時才跟著「建議資產配置」的加權報酬走——
// 預設關閉，既有客戶的數字一位都不會動。
function effReturn(c){
 var p=(c||{}).plan||{};
 if(p.useAllocReturn){
  // 新的投資配置表優先（以現值權重加權）；沒有才退回舊的 allocations（比例%）。
  var ap=allocPV(c);
  if(ap.weight>0&&isFinite(ap.wRet))return ap.wRet;
  var al=allocInfo(c);
  if(al.totalPct>0&&isFinite(al.wRet))return al.wRet;
 }
 return n((c.params||{}).invReturn);
}

var GAP_CATS=[['base','日常支出'],['debt','貸款本息'],['goal','人生目標'],['edu','子女教育'],['life','生活願望'],['retire','退休生活']];

function gapPV(c){return projection(c).shortPV}
function gapPVAt(c,rate){return projection(c,0,rate).shortPV}

// 願景達成度。舊公式是「淨資產 ÷ 一生總流出」——分子是存量、分母是流量，
// 而且完全不看未來收入，導致幾乎所有客戶永遠只有兩三成，教練無從判斷嚴重程度。
// 新公式＝1 −（現值缺口 ÷ 一生需求現值），填得平就是 100%。
function visionRateOf(proj){
 if(!proj||!proj.needPV)return 100;
 return Math.round(Math.max(0,Math.min(1,1-proj.shortPV/proj.needPV))*100);
}
function visionRate(c){return visionRateOf(projection(c))}

// ---------- 願景彈性度（沿用既有欄位，不新增） ----------
// 有填「金額(最低)」就以它為下限；沒填則看重要度——5 分視為不可動，其餘可歸零。
function goalFloor(g){var v=n(g.minPresent);if(v>0)return Math.min(v,n(g.present));return n(g.imp)>=5?n(g.present):0}
function wishFloor(w){var v=n(w.minAmount);if(v>0)return Math.min(v,n(w.amount));return n(w.imp)>=5?n(w.amount):0}
// 願景還有多少可壓縮空間（現值口徑的粗估，只用來判斷「這根槓桿有沒有得動」）。
function visionRoom(c){
 var s=sum(c.goals,function(g){return visionOn(g)?Math.max(0,n(g.present)-goalFloor(g)):0});
 [c.travel,c.hobby,c.luxury].forEach(function(arr){s+=sum(arr,function(w){return visionOn(w)?Math.max(0,n(w.amount)-wishFloor(w))*(n(w.freq)||1):0})});
 return s;
}

// ---------- 槓桿 ----------
// 四個方向拆成六根：收入、支出、效率(報酬率)、時間(延後退休)、退休水準、願景。
// ⚠️「時間×報酬」是獨立的一根，不要併進收入——併了會讓歸因整個錯掉。
var LEVERS=[
 {id:'income',     name:'增加收入',     unit:'%',  hint:'工作收入整體調升',        dir:'up'},
 {id:'expense',    name:'減少支出',     unit:'%',  hint:'生活與消費類支出削減',    dir:'up'},
 {id:'rate',       name:'提高報酬',     unit:'%',  hint:'投資報酬率假設',          dir:'abs'},
 // step:1 ＝ 只能整數年。projection() 的時間軸是整數歲，退休年齡帶小數會讓某一年的
 // 退休權重 w 整段跳掉——反解會收斂到「延後 0.0001 年就填平了」這種假答案。
 {id:'retire',     name:'延後退休',     unit:'年', hint:'工作收入延長、退休期縮短',dir:'up',step:1},
 {id:'retireLevel',name:'降低退休水準', unit:'%',  hint:'退休期支出調降',          dir:'up'},
 {id:'vision',     name:'調整願景',     unit:'%',  hint:'目標與生活願望往「最低金額」壓縮',dir:'up'}
];
function leverName(id){for(var i=0;i<LEVERS.length;i++)if(LEVERS[i].id===id)return LEVERS[i].name;return id}
function leverUnit(id){for(var i=0;i<LEVERS.length;i++)if(LEVERS[i].id===id)return LEVERS[i].unit;return ''}

// 財務階段閘門：不同階段允許動的槓桿不一樣。
// 整裝期(D) 收支還沒轉正、基本保障還沒備齊，先談「把報酬率拉高」是本末倒置，
// 也是實務上最容易出事的一種建議 —— 直接鎖起來，並把理由寫在畫面上。
function leverGate(c,grade){
 grade=grade||health(c).grade;
 var block={},reason={};
 if(grade==='D'){block.rate=1;reason.rate='整裝期：收支尚未轉正或基本保障未備，先不談提高報酬率——順序錯了風險會反咬。';}
 var rateCap=(grade==='C')?Math.min(CAP_RATE,CAP_RATE_STARTER):CAP_RATE;
 if(visionRoom(c)<=0){block.vision=1;reason.vision='目標與生活願望都沒有填「金額(最低)」、或重要度都是 5——沒有可壓縮空間。';}
 return {grade:grade,block:block,reason:reason,rateCap:rateCap};
}

// 工作收入可調升的上限 %。
//
// 預設走後台的全域上限 CAP_INCOME_UP，但客戶如果在訪談時自己給了一個
// 「再拚一年可以到多少月收入」的數字（profile.incomeCeiling），就**以他自己說的為準**。
// 理由：客戶親口說得出口的上限比我們替他假設的 30% 有依據得多，
// 而且之後把方案攤開來談時，那個數字是他自己給的，站得住。
// 這一題來自教練實際在用的訪談問卷，見 docs/客戶入場問卷_規格拆解.md。
//
// ⚠️ 只有「工作收入」進分母——理財與其他收入不是靠拚就能拉高的，
//    混進去會把上限稀釋成一個看起來很保守、實際上沒有意義的數字。
function incomeCeilingPct(c){
 var ceil=n(((c||{}).profile||{}).incomeCeiling);
 if(!(ceil>0))return CAP_INCOME_UP;
 var work=sum(c.incomes,function(i){return i.type==='工作'?n(i.amount):0});
 if(!(work>0))return CAP_INCOME_UP;
 var pct=(ceil*12/work-1)*100;
 // ⚠️ 自述上限「低於或等於」目前工作收入時，**不套用**，退回全域上限。
 //    數學上它是負的、夾到 0 就等於把「增加收入」這根槓桿鎖死——而畫面上完全看不出來，
 //    教練只會覺得「怎麼算不出方案」。
 //    而且這種情況最常見的原因是客戶把題目聽成「你現在賺多少」，或收入含一次性獎金，
 //    不是他真的到頂了。要提醒教練回去確認，不是默默照著算。
 if(!(pct>0))return CAP_INCOME_UP;
 return pct;
}
// ===== 每一列自己的「可刪減%」保護線（expenses[].cut）=====
// ⚠️⚠️ 改版前 applyLevers() 對所有生活/消費列一律砍 set.expense%，完全不看每列的 cut：
//    教練在訪談裡一列一列問出「這一項最多只能砍 10%」設了保護線，槓桿照樣砍 30%
//    （實測 cut=10% 的生活費用列，槓桿砍 30% 時仍被砍到 504,000）。
// ⚠️ 未填（0 或空）＝**沒有設上限**＝吃槓桿的全額。
//    絕對不能反過來當「不可刪減」——全庫只有 63 筆有填，反過來會讓整根槓桿一夜失效。
//    UI 的欄位提示要把這句話寫出來（見 finDF('可刪減 %') 的 hint）。
function rowCutPct(e,leverPct){
 var cap=n(e&&e.cut);
 return cap>0?Math.min(leverPct,cap):leverPct;
}
// 「減少支出」這根槓桿真正還推得動的上限＝所有生活/消費列裡最寬鬆的那一條保護線。
// ⚠️⚠️ 求解器的 hi 一定要吃這個值：否則 leverRange 說「可以砍到 30%」、applyLevers
//    實際只砍得到 10%，二分法會在 10~30 之間收斂到一個「做得到」但其實毫無作用的答案，
//    處方箋會開出一個假的方案（"求解器以為砍得到、實際砍不到"）。
// ⚠️ 完全沒有生活/消費列時回 0 → solveLever 的 lo=hi=0，直接判 infeasible，這是對的。
function expenseCutCap(c){
 var cap=0;
 ((c||{}).expenses||[]).forEach(function(e){
  if(!isLivingCat(e.cat)||!(n(e.amount)>0))return;
  var rc=n(e.cut);
  cap=Math.max(cap,rc>0?Math.min(rc,CAP_EXPENSE_CUT):CAP_EXPENSE_CUT);
 });
 return Math.min(cap,CAP_EXPENSE_CUT);
}
function leverRange(c,id,gate){
 gate=gate||leverGate(c);
 if(id==='rate')return {lo:effReturn(c),hi:Math.max(effReturn(c),gate.rateCap),step:0};
 if(id==='retire')return {lo:0,hi:CAP_RETIRE_DELAY,step:1};
 if(id==='income')return {lo:0,hi:incomeCeilingPct(c)};
 if(id==='expense')return {lo:0,hi:expenseCutCap(c)};
 if(id==='retireLevel')return {lo:0,hi:CAP_RETIRE_CUT};
 return {lo:0,hi:CAP_VISION_CUT};
}

// 延後退休：本人與其他賺薪成員一起推，工作收入的結束歲跟著延長。
// scenario() 與 applyLevers() 共用同一份，避免兩邊各推各的。
function applyRetireDelay(c,years){
 years=n(years);if(!years)return c;
 c.profile.retireAge=n(c.profile.retireAge)+years;
 (c.members||[]).forEach(function(m){if(m&&m.role!=='本人'&&n(m.retireAge)>0)m.retireAge=n(m.retireAge)+years});
 (c.incomes||[]).forEach(function(i){if(i.type==='工作'&&n(i.end)<n(c.profile.retireAge))i.end=n(c.profile.retireAge)});
 return c;
}

/** 套用一組槓桿值，回傳新的個案（不動原件）。 */
function applyLevers(c,set){
 set=set||{};
 var a=JSON.parse(JSON.stringify(c));
 var inc=n(set.income);
 if(inc)(a.incomes||[]).forEach(function(i){if(i.type==='工作')i.amount=n(i.amount)*(1+inc/100)});
 var cut=n(set.expense);
 // ⚠️ 每一列取 min(槓桿要求的%, 該列的可刪減%)——教練設的保護線不能被槓桿蓋過去。見 rowCutPct。
 if(cut)(a.expenses||[]).forEach(function(e){if(isLivingCat(e.cat))e.amount=n(e.amount)*(1-rowCutPct(e,cut)/100)});
 if(set.rate!==undefined&&set.rate!==null&&set.rate!==''){
  a.params=a.params||{};a.params.invReturn=n(set.rate);
  a.plan=a.plan||{};a.plan.useAllocReturn=false;   // 手動指定報酬率就不再跟著配置走
 }
 if(n(set.retire))applyRetireDelay(a,n(set.retire));
 var rl=n(set.retireLevel)/100;
 if(rl>0){
  (a.retireExpenses||[]).forEach(function(r){r.amount=n(r.amount)*(1-rl)});
  if(a.retire)a.retire.monthLiving=n(a.retire.monthLiving)*(1-rl);
 }
 var vx=n(set.vision)/100;
 if(vx>0){
  (a.goals||[]).forEach(function(g){if(!visionOn(g))return;var f=goalFloor(g);g.present=n(g.present)-vx*Math.max(0,n(g.present)-f)});
  [a.travel,a.hobby,a.luxury].forEach(function(arr){(arr||[]).forEach(function(w){if(!visionOn(w))return;var f=wishFloor(w);w.amount=n(w.amount)-vx*Math.max(0,n(w.amount)-f)})});
 }
 return a;
}

function gapWith(c,set){return projection(applyLevers(c,set)).shortPV}

/**
 * 單槓桿反解：「如果只動這一根，要動到多少才填得平？」
 * 二分法 24 次（≈1e-7 相對精度就夠，畫面只顯示到整數）。
 * 回傳 feasible=false 代表拉到上限仍補不平——這就是「此路不通」，
 * 教練該往下一根、或往調整願景走。
 */
function solveLever(c,id,base,gate){
 base=base||{};gate=gate||leverGate(c);
 var r=leverRange(c,id,gate);
 var mk=function(x){var s={};for(var k in base)if(base.hasOwnProperty(k))s[k]=base[k];s[id]=x;return s};
 var blocked=!!gate.block[id];
 var g0=gapWith(c,mk(r.lo));
 if(g0<=0)return {id:id,name:leverName(id),unit:leverUnit(id),x:r.lo,lo:r.lo,cap:r.hi,gap:0,base:0,needed:false,feasible:true,blocked:blocked,reason:gate.reason[id]||''};
 if(blocked)return {id:id,name:leverName(id),unit:leverUnit(id),x:r.lo,lo:r.lo,cap:r.hi,gap:g0,base:g0,needed:true,feasible:false,blocked:true,reason:gate.reason[id]||'',reduce:0};
 var g1=gapWith(c,mk(r.hi));
 if(g1>0)return {id:id,name:leverName(id),unit:leverUnit(id),x:r.hi,lo:r.lo,cap:r.hi,gap:g1,base:g0,needed:true,feasible:false,blocked:false,reason:'',reduce:g0-g1};
 if(r.step){
  // 整數槓桿：直接掃，二分法在離散軸上會收斂到沒有意義的小數。
  for(var x=r.lo+r.step;x<=r.hi+1e-9;x+=r.step){if(gapWith(c,mk(x))<=0)return {id:id,name:leverName(id),unit:leverUnit(id),x:x,lo:r.lo,cap:r.hi,gap:0,base:g0,needed:true,feasible:true,blocked:false,reason:'',reduce:g0,step:r.step};}
  return {id:id,name:leverName(id),unit:leverUnit(id),x:r.hi,lo:r.lo,cap:r.hi,gap:g1,base:g0,needed:true,feasible:false,blocked:false,reason:'',reduce:g0-g1,step:r.step};
 }
 var lo=r.lo,hi=r.hi;
 for(var i=0;i<24;i++){var mid=(lo+hi)/2;if(gapWith(c,mk(mid))>0)lo=mid;else hi=mid;}
 return {id:id,name:leverName(id),unit:leverUnit(id),x:hi,lo:r.lo,cap:r.hi,gap:0,base:g0,needed:true,feasible:true,blocked:false,reason:'',reduce:g0};
}

/** 六根槓桿各自反解一次——這張表就是「教練該解什麼」的自動提醒。 */
function soloSolve(c){
 var gate=leverGate(c);
 return {gate:gate,rows:LEVERS.map(function(L){return solveLever(c,L.id,{},gate)})};
}

// ---------- 三個處方 ----------
// 模板數量永遠固定三個，內容每次由求解器現算——這樣才不會「模板一多版面就亂」。
var RX_DEFS=[
 {key:'stable',name:'穩健型',desc:'不假設加薪、不拉高報酬率。先從支出與退休水準下手，最後才用時間換。',
  order:['expense','retireLevel','retire']},
 {key:'growth',name:'進取型',desc:'假設職涯與投資都往上走。先要收入，再要報酬，最後用時間補。',
  order:['income','rate','retire']},
 // 第三張刻意從願景開始，而不是「其他都拉到上限之後才調願景」——
 // 教練真正需要當場回答的是「如果什麼都做不到，願景要砍多少才做得到」，
 // 把它擺在最後一位會讓這個答案永遠算不出來。
 {key:'vision',name:'調願景型',desc:'不動收入與支出，先算「願景要壓縮多少才做得到」；壓到上限仍不夠才動其他槓桿。',
  order:['vision','expense','income','rate','retire','retireLevel']}
];

function greedyFill(c,order,gate){
 gate=gate||leverGate(c);
 var set={},steps=[];
 for(var i=0;i<order.length;i++){
  var id=order[i];
  var r=solveLever(c,id,set,gate);
  if(!r.needed){steps.push(r);break;}          // 前面幾根已經填平了
  if(r.blocked){steps.push(r);continue;}        // 階段閘門擋住，跳過但要留痕
  set[id]=r.x;steps.push(r);
  if(r.feasible)break;                          // 這一根就夠了
 }
 var gap=gapWith(c,set);
 return {levers:set,steps:steps,gap:gap,ok:gap<=0.5};
}

function prescriptions(c){
 var gate=leverGate(c);
 return RX_DEFS.map(function(d){
  var r=greedyFill(c,d.order,gate);
  return {key:d.key,name:d.name,desc:d.desc,levers:r.levers,steps:r.steps,gap:r.gap,ok:r.ok};
 });
}

// ---------- 缺口帳 ----------
function gapLedger(c){
 var p=projection(c),m=metrics(c);
 var total=p.shortPV;
 var lateTot=0;GAP_CATS.forEach(function(k){lateTot+=p.pvLate[k[0]]});
 var flow=[];
 GAP_CATS.forEach(function(k){
  var share=lateTot?p.pvLate[k[0]]/lateTot:0;var pvv=total*share;
  if(pvv>0.5)flow.push({key:k[0],name:k[1],pv:pvv,share:share});
 });
 flow.sort(function(a,b){return b.pv-a.pv});
 var now=[];
 var covs={};
 coverageGaps(c).forEach(function(g){if(g.gap>0)covs[g.kind]=(covs[g.kind]||0)+g.gap});
 // ⚠️ 每一列都要帶自己的單位：這張清單同時放得下「壽險 500 萬元」與「住院醫療 3,000 元/日」，
 //    少了 unit 就會被讀成同一種錢（B3 的起因）。amount 一律不換算。
 Object.keys(covs).forEach(function(k){now.push({name:'保障・'+k,amount:covs[k],kind:'保障',unit:kindUnit(k)})});
 var emReq=m.monthExp*(n(c.params.emergencyMonths)||6),emGap=Math.max(0,emReq-m.cash);
 if(emGap>0)now.push({name:'緊急預備金',amount:emGap,kind:'流動性',unit:'元'});
 now.sort(function(a,b){return b.amount-a.amount});
 // 每年要補多少：用償債基金公式（不是把現值缺口直接除以年數——那會低估到離譜）。
 // 期數取「到退休」與「到第一個不足年」孰早：錢要在缺口發生之前就位，
 // 而退休之後通常也沒有薪資可以再存。
 var a0_=n(c.profile.age)||40,ra_=n(c.profile.retireAge);
 var end_=(p.negAge!=null)?Math.min(p.negAge,ra_):ra_;
 var yrs=Math.max(1,end_-a0_);
 var r_=p.rate/100;
 var annual_=(Math.abs(r_)<1e-9)?(total/yrs):(total*r_/(Math.pow(1+r_,yrs)-1));
 return {total:total,needPV:p.needPV,rate:p.rate,negAge:p.negAge,shortAge:p.shortAge,
  flow:flow,now:now,years:yrs,annual:annual_,
  conservative:gapPVAt(c,PLAN_DISCOUNT),conservativeRate:PLAN_DISCOUNT,
  visionRate:visionRateOf(p),rateOverCap:effReturn(c)>CAP_RATE};
}

// 後台 /admin/categories 的「規劃求解參數」一存，這些上限就會被覆蓋。
// 與 applyBizTax 同一套防呆：只覆蓋「本來就存在、而且是有限數字」的 key。
function applyPlanCaps(values){
 if(!values||typeof values!=='object')return;
 var setters={
  PLAN_DISCOUNT:function(x){PLAN_DISCOUNT=x},CAP_INCOME_UP:function(x){CAP_INCOME_UP=x},
  CAP_EXPENSE_CUT:function(x){CAP_EXPENSE_CUT=x},CAP_RATE:function(x){CAP_RATE=x},
  CAP_RETIRE_DELAY:function(x){CAP_RETIRE_DELAY=x},CAP_RETIRE_CUT:function(x){CAP_RETIRE_CUT=x},
  CAP_VISION_CUT:function(x){CAP_VISION_CUT=x},CAP_RATE_STARTER:function(x){CAP_RATE_STARTER=x}
 };
 Object.keys(setters).forEach(function(k){
  var x=Number(values[k]);
  if(isFinite(x)&&values[k]!==null&&values[k]!==undefined&&values[k]!=='')setters[k](x);
 });
}

// ===== 配置與對帳（缺口 → 用什麼填）=====
//
// Ray 2026/08/23：「缺口跟配置結果出來了之後，底下需要有對應的配置內容跟預期報酬率，
// 然後滿足上面的缺口。不用具體的商品，先予以留空。」
//
// ⚠️ 地基語意（很容易做錯的三件事）：
//
// 1) **只有「新增投入」的錢才算填補缺口。** 「既有轉入」是把本來就在 projection 裡的
//    可投資資產換個地方放——它會改變加權報酬率，但不會憑空多出一塊錢。
//    把既有資產也算成填補來源，等於把同一筆錢用兩次。
//
// 2) **年投入不當成支出。** 它是「從消費轉到投資」，不是消失的錢；真要減少消費是
//    「減少支出」那根槓桿的事。兩邊都算會重複扣。
//    **保費不一樣——那是真的消耗掉的錢**，所以畫面會提醒教練另外登錄到支出→保險。
//
// 3) **保障配置不進現值對帳。** 保額填的是「即時缺口」（事件發生才要的錢），
//    和一生現金流缺口不同性質，所以走另一條逐項掛勾的對帳，不併入總額。
//
// 商品名稱一律留空：嵐途是一般顧問公司，不做商品推薦。這張表登錄的是
// 「結構與條件」（本金/報酬率/保額/條件內容），不是「買哪一張」。

var ALLOC_SRC=['新增投入','既有轉入'];

// 調整動作的類別表。這一份是從 public/lantu-app.html 移植過來的（allocInvest 依賴 actCat 取預設名稱），
// engine 端只用得到 k / n 兩個欄位，其餘留著是為了兩邊逐字對得上。
var ACT_CATS=[
 {k:'income',   n:'增加工作收入', lane:'A', hint:'每月增加多少'},
 {k:'expense',  n:'刪減支出',     lane:'C', hint:'每月省下多少', ref:'expenses'},
 {k:'regular',  n:'定期定額',     lane:'B', hint:'每月投入、自帶報酬率'},
 {k:'lump',     n:'單筆投入',     lane:'B', hint:'一次投入、自帶報酬率'},
 {k:'liquidate',n:'資產變現',     lane:'B', hint:'填淨變現金額', ref:'assets'},
 {k:'loan',     n:'貸款取得資金', lane:'B', hint:'利率隱含在月付裡'},
 {k:'insure',   n:'購買保障',     lane:'B', hint:'保額會接回保障缺口'}
];
function actCat(k){for(var i=0;i<ACT_CATS.length;i++)if(ACT_CATS[i].k===k)return ACT_CATS[i];return ACT_CATS[2]}

// 投資型配置＝手填的 c.plan.invest ＋ **調整動作裡的定期定額／單筆投入**。
// 那兩類本來就是投資，理論上就該出現在配置圓餅與加權報酬裡；
// 「建議資產配置」本身是規劃不是現況，所以這裡合併沒有語意衝突
//（跟十字表不一樣——十字表是現況，動作只能疊加顯示、不能寫進去）。
// ⚠️ 動作帶來的列標 `fromAction:true`，畫面上不可編輯，要改請回動作清單。
// ⚠️⚠️ 2026/08/28：engine 端原本只有 own 那一半，plan.useAllocReturn 打開時
//   effReturn / allocPV 與教練畫面差一截 → 寫進 DB 的 shortPV 跟畫面上不是同一個數字。
//   以 html 版為準移植過來，engine.drift.test.ts 釘住。
function allocInvest(c){
 var own=((c.plan||{}).invest)||[];
 var A=n((c||{}).profile&&c.profile.age)||40,R=n((c||{}).profile&&c.profile.retireAge)||65;
 var fromAct=planActionsOn(c).filter(function(a){return a.cat==='regular'||a.cat==='lump'}).map(function(a){
  var from=n(a.payFrom)||A,to=n(a.payTo)||R;
  return {name:((a.name||'').trim()||actCat(a.cat).n),
   kind:(a.tool||'').trim()||'—',
   principal:n(a.payLump),
   yearly:n(a.payMonthly)*12,
   years:Math.max(1,to-from+(a.cat==='lump'?1:0)),
   ret:n(a.growth),
   src:'新增投入',
   fromAction:true,actionId:a.id};
 });
 return own.concat(fromAct);
}
function allocInvestOwn(c){return ((c.plan||{}).invest)||[]}
function allocProtect(c){return ((c.plan||{}).protect)||[]}

/** 這一列的投入年數：留空＝從現在到退休。 */
function allocYears(c,r){
 var y=n(r.years);
 if(y>0)return y;
 return Math.max(1,n(c.profile.retireAge)-(n(c.profile.age)||40));
}

/** 年金現值：每年投入 pmt、共 n 年、折現率 r%。r≈0 時退回單純相乘（不可除以零）。 */
function annuityPV(pmt,yrs,ratePct){
 pmt=n(pmt);yrs=n(yrs);
 if(pmt<=0||yrs<=0)return 0;
 var r=n(ratePct)/100;
 if(Math.abs(r)<1e-9)return pmt*yrs;
 return pmt*(1-Math.pow(1+r,-yrs))/r;
}

/**
 * 每一列投資配置的「現值貢獻」＝這筆新錢今天值多少。
 * 與缺口同為現值口徑，可以直接相比。折現率用**該列自己的預期報酬率**——
 * 那是這筆錢的機會成本，也是教練填在同一列的假設，最不會前後矛盾。
 */
function allocPV(c){
 var rows=allocInvest(c).map(function(r){
  var isNew=(r.src||'新增投入')==='新增投入';
  var yrs=allocYears(c,r);
  var pvPrincipal=isNew?n(r.principal):0;
  var pvYearly=isNew?annuityPV(r.yearly,yrs,r.ret):0;
  var base=n(r.principal)+annuityPV(r.yearly,yrs,r.ret);   // 含既有，只給加權報酬用
  return {row:r,isNew:isNew,years:yrs,pv:pvPrincipal+pvYearly,weight:base};
 });
 var pv=sum(rows,function(x){return x.pv});
 var wTot=sum(rows,function(x){return x.weight});
 var wRet=wTot?sum(rows,function(x){return x.weight*n(x.row.ret)})/wTot:0;
 return {rows:rows,pv:pv,weight:wTot,wRet:wRet,
  yearly:sum(allocInvest(c),function(r){return n(r.yearly)}),
  premium:sum(allocProtect(c),function(r){return n(r.premium)})};
}

/**
 * 對帳：這組配置補得起缺口嗎？
 * set＝拉桿組合（缺口要用「拉桿之後」的，因為配置補的是剩下那一段）。
 */
function allocReconcile(c,set){
 var after=applyLevers(c,set||{});
 var led=gapLedger(after);
 var ap=allocPV(c);
 var gap=led.total;
 // 保障：逐項掛勾。沒有被任何一列指到的即時缺口 → unassigned。
 var byKey={};
 allocProtect(c).forEach(function(r){
  var k=r.gapKey||'';
  if(!k||k==='（未指定）')return;
  byKey[k]=(byKey[k]||0)+n(r.cover);
 });
 var protect=led.now.map(function(x){
  var have=byKey[x.name]||0;
  return {name:x.name,kind:x.kind,unit:x.unit||'元',need:x.amount,have:have,short:Math.max(0,x.amount-have),ok:have>=x.amount-0.5};
 });
 var unassigned=protect.filter(function(p){return !p.ok});
 var orphan=Object.keys(byKey).filter(function(k){
  for(var i=0;i<led.now.length;i++)if(led.now[i].name===k)return false;
  return true;
 });
 return {gap:gap,pv:ap.pv,alloc:ap,led:led,
  coverRate:gap>0.5?ap.pv/gap:(ap.pv>0?1:1),
  remain:Math.max(0,gap-ap.pv),over:Math.max(0,ap.pv-gap),
  ok:ap.pv>=gap-0.5,
  protect:protect,unassigned:unassigned,orphan:orphan};
}

/** 舊的 allocations（標的/比例%/預期報酬%/效益）搬到新結構。只跑一次，跑完刪掉舊欄位。 */
function migrateAlloc(c){
 if(!c||!c.plan)return c;
 var p=c.plan;
 if(!p.invest)p.invest=[];
 if(!p.protect)p.protect=[];
 if(p.allocations&&p.allocations.length&&!p._allocMigrated){
  // 比例% 換算成本金：以目前的可投資資產為基數，來源標「既有轉入」——
  // 舊表講的本來就是「現有資產怎麼分」，不是「再拿新錢出來」。
  var liquid=sum((c.assets||[]),function(a){return aLiquid(c,a)?aVal(a):0});
  p.allocations.forEach(function(a){
   if(!(n(a.pct)>0)&&!a.name)return;
   p.invest.push({kind:'投資',name:a.name||'',src:'既有轉入',
    principal:Math.round(liquid*n(a.pct)/100),yearly:0,years:0,
    ret:n(a.ret),note:a.benefit||''});
  });
  p._allocMigrated=1;
 }
 return c;
}

/** 這份規劃目前採用的槓桿組合（相容舊欄位 plan.retireDelay）。 */
function planLevers(c){
 var p=c.plan||{},s={};
 var lv=p.levers||{};
 for(var k in lv)if(lv.hasOwnProperty(k)&&n(lv[k]))s[k]=n(lv[k]);
 if(n(p.retireDelay)&&!s.retire)s.retire=n(p.retireDelay);
 return s;
}

// ---------- 調整方案 → 具體行動 ----------
// 求解器算出來的是「支出要砍 12.4%」這種比例，但教練跟客戶講的必須是
// 「每個月少花 8,300 元」「換屋從 1,200 萬降到 1,050 萬」。這一段負責翻譯。
// ⚠️ 回傳的是純資料，畫面（分析頁／報告書／方案書）三處共用同一份，不要各自再算一次。

/** 套用某個願景壓縮幅度後，逐項的「理想 → 調整後」。x 為 0~100。 */
function visionChanges(c,x){
 var vx=n(x)/100,out=[];
 if(vx<=0)return out;
 (c.goals||[]).forEach(function(g){
  if(!visionOn(g))return;
  var f=goalFloor(g),from=n(g.present),to=from-vx*Math.max(0,from-f);
  if(from-to>0.5)out.push({kind:'目標',name:(g.name||g.type||'目標'),from:from,to:to,floor:f,unit:'元'});
 });
 [['旅遊',c.travel],['休閒',c.hobby],['奢侈品',c.luxury]].forEach(function(pair){
  (pair[1]||[]).forEach(function(w){
   if(!visionOn(w))return;
   var f=wishFloor(w),from=n(w.amount),to=from-vx*Math.max(0,from-f);
   if(from-to>0.5)out.push({kind:pair[0],name:(w.sub||w.cat||pair[0]),from:from,to:to,floor:f,unit:'元/次'});
  });
 });
 return out;
}

/**
 * 把一組槓桿翻成可執行清單。set 留空＝用這份規劃已採用的方案。
 * 每一列：{axis 面向, title 做什麼, detail 做到什麼程度, note 補充}
 */
function planActions(c,set){
 set=set||planLevers(c);
 var led=gapLedger(c),acts=[],m=metrics(c);
 var after=applyLevers(c,set),gapAfter=projection(after).shortPV;

 if(led.total>0.5){
  acts.push({axis:'累積',title:'把缺口補起來',
   detail:(led.years<=1
     ? '現金流最快在 '+led.negAge+' 歲轉負，'+fmt(led.total)+' 元的缺口沒有攤提空間，必須立即處理'
     : '在 '+led.years+' 年內每年存入 '+fmt(led.annual)+' 元，以 '+(+led.rate.toFixed(2))+'% 複利累積'),
   note:'現值缺口 '+fmt(led.total)+' 元（保守情境 '+fmt(led.conservative)+' 元）'});
 }

 var incNow=sum(c.incomes,function(i){return i.type==='工作'?n(i.amount):0});
 if(n(set.income)){
  var incAdd=incNow*n(set.income)/100;
  acts.push({axis:'收入',title:'提高工作收入',
   detail:'整體調升 '+(+n(set.income).toFixed(1))+'％＝每年多 '+fmt(incAdd)+' 元（每月 '+fmt(incAdd/12)+' 元）',
   note:'目前工作收入合計 '+fmt(incNow)+' 元/年'});
 }
 var expNow=sum(c.expenses,function(e){return isLivingCat(e.cat)?n(e.amount):0});
 if(n(set.expense)){
  var expCut=expNow*n(set.expense)/100;
  acts.push({axis:'支出',title:'降低生活與消費支出',
   detail:'削減 '+(+n(set.expense).toFixed(1))+'％＝每年少花 '+fmt(expCut)+' 元（每月 '+fmt(expCut/12)+' 元）',
   note:'目前生活＋消費 '+fmt(expNow)+' 元/年'});
 }
 if(set.rate!==undefined&&set.rate!==null&&set.rate!==''&&n(set.rate)>effReturn(c)){
  var al=allocInfo(c);
  acts.push({axis:'效率',title:'調整資產配置以提高長期報酬',
   detail:'報酬率假設由 '+(+effReturn(c).toFixed(2))+'％ 提高到 '+(+n(set.rate).toFixed(2))+'％',
   note:(al.totalPct>0?'目前建議配置的加權報酬為 '+al.wRet.toFixed(2)+'％，需要重新檢視配置':'尚未填建議資產配置')+
        '；規劃上限 '+CAP_RATE+'％，此為假設不是承諾'});
 }
 if(n(set.retire)){
  acts.push({axis:'時間',title:'延後退休',
   detail:'退休年齡由 '+n(c.profile.retireAge)+' 歲改為 '+n(after.profile.retireAge)+' 歲（延後 '+Math.round(n(set.retire))+' 年）',
   note:'工作收入同步延長，退休期縮短——這一根同時作用在兩端'});
 }
 if(n(set.retireLevel)){
  var rNow=retireAnnual(c,n(c.profile.retireAge)+1,1);
  acts.push({axis:'願景',title:'調降退休生活水準',
   detail:'退休期支出調降 '+(+n(set.retireLevel).toFixed(1))+'％'+(rNow>0?'＝退休首年由 '+fmt(rNow)+' 元降為 '+fmt(rNow*(1-n(set.retireLevel)/100))+' 元':''),
   note:'退休期支出明細在「退休」分頁逐列調整'});
 }
 var vc=visionChanges(c,set.vision);
 if(vc.length){
  acts.push({axis:'願景',title:'壓縮目標與生活願望',
   detail:'整體壓縮 '+(+n(set.vision).toFixed(1))+'％，共 '+vc.length+' 項調整（逐項見下表）',
   note:'壓縮下限＝各項填的「金額(最低)」；重要度 5 的項目不動'});
 }

 (led.now||[]).forEach(function(x){
  acts.push({axis:(x.kind==='保障'?'保障':'流動性'),
   title:(x.kind==='保障'?'補足保障缺口':'補足緊急預備金'),
   detail:x.name+' 尚差 '+fmt(x.amount)+' '+(x.unit||'元'),
   note:'不併入現值缺口——這是事件發生才要的錢／隨時要能動用的錢'});
 });

 return {actions:acts,visionChanges:vc,gapBefore:led.total,gapAfter:gapAfter,ledger:led,after:after,levers:set};
}

function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;var t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296}}

function hashStr(s){s=s||'x';var h=2166136261;for(var i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}return h>>>0}

function gauss(rng,m,sd){var u=0,v=0;while(u===0)u=rng();while(v===0)v=rng();return m+sd*Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v)}

function monteCarlo(c,N){N=(n(N)>0)?Math.round(n(N)):1000;var rng=mulberry32(hashStr(c.id)+N);
 // horizon 沒填時要退回 85（與 projection 一致）。少了 ||85 會讓 years 變負數 →
 // 迴圈不執行 → neg=0 → pSuccess 顯示「不破產機率 100%」而圖是空的。
 var a0=n(c.profile.age)||40,aEnd=effHorizon(c),years=Math.max(0,aEnd-a0+1);
 var bR=n(c.params.invReturn),sR=n(c.params.invReturnStd),bI=n(c.params.inflation),sI=n(c.params.inflationStd),bG=n(c.params.salaryGrowth),sG=n(c.params.salaryStd);
 var liquid0=sum(c.assets,function(a){return aLiquid(c,a)?aVal(a):0});
 var passive=assetPassive(c);
 var workBase=sum(c.incomes,function(i){return i.type==='工作'?n(i.amount):0});
 var edu=[];var g0=n(c.params.tuitionGrowth)/100;
 (c.education||[]).forEach(function(e){var s=a0+n(e.startIn);for(var yy=0;yy<n(e.years);yy++){edu[s+yy]=(edu[s+yy]||0)+n(e.annual)*Math.pow(1+g0,n(e.startIn)+yy)}});
 // 購置貸款：與 projection() 同一份，否則「不破產機率」會跟主圖講不同的話。
 // ⚠️ 頭期款用確定性的成長率算（goalLoans 內），不隨每一次抽樣的通膨走——
 //    貸款契約的金額本來就在簽約當下就固定了。
 var gLoansMC=goalLoans(c);
 var matrix=[],finals=[],neg=0;
 for(var s=0;s<N;s++){var invest=liquid0,cumI=1,cumG=1,broke=false,traj=[];
  for(var age=a0;age<=aEnd;age++){var t=age-a0;
   var ret=gauss(rng,bR,sR)/100,infl=gauss(rng,bI,sI)/100,sg=gauss(rng,bG,sG)/100;
   var work=(function(){var w=0;c.incomes.forEach(function(i){if(i.type==='工作'&&inSpan(i,age))w+=n(i.amount)*cumG});return w})();
   var other=sum(c.incomes,function(i){return (i.type!=='工作'&&i.type!=='理財'&&inSpan(i,age))?n(i.amount):0});
   var fin=sum(c.incomes,function(i){return (i.type==='理財'&&inSpan(i,age))?n(i.amount):0})+passive;
   var income=work+other+fin;
   var wMC=retiredWeight(c,age);
   var expense=workPhaseExpense(c,age,cumI,wMC);
   var debt=sum(c.liabilities,function(l){return debtPayAt(l,age,a0)})+sum(gLoansMC,function(L){return debtPayAt(L.liab,age,a0)});
   var goalOut=0;
   (c.goals||[]).forEach(function(gg,gi){
    if(!visionOn(gg))return;if(!inSpan(gg,age))return;
    var hit=(n(gg.freq)<=0)?(age===n(gg.start)):(((age-n(gg.start))%n(gg.freq))===0);if(!hit)return;
    var gl=null;for(var li=0;li<gLoansMC.length;li++)if(gLoansMC[li].idx===gi)gl=gLoansMC[li];
    if(gl){goalOut+=gl.down;return;}
    var gr=gg.growth==='通膨'?cumI:1;goalOut+=n(gg.present)*gr;});
   var eduY=edu[age]||0;
   var lifeY=lifestyleFactor(c,age,cumI);
   var retireDraw=retireAnnual(c,age,cumI)*wMC;
   invest=(invest>0?invest*(1+ret):invest)+(income-expense-debt-goalOut-eduY-lifeY-retireDraw);
   if(invest<0)broke=true;
   traj.push(invest);
   cumI*=(1+infl);cumG*=(1+sg);
  }
  matrix.push(traj);finals.push(invest);if(broke)neg++;
 }
 // p 分位：索引要用 (len-1) 內插，用 floor(p*len) 在小樣本會把 P90 取成最大值。
 function pctile(arr,p){var a=arr.slice().sort(function(x,y){return x-y});if(!a.length)return 0;
  return a[Math.min(a.length-1,Math.max(0,Math.round(p*(a.length-1))))]}
 var bands=[];for(var y=0;y<years;y++){var col=matrix.map(function(m){return m[y]});bands.push([pctile(col,0.1),pctile(col,0.5),pctile(col,0.9)])}
 return {N:N,years:years,a0:a0,pSuccess:(N-neg)/N,finalP10:pctile(finals,0.1),finalP50:pctile(finals,0.5),finalP90:pctile(finals,0.9),bands:bands};
}

function health(c){
 var m=metrics(c),savingRate=m.save/(m.incTotal||1);
 var reserve=Math.min(1,(m.liquid/(m.monthExp||1))/n(c.params.emergencyMonths||6));
 // 聯徵評分區間是 200–800。credit 的設計值域是 0~1（safety 用 credit*15 加權，滿分 100）；
 // 用 cs/100 會讓 700 分算成 7.0、safety 直接飆到 183。與 lantu-app.html:827 一致。
 var cs=creditScoreOf(c);var credit=cs>=200?Math.min(1,Math.max(0,(cs-200)/600)):0;
 var dr=m.debtTotal/(m.assetTotal||1);var debtBal=dr<0.2?1:Math.max(0,1-(dr-0.2)/0.6);
 /* ⚠️⚠️ 風險保全（安全度 30 分權重）只吃「一次性給付缺口」。
    改版前的分子是 totalGap()＝三種單位硬加，分母是同樣硬加的需求總額，
    等於拿「500 萬元 ＋ 3,000 元/日 ＋ 30,000 元/月」去除以另一個同樣沒有意義的和。
    一次性給付是唯一與保額同維度、可以直接比的數字；日額／月額缺口改在畫面上
    獨立呈現（gapTotals().daily / .monthly），不進分數。 */
 var need=gapTotals(c).lump,needBase=gapNeedBase(c).lump||1;
 var riskCover=Math.max(0,1-need/needBase);
 var balScore=savingRate>=0?1:Math.max(0,1+savingRate);
 // 五項加權滿分 100；clamp 是防呆，任何一項若因資料異常超出 0~1 都不該讓總分破表。
 var safety=Math.max(0,Math.min(100,Math.round((balScore*25+reserve*15+credit*15+debtBal*15+riskCover*30))));
 /* ⚠️ A1 之後 expTotal 真的可能是 0（現齡不落在任何一列的起訖內）。
    舊寫法 m.incFinancial/(m.expTotal||1) 會把「沒有任何有效支出」讀成
    「理財收入覆蓋了 100% 的支出」→ 財務階段直接跳到 A 遠行期
    （2025 示範案的張文山 29 歲、每一列都從 40 歲起算，就是這樣 D→A）。
    沒有支出可以覆蓋，那不是財務自由，是資料不完整。*/
 var freedom=m.expTotal>0?Math.round(Math.min(1,m.incFinancial/m.expTotal)*100):0;
 // 願景達成度＝1 −（現值缺口 ÷ 一生需求現值）。舊公式是「淨資產 ÷ 一生總流出」——
 // 分子存量、分母流量，而且完全不看未來收入，導致幾乎每個客戶都卡在兩三成、教練無從判斷輕重。
 // m.proj 是 metrics() 已經跑過的那一份，這裡不會多跑一次 projection。
 var vision=visionRateOf(m.proj);
 var grade=(safety<60||balScore<1)?'D':(freedom<20?'C':(vision<60?'B':'A'));
 return {safety:safety,freedom:freedom,vision:vision,grade:grade,
  raw:{balScore:balScore,reserve:reserve,credit:credit,debtBal:debtBal,riskCover:riskCover},
  parts:{收支平衡:Math.round(balScore*100),預備金:Math.round(reserve*100),信用:Math.round(credit*100),負債平衡:Math.round(debtBal*100),風險保全:Math.round(riskCover*100)}};
}

// ===== 財務階段（旅程命名）：內部值仍為 A/B/C/D，此處只做顯示層對照 =====
// 與 public/lantu-app.html 的 STAGE 必須保持一致。
var STAGE={
 D:{name:'整裝期',task:'讓收支轉正、備妥緊急預備金與基本保障',c:'#8fa6b8',cl:'#5f7385',
    gate:'財務安全度 < 60 分，或年結餘為負',
    desc:'旅程的起點。先把地基補好——讓收支有結餘、備妥緊急預備金與基本保障，才有餘力談累積。'},
 C:{name:'啟程期',task:'把儲蓄變成會生錢的資產，建立理財收入',c:'#7fa8a0',cl:'#4e7a72',
    gate:'安全度 ≥ 60 分且收支為正，但財務自由度 < 20%',
    desc:'地基已穩、正式上路。收入幾乎仍全靠工作，重點是把儲蓄轉成會生息的資產，讓理財收入長出來。'},
 B:{name:'前行期',task:'資產配置、抗風險，朝願景累積',c:'#c9a86b',cl:'#a3814a',
    gate:'財務自由度 ≥ 20%，但願景達成度 < 60%',
    desc:'資產已開始替你工作。重點轉為配置與抗風險，穩定朝退休、教育、置產等願景累積。'},
 A:{name:'遠行期',task:'願景擴張、傳承與稅務配置',c:'#e0c88b',cl:'#8a6f3c',
    gate:'安全度 ≥ 60、自由度 ≥ 20%、願景達成度 ≥ 60% 全數達標',
    desc:'三項指標都到位。可以把重心放在願景擴張、資產傳承與稅務效率。'}
};
// 三個判定指標的計算標準（與 health() 完全對應）
var STAGE_METRICS=[
 ['財務安全度','收支平衡×25 ＋ 緊急預備金×15 ＋ 信用×15 ＋ 負債平衡×15 ＋ 風險保全×30，滿分 100 分'],
 ['財務自由度','理財收入 ÷ 家庭總支出 × 100%（理財收入能覆蓋多少比例的支出）'],
 ['願景達成度','1 −（現值缺口 ÷ 一生需求現值）× 100%；填得平就是 100%（退休、教育、置產等目標的達成進度）']
];
function stageGate(g){return (STAGE[g]||{}).gate||''}
function stageDesc(g){return (STAGE[g]||{}).desc||''}
var STAGE_ORDER=['D','C','B','A'];
function stageName(g){return (STAGE[g]||{}).name||'未評估'}
function stageTask(g){return (STAGE[g]||{}).task||''}
function stageColor(g,light){var st=STAGE[g];return st?(light?st.cl:st.c):(light?'#6b7d8f':'var(--mut)')}
// 為什麼在這個階段：指出當前最關鍵的那一項
function stageReason(h){
 if(!h)return '';
 var rw=h.raw||{};
 if(rw.balScore<1)return '目前收支為負，第一步是讓現金流轉正';
 if(h.safety<60){
  var it=[['風險保全',rw.riskCover],['緊急預備金',rw.reserve],['負債結構',rw.debtBal],['信用狀況',rw.credit]];
  it.sort(function(a,b){return (a[1]||0)-(b[1]||0)});
  return it[0][0]+'是目前最需要補強的一項';
 }
 if(h.freedom<20)return '理財收入目前覆蓋 '+h.freedom+'% 的支出，下一步是讓資產開始工作';
 if(h.vision<60)return '淨資產已達願景需求的 '+h.vision+'%，持續累積中';
 return '基礎與現金流都到位，可以把重心放在願景與傳承';
}
var GRADE_STRAT={A:STAGE.A.task,B:STAGE.B.task,C:STAGE.C.task,D:STAGE.D.task};

function advice(c){
 var m=metrics(c),h=health(c),proj=m.proj,list=[],rn=retireNeed(c);
 if(proj.turnNeg)list.push(['退休期限／資產本金警訊','可投資資產本金預計在 '+proj.turnNeg+' 歲由正轉負，需提高資產使用率或延後收入中斷。']);
 if(rn.gap>0)list.push(['退休缺口','退休總需求約 '+fmt(rn.total)+' 元、已備 '+fmt(rn.prepared)+' 元，缺口 '+fmt(rn.gap)+' 元，建議建立長期儲蓄與配置。']);
 if(eduTotal(c)>0)list.push(['子女教育準備','教育金總需求(終值)約 '+fmt(eduTotal(c))+' 元，建議專款專用、定期定額提前準備。']);
 if(m.incFinancial/(m.expTotal||1)<1)list.push(['增加理財收入','理財收入僅覆蓋 '+(m.incFinancial/(m.expTotal||1)*100).toFixed(0)+'% 總支出，建議資產活化創造被動現金流。']);
 // 缺口分兩種給付形態呈現，刻意不相加（見 gapTotals）。
 var gt=gapTotals(c),gtx=[];
 if(gt.lump>0)gtx.push('一次性給付缺口約 '+fmt(gt.lump)+' 元');
 if(gt.daily>0)gtx.push('定期給付缺口日額 '+fmt(gt.daily)+' 元/日');
 if(gt.monthly>0)gtx.push('定期給付缺口月額 '+fmt(gt.monthly)+' 元/月');
 if(gtx.length)list.push(['風險保全規劃',gtx.join('、')+'。三者單位不同、刻意不相加。這是還沒被安排到的那一段，先從壽險／房貸壽險補起。']);
 var movable=sum(c.assets,function(a){return a.movable?aVal(a):0});
 if(movable>0)list.push(['資產活化配置','可調整資產約 '+fmt(movable)+' 元，建議多元配置分散風險。']);
 if(m.tax/(m.incTotal||1)>0.1)list.push(['節稅規劃','稅負佔收入偏高，建議檢視申報方式與資產架構。']);
 var lg=legacyNeed(c);if(lg>0)list.push(['傳承規劃','規劃現金傳承約 '+fmt(lg)+' 元（'+n((c.legacy||{}).heirs)+' 位繼承人）。建議以保單指定受益人＋海外配置，達到資產保全與節稅傳承。']);
 var ptx=propertyTax(c);if(ptx.total>0)list.push(['房產稅源預留','每年房屋稅/地價稅/牌照燃料稅合計約 '+fmt(ptx.total)+' 元，記得預留稅源。']);
 if(!list.length)list.push(['維持與檢視','各項指標健康，建議每半年檢視並隨人生階段調整。']);
 return list;
}

function actionList(c){var adv=advice(c),axes=['A','B','C','D'];
 return adv.map(function(a,i){return {axis:axes[i%4],title:a[0],detail:a[1]}});
}

// TAX_BR / EST_BR / 各項扣除額已移到 src/lib/taiwan.ts（帶年度標註＋跨年護欄測試），此處僅 re-export。

// 累進級距。三個邊界情形要擋掉：
//  - NaN / Infinity → 回 0 稅（原本 NaN 會靜默落到 rate 0）
//  - 負數（負所得）→ rate 也要是 0，原本會回 5%
//  - 超過最高級距上界 → 套最高級距，原本直接掉出迴圈回「0 稅」
function bracket(x,br){
 x=Number(x);
 if(!isFinite(x)||x<=0)return {rate:0,ded:0,tax:0};
 for(var i=0;i<br.length;i++){if(x<=br[i][0])return {rate:br[i][1],ded:br[i][2],tax:Math.max(0,x*br[i][1]-br[i][2])}}
 var last=br[br.length-1];
 return {rate:last[1],ded:last[2],tax:Math.max(0,x*last[1]-last[2])};
}

function incomeTax(c){
 var tp=c.taxParams||{};
 var work=(c.incomes||[]).filter(function(i){return i.type==='工作'});
 // 子類別＝執行業務所得者走費用率扣除，其餘工作收入走薪資所得特別扣除（與 lantu-app.html:910 一致）。
 var profGross=sum(work,function(i){return i.subType==='執行業務所得'?n(i.amount):0});
 var salary=sum(work,function(i){return i.subType==='執行業務所得'?0:n(i.amount)});
 var pRate=profExpenseRate(tp);
 var profExpense=Math.round(profGross*pRate/100);
 var profNet=Math.max(0,profGross-profExpense);
 var people=1+(tp.married?1:0)+n(tp.dependents);
 // 薪資特別扣除的人數依申報身分（本人＋有偶）認定，與免稅額/標準扣除同一個來源。
 // 舊版改用「成員中 insSalary>0 的人數」，會在「家庭加了有薪配偶但稅賦沒切有偶」時多扣一份、稅額少算約 5 萬。
 var salaryEarners=Math.max(1,Math.min(1+(tp.married?1:0),(c.members||[]).filter(function(m){return n(m.insSalary)>0}).length||1));
 var exempt=EXEMPT_PER_PERSON*people;
 var stdDed=tp.married?STD_DED_MARRIED:STD_DED_SINGLE;
 var salarySpecial=Math.min(salary,SALARY_SPECIAL*salaryEarners);
 var gross=salary+profNet;
 var net=Math.max(0,gross-exempt-stdDed-salarySpecial-n(tp.otherDeduction));
 var b=bracket(net,TAX_BR);
 return {salary:salary,profGross:profGross,profRate:pRate,profExpense:profExpense,profNet:profNet,
  profOccupation:tp.profOccupation||'',gross:gross,
  exempt:exempt,stdDed:stdDed,salarySpecial:salarySpecial,salaryEarners:salaryEarners,
  net:net,rate:b.rate,ded:b.ded,tax:b.tax,people:people};
}

// 遺產稅：免稅額之外還有配偶／直系血親卑親屬／喪葬費三項法定扣除額，舊版全部沒算，稅額被系統性高估。
// 另：舊版誤用綜所稅的 taxParams.otherDeduction，改為獨立的 estateDeduction。
function estateTax(c,netOverride){
 var tp=(c||{}).taxParams||{};
 var lg=(c||{}).legacy||{};
 var netBase=(netOverride!=null)?netOverride:metrics(c).net;
 /* ===== 傳承金額納入遺產稅稅基（legacy.feedEstate）=====
    ⚠️⚠️ 改版前 estateTax() 根本沒讀 feedEstate（25 份勾了），報告書卻寫
    「本次規劃已把傳承金額納入遺產稅的試算」——那句文案在說謊。
    勾了就真的把 legacyNeed(c)（＝繼承人數 × 每人現金傳承）加進稅基：要留給繼承人的
    那筆現金本來就得先進遺產、先被課一次稅，客戶才留得住。沒勾＝維持改版前的算法。
    ⚠️ 這一項**只做遺產稅這一段**。legacyNeed 仍然沒有進 projection() 的 needPV
       （那裡目前只做旗標），那是另一個地基決定，已在回報裡提出來給 Ray，不自作主張。 */
 var legacyFed=lg.feedEstate?legacyNeed(c):0;
 var net=netBase+legacyFed;
 var heirs=Math.max(0,n(lg.heirs));
 var ded={
  exempt:ESTATE_EXEMPT,
  spouse:tp.married?ESTATE_SPOUSE_DED:0,
  lineal:heirs*ESTATE_LINEAL_DED,
  funeral:ESTATE_FUNERAL_DED,
  other:n(tp.estateDeduction)
 };
 var totalDed=ded.exempt+ded.spouse+ded.lineal+ded.funeral+ded.other;
 var base=Math.max(0,net-totalDed);
 var b=bracket(base,EST_BR);
 // net＝實際課稅用的遺產淨額（已含傳承）；netBase＝未加傳承的家庭淨值；legacyFed＝這次加了多少。
 return {base:base,rate:b.rate,tax:b.tax,net:net,netBase:netBase,legacyFed:legacyFed,heirs:heirs,deductions:ded,totalDeduction:totalDed};
}

function propertyTax(c){var tp=c.taxParams||{};var house=n(tp.houseAssessed)*HOUSE_TAX_RATE,land=n(tp.landAssessed)*LAND_TAX_RATE,car=n(tp.carTax);return {house:house,land:land,car:car,total:house+land+car}}

// 社會保險老年給付＋勞退新制概算。依「本人」的投保類型分流：
//   勞保系 → 勞保老年年金 A/B 式擇優（未滿 15 年只能領老年一次金）＋ 勞退新制；
//   國民年金 → A 式(0.65%＋加計)／B 式(1.3%) 擇優，無雇主提繳故無勞退；
//   公保/軍保/農保/無 → 規則各異，不代為概算。
//
// 年資＝「已投保年資（過去）＋ 到退休還會投保的年數（未來）」。
// ⚠️ 2026/08 修正：已投保年資（member.worked）在改版前**沒有任何輸入欄位**，
//    永遠是 0，等於把客戶過去投保的十幾二十年整段丟掉，勞保年金一律嚴重低估。
//    現在家庭成員卡有「勞保起保年月／已投保年資」可填。
// ⚠️ 同時修正勞退：舊版拿 years(過去+未來) 當「未來提繳」的複利期數，
//    等於讓過去那段年資的提繳也在未來複利一次。未來提繳只能用 future，
//    過去的部分是「專戶現有累積餘額」滾存到退休。
//
// ⚠️ 勞退走的是「月提繳工資分級表」(上限 150,000)，不是勞保投保薪資分級表(上限 45,800)。
//    兩張表混用會讓月薪 10 萬的客戶勞退提繳低估過半。
function insuredYearsOf(m){
 // 手填的年資是唯一真相；起保年月只是「幫忙算一次填進去」的便利欄（見 UI 的 setInsStart）。
 var w=n(m&&m.worked);
 return w>0?w:yearsSinceYm(m&&m.insStart);
}
function estimateSocialPension(c){
 var pm=primaryMember(c)||{};
 var ins=n(pm.insSalary);
 var insType=pm.insType||'勞保';
 var age=n(c.profile.age),ra=n(c.profile.retireAge);
 var past=insuredYearsOf(pm);
 var future=Math.max(0,ra-age);
 var years=Math.max(0,past+future);
 var r=c.retire||{};var rr=n(r.retireReturn)/100||0.04;var m=Math.max(0,n(c.profile.lifeExp)-ra);
 var kind=(LABOR_LIKE_INS.indexOf(insType)>=0)?'labor':(insType==='國民年金'?'np':'other');
 var out={kind:kind,insType:insType,ins:ins,pensionBase:0,years:years,past:past,future:future,
  monthly:0,lump:0,fund:0,fundNow:0,fundNew:0,fundEstimated:false,pensionPast:0,
  total:0,npA:0,npB:0,insA:0,insB:0,pick:'',eligible:false,onceMonths:0};
 var pv=function(annual){return (rr>0)?annual*(1-Math.pow(1+rr,-m))/rr:annual*m;};
 if(kind==='np'){
  out.ins=ins>0?ins:NP_INSURED_MONTHLY;
  if(years<=0)return out;
  out.npA=out.ins*years*NP_RATE_A+NP_BONUS_A;
  out.npB=out.ins*years*NP_RATE_B;
  out.pick=(out.npA>=out.npB)?'A':'B';
  out.eligible=true;                            // 國保老年年金沒有 15 年門檻
  out.monthly=Math.max(out.npA,out.npB);
  out.lump=pv(out.monthly*12);
  out.fund=0;
  out.total=out.lump;
  return out;
 }
 if(kind!=='labor')return out;
 out.pensionBase=laborPensionSalary(n(pm.monthlySalary)||n((c.profile||{}).monthlySalary)||ins);
 var g=LABOR_PENSION_FUND_RATE, annualContrib=out.pensionBase*LABOR_PENSION_RATE*12;
 // 勞退專戶：有填實際餘額就用實際的；沒填但有「新制提繳起始年月」就回推概估。
 out.pensionPast=n(pm.pensionYears)||yearsSinceYm(pm.pensionStart);
 var bal=n(pm.pensionBalance);
 if(bal<=0&&out.pensionPast>0&&annualContrib>0){
  bal=(g>0)?annualContrib*(Math.pow(1+g,out.pensionPast)-1)/g:annualContrib*out.pensionPast;
  out.fundEstimated=true;
 }
 out.fundNow=bal*Math.pow(1+g,future);
 out.fundNew=(g>0)?annualContrib*(Math.pow(1+g,future)-1)/g:annualContrib*future;
 out.fund=out.fundNow+out.fundNew;
 if(ins>0&&years>0){
  out.insA=ins*years*LABOR_INS_ANNUITY_RATE_A+LABOR_INS_ANNUITY_BONUS_A;
  out.insB=ins*years*LABOR_INS_ANNUITY_RATE;
  out.eligible=years>=LABOR_ANNUITY_MIN_YEARS;
  if(out.eligible){
   out.pick=(out.insA>=out.insB)?'A':'B';
   out.monthly=Math.max(out.insA,out.insB);
   out.lump=pv(out.monthly*12);
  }else{
   // 年資未滿 15 年：只能請領「老年一次金」＝每滿 1 年發 1 個月平均月投保薪資。
   out.onceMonths=Math.floor(years);
   out.lump=ins*out.onceMonths;
  }
 }
 out.total=out.lump+out.fund;
 return out;
}
/** @deprecated 舊名，改用 estimateSocialPension（保留 export 契約相容） */
function estimateLaborPension(c){return estimateSocialPension(c);}

// 傳承是願景的一部分、不獨立計算，但客戶可以勾選不處理（lg.on===false）。
// 目標金額沿用既有的「繼承人數 × 每人現金傳承」，不需要新欄位。
function legacyNeed(c){var lg=c.legacy||{};if(lg.on===false)return 0;return n(lg.heirs)*n(lg.perHeirCash)}

function allocInfo(c){var al=(c.plan&&c.plan.allocations)||[];
 var totalPct=sum(al,function(a){return n(a.pct)});
 var wRet=totalPct?sum(al,function(a){return n(a.pct)*n(a.ret)})/totalPct:0;
 return {list:al,totalPct:totalPct,wRet:wRet};
}

// 「現況」＝把所有調整動作拿掉的同一份個案。用來畫灰線、算改善度、做前後對照。
// ⚠️ 深拷貝，不要就地清空——呼叫端拿到的 c 還要繼續用。
function baseCase(c){
 var b=JSON.parse(JSON.stringify(c||{}));
 b.actions=[];
 return b;
}

function scenario(c){
 // 2026/08/23 起「規劃後」＝套用 c.plan.levers 的完整槓桿組合（六根），
 // 不再只有延後退休一根。舊欄位 plan.retireDelay 由 planLevers() 相容進來。
 //
 // 2026/08/24（v2）：調整動作上線後，「規劃前」不再等於 c —— c 本身已經含 actions。
 // ⚠️ 有動作時 before 必須用 baseCase(c)（把 actions 清空的同一份個案），
 //    否則前後對照兩邊都含動作，差額永遠是 0，整張對照表失去意義。
 // 動作與 v1 的 levers 可以並存：levers 仍然套用在「含動作」的個案上。
 var hasAct=planActionsOn(c).length>0;
 var baseC=hasAct?baseCase(c):c;
 var after=applyLevers(c,planLevers(c));
 var before={metrics:metrics(baseC),retire:retireNeed(baseC),health:health(baseC),estate:estateTax(baseC),incomeTax:incomeTax(baseC),gap:gapPV(baseC)};
 var mAfter=metrics(after);
 var netAfter=mAfter.net-n((c.plan||{}).movableToOverseas); // 資產移轉降低境內帳面淨值(遺產稅基)
 var after2={metrics:mAfter,retire:retireNeed(after),health:health(after),estate:estateTax(after,netAfter),incomeTax:incomeTax(after),gap:mAfter.proj.shortPV};
 // afterCase＝套用方案後的完整個案（延後退休已推到每位賺薪成員），供測試與明細追溯。
 // baseCase＝規劃前的那一份（有動作時是清空 actions 的版本）。
 return {before:before,after:after2,afterCase:after,baseCase:baseC,hasActions:hasAct};
}

function crossTable(c){var m=metrics(c);
 // ⚠️ 每一列都跟 m.incTotal / m.expTotal 同一個口徑（現齡有效），
 //    否則收支損益表的「合計」會對不上上面那幾列的和。
 var incWork=sum(c.incomes,function(i){return (i.type==='工作'&&activeNow(c,i))?n(i.amount):0});
 var incFin=sum(c.incomes,function(i){return (i.type==='理財'&&activeNow(c,i))?n(i.amount):0});
 var incOther=sum(c.incomes,function(i){return (i.type==='其他'&&activeNow(c,i))?n(i.amount):0});
 var expLive=sum(c.expenses,function(e){return ((e.cat==='生活'||e.cat==='消費')&&activeNow(c,e))?n(e.amount):0});
 var expTax=m.tax, expIns=m.ins;
 // 對齊 Excel 收支損益表：貸款與撫育（孝親＋教育）各自成列，不要全部倒進「其他」。
 var expLoan=manualLoanPay(c)+annualDebtPay(c);
 var expSupport=sum(c.expenses,function(e){return (e.cat==='孝親'&&activeNow(c,e))?n(e.amount):0});
 var expOther=sum(c.expenses,function(e){return (activeNow(c,e)&&['生活','消費','稅賦','保險','孝親','貸款'].indexOf(e.cat)<0)?n(e.amount):0});
 var aSelf=sum(c.assets,function(a){return aLiquid(c,a)?0:aVal(a)});
 var aInv=sum(c.assets,function(a){return aLiquid(c,a)?aVal(a):0});
 var dCons=sum(c.liabilities,function(l){return isConsumerDebt(l)?lBal(l):0});
 var dInv=m.debtTotal-dCons;
 return {incWork:incWork,incFin:incFin,incOther:incOther,incTotal:m.incTotal,expLive:expLive,expLoan:expLoan,expSupport:expSupport,expTax:expTax,expIns:expIns,expOther:expOther,expTotal:m.expTotal,saveInvest:m.saveInvest,
  aSelf:aSelf,aInv:aInv,aTotal:m.assetTotal,dCons:dCons,dInv:dInv,dTotal:m.debtTotal,net:m.net,monthBal:(m.incTotal-m.expTotal)/12};
}

// @deprecated 已改用 stageColor（財務階段）；保留僅為既有 export 契約相容，勿用於新程式。
function gradeColor(g){return {A:'var(--ok)',B:'var(--teal)',C:'var(--amber)',D:'var(--warn)'}[g]}

// PURPOSES / TARGETS 的唯一真相在 src/lib/intent.ts（本檔僅 re-export，見檔頂 import）。
// 舊版在這裡另存一份，已經漂到含有已廢止的「置產」「人生模擬」且缺「婚姻規劃」。

// 作答值：單選＝選項索引；複選（multi）＝索引陣列。計分一律取所選項中的最高分，
// 因此複選題不會膨脹總分，12 題滿分仍為 60，四個分級門檻不變。
var RISK_Q=[
 {q:'您目前的年齡層是？',o:[['70歲以上',1],['60–69歲',2],['50–59歲',3],['40–49歲',4],['39歲以下',5]]},
 {q:'這筆可投資資金占您整體資產的比例？',o:[['80%以上（幾乎是全部）',1],['約60–80%',2],['約40–60%',3],['約20–40%',4],['20%以下（僅一小部分）',5]]},
 {q:'您這筆資金主要的投資目的是？',o:[['保本，絕不能虧損',1],['略高於定存即可',2],['穩健累積，兼顧風險',3],['追求資產明顯成長',4],['積極追求高報酬',5]]},
 {q:'您預計這筆資金可以不動用多久？',o:[['1年以內',1],['1–3年',2],['3–5年',3],['5–10年',4],['10年以上',5]]},
 {q:'您目前的收入來源穩定度？',o:[['已無主動收入（退休/待業）',1],['不穩定、起伏大',2],['尚可，普通穩定',3],['穩定的薪資收入',4],['穩定且有多重來源',5]]},
 {q:'未來3–5年您的收入預期？',o:[['可能明顯減少',1],['可能略減',2],['大致持平',3],['可能成長',4],['可望大幅成長',5]]},
 {q:'您對投資理財商品的了解與經驗？（可複選）',multi:true,hint:'請勾選所有接觸過的類型；計分以最高者為準。',o:[['完全沒有',1],['僅定存/儲蓄險',2],['買過基金/ETF',3],['熟悉股票/債券操作',4],['熟悉衍生性/槓桿商品',5]]},
 {q:'您實際投資過（或目前持有）的商品有哪些？（可複選）',multi:true,hint:'請勾選所有持有過的商品；計分以風險最高者為準。',o:[['定存、儲蓄險',1],['債券、貨幣型基金',2],['平衡型基金、績優股',3],['個股、股票型基金',4],['期權、外匯、加密貨幣等',5]]},
 {q:'若投資一年內下跌20%，您會？',o:[['立刻全部贖回、不再投資',1],['贖回大部分',2],['觀望、暫不動作',3],['續抱等待回升',4],['視為機會、加碼買進',5]]},
 {q:'您能接受這筆資金最大的本金虧損幅度？',o:[['不能接受任何虧損',1],['5%以內',2],['約10–15%',3],['約20–30%',4],['30%以上也可承受',5]]},
 {q:'下列報酬/風險組合，您偏好哪一種？',o:[['報酬2%，幾乎不虧',1],['報酬4%，最差-5%',2],['報酬6%，最差-15%',3],['報酬9%，最差-25%',4],['報酬12%，最差-40%',5]]},
 // ⚠️ 2026/08/28 改版：原本問「臨時需要動用這筆資金的可能性」，改問緊急預備金。
 //    題號與 ans 的索引刻意不動（ans 用題目索引當 key，改順序會靜默對到錯的題目），
 //    滿分仍是 60、四個分級門檻不變。改版前已作答的走 riskQuiz.q12Legacy 標記。
 {q:'您目前的緊急預備金（可隨時動用的現金）大約可以支應幾個月的生活支出？',hint:'系統參數的「緊急預備金(月)」預設是 6 個月，可作為對照。',o:[['沒有準備',1],['不到 3 個月',2],['3–6 個月',3],['6–12 個月',4],['12 個月以上',5]]}
];

var RISK_TIERS=[
 {min:12,max:23,name:'保守型',en:'Conservative',rr:3,std:6,desc:'以保本與穩定為優先，可承受的波動很低。',color:'#6f8f74',alloc:'現金/定存與債券為主（約 70–85%），少量配置平衡型或高評級收益商品。'},
 {min:24,max:35,name:'穩健型',en:'Moderate',rr:5,std:10,desc:'願意承擔適度風險換取中等成長，重視風險與報酬的平衡。',color:'#7f97ac',alloc:'股債均衡（股 40–55%、債與現金 45–60%），核心配置搭配部分成長型標的。'},
 {min:36,max:47,name:'積極型',en:'Aggressive',rr:6.5,std:14,desc:'以資產成長為主要目標，能承受明顯的短期波動。',color:'#c99a5b',alloc:'股票/股票型基金為主（約 60–75%），搭配少量債券與現金作為緩衝。'},
 {min:48,max:60,name:'進取型',en:'Growth',rr:8,std:18,desc:'追求長期最大化報酬，可承受大幅波動與較高風險。',color:'#b07d3d',alloc:'高成長股票、產業/區域型與另類資產為主（80%以上），現金部位極低。'}
];

// 複選題的作答值是陣列。舊版直接 RISK_Q[i].o[a[i]][1]，遇到陣列或越界索引會丟 TypeError。
function riskAnsList(a,qi){var v=a?a[qi]:null;if(v==null)return [];return Array.isArray(v)?v.slice():[v];}
function riskQScore(qi,list){var Q=RISK_Q[qi],mx=0;if(!Q)return 0;(list||[]).forEach(function(oi){if(Q.o[oi]&&Q.o[oi][1]>mx)mx=Q.o[oi][1];});return mx;}
function riskScore(c){var a=((c||{}).riskQuiz&&c.riskQuiz.ans)||{},s=0,answered=0,un=[];
 for(var i=0;i<RISK_Q.length;i++){var L=riskAnsList(a,i);if(L.length){s+=riskQScore(i,L);answered++;}else un.push(i);}
 return {score:s,answered:answered,total:RISK_Q.length,unanswered:un};}

function riskProfile(c){var r=riskScore(c);if(r.answered<RISK_Q.length)return null;var t=RISK_TIERS[0];for(var i=0;i<RISK_TIERS.length;i++){if(r.score>=RISK_TIERS[i].min)t=RISK_TIERS[i];}return {tier:t,score:r.score,answered:r.answered,total:r.total};}

// months<=0 時分母 (1+i)^0−1 = 0 → Infinity，會原字串印到畫面（「月繳 Infinity」）。
function pmt(bal,rate,months){months=n(months);if(!(months>0))return 0;var i=n(rate)/12/100;if(i<=0)return n(bal)/months;return n(bal)*i*Math.pow(1+i,months)/(Math.pow(1+i,months)-1)}

export {
  KINDS,
  KIND_UNIT,
  kindUnit,
  coverAmt,
  DEFAULT_CARE_MONTHS,
  careMonthsOf,
  careNeedRows,
  EDU_STAGES,
  uid,
  sampleCase,
  newCase,
  defaultCompany,
  primaryMember,
  creditScoreOf,
  n,
  sum,
  fmt,
  esc,
  pct,
  annualDebtInterest,
  annualDebtPay,
  familyAnnualLiving,
  aVal,
  aInc,
  aCls,
  aLiquid,
  aMatured,
  lBal,
  lPay,
  lRemain,
  assetPassive,
  liquidMovable,
  lifestyleFactor,
  lifestyleAnnualNow,
  eduTotal,
  retireNeed,
  lifeNeed,
  medicalDailyNeed,
  memberDep,
  POLICY_MAP,
  existingCover,
  coverageGaps,
  totalGap,
  gapTotals,
  gapNeedBase,
  grossLifeNeed,
  needCoversDebt,
  needCoversEdu,
  needCoversParents,
  indepDeps,
  protectYearsEff,
  growingAnnuityPV,
  preparedPV,
  preparedSuspect,
  PREPARED_MONTHLY_MAX,
  CHECKUP_LABEL,
  applyCheckupParams,
  checkupState,
  checkupRow,
  premiumType,
  policyActive,
  annualPremiumBy,
  premiumCheckup,
  actionCover,
  coverageCheckupRows,
  PAYBACK_TYPES,
  policyPaybacks,
  paybackInSpan,
  paybackTotal,
  policyPaybackBetween,
  paybackCheckupRows,
  effYear,
  effMonth,
  PAY_MODES,
  payTimes,
  premiumPerPay,
  premiumMonths,
  payingInYear,
  premiumByYear,
  premiumByMonth,
  premiumByPayer,
  BENEFIT_GROUPS,
  policyBenefitRows,
  benefitsByGroup,
  policyYearAt,
  surrenderAt,
  masterAnalysis,
  // ── 二代健保 ──
  NHI_YEAR,
  NHI_RATE,
  NHI_SALARY_MIN,
  NHI_SALARY_MAX,
  NHI_SALARY_GRADES,
  NHI_DEP_CAP,
  NHI_CATS,
  nhiSelfRatio,
  nhiJobCat,
  nhiSalaryOf,
  NHI_SUPP_RATE,
  NHI_SUPP_MIN,
  NHI_SUPP_YEAR,
  NHI_SUPP_CAP,
  NHI_SUPP_BONUS_MULT,
  NHI_SUPP_WAGE_MIN,
  NHI_SUPP_KINDS,
  nhiSuppKindOf,
  nhiPayTimes,
  nhiSuppMinOf,
  nhiGeneral,
  nhiSuppRows,
  nhiFamily,
  NHI_AUTO_NAME,
  nhiExpenseOn,
  syncNHI,
  // ── 產險比對線 ──
  PROP_INS_YEAR,
  QUAKE_BASIC_SUM,
  QUAKE_LODGING,
  PROP_PING_COST,
  PROP_BUILDING_RATIO,
  CAR_LIAB_BODILY,
  CAR_LIAB_PROPERTY,
  CALI_DEATH,
  CALI_MEDICAL,
  EMPLOYER_COMP_MONTHS,
  PUBLIC_LIAB_STD,
  PKINDS,
  PGROUPS,
  PKIND_GROUP,
  PPOLICY_MAP,
  propKindsOfSub,
  PNEED_FIELD,
  propNeedOf,
  propRealty,
  propVehicles,
  propRealtyValue,
  propVehicleValue,
  propEmployees,
  propAvgWage,
  propAutoNeed,
  propHave,
  propGaps,
  propGapTotals,
  goalLoans,
  propertyGaps,
  metrics,
  ratios,
  projection,
  mulberry32,
  hashStr,
  gauss,
  monteCarlo,
  health,
  GRADE_STRAT,
  STAGE,
  STAGE_METRICS,
  STAGE_ORDER,
  stageGate,
  stageDesc,
  stageName,
  stageTask,
  stageColor,
  stageReason,
  advice,
  actionList,
  TAX_BR,
  EST_BR,
  bracket,
  incomeTax,
  estateTax,
  propertyTax,
  estimateLaborPension,
  estimateSocialPension,
  NP_YEAR,
  NP_INSURED_MONTHLY,
  NP_RATE_A,
  NP_BONUS_A,
  NP_RATE_B,
  LABOR_LIKE_INS,
  LABOR_PENSION_CAP,
  JOB_TYPES,
  NO_EMPLOYER_JOBS,
  isNoEmployerJob,
  jobInsType,
  ageFromBirth,
  LABOR_INS_GRADES,
  laborInsSalary,
  laborPensionSalary,
  PROF_EXPENSE,
  profStdRate,
  profExpenseRate,
  legacyNeed,
  isEarnerRole,
  isLivingCat,
  earnerRetirePoints,
  retirePoints,
  retireAgeAssumed,
  DEFAULT_RETIRE_AGE,
  retiredWeight,
  retireAnnual,
  workPhaseExpense,
  inSpan,
  nowAge,
  activeNow,
  repayMode,
  graceMonths,
  debtPayAt,
  rowCutPct,
  expenseCutCap,
  horizonManual,
  effHorizon,
  familyAnnualParentSupport,
  manualLoanPay,
  savingInvest,
  assetLayer,
  assetLayout,
  kindNorm,
  allocInfo,
  scenario,
  // 調整方案：缺口求解器
  effReturn,
  gapPV,
  gapPVAt,
  visionRate,
  visionRateOf,
  gapLedger,
  visionOn,
  planActionsOn,
  baseCase,
  goalFloor,
  wishFloor,
  visionRoom,
  LEVERS,
  leverName,
  leverGate,
  leverRange,
  applyRetireDelay,
  applyLevers,
  gapWith,
  solveLever,
  soloSolve,
  RX_DEFS,
  greedyFill,
  prescriptions,
  planLevers,
  planActions,
  ALLOC_SRC,
  ACT_CATS,
  actCat,
  allocInvest,
  allocInvestOwn,
  allocProtect,
  allocYears,
  annuityPV,
  allocPV,
  allocReconcile,
  migrateAlloc,
  visionChanges,
  GAP_CATS,
  PLAN_DISCOUNT,
  CAP_INCOME_UP,
  incomeCeilingPct,
  CAP_EXPENSE_CUT,
  CAP_RATE,
  CAP_RETIRE_DELAY,
  CAP_RETIRE_CUT,
  CAP_VISION_CUT,
  CAP_RATE_STARTER,
  applyPlanCaps,
  crossTable,
  gradeColor,
  PURPOSES,
  TARGETS,
  RISK_Q,
  RISK_TIERS,
  riskAnsList,
  riskQScore,
  riskScore,
  riskProfile,
  pmt
};
