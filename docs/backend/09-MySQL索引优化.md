# 09 · MySQL 索引优化专题

> 索引是数据库性能的核心。慢查询 90% 和索引有关。

## 一、索引是什么
- 类比**书的目录**：没目录要一页页翻（全表扫描），有目录直接定位。
- MySQL（InnoDB）索引底层是 **B+ 树**，查询复杂度从 O(n) 降到 O(log n)。
- 代价：占空间、拖慢写入（增删改要维护索引）——所以**不是越多越好**。

## 二、索引类型
| 类型 | 说明 |
|------|------|
| 主键索引（聚簇索引） | 数据按主键物理排序存储，一张表一个 |
| 普通/二级索引 | 最常建的，加速 WHERE/JOIN/ORDER BY |
| 唯一索引 | 兼具唯一约束（如 email、username）|
| **联合索引** | 多列组合，遵循**最左前缀**原则 |
| 全文索引 | 文本搜索（中文需配合分词）|

## 三、EXPLAIN —— 看懂执行计划（最重要的工具）
```sql
EXPLAIN SELECT * FROM `user` WHERE email = 'x@y.com';
```
重点看这几列：
| 列 | 含义 | 想看到 |
|----|------|--------|
| `type` | 访问类型 | `const`/`ref`/`range` 好；**`ALL`=全表扫描，差** |
| `key` | 实际用的索引 | 非 NULL（用上了索引）|
| `rows` | 预估扫描行数 | 越小越好 |
| `Extra` | 额外信息 | 怕看到 `Using filesort`、`Using temporary` |

`type` 从好到差：`system > const > eq_ref > ref > range > index > ALL`。

## 四、联合索引的"最左前缀"原则（高频考点）
建了 `INDEX(a, b, c)`，相当于有了 `(a)`、`(a,b)`、`(a,b,c)` 三个前缀索引：
```sql
WHERE a=1                 -- ✅ 用到
WHERE a=1 AND b=2         -- ✅ 用到
WHERE a=1 AND b=2 AND c=3 -- ✅ 用到
WHERE b=2                 -- ❌ 跳过了最左列 a，用不到
WHERE a=1 AND c=3         -- ⚠️ 只能用到 a，c 用不上
```

## 五、索引失效的常见坑
```sql
-- ❌ 对索引列做运算/函数 → 失效
WHERE YEAR(created_at) = 2026          -- 改成范围: created_at >= '2026-01-01'
-- ❌ 左模糊 → 失效
WHERE name LIKE '%欧阳'                 -- 右模糊 '欧阳%' 才能用索引
-- ❌ 隐式类型转换 → 失效
WHERE phone = 13800138000              -- phone 是字符串却传数字
-- ❌ OR 一边没索引 → 可能全表
-- ❌ 用 != / NOT IN / IS NOT NULL → 常失效
```

## 六、优化实战流程
1. **开慢查询日志**找出慢 SQL：
   ```sql
   SET GLOBAL slow_query_log = ON;
   SET GLOBAL long_query_time = 1;   -- 超过 1 秒记录
   ```
   （或用 `mysqldumpslow` / `pt-query-digest` 分析慢日志）
2. 对慢 SQL 跑 `EXPLAIN`，看 `type=ALL` 或 `rows` 巨大。
3. 根据 WHERE/JOIN/ORDER BY 涉及的列**建合适的（联合）索引**。
4. 改写 SQL：避开上面的失效坑、`SELECT` 只取需要的列（**覆盖索引**能避免回表）。
5. 再 `EXPLAIN` 验证 `type` 变好、`rows` 下降。

## 七、建索引的经验
- 高频查询条件列、JOIN 关联列、排序列 → 建索引。
- 区分度低的列（如性别、状态只有几种值）单独建索引意义小。
- 联合索引把**区分度高 / 最常用**的列放左边。
- 单表索引别太多（一般 5 个以内），写多读少的表更要克制。

## 八、对照本项目（Prisma/PostgreSQL）
本项目 `schema.prisma` 里的 `@@index([role])`、`@unique` 就是在声明索引；PostgreSQL 同样用 `EXPLAIN`，理念和 MySQL 一致，只是 type/输出格式略有差异。
