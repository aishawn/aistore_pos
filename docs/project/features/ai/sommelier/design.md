# 侍酒推荐与酒标识别：设计与实现

更新日期：2026-11-03；代码基线见[基线](../../../baseline.md)。负责人待指定。

## 业务与数据流

门店目录与可用库存/价格 → 用户类型/预算/口味条件 → WineMatcher 评分与分层 → 推荐卡片。酒标图像提取标识，再回目录查询；说明和话术可以调用模型，库存与价格以 Odoo 为准。

## 接口与边界

入口：/sommelier、/sommelier/find、/sommelier/identify；/api/ai/sommelier/*。

没有匹配就说明没有匹配，不虚构在售、价格、年份和库存。相似推荐保留门店范围。识别出品牌不代表命中本店 SKU；不把反馈写入当作销售转化。

模型、prompt/config 和线上开关未由本次盘点确认。每轮变更记录版本，不将当前源码默认值回填到旧测试。统一配额、降级和数据契约见[AI 架构](../architecture.md)。

## 代码与原设计

- [SommelierService.java](../../../../../pos-api/src/main/java/com/orithos/modules/ai/sommelier/SommelierService.java)
- [SommelierCatalogService.java](../../../../../pos-api/src/main/java/com/orithos/modules/ai/sommelier/SommelierCatalogService.java)
- [WineMatcher.java](../../../../../pos-api/src/main/java/com/orithos/modules/ai/sommelier/WineMatcher.java)
- [WineLabelVisionService.java](../../../../../pos-api/src/main/java/com/orithos/modules/ai/sommelier/WineLabelVisionService.java)

## 异常与兼容

遵守现有响应契约和 Odoo 门店权限；缺数据、源过期、源不可用分别说明。恢复或重试不能跨店兜底、重复提交或把未知改为零。发布前核对具体改动的 source/runtime SHA；本文不授予业务写入权限。
