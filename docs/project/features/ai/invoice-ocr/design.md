# 发票 OCR 与预览：设计与实现

更新日期：2026-11-03；代码基线见[基线](../../../baseline.md)。负责人待指定。

## 业务与数据流

上传文件 → 图像/PDF 规范化 → Gateway 视觉任务 → 结构化字段解析 → 员工核对供应商、票号、日期、箱规、数量、金额、GST → 保存应用草稿。匹配、创建 RFQ、确认、收货需各自权限与写入核对。

## 接口与边界

入口：/invoices/scan；POST /api/ai/invoice/preview；后续 /api/invoice-scans session。

只转录可见数值，不推算缺失 GST 或总额；有反光、遮挡、不确定字段返回 null 和人工复核提示。可见金额冲突应保留原值、提示核对，不强行配平。预览不得创建供应商、采购、收货和库存。文件限制及身份失败需在 provider 调用前拒绝。

模型、prompt/config 和线上开关未由本次盘点确认。每轮变更记录版本，不将当前源码默认值回填到旧测试。统一配额、降级和数据契约见[AI 架构](../architecture.md)。

## 代码与原设计

- [InvoiceVisionService.java](../../../../../pos-api/src/main/java/com/orithos/modules/ai/invoice/InvoiceVisionService.java)
- [AiInvoicePreviewController.java](../../../../../pos-api/src/main/java/com/orithos/modules/ai/invoice/AiInvoicePreviewController.java)
- [InvoiceScanSessionService.java](../../../../../pos-api/src/main/java/com/orithos/modules/ai/invoice/InvoiceScanSessionService.java)
- [SUPPLIER_INVOICE_API_INGEST.md](../../../../SUPPLIER_INVOICE_API_INGEST.md)

## 异常与兼容

遵守现有响应契约和 Odoo 门店权限；缺数据、源过期、源不可用分别说明。恢复或重试不能跨店兜底、重复提交或把未知改为零。发布前核对具体改动的 source/runtime SHA；本文不授予业务写入权限。
