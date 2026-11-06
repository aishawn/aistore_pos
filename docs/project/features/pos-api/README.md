# CAP-API Orithos POS API

状态：已实现首期代码，部署和线上验收 NOT RUN。API 位于 Spring `pos-api`，业务读取只经过 Odoo JSON-RPC；旧 PostgreSQL Classic service 不在调用链中。

入口：`/api/pos/v1`。CLI：`tools/orithos-pos`。

本期支持 API token 生命周期、scope、vendor/company 隔离、产品/客户/供应商/销售/订单/采购只读分页查询、CLI JSON/JSONL 读取和批量命令的显式确认/idempotency 头。高风险写入、webhook 和真实批处理在 Odoo 隔离验收前返回明确的 `501 not_implemented`，避免伪成功。

文档：[design.md](design.md)、[progress.md](progress.md)、[validation.md](validation.md)、[API.md](API.md)、[OpenAPI](openapi.yaml)、[CLI 手册](../../../../tools/README.md)。
