/* eslint-disable */
// @ts-nocheck
// 嵐途財務引擎 — 由 v12 單檔原型移植的純函式（無 DOM/狀態）。

var KINDS=['壽險','意外險','住院醫療','初次罹癌','癌症住院','重病給付','每月照護'];

var EDU_STAGES=['嬰兒','幼稚園','小學','國中','高中職','大學','研究所','博士班'];

let __uidSeq=0;
function uid(){return 'c'+Date.now().toString(36)+(__uidSeq++).toString(36)+Math.floor(Math.random()*1e6).toString(36)}

function sampleCase(){return {
 id:uid(),
 profile:{name:'王大明(示範)',gender:'男',age:40,retireAge:65,lifeExp:85,credit:700},
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
 retire:{monthLiving:55000,retireReturn:4,retireInflation:1.5,prepared:[{item:'勞退',age:65,amount:3000000,method:'一次領'}]},
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
  {member:'王大明',funeral:600000,protectYears:5,estateTax:0,room:2000,selfPay:1500,nursing:1500,firstCancer:300000,cancerHosp:2000,critical:2000000,monthCare:30000,careMonths:120}
 ],
 coverages:[
  {member:'王大明',kind:'壽險',comm:0,social:0},
  {member:'王大明',kind:'住院醫療',comm:0,social:0}
 ],
 policies:[
  {insured:'王大明',name:'國泰終身醫療',premium:47536,life:0,accident:0,medical:2000,firstCancer:0,cancerHosp:0,critical:0,monthCare:0,cashValue:0},
  {insured:'王大明',name:'重大傷病定期',premium:20100,life:0,accident:0,medical:0,firstCancer:0,cancerHosp:0,critical:2000000,monthCare:0,cashValue:0},
  {insured:'王大明',name:'定期壽險',premium:8864,life:3000000,accident:1000000,medical:0,firstCancer:0,cancerHosp:0,critical:0,monthCare:0,cashValue:0}
 ],
 intent:{purposes:['想增加收入','想進行投資、活化資產','有節稅需求，想進行節稅'],targets:['退休生活規劃','子女教養規劃','購屋規劃','孝親規劃'],mustHave:['退休生活規劃','子女教養規劃']},
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

function newCase(){var c=sampleCase();c.id=uid();c.profile.name='新客戶';['incomes','expenses','assets','liabilities','education','goals','needs','coverages','policies','tracking','travel','hobby','luxury'].forEach(function(k){c[k]=[]});c.params.invReturnStd=12;c.params.inflationStd=1;c.params.salaryStd=1;c.members=[{name:'本人',role:'本人',gender:'男',age:40,worked:0,insType:'勞保',insSalary:0,depRatio:100,expRatio:100,indepAge:''}];c.retire={monthLiving:0,retireReturn:4,retireInflation:1.5,prepared:[]};c.taxParams={married:false,dependents:0,otherDeduction:0};c.plan={retireDelay:0,movableToOverseas:0,allocations:[]};
 c.intent={purposes:[],targets:[],mustHave:[]};c.career={plan:'無',switchAge:'',switchFund:'',startupType:'',startupBudget:'',importance:0};c.marriage={plan:'否',age:'',budget:'',minBudget:'',importance:0};c.credit={cards:0,payFull:'是',firstCardOver1yr:'否',installment:'無',badRecord5yr:'否',recentApply:'無',score:''};c.overseas={hasAssets:'否',identity:'否',purpose:'',assetTypes:''};c.legacy={heirs:0,perHeirCash:0,perHeirNote:'',feedEstate:false};c.nextReview='';c.riskQuiz={ans:{}};return c}

function n(v){v=Number(v);return isNaN(v)?0:v}

function sum(a,f){return (a||[]).reduce(function(s,x){return s+f(x)},0)}

function fmt(v){v=Math.round(n(v));return v.toString().replace(/\B(?=(\d{3})+(?!\d))/g,',')}

function esc(s){return (s==null?'':String(s)).replace(/[&<>"]/g,function(m){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]})}

function pct(x){return (x*100).toFixed(2)+'%'}

function annualDebtInterest(c){var a0=n(c.profile.age);return sum(c.liabilities,function(l){var sa=n(l.startAge)||a0;return (a0>=sa)?lBal(l)*n(l.rate)/100:0})}

function annualDebtPay(c){var a0=n(c.profile.age);return sum(c.liabilities,function(l){var sa=n(l.startAge)||a0;var elapsed=(a0-sa)*12;return (a0>=sa&&(n(l.months)-elapsed)>0)?lPay(l)*12:0})}

function familyAnnualLiving(c){return sum(c.expenses,function(e){return (e.cat==='生活'||e.cat==='消費')?n(e.amount):0})}

function aVal(a){return n(a.value)*(n(a.fxRate)||1)}

function aInc(a){return n(a.income)*(n(a.fxRate)||1)}

function lBal(l){return n(l.balance)*(n(l.fxRate)||1)}

function lPay(l){return n(l.pay)*(n(l.fxRate)||1)}

function assetPassive(c){return sum(c.assets,function(a){return (a.income!=null&&a.income!=='')?aInc(a):((a.type==='股票'||a.type==='基金'||a.type==='債券')?aVal(a)*n(a.ret)/100:0)})}

function liquidMovable(c){return sum(c.assets,function(a){return (a.cls==='流動'&&a.movable)?aVal(a):0})}

function lifestyleFactor(c,age,factor){var s=0;[c.travel,c.hobby,c.luxury].forEach(function(arr){(arr||[]).forEach(function(it){if(age>=n(it.start)&&age<=n(it.end))s+=n(it.amount)*(n(it.freq)||1)*factor})});return s;}

function lifestyleAnnualNow(c){return lifestyleFactor(c,n(c.profile.age),1);}

function eduTotal(c){var g=n(c.params.tuitionGrowth)/100;
 return sum(c.education,function(e){return n(e.annual)*n(e.years)*Math.pow(1+g,n(e.startIn))})}

function retireNeed(c){
 var r=c.retire||{},age=n(c.profile.age),ra=n(c.profile.retireAge),le=n(c.profile.lifeExp);
 var infl=n(c.params.inflation)/100, g=n(r.retireInflation)/100, rr=n(r.retireReturn)/100;
 var years=Math.max(0,ra-age), m=Math.max(0,le-ra);
 var monthFV=n(r.monthLiving)*Math.pow(1+infl,years);
 var annualFV=monthFV*12;
 var total;
 if(Math.abs(rr-g)<1e-6){total=annualFV*m/(1+rr);}
 else{total=annualFV*(1-Math.pow((1+g)/(1+rr),m))/(rr-g);}
 var prepared=sum(r.prepared,function(p){return n(p.amount)});
 return {years:years,余年:m,monthFV:monthFV,total:total,prepared:prepared,gap:Math.max(0,total-prepared)};
}

function lifeNeed(c,nd){
 var famLiving=familyAnnualLiving(c);
 var need=n(nd.depRatioOverride!=null?nd.depRatioOverride:memberDep(c,nd.member))/100*famLiving*n(nd.protectYears)
   + sum(c.liabilities,function(l){return n(l.balance)}) + eduTotal(c) + n(nd.funeral) + n(nd.estateTax);
 var existing=existingCover(c,nd.member,'壽險');
 var liquid=liquidMovable(c);
 return Math.max(0,need - existing - liquid);
}

function medicalDailyNeed(nd){return n(nd.room)+n(nd.selfPay)+n(nd.nursing)}

function memberDep(c,name){var m=(c.members||[]).find(function(x){return x.name===name});return m?n(m.depRatio):100}

var POLICY_MAP={'壽險':'life','意外險':'accident','住院醫療':'medical','初次罹癌':'firstCancer','癌症住院':'cancerHosp','重病給付':'critical','每月照護':'monthCare'};

function existingCover(c,member,kind){
 var fromCov=sum(c.coverages,function(cv){return (cv.member===member&&cv.kind===kind)?(n(cv.comm)+n(cv.social)):0});
 var f=POLICY_MAP[kind];var fromPol=f?sum(c.policies,function(p){return p.insured===member?n(p[f]):0}):0;
 return fromCov+fromPol;
}

function coverageGaps(c){
 var rows=[];
 (c.needs||[]).forEach(function(nd){
  var map={
   '壽險':lifeNeed(c,nd),
   '住院醫療':medicalDailyNeed(nd),
   '初次罹癌':n(nd.firstCancer),
   '癌症住院':n(nd.cancerHosp),
   '重病給付':n(nd.critical),
   '每月照護':n(nd.monthCare)
  };
  Object.keys(map).forEach(function(k){
   var need=map[k],ex=existingCover(c,nd.member,k);
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
 var cash=sum(c.assets,function(a){return (a.type==='現金'||a.type==='定存')?aVal(a):0});
 var liquid=sum(c.assets,function(a){return a.cls==='流動'?aVal(a):0});
 var assetTotal=sum(c.assets,function(a){return aVal(a)});
 var debtTotal=sum(c.liabilities,function(l){return lBal(l)});
 var net=assetTotal-debtTotal, save_=incTotal-expTotal, interest=annualDebtInterest(c), monthExp=expTotal/12;
 var proj=projection(c);
 return {incTotal:incTotal,incFinancial:incFinancial,living:living,tax:tax,ins:ins,expTotal:expTotal,cash:cash,liquid:liquid,
  assetTotal:assetTotal,debtTotal:debtTotal,net:net,save:save_,interest:interest,monthExp:monthExp,visionNeed:proj.totalOutflow,proj:proj};
}

function ratios(c){var m=metrics(c),r={};
 r['年儲蓄率']={v:pct(m.save/(m.incTotal||1)),f:'年儲蓄 ÷ 總收入',ok:m.save/(m.incTotal||1)>=0.1};
 r['消費比率']={v:pct(m.living/(m.incTotal||1)),f:'生活費用 ÷ 總收入',ok:true};
 r['財務負擔率']={v:pct((m.tax+m.ins+m.interest)/(m.incTotal||1)),f:'(稅+保險+利息) ÷ 總收入',ok:(m.tax+m.ins+m.interest)/(m.incTotal||1)<=0.4};
 r['現金佔流動比']={v:pct(m.cash/(m.liquid||1)),f:'現金 ÷ 流動資產',ok:m.cash/(m.liquid||1)>=0.2};
 r['負債比率']={v:pct(m.debtTotal/(m.assetTotal||1)),f:'負債 ÷ 資產總額',ok:m.debtTotal/(m.assetTotal||1)<0.5};
 r['緊急預備金']={v:(m.monthExp?(m.liquid/m.monthExp).toFixed(1):'0')+' 個月',f:'流動資產 ÷ 每月支出',ok:m.liquid/(m.monthExp||1)>=n(c.params.emergencyMonths||6)};
 r['財務自由度']={v:pct(m.incFinancial/(m.expTotal||1)),f:'理財收入 ÷ 總支出',ok:m.incFinancial/(m.expTotal||1)>=1};
 r['理財成就率']={v:pct(m.net/((m.net-m.save)||1)),f:'淨值 ÷ (去年淨值)',ok:m.save>0};
 r['淨值成長率']={v:pct(m.save/(m.net||1)),f:'年儲蓄 ÷ 淨值',ok:m.save>0};
 r['願景達成率']={v:pct(m.net/(m.visionNeed||1)),f:'現有淨資產 ÷ 願景總需求',ok:m.net/(m.visionNeed||1)>=1};
 r['願景成就率']={v:pct((m.net/(m.visionNeed||1))/0.5),f:'願景達成率 ÷ 歷程比率',ok:false};
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
  var expense=sum(c.expenses,function(e){return (age>=n(e.start)&&age<=n(e.end))?n(e.amount)*(e.infl?Math.pow(1+infl,t):1):0});
  var debt=sum(c.liabilities,function(l){var sa=n(l.startAge)||a0;var el=(age-sa)*12;return (age>=sa&&(n(l.months)-el)>0)?lPay(l)*12:0});
  var goalOut=sum(c.goals,function(gg){if(age<n(gg.start)||age>n(gg.end))return 0;
    var hit=(n(gg.freq)<=0)?(age===n(gg.start)):(((age-n(gg.start))%n(gg.freq))===0);if(!hit)return 0;
    var gr=gg.growth==='通膨'?infl:(gg.growth==='薪資'?n(c.params.salaryGrowth)/100:(gg.type==='購屋'?n(gg.appreciation)/100:0));
    return n(gg.present)*Math.pow(1+gr,t);});
  var edu=eduByYear[age]||0;
  var life=lifestyleFactor(c,age,Math.pow(1+infl,t));
  var retireDraw=(age>n(c.profile.retireAge))? n(c.retire&&c.retire.monthLiving)*12*Math.pow(1+infl,t):0;
  var bal=income-expense-debt-goalOut-edu-life-retireDraw;
  invest=(invest>0?invest*(1+ret):invest)+bal;
  totalOut+=expense+debt+goalOut+edu+life+retireDraw;
  if(turnNeg===null&&invest<0)turnNeg=age;
  var remDebt=sum(c.liabilities,function(l){var sa=n(l.startAge)||a0;if(age<sa)return 0;return Math.max(0,lBal(l)-lPay(l)*12*(age-sa))});
  var netEst=invest+fixedAssets-remDebt;
  rows.push({age:age,income:income,work:workIncome,fin:finIncome,other:otherIncome,expense:expense+edu+retireDraw,debt:debt,goal:goalOut,bal:bal,invest:invest,net:netEst});
 }
 return {rows:rows,turnNeg:turnNeg,totalOutflow:totalOut};
}

function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;var t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296}}

function hashStr(s){s=s||'x';var h=2166136261;for(var i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}return h>>>0}

function gauss(rng,m,sd){var u=0,v=0;while(u===0)u=rng();while(v===0)v=rng();return m+sd*Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v)}

function monteCarlo(c,N){N=N||1000;var rng=mulberry32(hashStr(c.id)+N);
 var a0=n(c.profile.age),aEnd=n(c.params.horizon),years=aEnd-a0+1;
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
   var expense=sum(c.expenses,function(e){return (age>=n(e.start)&&age<=n(e.end))?n(e.amount)*(e.infl?cumI:1):0});
   var debt=sum(c.liabilities,function(l){var sa=n(l.startAge)||a0;var el=(age-sa)*12;return (age>=sa&&(n(l.months)-el)>0)?lPay(l)*12:0});
   var goalOut=sum(c.goals,function(gg){if(age<n(gg.start)||age>n(gg.end))return 0;var hit=(n(gg.freq)<=0)?(age===n(gg.start)):(((age-n(gg.start))%n(gg.freq))===0);if(!hit)return 0;var gr=gg.growth==='通膨'?cumI:1;return n(gg.present)*gr});
   var eduY=edu[age]||0;
   var lifeY=lifestyleFactor(c,age,cumI);
   var retireDraw=(age>n(c.profile.retireAge))?n(c.retire&&c.retire.monthLiving)*12*cumI:0;
   invest=(invest>0?invest*(1+ret):invest)+(income-expense-debt-goalOut-eduY-lifeY-retireDraw);
   if(invest<0)broke=true;
   traj.push(invest);
   cumI*=(1+infl);cumG*=(1+sg);
  }
  matrix.push(traj);finals.push(invest);if(broke)neg++;
 }
 function pctile(arr,p){var a=arr.slice().sort(function(x,y){return x-y});return a[Math.min(a.length-1,Math.floor(p*a.length))]}
 var bands=[];for(var y=0;y<years;y++){var col=matrix.map(function(m){return m[y]});bands.push([pctile(col,0.1),pctile(col,0.5),pctile(col,0.9)])}
 return {N:N,years:years,a0:a0,pSuccess:(N-neg)/N,finalP10:pctile(finals,0.1),finalP50:pctile(finals,0.5),finalP90:pctile(finals,0.9),bands:bands};
}

function health(c){
 var m=metrics(c),savingRate=m.save/(m.incTotal||1);
 var reserve=Math.min(1,(m.liquid/(m.monthExp||1))/n(c.params.emergencyMonths||6));
 var cs=n((c.credit&&c.credit.score))||n(c.profile.credit);var credit=cs?cs/100:0;
 var dr=m.debtTotal/(m.assetTotal||1);var debtBal=dr<0.2?1:Math.max(0,1-(dr-0.2)/0.6);
 var need=totalGap(c),needBase=sum(coverageGaps(c),function(g){return g.need})||1;
 var riskCover=Math.max(0,1-need/needBase);
 var balScore=savingRate>=0?1:Math.max(0,1+savingRate);
 var safety=Math.round((balScore*25+reserve*15+credit*15+debtBal*15+riskCover*30));
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
 D:{name:'整裝期',task:'讓收支轉正、備妥緊急預備金與基本保障',c:'#8fa6b8',cl:'#5f7385'},
 C:{name:'啟程期',task:'把儲蓄變成會生錢的資產，建立理財收入',c:'#7fa8a0',cl:'#4e7a72'},
 B:{name:'前行期',task:'資產配置、抗風險，朝願景累積',c:'#c9a86b',cl:'#a3814a'},
 A:{name:'遠行期',task:'願景擴張、傳承與稅務配置',c:'#e0c88b',cl:'#8a6f3c'}
};
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

var TAX_BR=[[590000,0.05,0],[1330000,0.12,41300],[2660000,0.2,147700],[4980000,0.3,413700],[1e15,0.4,911700]];

var EST_BR=[[56210000,0.10,0],[112420000,0.15,2810500],[1e15,0.20,8431500]];

function bracket(x,br){for(var i=0;i<br.length;i++){if(x<=br[i][0])return {rate:br[i][1],ded:br[i][2],tax:Math.max(0,x*br[i][1]-br[i][2])}}return{rate:0,ded:0,tax:0}}

function incomeTax(c){
 var tp=c.taxParams||{};
 var salary=sum(c.incomes,function(i){return i.type==='工作'?n(i.amount):0});
 var people=1+(tp.married?1:0)+n(tp.dependents);
 var salaryEarners=(c.members||[]).filter(function(m){return n(m.insSalary)>0}).length||1;
 var exempt=97000*people;
 var stdDed=tp.married?262000:131000;
 var salarySpecial=Math.min(salary,218000*salaryEarners);
 var net=Math.max(0,salary-exempt-stdDed-salarySpecial-n(tp.otherDeduction));
 var b=bracket(net,TAX_BR);
 return {salary:salary,exempt:exempt,stdDed:stdDed,salarySpecial:salarySpecial,net:net,rate:b.rate,ded:b.ded,tax:b.tax,people:people};
}

function estateTax(c,netOverride){
 var net=(netOverride!=null)?netOverride:metrics(c).net;
 var exempt=13330000, base=Math.max(0,net-exempt-n((c.taxParams||{}).otherDeduction));
 var b=bracket(base,EST_BR);
 return {base:base,rate:b.rate,tax:b.tax};
}

function propertyTax(c){var tp=c.taxParams||{};var house=n(tp.houseAssessed)*0.012,land=n(tp.landAssessed)*0.002,car=n(tp.carTax);return {house:house,land:land,car:car,total:house+land+car}}

function legacyNeed(c){var lg=c.legacy||{};return n(lg.heirs)*n(lg.perHeirCash)}

function allocInfo(c){var al=(c.plan&&c.plan.allocations)||[];
 var totalPct=sum(al,function(a){return n(a.pct)});
 var wRet=totalPct?sum(al,function(a){return n(a.pct)*n(a.ret)})/totalPct:0;
 return {list:al,totalPct:totalPct,wRet:wRet};
}

function scenario(c){
 var after=JSON.parse(JSON.stringify(c));
 after.profile.retireAge=n(c.profile.retireAge)+n((c.plan||{}).retireDelay);
 // 延後退休：延長工作收入到新退休年齡
 after.incomes.forEach(function(i){if(i.type==='工作'&&n(i.end)<after.profile.retireAge)i.end=after.profile.retireAge});
 var before={metrics:metrics(c),retire:retireNeed(c),health:health(c),estate:estateTax(c),incomeTax:incomeTax(c)};
 var mAfter=metrics(after);
 var netAfter=mAfter.net-n((c.plan||{}).movableToOverseas); // 資產移轉降低境內帳面淨值(遺產稅基)
 var after2={metrics:mAfter,retire:retireNeed(after),health:health(after),estate:estateTax(after,netAfter),incomeTax:incomeTax(after)};
 return {before:before,after:after2};
}

function crossTable(c){var m=metrics(c);
 var incWork=sum(c.incomes,function(i){return i.type==='工作'?n(i.amount):0});
 var incFin=sum(c.incomes,function(i){return i.type==='理財'?n(i.amount):0});
 var incOther=sum(c.incomes,function(i){return i.type==='其他'?n(i.amount):0});
 var expLive=sum(c.expenses,function(e){return (e.cat==='生活'||e.cat==='消費')?n(e.amount):0});
 var expTax=m.tax, expIns=m.ins, expOther=sum(c.expenses,function(e){return ['生活','消費','稅賦','保險'].indexOf(e.cat)<0?n(e.amount):0});
 var aSelf=sum(c.assets,function(a){return a.cls==='固定'?aVal(a):0});
 var aInv=sum(c.assets,function(a){return a.cls==='流動'?aVal(a):0});
 var dCons=sum(c.liabilities,function(l){return (l.mainCat==='信貸'||/信|卡|消費/.test(l.name))?lBal(l):0});
 var dInv=m.debtTotal-dCons;
 return {incWork:incWork,incFin:incFin,incOther:incOther,incTotal:m.incTotal,expLive:expLive,expTax:expTax,expIns:expIns,expOther:expOther+annualDebtPay(c),expTotal:m.expTotal,
  aSelf:aSelf,aInv:aInv,aTotal:m.assetTotal,dCons:dCons,dInv:dInv,dTotal:m.debtTotal,net:m.net,monthBal:(m.incTotal-m.expTotal)/12};
}

// @deprecated 已改用 stageColor（財務階段）；保留僅為既有 export 契約相容，勿用於新程式。
function gradeColor(g){return {A:'var(--ok)',B:'var(--teal)',C:'var(--amber)',D:'var(--warn)'}[g]}

var PURPOSES=['想增加收入','想買車、買房，進行置產','想進行儲蓄，替未來準備','想進行投資、活化資產','想優化個人的信用評分','想進行風險的保障評估','有節稅需求，想進行節稅','人生模擬，了解一生金流'];

var TARGETS=['人生模擬','職涯規劃','購車規劃','購屋規劃','子女教養規劃','孝親規劃','旅遊規劃','休閒興趣規劃','奢侈品購買規劃','退休生活規劃','傳承規劃'];

var RISK_Q=[
 {q:'您目前的年齡層是？',o:[['70歲以上',1],['60–69歲',2],['50–59歲',3],['40–49歲',4],['39歲以下',5]]},
 {q:'這筆可投資資金占您整體資產的比例？',o:[['80%以上（幾乎是全部）',1],['約60–80%',2],['約40–60%',3],['約20–40%',4],['20%以下（僅一小部分）',5]]},
 {q:'您這筆資金主要的投資目的是？',o:[['保本，絕不能虧損',1],['略高於定存即可',2],['穩健累積，兼顧風險',3],['追求資產明顯成長',4],['積極追求高報酬',5]]},
 {q:'您預計這筆資金可以不動用多久？',o:[['1年以內',1],['1–3年',2],['3–5年',3],['5–10年',4],['10年以上',5]]},
 {q:'您目前的收入來源穩定度？',o:[['已無主動收入（退休/待業）',1],['不穩定、起伏大',2],['尚可，普通穩定',3],['穩定的薪資收入',4],['穩定且有多重來源',5]]},
 {q:'未來3–5年您的收入預期？',o:[['可能明顯減少',1],['可能略減',2],['大致持平',3],['可能成長',4],['可望大幅成長',5]]},
 {q:'您對投資理財商品的了解與經驗？',o:[['完全沒有',1],['僅定存/儲蓄險',2],['買過基金/ETF',3],['熟悉股票/債券操作',4],['熟悉衍生性/槓桿商品',5]]},
 {q:'您實際投資過風險最高的商品是？',o:[['定存、儲蓄險',1],['債券、貨幣型基金',2],['平衡型基金、績優股',3],['個股、股票型基金',4],['期權、外匯、加密貨幣等',5]]},
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

function riskScore(c){var a=(c.riskQuiz&&c.riskQuiz.ans)||{},s=0,answered=0;for(var i=0;i<RISK_Q.length;i++){if(a[i]!=null){s+=RISK_Q[i].o[a[i]][1];answered++;}}return {score:s,answered:answered,total:RISK_Q.length};}

function riskProfile(c){var r=riskScore(c);if(r.answered<RISK_Q.length)return null;var t=RISK_TIERS[0];for(var i=0;i<RISK_TIERS.length;i++){if(r.score>=RISK_TIERS[i].min)t=RISK_TIERS[i];}return {tier:t,score:r.score,answered:r.answered,total:r.total};}

function pmt(bal,rate,months){var i=rate/12/100;if(i<=0)return months>0?bal/months:0;return bal*i*Math.pow(1+i,months)/(Math.pow(1+i,months)-1)}

export {
  KINDS,
  EDU_STAGES,
  uid,
  sampleCase,
  newCase,
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
  STAGE_ORDER,
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
  legacyNeed,
  allocInfo,
  scenario,
  crossTable,
  gradeColor,
  PURPOSES,
  TARGETS,
  RISK_Q,
  RISK_TIERS,
  riskScore,
  riskProfile,
  pmt
};
