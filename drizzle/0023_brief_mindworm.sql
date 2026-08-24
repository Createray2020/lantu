CREATE TABLE "ins_products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company" text NOT NULL,
	"code" text DEFAULT '' NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"kind" text DEFAULT '' NOT NULL,
	"main_rider" text DEFAULT '' NOT NULL,
	"on_sale" boolean DEFAULT true NOT NULL,
	"big_cat" text DEFAULT '人身' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "ins_products_company_code_uq" ON "ins_products" USING btree ("company","code");--> statement-breakpoint
CREATE INDEX "ins_products_company_idx" ON "ins_products" USING btree ("company","sort_order");

--> statement-breakpoint
-- 保險公司清單 seed（公司層的列：code/name 留空字串）。
-- 冪等：company+code 有唯一鍵，重跑不會長出第二份。
-- 這 38 家只是「公司名稱」，是保單登錄時要選的對象，不含任何商品或費率資料。
INSERT INTO "ins_products" ("company","code","name","kind","main_rider","on_sale","big_cat","sort_order") VALUES
 ('三商美邦','','','','',true,'人身',0),
 ('安達','','','','',true,'人身',1),
 ('凱基','','','','',true,'人身',2),
 ('中華郵政','','','','',true,'人身',3),
 ('元大','','','','',true,'人身',4),
 ('友邦','','','','',true,'人身',5),
 ('台灣','','','','',true,'人身',6),
 ('全球','','','','',true,'人身',7),
 ('合作金庫','','','','',true,'人身',8),
 ('安聯','','','','',true,'人身',9),
 ('宏泰','','','','',true,'人身',10),
 ('法國巴黎','','','','',true,'人身',11),
 ('保誠','','','','',true,'人身',12),
 ('南山','','','','',true,'人身',13),
 ('國泰','','','','',true,'人身',14),
 ('第一金','','','','',true,'人身',15),
 ('富邦','','','','',true,'人身',16),
 ('新光','','','','',true,'人身',17),
 ('臺銀','','','','',true,'人身',18),
 ('遠雄','','','','',true,'人身',19),
 ('中信產險','','','','',true,'產物',20),
 ('兆豐產險','','','','',true,'產物',21),
 ('安達產物','','','','',true,'產物',22),
 ('旺旺友聯產物','','','','',true,'產物',23),
 ('明台產物','','','','',true,'產物',24),
 ('法國巴黎產物','','','','',true,'產物',25),
 ('南山產物','','','','',true,'產物',26),
 ('泰安產物','','','','',true,'產物',27),
 ('國泰產物','','','','',true,'產物',28),
 ('第一產物','','','','',true,'產物',29),
 ('富邦產物','','','','',true,'產物',30),
 ('華南產物','','','','',true,'產物',31),
 ('新光產物','','','','',true,'產物',32),
 ('新安東京產物','','','','',true,'產物',33),
 ('臺灣產物','','','','',true,'產物',34),
 ('和泰產物','','','','',true,'產物',35),
 ('國外公司','','','','',true,'人身',36),
 ('國外公司(產物)','','','','',true,'產物',37)
ON CONFLICT ("company","code") DO NOTHING;
