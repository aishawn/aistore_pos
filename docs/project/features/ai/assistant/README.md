# 门店助手、语音与历史

更新日期：2026-11-03。功能 ID：CAP-AI-ASSISTANT。负责人：assistant 模块 owner 待指定。

## 目标与入口

让员工用中文或英文查销售、库存、商品，并打开相应页面；语音输入复用同一链路，历史支持继续会话。

技术类型：确定性路由 + 大模型分类/回答 + ASR。用户/接口入口：门店 Orithos AI 面板；POST /api/ai/assistant、POST /api/ai/transcribe、GET /api/ai/threads。

## 当前能力与状态

问法路由、业务日期槽位、Odoo 只读报表、结构化 CTA、上下文与历史、语音能力门禁均有源码。导航不是提交业务操作；多轮会话不等于所有快捷预览都持久化。

已实现（本库主分支基线）；历史线上验证见 E-RO / E-WF-DEMO / E-WF-SKR；当前基线未重新线上验收。

## 验证与效果

2026-11-03 报表记录 E-RO 为 Demo/SKR 各 23/23；其 runtime 为 28a433a9，不能外推为本基线验收。同日 a6d5c7b0 的 390 条整轮：Demo 379 PASS/11 BLOCKED，SKR 382 PASS/8 BLOCKED；SKR 工作树脏，均未获候选接受。定向重试分别 11/11、8/8 检查通过，但总状态仍 BLOCKED（非全量）。ASR 合成样本 4/4，runtime 未记录，不证明真实麦克风。历史 round-trip 有确定性报表成功及 fallback 失败的并存记录。

## 阅读路径

[设计与实现](design.md) · [验证方法与证据](validation.md) · [进展与问题](progress.md) · [AI 全景](../README.md)
