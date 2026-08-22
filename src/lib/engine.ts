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
} from "@/lib/taiwan";

// 保障險種。2026/08 對齊 Excel 需求分析三大塊（責任／重病重殘／醫療）：
//  ・「意外險」更名「意外傷殘」——需求分析問的是傷殘失能，不是意外醫療雜支。
//  ・新增「醫療雜費」（住院雜費，實支實付的主戰場）與「薪資補償」（失能所得）。
//  ・「癌症住院」保留不刪：既有案子已經填了值，拿掉會靜默歸零；UI 收進選填區。
// 舊資料的 coverages[].kind 仍可能是「意外險」，由 KIND_ALIAS 正規化，不會對不上。
var KINDS=['壽險','意外傷殘','住院醫療','醫療雜費','薪資補償','初次罹癌','癌症住院','重病給付','每月照護'];
var KIND_ALIAS={'意外險':'意外傷殘'};
function kindNorm(k){return KIND_ALIAS[k]||k;}

var EDU_STAGES=['嬰兒','幼稚園','小學','國中','高中職','大學','研究所','博士班'];

let __uidSeq=0;
function uid(){return 'c'+Date.now().toString(36)+(__uidSeq++).toString(36)+Math.floor(Math.random()*1e6).toString(36)}

function sampleCase(){return {
 id:uid(),
 profile:{name:'王大明(示範)',gender:'男',birth:'',age:40,retireAge:65,lifeExp:85,credit:700,jobTypeOther:''},
 params:{inflation:1.5,salaryGrowth:2,invReturn:5,tuitionGrowth:3,freeSaving:1,planSaving:0,emergencyMonths:6,horizon:85,invReturnStd:12,inflationStd:1,salaryStd:1},
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
  {member:'王大明',funeral:600000,protectYears:5,estateTax:0,room:2000,selfPay:1500,nursing:1500,miscDaily:3000,incomeComp:50000,disability:3000000,firstCancer:300000,cancerHosp:2000,critical:2000000,monthCare:30000,careMonths:120}
 ],
 coverages:[
  {member:'王大明',kind:'壽險',comm:0,social:0},
  {member:'王大明',kind:'住院醫療',comm:0,social:0}
 ],
 policies:[
  {insured:'王大明',name:'國泰終身醫療',premium:47536,life:0,accident:0,medical:2000,medMisc:100000,incomeComp:0,firstCancer:0,cancerHosp:0,critical:0,monthCare:0,cashValue:0},
  {insured:'王大明',name:'重大傷病定期',premium:20100,life:0,accident:0,medical:0,firstCancer:0,cancerHosp:0,critical:2000000,monthCare:0,cashValue:0},
  {insured:'王大明',name:'定期壽險',premium:8864,life:3000000,accident:1000000,medical:0,firstCancer:0,cancerHosp:0,critical:0,monthCare:0,cashValue:0}
 ],
 intent:{purposes:['想增加收入','想進行投資、活化資產','有節稅需求，想進行節稅'],targets:['退休生活規劃','子女教養規劃','購屋規劃','孝親規劃'],mustHave:['退休生活規劃','子女教養規劃']},
 savings:[
  {name:'定期定額 ETF',subCat:'定期定額ETF/基金',period:'月',amount:120000},
  {name:'儲蓄險保費',subCat:'儲蓄保險保費',period:'年',amount:60000}
 ],
 legacy:{heirs:2,perHeirCash:20000000,perHeirNote:'每人一間房',feedEstate:true},
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
 c.intent=defaultIntent();c.career={plan:'無',switchAge:'',switchFund:'',startupType:'',startupBudget:'',importance:0};c.marriage={plan:'否',age:'',budget:'',minBudget:'',importance:0};c.credit={cards:0,payFull:'是',firstCardOver1yr:'否',installment:'無',badRecord5yr:'否',recentApply:'無',score:''};c.overseas={hasAssets:'否',identity:'否',purpose:'',assetTypes:''};c.legacy={heirs:0,perHeirCash:0,perHeirNote:'',feedEstate:false};c.nextReview='';c.riskQuiz={ans:{}};
 // 與 lantu-app.html 的 newCase() 對齊：少了這幾個欄位，新客戶進 iframe 後價值輪與報告備註會是 undefined。
 c.profile.birth='';c.profile.jobType='一般就業者';c.profile.jobTypeOther='';c.profile.monthlySalary=0;c.company=defaultCompany();c.lifeGoals=[];c.reportNote='';
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

function annualDebtInterest(c){var a0=n(c.profile.age);return sum(c.liabilities,function(l){var sa=n(l.startAge)||a0;return (a0>=sa)?lBal(l)*n(l.rate)/100:0})}

function annualDebtPay(c){var a0=n(c.profile.age);return sum(c.liabilities,function(l){var sa=n(l.startAge)||a0;var elapsed=(a0-sa)*12;return (a0>=sa&&(n(l.months)-elapsed)>0)?lPay(l)*12:0})}

function familyAnnualLiving(c){return sum(c.expenses,function(e){return (e.cat==='生活'||e.cat==='消費')?n(e.amount):0})}

// 父母奉養費。責任遞減圖一直有把它算進身故責任，但 lifeNeed() 的需求反推漏了，
// 兩張圖對同一個客戶會給出不同的壽險缺口。2026/08 補進 lifeNeed。
function familyAnnualParentSupport(c){return sum(c.expenses,function(e){return e.cat==='孝親'?n(e.amount):0})}

// 支出側手動登錄的貸款支出（大類「貸款」）。
// 負債表那邊由 annualDebtPay() 反推，兩者相加＝家庭貸款總支出；
// 手動列是給「沒登在負債表的貸款」用的，UI 會標出可能重複的細類。
function manualLoanPay(c){return sum(c.expenses,function(e){return e.cat==='貸款'?n(e.amount):0})}

// 儲蓄理財投入（c.savings[]）。不進總支出——在原表它就放在總支出之外。
function savingInvest(c){return sum(c.savings,function(x){return n(x.amount)})}

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

// 貸款剩餘本金（本息攤還）。舊版用「餘額 − 月繳×12×年數」線性遞減，把每期利息也當本金攤掉，
// 2% 的 1000 萬房貸第 10 年會少算約 170 萬負債，生涯藍圖的淨資產因此系統性樂觀。
function lRemain(l,age,a0){
 var sa=n(l.startAge)||a0; if(age<sa)return 0;
 var P=lBal(l); if(P<=0)return 0;
 var k=Math.max(0,Math.round((age-sa)*12));
 var total=n(l.months); if(total>0)k=Math.min(k,total);
 var i=n(l.rate)/12/100, pay=lPay(l);
 if(pay<=0)return P;
 if(i<=0)return Math.max(0,P-pay*k);
 var f=Math.pow(1+i,k);
 return Math.max(0,Math.min(P,P*f-pay*(f-1)/i));
}

function assetPassive(c){return sum(c.assets,function(a){return (a.income!=null&&a.income!=='')?aInc(a):((a.type==='股票'||a.type==='基金'||a.type==='債券')?aVal(a)*n(a.ret)/100:0)})}

function liquidMovable(c){return sum(c.assets,function(a){return (a.cls==='流動'&&a.movable)?aVal(a):0})}

function lifestyleFactor(c,age,factor){var s=0;[c.travel,c.hobby,c.luxury].forEach(function(arr){(arr||[]).forEach(function(it){if(age>=n(it.start)&&age<=n(it.end))s+=n(it.amount)*(n(it.freq)||1)*factor})});return s;}

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
// 某一年的「已退休權重」0~1。
function retiredWeight(c,age){
 var pts=earnerRetirePoints(c);
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
  if(age<n(e.start)||age>n(e.end))return;
  var v=n(e.amount)*(e.infl?inflFactor:1);
  s+=isLivingCat(e.cat)?v*(1-w):v;
 });
 return s;
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
 var prepared=sum(r.prepared,function(p){return n(p.amount)});
 // valid=false 代表「退休年齡 ≥ 預期壽命」，余年 0 → total/gap 都是 0。
 // 呼叫端要據此顯示「參數有誤」而不是「沒有退休缺口」。
 return {years:years,余年:m,monthFV:monthFV,total:total,prepared:prepared,gap:Math.max(0,total-prepared),valid:m>0};
}

function lifeNeed(c,nd){
 var famLiving=familyAnnualLiving(c);
 // 負債一律走 lBal()（有乘匯率）。直接用 n(l.balance) 會讓外幣房貸在「缺口」與「準備度」兩頁差一個匯率。
 var need=n(nd.depRatioOverride!=null?nd.depRatioOverride:memberDep(c,nd.member))/100*famLiving*n(nd.protectYears)
   + familyAnnualParentSupport(c)*n(nd.protectYears)
   + sum(c.liabilities,function(l){return lBal(l)}) + eduTotal(c) + n(nd.funeral) + n(nd.estateTax);
 var existing=existingCover(c,nd.member,'壽險');
 var liquid=liquidMovable(c);
 return Math.max(0,need - existing - liquid);
}

function medicalDailyNeed(nd){return n(nd.room)+n(nd.selfPay)+n(nd.nursing)}

function memberDep(c,name){var m=(c.members||[]).find(function(x){return x.name===name});return m?n(m.depRatio):100}

var POLICY_MAP={'壽險':'life','意外傷殘':'accident','住院醫療':'medical','醫療雜費':'medMisc','薪資補償':'incomeComp','初次罹癌':'firstCancer','癌症住院':'cancerHosp','重病給付':'critical','每月照護':'monthCare'};

function existingCover(c,member,kind){
 var fromCov=sum(c.coverages,function(cv){return (cv.member===member&&kindNorm(cv.kind)===kindNorm(kind))?(n(cv.comm)+n(cv.social)):0});
 var f=POLICY_MAP[kind];var fromPol=f?sum(c.policies,function(p){return p.insured===member?n(p[f]):0}):0;
 return fromCov+fromPol;
}

function coverageGaps(c){
 var rows=[];
 (c.needs||[]).forEach(function(nd){
  var map={
   '壽險':lifeNeed(c,nd),
   '意外傷殘':n(nd.disability),
   '住院醫療':medicalDailyNeed(nd),
   '醫療雜費':n(nd.miscDaily),
   '薪資補償':n(nd.incomeComp),
   '初次罹癌':n(nd.firstCancer),
   '癌症住院':n(nd.cancerHosp),
   '重病給付':n(nd.critical),
   '每月照護':n(nd.monthCare)
  };
  Object.keys(map).forEach(function(k){
   var need=map[k],ex=existingCover(c,nd.member,k);
   // 已備來源擴充：本人的壽險一次性需求，可由家庭流動資產支應（與 lantu-app.html:453 一致）。
   if(k==='壽險'&&nd.member===(primaryMember(c)||{}).name)ex+=liquidMovable(c);
   rows.push({member:nd.member,kind:k,need:need,have:ex,gap:need-ex});
  });
 });
 return rows;
}

function totalGap(c){return sum(coverageGaps(c),function(g){return Math.max(0,g.gap)})}

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
 var incTotal=sum(c.incomes,function(i){return n(i.amount)});
 var passive=assetPassive(c);
 var incFinancial=sum(c.incomes,function(i){return i.type==='理財'?n(i.amount):0})+passive;
 var living=familyAnnualLiving(c);
 var tax=sum(c.expenses,function(e){return e.cat==='稅賦'?n(e.amount):0});
 var ins=sum(c.expenses,function(e){return e.cat==='保險'?n(e.amount):0});
 var expTotal=sum(c.expenses,function(e){return n(e.amount)})+annualDebtPay(c);
 var saveInvest=savingInvest(c);
 var cash=sum(c.assets,function(a){return (a.type==='現金'||a.type==='定存')?aVal(a):0});
 var liquid=sum(c.assets,function(a){return a.cls==='流動'?aVal(a):0});
 var assetTotal=sum(c.assets,function(a){return aVal(a)});
 var debtTotal=sum(c.liabilities,function(l){return lBal(l)});
 var net=assetTotal-debtTotal, save_=incTotal-expTotal, interest=annualDebtInterest(c), monthExp=expTotal/12;
 var proj=projection(c);
 return {incTotal:incTotal,incFinancial:incFinancial,living:living,tax:tax,ins:ins,expTotal:expTotal,saveInvest:saveInvest,cash:cash,liquid:liquid,
  assetTotal:assetTotal,debtTotal:debtTotal,net:net,save:save_,interest:interest,monthExp:monthExp,visionNeed:proj.totalOutflow,proj:proj};
}

// 協會標準財務比率體檢：收支流量 13 項 + 資產負債 12 項，各帶 ideal（理想值）與 status 紅黃綠燈。
// 與 public/lantu-app.html:663 的 ratios() 逐項一致（項目名稱與判燈門檻由對拍測試守著）。
function ratios(c){var m=metrics(c),r={};
 var inc=m.incTotal||1, at=m.assetTotal||1;
 // 收支流量子聚合
 var incWork=sum(c.incomes,function(i){return i.type==='工作'?n(i.amount):0});
 var livingCore=sum(c.expenses,function(e){return e.cat==='生活'?n(e.amount):0});
 var discretionary=sum(c.expenses,function(e){return (e.cat==='消費'||e.cat==='其他')?n(e.amount):0});
 var rent=sum(c.expenses,function(e){return (e.cat==='生活'&&/租/.test((e.name||'')+(e.subCat||'')))?n(e.amount):0});
 var insAll=sum(c.expenses,function(e){return e.cat==='保險'?n(e.amount):0});
 var social=sum(c.expenses,function(e){return (e.cat==='保險'&&/(勞保|健保|勞健保|社會|國保|國民年金)/.test((e.name||'')+(e.subCat||'')))?n(e.amount):0});
 var premium=Math.max(0,insAll-social);
 var loanPay=annualDebtPay(c)+manualLoanPay(c);
 var eduNow=sum(c.education,function(e){var s=n(e.startIn);return (s<=0&&0<s+n(e.years))?n(e.annual):0});
 var support=sum(c.expenses,function(e){return e.cat==='孝親'?n(e.amount):0})+eduNow;
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
 add(g1,'財務自由度',pct(m.incFinancial/(m.expTotal||1)),'≥100% 即財務自由','理財收入 ÷ 總支出',m.incFinancial>=m.expTotal?'good':m.incFinancial>=m.expTotal*0.3?'warn':'na');
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
 add(g2,'願景達成率',pct(m.net/(m.visionNeed||1)),'≥100%','現有淨資產 ÷ 願景總需求',bandLow(m.net/(m.visionNeed||1)*100,100));
 return r;
}

function projection(c){
 var a0=n(c.profile.age)||40,aEnd=n(c.params.horizon)||85,infl=n(c.params.inflation)/100,ret=n(c.params.invReturn)/100;
 var invest=sum(c.assets,function(a){return a.cls==='流動'?aVal(a):0});
 var fixedAssets=sum(c.assets,function(a){return a.cls==='固定'?aVal(a):0});
 var rows=[],turnNeg=null,totalOut=0;
 var eduByYear={}; var g=n(c.params.tuitionGrowth)/100;
 (c.education||[]).forEach(function(e){var s=a0+n(e.startIn);for(var yy=0;yy<n(e.years);yy++){var ag=s+yy;eduByYear[ag]=(eduByYear[ag]||0)+n(e.annual)*Math.pow(1+g,n(e.startIn)+yy)}});
 var rn=retireNeed(c);
 for(var age=a0;age<=aEnd;age++){
  var t=age-a0;
  var workIncome=sum(c.incomes,function(i){return (i.type==='工作'&&age>=n(i.start)&&age<=n(i.end))?n(i.amount)*Math.pow(1+n(i.growth)/100,t):0});
  var finIncome=sum(c.incomes,function(i){return (i.type==='理財'&&age>=n(i.start)&&age<=n(i.end))?n(i.amount)*Math.pow(1+n(i.growth)/100,t):0})+assetPassive(c);
  var otherIncome=sum(c.incomes,function(i){return (i.type!=='工作'&&i.type!=='理財'&&age>=n(i.start)&&age<=n(i.end))?n(i.amount)*Math.pow(1+n(i.growth)/100,t):0});
  var income=workIncome+finIncome+otherIncome;
  // 三段式：w＝已退休賺薪成員的支出比例權重。生活/消費依 w 從工作期換到退休期。
  var inflF=Math.pow(1+infl,t);
  var w=retiredWeight(c,age);
  var expense=workPhaseExpense(c,age,inflF,w);
  var debt=sum(c.liabilities,function(l){var sa=n(l.startAge)||a0;var el=(age-sa)*12;return (age>=sa&&(n(l.months)-el)>0)?lPay(l)*12:0});
  var goalOut=sum(c.goals,function(gg){if(age<n(gg.start)||age>n(gg.end))return 0;
    var hit=(n(gg.freq)<=0)?(age===n(gg.start)):(((age-n(gg.start))%n(gg.freq))===0);if(!hit)return 0;
    var gr=gg.growth==='通膨'?infl:(gg.growth==='薪資'?n(c.params.salaryGrowth)/100:(gg.type==='購屋'?n(gg.appreciation)/100:0));
    return n(gg.present)*Math.pow(1+gr,t);});
  var edu=eduByYear[age]||0;
  var life=lifestyleFactor(c,age,Math.pow(1+infl,t));
  var retireDraw=retireAnnual(c,age,inflF)*w;
  var bal=income-expense-debt-goalOut-edu-life-retireDraw;
  invest=(invest>0?invest*(1+ret):invest)+bal;
  totalOut+=expense+debt+goalOut+edu+life+retireDraw;
  if(turnNeg===null&&invest<0)turnNeg=age;
  var remDebt=sum(c.liabilities,function(l){return lRemain(l,age,a0)});
  var netEst=invest+fixedAssets-remDebt;
  rows.push({age:age,income:income,work:workIncome,fin:finIncome,other:otherIncome,expense:expense+edu+retireDraw,debt:debt,goal:goalOut,bal:bal,invest:invest,net:netEst});
 }
 return {rows:rows,turnNeg:turnNeg,totalOutflow:totalOut};
}

function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;var t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296}}

function hashStr(s){s=s||'x';var h=2166136261;for(var i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}return h>>>0}

function gauss(rng,m,sd){var u=0,v=0;while(u===0)u=rng();while(v===0)v=rng();return m+sd*Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v)}

function monteCarlo(c,N){N=(n(N)>0)?Math.round(n(N)):1000;var rng=mulberry32(hashStr(c.id)+N);
 // horizon 沒填時要退回 85（與 projection 一致）。少了 ||85 會讓 years 變負數 →
 // 迴圈不執行 → neg=0 → pSuccess 顯示「不破產機率 100%」而圖是空的。
 var a0=n(c.profile.age)||40,aEnd=n(c.params.horizon)||85,years=Math.max(0,aEnd-a0+1);
 var bR=n(c.params.invReturn),sR=n(c.params.invReturnStd),bI=n(c.params.inflation),sI=n(c.params.inflationStd),bG=n(c.params.salaryGrowth),sG=n(c.params.salaryStd);
 var liquid0=sum(c.assets,function(a){return a.cls==='流動'?aVal(a):0});
 var passive=assetPassive(c);
 var workBase=sum(c.incomes,function(i){return i.type==='工作'?n(i.amount):0});
 var edu=[];var g0=n(c.params.tuitionGrowth)/100;
 (c.education||[]).forEach(function(e){var s=a0+n(e.startIn);for(var yy=0;yy<n(e.years);yy++){edu[s+yy]=(edu[s+yy]||0)+n(e.annual)*Math.pow(1+g0,n(e.startIn)+yy)}});
 var matrix=[],finals=[],neg=0;
 for(var s=0;s<N;s++){var invest=liquid0,cumI=1,cumG=1,broke=false,traj=[];
  for(var age=a0;age<=aEnd;age++){var t=age-a0;
   var ret=gauss(rng,bR,sR)/100,infl=gauss(rng,bI,sI)/100,sg=gauss(rng,bG,sG)/100;
   var work=(function(){var w=0;c.incomes.forEach(function(i){if(i.type==='工作'&&age>=n(i.start)&&age<=n(i.end))w+=n(i.amount)*cumG});return w})();
   var other=sum(c.incomes,function(i){return (i.type!=='工作'&&i.type!=='理財'&&age>=n(i.start)&&age<=n(i.end))?n(i.amount):0});
   var fin=sum(c.incomes,function(i){return (i.type==='理財'&&age>=n(i.start)&&age<=n(i.end))?n(i.amount):0})+passive;
   var income=work+other+fin;
   var wMC=retiredWeight(c,age);
   var expense=workPhaseExpense(c,age,cumI,wMC);
   var debt=sum(c.liabilities,function(l){var sa=n(l.startAge)||a0;var el=(age-sa)*12;return (age>=sa&&(n(l.months)-el)>0)?lPay(l)*12:0});
   var goalOut=sum(c.goals,function(gg){if(age<n(gg.start)||age>n(gg.end))return 0;var hit=(n(gg.freq)<=0)?(age===n(gg.start)):(((age-n(gg.start))%n(gg.freq))===0);if(!hit)return 0;var gr=gg.growth==='通膨'?cumI:1;return n(gg.present)*gr});
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
 var need=totalGap(c),needBase=sum(coverageGaps(c),function(g){return g.need})||1;
 var riskCover=Math.max(0,1-need/needBase);
 var balScore=savingRate>=0?1:Math.max(0,1+savingRate);
 // 五項加權滿分 100；clamp 是防呆，任何一項若因資料異常超出 0~1 都不該讓總分破表。
 var safety=Math.max(0,Math.min(100,Math.round((balScore*25+reserve*15+credit*15+debtBal*15+riskCover*30))));
 var freedom=Math.round(Math.min(1,m.incFinancial/(m.expTotal||1))*100);
 var vision=Math.round(Math.min(1,m.net/(m.visionNeed||1))*100);
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
 ['願景達成度','資產淨值 ÷ 願景總需求 × 100%（退休、教育、置產等目標的累積進度）']
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
 var tg=totalGap(c);if(tg>0)list.push(['風險保全規劃','保障缺口合計約 '+fmt(tg)+' 元，優先補足壽險／房貸壽險。']);
 var movable=sum(c.assets,function(a){return a.movable?n(a.value):0});
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
 var net=(netOverride!=null)?netOverride:metrics(c).net;
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
 return {base:base,rate:b.rate,tax:b.tax,net:net,heirs:heirs,deductions:ded,totalDeduction:totalDed};
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

function legacyNeed(c){var lg=c.legacy||{};return n(lg.heirs)*n(lg.perHeirCash)}

function allocInfo(c){var al=(c.plan&&c.plan.allocations)||[];
 var totalPct=sum(al,function(a){return n(a.pct)});
 var wRet=totalPct?sum(al,function(a){return n(a.pct)*n(a.ret)})/totalPct:0;
 return {list:al,totalPct:totalPct,wRet:wRet};
}

function scenario(c){
 var after=JSON.parse(JSON.stringify(c));
 after.profile.retireAge=n(c.profile.retireAge)+n((c.plan||{}).retireDelay);
 // 延後退休要連配偶等賺薪成員一起推，否則三段權重會停在原本的切換點。
 (after.members||[]).forEach(function(m){if(m&&m.role!=='本人'&&n(m.retireAge)>0)m.retireAge=n(m.retireAge)+n((c.plan||{}).retireDelay);});
 // 延後退休：延長工作收入到新退休年齡
 after.incomes.forEach(function(i){if(i.type==='工作'&&n(i.end)<after.profile.retireAge)i.end=after.profile.retireAge});
 var before={metrics:metrics(c),retire:retireNeed(c),health:health(c),estate:estateTax(c),incomeTax:incomeTax(c)};
 var mAfter=metrics(after);
 var netAfter=mAfter.net-n((c.plan||{}).movableToOverseas); // 資產移轉降低境內帳面淨值(遺產稅基)
 var after2={metrics:mAfter,retire:retireNeed(after),health:health(after),estate:estateTax(after,netAfter),incomeTax:incomeTax(after)};
 // afterCase＝套用方案後的完整個案（延後退休已推到每位賺薪成員），供測試與明細追溯。
 return {before:before,after:after2,afterCase:after};
}

function crossTable(c){var m=metrics(c);
 var incWork=sum(c.incomes,function(i){return i.type==='工作'?n(i.amount):0});
 var incFin=sum(c.incomes,function(i){return i.type==='理財'?n(i.amount):0});
 var incOther=sum(c.incomes,function(i){return i.type==='其他'?n(i.amount):0});
 var expLive=sum(c.expenses,function(e){return (e.cat==='生活'||e.cat==='消費')?n(e.amount):0});
 var expTax=m.tax, expIns=m.ins;
 // 對齊 Excel 收支損益表：貸款與撫育（孝親＋教育）各自成列，不要全部倒進「其他」。
 var expLoan=manualLoanPay(c)+annualDebtPay(c);
 var expSupport=sum(c.expenses,function(e){return e.cat==='孝親'?n(e.amount):0});
 var expOther=sum(c.expenses,function(e){return ['生活','消費','稅賦','保險','孝親','貸款'].indexOf(e.cat)<0?n(e.amount):0});
 var aSelf=sum(c.assets,function(a){return a.cls==='固定'?aVal(a):0});
 var aInv=sum(c.assets,function(a){return a.cls==='流動'?aVal(a):0});
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
 {q:'投資期間內您臨時需要動用這筆資金的可能性？',o:[['非常高',1],['偏高',2],['普通',3],['偏低',4],['幾乎不會',5]]}
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
  retiredWeight,
  retireAnnual,
  workPhaseExpense,
  familyAnnualParentSupport,
  manualLoanPay,
  savingInvest,
  assetLayer,
  assetLayout,
  kindNorm,
  allocInfo,
  scenario,
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
