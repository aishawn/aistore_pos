# CAP-API Orithos POS API

状态：API、CLI 和文档代码已部署到两个 POS 环境；销售、退款、库存、采购写入以及批量幂等、webhook、异步操作的完整线上验收尚未完成。API 位于 Spring `pos-api`，业务读取和写入只经过 Odoo JSON-RPC；旧 PostgreSQL Classic service 不在调用链中。

入口：`/api/pos/v1`。CLI：`tools/orithos-pos`。

本期代码增加 API token 生命周期、scope、vendor/company 隔离、资源只读分页查询、销售报价、销售和全单退款写入、库存调整、草稿采购、异步批处理、幂等键重放、Webhook 签名和失败重试。销售、库存和采购批处理由服务端开关控制，验收环境统一使用 `aipos_uat`；采购写入只创建草稿，不接收库存。所有写入仍经过 Odoo 业务规则。

文档：[design.md](design.md)、[progress.md](progress.md)、[validation.md](validation.md)、[API.md](API.md)、[OpenAPI](openapi.yaml)、[CLI 手册](../../../../tools/README.md)。
