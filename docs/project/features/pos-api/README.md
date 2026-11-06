# CAP-API Orithos POS API

状态：已实现首期代码，部署和线上验收 NOT RUN。API 位于 Spring `pos-api`，业务读取只经过 Odoo JSON-RPC；旧 PostgreSQL Classic service 不在调用链中。

入口：`/api/pos/v1`。CLI：`tools/orithos-pos`。

本期代码增加 API token 生命周期、scope、vendor/company 隔离、资源只读分页查询、销售报价、异步批处理、幂等键重放、Webhook 签名和失败重试。销售、库存盘点和草稿采购批处理由服务端开关控制且默认关闭；退款和采购收货尚未接入 API。所有高风险写入必须在 `aipos_uat` 或批准的隔离环境完成验收后再启用。当前候选尚未通过远程 Java 21 验证或线上验收。

文档：[design.md](design.md)、[progress.md](progress.md)、[validation.md](validation.md)、[API.md](API.md)、[OpenAPI](openapi.yaml)、[CLI 手册](../../../../tools/README.md)。
