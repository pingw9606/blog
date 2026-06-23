---
---
# SEO 要点总结（原理 + 实战 + 面试）

> 基于本项目《短剧出海官网 SEO 开发规范 V1.0》和实际落地整理。短剧出海/内容站方向面试必问。配合 `Nextjs面试学习-对比Nuxt.md` 的渲染模式一起看。

---

## 0. SEO 三个阶段（先建立框架）

搜索引擎工作三步，所有 SEO 手段都是为这三步服务：

1. **Crawl 抓取**：爬虫能否访问到页面、读到内容 → 靠 robots、sitemap、内链、**SSR/SSG（可抓取的 HTML）**。
2. **Index 索引**：内容是否被收录、是否判重 → 靠 canonical、hreflang、唯一 URL、结构化数据。
3. **Rank 排名**：在结果里排多前 → 靠内容质量、Core Web Vitals、移动友好、外链、用户行为。

> **面试开场可答**：「SEO 落地分三层：可抓取（渲染 + robots/sitemap）、可索引（canonical/hreflang/唯一 URL/Schema）、可排名（性能 + 内容 + 体验）。前端主要负责前两层和性能。」

---

## 1. 渲染与可抓取性（前端 SEO 第一要务）⭐⭐⭐

**核心矛盾**：纯 CSR（SPA）首屏是空壳 HTML，爬虫抓不到内容 → SEO 灾难。

- **必须 SSR / SSG / ISR**，保证 **Title / Description / 正文内容服务端输出**（规范明确要求）。
- 本项目分层：
  - 法务页（privacy/terms）→ **SSG**（16 语言全预渲染）
  - 详情页 → **ISR**（`revalidate=60`，快 + 可更新）
  - 列表页 → **SSR + 客户端接管**（首屏 HTML 给爬虫，之后 SPA 切换）
- **验证**：`curl` 页面看 HTML 里有没有真实内容（剧名/简介/卡片），而不是只有 `<div id="root">`。

> 面试题「SPA 怎么做 SEO？」→ SSR/SSG/预渲染、动态渲染（给爬虫专门返回渲染好的 HTML）、或迁到 Next/Nuxt 这类 SSR 框架。

---

## 2. URL 设计 ⭐⭐⭐

### 规则（本项目规范）
- **统一格式 `{slug}-{id}`**：`my-ceo-husband-12345`。slug 给人和搜索引擎看，id 保证唯一可定位。
- **字符**：只允许 `a-z 0-9`，空格→`-`，连续空格→单个`-`，特殊符号删除，**全小写**。
  - `Who Is The Real Mrs. Chase?` → `who-is-the-real-mrs-chase`
- **URL 永久稳定**：剧名改了只改 Title，**不改 URL**（id 不变）。避免链接失效和权重丢失。
- **路径式 > query 式**：用 `/dramas/romance-200067/2` 而非 `/dramas?genre=x&page=2`。
  - 我们专门做过这个改造：query 参数易被判重、权重分散；路径式每个组合独立 URL、可被独立索引。

### 本项目实现
```ts
// lib/slug.ts
buildSlug("My CEO Husband", 12345)  // → "my-ceo-husband-12345"
parseId("my-ceo-husband-12345")     // → "12345"
```
路由用可选 catch-all `[[...slugs]]` 把分类/分页做成真实路径。

---

## 3. Canonical（唯一性标识，判重核心）⭐⭐⭐

- **所有页面都要输出 canonical**（首页/分类/详情/播放/分页…）。
- **规则：自指向**——当前页 canonical 指向自己。
  - `/drama/x-12345` 的 canonical = `/drama/x-12345`
- **带参数页**（`?utm_source=`、`?from=`）→ canonical 指向**无参数**版本。
- **分页页**（`/dramas/2`）→ canonical **自指向 `/dramas/2`**，⚠️ **禁止全部指向第一页**（否则第 2 页及内容不被收录）。

> 面试高频陷阱：「分页 canonical 该指向第一页吗？」→ **不该**，应自指向，否则深层内容丢失收录。（早期 `rel=prev/next` 已被 Google 弃用。）

---

## 4. Hreflang（多语言关联）⭐⭐⭐

16 语言站的核心。告诉搜索引擎「这是同一内容的不同语言版本」，避免跨语言判重、给对的地区展示对的语言。

### 规则（本项目）
- **所有语言页面互相关联**，且**双向引用**（A 引用 B，B 必须引用 A）。
- 每个 hreflang 目标 URL **必须 200**，不得 404/301。
- 配 `x-default` 兜底。
- canonical 仍自指向（不是指向某个主语言）。

### 本项目实现
```html
<!-- 详情页 SSR 输出（lib/seo/metadata.ts 自动生成） -->
<link rel="canonical" href="https://www.vibeshort.live/drama/x-12345"/>
<link rel="alternate" hreflang="en" href="https://www.vibeshort.live/drama/x-12345"/>
<link rel="alternate" hreflang="ja" href="https://www.vibeshort.live/ja/drama/x-12345"/>
<link rel="alternate" hreflang="x-default" href="https://www.vibeshort.live/drama/x-12345"/>
```
> 默认语言 en 无前缀，其它带前缀（`/ja`、`/es`）；关闭基于 Cookie 的自动跳转，保证 URL 对爬虫唯一稳定。

---

## 5. 结构化数据 Schema（JSON-LD）⭐⭐

让搜索引擎理解页面类型、出富媒体卡片（视频缩略图、面包屑等）。本项目按页面类型：

| 页面 | Schema |
|------|--------|
| 首页 | `Organization` + `WebSite` |
| 分类页 / Tags 页 | `BreadcrumbList` |
| 剧详情页 | `VideoSeries` + `BreadcrumbList` |
| 播放页 | `VideoObject` + `BreadcrumbList` |
| Blog/Fandom 页 | `Article` + `BreadcrumbList` |

**校验规则**：空字段不输出、错误图片/URL 不输出（避免无效 Schema 被惩罚）。

```tsx
// 本项目 JsonLd 组件，详情页用 VideoSeries
<JsonLd data={videoSeriesSchema({ name, description, image, url, numberOfEpisodes })} />
<JsonLd data={breadcrumbSchema([{name:"Home",path:"/"}, ...])} />
```
> 用 Google Rich Results Test / Schema.org validator 校验。

---

## 6. Sitemap & robots ⭐⭐

### Sitemap 规则
- 只收录 `status=published` + `200` + `indexable=true` 的页面。
- **不收录**：下架/404/410/草稿/未发布。
- **分片**：单文件 ≤ 10000 URL，超了拆分（`sitemap-drama-1.xml`、`-2.xml`）。
- URL 改动后 24h 内同步。

### robots
- 允许抓内容页，**屏蔽 `/api`、`/admin` 等**。
- 本项目 `app/robots.ts`、`app/sitemap.ts`（Next 文件约定，导出函数即生成）。

---

## 7. 状态码规范 ⭐

| 情况 | 状态码 |
|------|--------|
| 正常页 | 200 |
| 不存在 | **404**（不能返回 200！） |
| 永久删除 | **410** |
| 重定向 | 301（永久）/ 302（临时） |

> **面试陷阱**：「软 404」——页面不存在却返回 200 + 空内容，会污染索引。本项目详情页 `if (!drama) notFound()` 正确返回 404。

---

## 8. Core Web Vitals（排名因素，性能）⭐⭐⭐

Google 排名直接看的三个指标（规范要求）：

| 指标 | 含义 | 目标 | 前端优化 |
|------|------|------|----------|
| **LCP** | 最大内容绘制（首屏大图/标题出现） | < 2.5s | 首屏图 preload + AVIF/WebP + CDN + SSR |
| **INP** | 交互到响应延迟（替代了 FID） | < 200ms | 减小 JS、避免长任务、防抖 |
| **CLS** | 累计布局偏移（加载时跳动） | < 0.1 | 图片/视频容器**预留宽高比**（`aspect-ratio`） |

### 本项目落地
- 图片 `next/image`（自动 srcset + WebP + lazy）。
- 卡片容器 `aspect-ratio: 2/3` 预留空间，杜绝 CLS。
- 首屏 banner 图 `priority`（不 lazy），下方 `loading="lazy"`。
- 重组件（Swiper 等）懒加载，控制首屏 JS → 保 INP。
- ISR/SSG + CDN 边缘缓存 → 保 LCP/TTFB。

> 面试题「LCP 怎么优化？」→ 服务端渲染首屏、首屏图 preload + 现代格式 + 合适尺寸 + CDN、字体优化（font-display、preload）、减少阻塞资源。

---

## 9. 多语言内容本地化 ⭐
规范要求本地化：Title、Description、分类名、Tags 名、按钮文案。
- 本项目 `messages/*.json`（16 语言）+ next-intl。
- 中后台还支持「AI 简介重写」差异化内容，规避不同站点重复内容判定。

---

## 10. 其它要点

- **移动友好**：响应式（规范要求 Desktop/Tablet/Mobile），Google 移动优先索引。
- **内链 & 信息架构**：分类页/详情页/相关推荐互相链接，帮爬虫发现深层页 + 传递权重。本项目详情页有「相关推荐」、列表页有分类导航。
- **图片 SEO**：`alt` 描述性文本、文件名语义化、懒加载、尺寸优化。
- **避免重复内容**：canonical + hreflang + 唯一 URL + 内容差异化。

---

## 11. 本项目 SEO 落地清单（上线验收，可背）

规范的上线 checklist，全过才能上线：
- [ ] robots.txt 正确（屏蔽 api/admin）
- [ ] sitemap.xml（只含 published+200+indexable，分片 ≤1万）
- [ ] Canonical 自指向（含分页、带参页指向无参版）
- [ ] Hreflang 双向 + 全 200 + x-default
- [ ] Schema 按页面类型输出，空/错字段不输出
- [ ] 状态码（404/410 正确，无软 404）
- [ ] Core Web Vitals 达标（LCP<2.5s / INP<200ms / CLS<0.1）
- [ ] Search Console 验证 + GA4 埋点
- [ ] 多语言切换正常
- [ ] URL 规范（小写、`{slug}-{id}`、无非法字符）
- [ ] SSR 输出 Title/Description/正文

---

## 12. 面试 Q&A 速答

**Q1：SPA / CSR 为什么 SEO 差，怎么解决？**
A：CSR 首屏是空壳，爬虫（尤其非 Google 的）抓不到内容。解决：SSR/SSG/ISR、预渲染、动态渲染、迁 Next/Nuxt。

**Q2：canonical 作用？分页该怎么设？**
A：告诉搜索引擎页面的「权威 URL」，解决重复内容/参数页判重。分页应**自指向**，不指向第一页，否则深层内容不收录。

**Q3：hreflang 怎么配？常见错误？**
A：每语言版本互相 alternate 引用 + x-default，必须双向、目标 200。常见错：单向引用、指向 301/404、canonical 错指主语言。

**Q4：SSR / SSG / ISR 对 SEO 分别什么意义？**
A：都输出可抓取 HTML。SSG/ISR 还更快（CWV 更好）。ISR 兼顾「快」和「内容可更新」，是内容站首选。

**Q5：Core Web Vitals 是哪三个，怎么优化？**
A：LCP（首屏图 preload/现代格式/CDN/SSR）、INP（减 JS/避免长任务）、CLS（预留宽高比）。

**Q6：软 404 是什么？**
A：页面不存在却返回 200 + 空/错误内容，污染索引。要正确返回 404（Next 用 `notFound()`）。

**Q7：sitemap 注意什么？**
A：只收可索引的 200 页面、≤1万分片、及时同步、不含下架/草稿/参数页。

**Q8：URL 设计原则？**
A：语义化 slug、小写、短、稳定（不随标题变）、路径式优于 query、含关键词。

**Q9：结构化数据有什么用？**
A：帮搜索引擎理解内容类型、出富媒体结果（视频卡/评分/面包屑），提升点击率。视频站用 VideoObject。

**Q10：怎么验证 SEO 做对了？**
A：`curl` 看 SSR HTML、Search Console（覆盖率/抓取）、Rich Results Test（Schema）、Lighthouse/PageSpeed（CWV）、hreflang 测试工具。

---

## 13. 一句话升华（面试结尾）

> 「SEO 工程化的本质是：让搜索引擎『能抓到、能读懂、能判定唯一、加载够快』。前端的抓手是渲染方式（SSR/SSG/ISR 保可抓取）、URL 与 canonical/hreflang（保唯一与多语言）、结构化数据（保可读懂）、Core Web Vitals（保排名）。这个短剧出海项目就是围绕这四点做的全套落地。」
