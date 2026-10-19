# 店铺生命周期认证门禁测试

本批次补充 `AdminTenantLifecycleTest` 对 `TenantResolverFilter.isUnavailable` 的覆盖：

- `deleted`、`suspended`、`expired` 店铺必须被标记为不可用。
- `active`、未过期 `trial` 店铺保持可用。

这些断言对应平台状态页面的生命周期矩阵，确保 suspend/expire 后租户 host 的认证门禁不会回归。当前机器只有 Java 8，无法执行项目要求 Java 21 的 Maven 测试；代码变更会与下一批部署一起验证。未运行 build。

