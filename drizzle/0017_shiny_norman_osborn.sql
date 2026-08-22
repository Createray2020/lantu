-- 對齊「個人/家庭財務報表指標完整版」Excel：補上支出的【貸款】大類、
-- 獨立的【儲蓄理財投入】(第五個 kind)、以及三個缺漏的收入/消費細類。
--
-- 為什麼貸款要另立大類：Excel 把自用房貸/汽車貸款藏在「生活必需」底下、
-- 投資性房貸與信貸放在【其他貸款支出】。系統原本完全沒有支出側的貸款入口
-- （只從負債表反推年付本息），顧問看不到、也填不了沒登在負債表的貸款。
--
-- 為什麼儲蓄理財投入不是 expense：在原表它放在「總支出」之外——
-- 那是換口袋不是花掉。它是「有效儲蓄率」的分子，混進支出會被算兩次。
--
-- 全部 ON CONFLICT DO NOTHING：這支可以重跑，也不會動到既有列。
INSERT INTO "finance_categories" ("kind","parent","label","risk_asset","liquidity","consumer","needs_note","sort_order","active","is_system") VALUES
('income', '理財', '其他理財收入', false, NULL, false, false, 195, true, true),
('income', '其他', '育兒津貼', false, NULL, false, false, 212, true, true),
('income', '其他', '子女孝養金', false, NULL, false, false, 214, true, true),
('expense', '貸款', '自用住宅貸款', false, NULL, false, false, 111, true, true),
('expense', '貸款', '投資性房屋貸款', false, NULL, false, false, 112, true, true),
('expense', '貸款', '汽車貸款', false, NULL, false, false, 113, true, true),
('expense', '貸款', '機車貸款', false, NULL, false, false, 114, true, true),
('expense', '貸款', '信用貸款', false, NULL, false, false, 115, true, true),
('expense', '貸款', '信用卡分期/零卡分期', false, NULL, false, false, 116, true, true),
('expense', '貸款', '就學貸款', false, NULL, false, false, 117, true, true),
('expense', '貸款', '其他貸款支出', false, NULL, false, true, 118, true, true),
('expense', '消費', '醫美/非生活必需治裝', false, NULL, false, false, 215, true, true),
('saving', '儲蓄理財', '零存整付存款', false, NULL, false, false, 10, true, true),
('saving', '儲蓄理財', '儲蓄保險保費', false, NULL, false, false, 20, true, true),
('saving', '儲蓄理財', '定期定額ETF/基金', false, NULL, false, false, 30, true, true),
('saving', '儲蓄理財', '定期定額股票', false, NULL, false, false, 40, true, true),
('saving', '儲蓄理財', '勞退自提', false, NULL, false, false, 50, true, true),
('saving', '儲蓄理財', '投資型保單投資保費', false, NULL, false, false, 60, true, true),
('saving', '儲蓄理財', '定期定額海外/複委託', false, NULL, false, false, 70, true, true),
('saving', '儲蓄理財', '跟會(互助會)', false, NULL, false, false, 80, true, true),
('saving', '儲蓄理財', '其他儲蓄投資', false, NULL, false, true, 90, true, true)
ON CONFLICT ("kind","label") DO NOTHING;
