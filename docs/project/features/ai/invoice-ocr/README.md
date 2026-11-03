# 发票 OCR 与预览

更新日期：2026-11-03。功能 ID：CAP-AI-OCR。负责人：invoice-ocr 模块 owner 待指定。

## 目标与入口

把供应商票据转为可审阅字段，减少录入，保留原始金额与不确定性。

技术类型：多模态模型 + 结构化解析 + 人工复核。用户/接口入口：/invoices/scan；POST /api/ai/invoice/preview；后续 /api/invoice-scans session。

## 当前能力与状态

图像/PDF 处理、视觉提取、JSON 解析、预览和 scan session 已有源码；草稿关联采购与确认收货是独立业务链路。供应商 API ingest 是默认禁用 scaffold。

已实现（本库基线）；E-OCR 为旧版本合成票据线上预览验证；真实供应商准确率和当前版本复验 NOT RUN。

## 验证与效果

E-OCR 在 SKR runtime 9a4dfeb9 上为合成澳洲税票预览 PASS：关键字段存在，lineCount=1，businessWrites=0。它不提供真实发票整体正确率、长表准确率、费用或延迟分位数。原工作区曾有反光 GST 补全失败和配额阻断记录，但相关 JSON 未在本库基线归档，因此在此列为待补证，不伪造 FAIL→PASS 闭环。

## 阅读路径

[设计与实现](design.md) · [验证方法与证据](validation.md) · [进展与问题](progress.md) · [AI 全景](../README.md)
