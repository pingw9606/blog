---
---
# 阶段三：高级 RAG、记忆与可观测

> 本阶段导读
>
> 阶段一、二我们打通了 Agent 的基本骨架与工程化后端。但真正落地「企业级知识库 Agent」时，你会遇到三类硬骨头：
>
> 1. **检索质量不够**：单一向量检索召回率低、关键词命中差。本阶段用「混合检索 + 重排模型（rerank）」把召回质量拉满（第 27 节），再用「知识图谱 + Graph RAG」解决多跳推理（第 28 节）。
> 2. **黑盒难调试**：Agent 跑错了不知道哪一步出问题、RAG 改了 prompt 不知道效果是涨是跌。本阶段用 LangSmith 做全链路追踪与离线评估（第 29 节）。
> 3. **没有记忆、不够"深度"**：本阶段引入 DeepAgents 框架（第 30、31 节）做多 Agent 深度调研，再系统讲清记忆体系——PostgreSQL/pgvector 做长期向量存储（第 32 节）、Redis 做短期会话记忆（第 33 节）、Mem0 做分层长期记忆（第 34 节）。
>
> 学完本阶段，你的知识库 Agent 将具备：高召回检索、可量化评估、可观测调试、可记忆用户偏好的完整能力。所有示例都用 TypeScript / Node.js，OpenAI 兼容 API，环境变量统一从 `process.env` 读取。

---

## 27. 混合检索 RAG：多路召回 + 重排模型

### 学习目标

- 理解为什么「纯向量检索」在生产环境会翻车，明白 BM25 关键词检索与稠密向量检索各自的长短。
- 掌握「混合检索（Hybrid Search）」的工程实现：多路召回 + 融合排序（RRF）。
- 接入重排模型（Reranker），用 Cross-Encoder 对候选文档做精排。
- 在 TypeScript 中用 ElasticSearch + Milvus + rerank API 拼出一条完整的混合检索链路。

### 核心概念讲解

**为什么单一检索不够？**

向量检索（dense retrieval）擅长「语义相似」，比如「怎么退款」能召回「退货流程说明」。但它有两个软肋：

- 对**专有名词、型号、编号、缩写**不敏感。用户搜 "ERR_2048"，向量模型可能把它和一堆"错误处理"的泛泛文档拉近，反而漏掉那篇正好讲 ERR_2048 的文档。
- 召回结果的相对顺序不可靠。向量相似度（cosine）只是粗排，Top-1 不一定是最该用的。

关键词检索（sparse retrieval，典型是 BM25）正好相反：它对精确 term 命中极强，但完全不懂语义同义改写。

**混合检索 = 两路都召回，再融合。** 工程上最常用、最稳的融合算法是 **RRF（Reciprocal Rank Fusion，倒数排名融合）**：

```
score(doc) = Σ_over_each_retriever  1 / (k + rank_i(doc))
```

其中 `rank_i` 是该文档在第 i 路召回里的排名（从 1 开始），`k` 是平滑常数（业界默认 60）。RRF 的好处是**不依赖各路分数的量纲**——向量的 cosine 和 BM25 的 tf-idf 分数压根不在一个尺度，直接加权相加会出问题，而 RRF 只看排名，天然对齐。

**重排模型（Reranker）是最后一道精排。** 召回阶段（向量/BM25）都是「双塔」结构：query 和 doc 分别编码，算相似度，快但粗。Reranker 是「交叉编码器（Cross-Encoder）」：把 query 和 doc **拼在一起**喂给模型，让注意力充分交互，输出一个精准的相关性分数。它慢（不能对全库算），但准——所以标准做法是：

```
召回 100 条（快，混合） → rerank 精排取 Top 5（准，喂给 LLM）
```

这套「召回-排序」两阶段架构，是所有生产级 RAG 的标配。

### 关键代码

先装依赖（沿用阶段二的 ElasticSearch、Milvus）：

```bash
npm i @elastic/elasticsearch @zilliz/milvus2-sdk-node openai
```

环境变量：

```bash
# .env
OPENAI_API_KEY=sk-xxx
OPENAI_BASE_URL=https://api.openai.com/v1
EMBEDDING_MODEL=text-embedding-3-small
ES_NODE=http://localhost:9200
MILVUS_ADDRESS=localhost:19530
# 用兼容 OpenAI 协议的 rerank 服务（如 SiliconFlow / Jina / 本地 bge-reranker）
RERANK_BASE_URL=https://api.siliconflow.cn/v1
RERANK_API_KEY=sk-xxx
RERANK_MODEL=BAAI/bge-reranker-v2-m3
```

**第一步：两路召回。** 向量召回用 embedding + Milvus，关键词召回用 ES 的 BM25。

```ts
// retrievers.ts
import { Client as ESClient } from "@elastic/elasticsearch";
import { MilvusClient } from "@zilliz/milvus2-sdk-node";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_BASE_URL,
});

const es = new ESClient({ node: process.env.ES_NODE! });
const milvus = new MilvusClient({ address: process.env.MILVUS_ADDRESS! });

const COLLECTION = "kb_chunks";
const ES_INDEX = "kb_chunks";

export interface Hit {
  id: string;
  text: string;
}

// 把文本转成向量
async function embed(text: string): Promise<number[]> {
  const res = await openai.embeddings.create({
    model: process.env.EMBEDDING_MODEL!,
    input: text,
  });
  return res.data[0].embedding;
}

// 向量召回（稠密）
export async function denseRecall(query: string, topK = 50): Promise<Hit[]> {
  const vector = await embed(query);
  const res = await milvus.search({
    collection_name: COLLECTION,
    data: [vector],
    limit: topK,
    output_fields: ["id", "text"],
  });
  return res.results.map((r: any) => ({ id: String(r.id), text: r.text }));
}

// 关键词召回（稀疏 / BM25）
export async function sparseRecall(query: string, topK = 50): Promise<Hit[]> {
  const res = await es.search({
    index: ES_INDEX,
    size: topK,
    query: {
      match: { text: query }, // ES 默认 BM25 打分
    },
  });
  return res.hits.hits.map((h: any) => ({
    id: h._id,
    text: h._source.text,
  }));
}
```

**第二步：RRF 融合。**

```ts
// rrf.ts
import { Hit } from "./retrievers";

/**
 * Reciprocal Rank Fusion
 * @param rankedLists 多路召回结果（每路已按相关性排好序）
 * @param k 平滑常数，默认 60
 */
export function reciprocalRankFusion(
  rankedLists: Hit[][],
  k = 60,
): Hit[] {
  const scores = new Map<string, number>();
  const docs = new Map<string, Hit>();

  for (const list of rankedLists) {
    list.forEach((hit, idx) => {
      const rank = idx + 1; // rank starts at 1
      const prev = scores.get(hit.id) ?? 0;
      scores.set(hit.id, prev + 1 / (k + rank));
      docs.set(hit.id, hit);
    });
  }

  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => docs.get(id)!);
}
```

**第三步：重排（Cross-Encoder rerank）。** 多数 rerank 服务用一个简单的 HTTP 协议：

```ts
// rerank.ts
import { Hit } from "./retrievers";

interface RerankResult {
  index: number;
  relevance_score: number;
}

export async function rerank(
  query: string,
  hits: Hit[],
  topN = 5,
): Promise<Hit[]> {
  const res = await fetch(`${process.env.RERANK_BASE_URL}/rerank`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.RERANK_API_KEY}`,
    },
    body: JSON.stringify({
      model: process.env.RERANK_MODEL,
      query,
      documents: hits.map((h) => h.text),
      top_n: topN,
    }),
  });

  const data = (await res.json()) as { results: RerankResult[] };
  // results 已按 relevance_score 降序返回
  return data.results.map((r) => hits[r.index]);
}
```

**第四步：串成完整的混合检索管线。**

```ts
// hybridSearch.ts
import { denseRecall, sparseRecall, Hit } from "./retrievers";
import { reciprocalRankFusion } from "./rrf";
import { rerank } from "./rerank";

export async function hybridSearch(
  query: string,
  finalK = 5,
): Promise<Hit[]> {
  // 1. 两路并行召回
  const [dense, sparse] = await Promise.all([
    denseRecall(query, 50),
    sparseRecall(query, 50),
  ]);

  // 2. RRF 融合，去重并按融合分排序
  const fused = reciprocalRankFusion([dense, sparse]);

  // 3. 取融合后的 Top 30 送 rerank 精排（rerank 慢，别全送）
  const candidates = fused.slice(0, 30);
  const reranked = await rerank(query, candidates, finalK);

  return reranked;
}

// 用法
// const docs = await hybridSearch("怎么处理 ERR_2048 错误");
// const context = docs.map((d) => d.text).join("

");
// 然后把 context 拼进 prompt 喂给 LLM
```

### 动手步骤

1. 沿用阶段二导入到 Milvus 和 ES 的同一批文档分块（chunk），确保两边的 `id` 能对齐——这是融合去重的前提。
2. 跑通 `denseRecall` 和 `sparseRecall`，分别打印结果，**直观对比**两路召回的差异：搜一个含编号/型号的 query，你会明显看到 BM25 命中更准。
3. 接入 `reciprocalRankFusion`，观察融合后排序的变化。
4. 申请一个 rerank 服务（SiliconFlow、Jina 都有 OpenAI 兼容接口，或本地用 Xinference 部署 `bge-reranker-v2-m3`），跑通 `rerank`。
5. 用 `hybridSearch` 替换阶段二里的单一检索，对比最终 LLM 回答质量。

### 小结 / 常见坑

- **召回数量要给够再 rerank**。召回阶段宁可多召（每路 50），rerank 阶段才收窄到 5。召回阶段就只取 5，等于把 rerank 的发挥空间堵死了。
- **RRF 的 k 别乱调**。60 是经过验证的默认值，除非有评估数据支撑，否则不要凭感觉改。
- **rerank 是有延迟成本的**，一次 rerank 30 条大概几百毫秒。候选数量和延迟要权衡，生产里常设 20~50。
- **别把 rerank 当召回用**。rerank 只能对已召回的候选打分，它无法"找回"两路都没召到的文档。所以召回阶段的覆盖率仍然是地基。
- chunk 切分质量决定上限。再好的检索也救不了切得稀碎或巨大的 chunk，回到阶段二把分块策略做扎实。

---

## 28. Neo4j 知识图谱和 Graph RAG

### 学习目标

- 搞懂向量 RAG 的天花板：为什么「多跳推理」「关系型问题」向量检索做不好。
- 理解知识图谱（实体-关系-实体三元组）和 Graph RAG 的核心思想。
- 用 Neo4j + Cypher 在 TypeScript 中建图、查图。
- 用 LLM 从非结构化文本中抽取三元组，自动构建知识图谱。
- 实现一个最小的 Graph RAG：把图查询结果作为上下文喂给 LLM。

### 核心概念讲解

**向量 RAG 的盲区在"关系"。** 假设知识库里有两句话：

- "张三是 A 项目的负责人。"
- "A 项目依赖 B 服务的鉴权模块。"

用户问："张三负责的项目依赖了哪些服务？" 向量检索会分别召回这两句，但它**不理解两句之间的关联**——它无法把"张三→A 项目→B 服务"这条链路串起来。这类需要**沿着关系多跳跳转**的问题，正是知识图谱的主场。

**知识图谱 = 节点 + 关系。** 一切知识被拆成三元组 `(主体, 关系, 客体)`：

```
(张三) -[负责]-> (A项目)
(A项目) -[依赖]-> (B服务)
```

节点（Node）是实体，边（Relationship）是关系，两者都能带属性。Neo4j 是最主流的图数据库，查询语言叫 **Cypher**，语法非常直观——它用 ASCII 画图：`(节点)-[关系]->(节点)`。

**Graph RAG 的流程：**

1. **建图**：用 LLM 从文档抽取三元组，写入 Neo4j。
2. **检索**：用户提问时，先识别问题里的实体，再用 Cypher 沿关系遍历，把相关子图捞出来。
3. **生成**：把子图（一堆三元组）转成文本，连同原始文档一起作为上下文喂给 LLM。

生产里常把 Graph RAG 和向量 RAG **结合**：向量负责"找到相关段落"，图负责"补全实体间的关系"。

### 关键代码

装依赖与起 Neo4j：

```bash
npm i neo4j-driver openai
# 用 Docker 起一个 Neo4j
docker run -d --name neo4j \
  -p 7474:7474 -p 7687:7687 \
  -e NEO4J_AUTH=neo4j/test1234 \
  neo4j:5
```

```bash
# .env 追加
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=test1234
LLM_MODEL=gpt-4o-mini
```

**第一步：封装 Neo4j 连接与写入。**

```ts
// graph.ts
import neo4j, { Driver } from "neo4j-driver";

const driver: Driver = neo4j.driver(
  process.env.NEO4J_URI!,
  neo4j.auth.basic(process.env.NEO4J_USER!, process.env.NEO4J_PASSWORD!),
);

export interface Triple {
  subject: string;
  relation: string;
  object: string;
}

// 写入一条三元组：MERGE 保证节点/关系不重复创建
export async function upsertTriple(t: Triple): Promise<void> {
  const session = driver.session();
  try {
    // 注意：关系类型不能直接参数化，这里对 relation 做白名单/清洗后拼接
    const rel = t.relation.replace(/[^A-Z_\u4e00-\u9fa5]/gi, "_").toUpperCase();
    await session.run(
      `
      MERGE (s:Entity {name: $subject})
      MERGE (o:Entity {name: $object})
      MERGE (s)-[r:${rel}]->(o)
      `,
      { subject: t.subject, object: t.object },
    );
  } finally {
    await session.close();
  }
}

export { driver };
```

**第二步：用 LLM 抽取三元组。** 让模型输出结构化 JSON。

```ts
// extract.ts
import OpenAI from "openai";
import { Triple } from "./graph";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_BASE_URL,
});

export async function extractTriples(text: string): Promise<Triple[]> {
  const res = await openai.chat.completions.create({
    model: process.env.LLM_MODEL!,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "你是知识图谱抽取器。从文本中抽取实体关系三元组，" +
          '以 JSON 返回：{"triples":[{"subject":"","relation":"","object":""}]}。' +
          "relation 用简短的动词或名词，如 负责、依赖、属于。",
      },
      { role: "user", content: text },
    ],
  });

  const json = JSON.parse(res.choices[0].message.content ?? "{}");
  return (json.triples ?? []) as Triple[];
}
```

**第三步：查询子图（沿关系遍历）。** 给定一个实体，捞出它周围 N 跳的关系。

```ts
// query.ts
import { driver, Triple } from "./graph";

// 查询某实体 1~2 跳内的所有关系
export async function queryNeighborhood(
  entity: string,
  hops = 2,
): Promise<Triple[]> {
  const session = driver.session();
  try {
    const result = await session.run(
      `
      MATCH path = (s:Entity {name: $entity})-[*1..${hops}]-(o:Entity)
      UNWIND relationships(path) AS r
      RETURN DISTINCT
        startNode(r).name AS subject,
        type(r)           AS relation,
        endNode(r).name   AS object
      `,
      { entity },
    );
    return result.records.map((rec) => ({
      subject: rec.get("subject"),
      relation: rec.get("relation"),
      object: rec.get("object"),
    }));
  } finally {
    await session.close();
  }
}
```

**第四步：组装 Graph RAG。**

```ts
// graphRag.ts
import OpenAI from "openai";
import { extractTriples } from "./extract";
import { upsertTriple } from "./graph";
import { queryNeighborhood } from "./query";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_BASE_URL,
});

// 离线：构建图谱
export async function ingest(docs: string[]): Promise<void> {
  for (const doc of docs) {
    const triples = await extractTriples(doc);
    for (const t of triples) await upsertTriple(t);
  }
}

// 在线：从问题里抽实体（简化版：直接让 LLM 抽），再查图、再生成
export async function graphRagAnswer(question: string): Promise<string> {
  const entities = await extractEntities(question);

  const tripleSet = new Set<string>();
  for (const e of entities) {
    const triples = await queryNeighborhood(e, 2);
    triples.forEach((t) =>
      tripleSet.add(`${t.subject} -[${t.relation}]-> ${t.object}`),
    );
  }
  const context = [...tripleSet].join("
");

  const res = await openai.chat.completions.create({
    model: process.env.LLM_MODEL!,
    messages: [
      {
        role: "system",
        content: "根据以下知识图谱关系回答问题，只用提供的事实：
" + context,
      },
      { role: "user", content: question },
    ],
  });
  return res.choices[0].message.content ?? "";
}

async function extractEntities(question: string): Promise<string[]> {
  const res = await openai.chat.completions.create({
    model: process.env.LLM_MODEL!,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: '抽取问题中的实体名，返回 {"entities":["",""]}',
      },
      { role: "user", content: question },
    ],
  });
  const json = JSON.parse(res.choices[0].message.content ?? "{}");
  return json.entities ?? [];
}
```

### 动手步骤

1. Docker 起 Neo4j，浏览器打开 `http://localhost:7474` 用账号密码登录，能看到可视化界面。
2. 准备几段含明确关系的文本（如团队/项目/服务的描述），跑 `ingest` 建图。
3. 在 Neo4j Browser 里执行 `MATCH (n) RETURN n LIMIT 50` 看看抽出来的图长什么样。
4. 跑 `graphRagAnswer("张三负责的项目依赖了哪些服务？")`，验证多跳推理。
5. 进阶：把 Graph RAG 和第 27 节的混合检索结果拼在一起喂 LLM，体会"段落 + 关系"双重上下文的效果。

### 小结 / 常见坑

- **Cypher 的关系类型（`:REL`）不能用参数占位**，只能拼接字符串。务必对 relation 做清洗/白名单，否则有 Cypher 注入风险（代码里 `replace` 那行就是干这个的）。
- **MERGE 而不是 CREATE**。CREATE 会重复建节点，MERGE 才能保证实体唯一（按 name 去重），生产里通常还要给 `Entity.name` 建唯一约束：`CREATE CONSTRAINT FOR (e:Entity) REQUIRE e.name IS UNIQUE`。
- **实体对齐是大坑**。"张三""张三同学""Mr. Zhang"会被抽成三个不同节点。生产里需要做实体归一（normalize），可以在抽取 prompt 里要求统一称呼，或事后做相似度合并。
- **不要指望纯 Graph RAG 取代向量 RAG**。图擅长关系，但丢失了原文细节。二者互补，别二选一。
- LLM 抽取三元组会有噪声和幻觉，关键场景需要人工审核或加抽取置信度过滤。

---

## 29. LangSmith 全链路观测：从 Agent 调试到 RAG 量化评估

### 学习目标

- 理解为什么 Agent/RAG 应用必须有可观测性（observability），日志不够用。
- 用 LangSmith 给 LangChain/LangGraph 应用一键开启 tracing，看清每一步的输入输出、耗时、token 消耗。
- 给非 LangChain 代码（如裸 OpenAI SDK 调用）用 `traceable` 手动埋点。
- 用 LangSmith Datasets + Evaluators 做 RAG/Agent 的**离线量化评估**：改了 prompt 到底变好还是变差，用分数说话。

### 核心概念讲解

**为什么 console.log 不够？** Agent 是多步的：检索 → 拼 prompt → LLM → 工具调用 → 再 LLM……一次请求可能套着十几次模型/工具调用。出问题时你要知道：是检索召回错了？还是 prompt 拼错了？还是 LLM 理解偏了？纯日志根本理不清这种**嵌套树状调用**。

LangSmith 把一次完整请求记录为一棵 **Trace（追踪树）**，每个节点是一个 **Run**（一次 LLM 调用、一次检索、一个工具）。你能看到每一步的：输入、输出、耗时、token 数、报错。这就是"可观测性"。

**两类核心能力：**

1. **Tracing（追踪/调试）**：线上/开发时看每次调用的全过程。LangChain 生态只要设几个环境变量就**自动**全量上报，零侵入。
2. **Evaluation（评估）**：把一批测试用例存成 **Dataset**，对你的应用跑一遍，用 **Evaluator**（可以是规则、也可以是 LLM-as-judge）给每条输出打分。这样改 prompt、换模型、调检索参数时，你能**量化对比**两个版本，而不是凭感觉。

对 RAG 来说，常用评估维度：**正确性（correctness）**、**忠实度（faithfulness，答案是否有据于检索内容、没幻觉）**、**相关性（检索是否召回了对的文档）**。

### 关键代码

```bash
npm i langsmith langchain @langchain/openai @langchain/core
```

**第一步：开启自动 tracing（LangChain 生态零侵入）。** 只需环境变量：

```bash
# .env
LANGSMITH_TRACING=true
LANGSMITH_API_KEY=ls-xxx
LANGSMITH_PROJECT=kb-agent          # 项目名，trace 会归到这个项目下
LANGSMITH_ENDPOINT=https://api.smith.langchain.com
OPENAI_API_KEY=sk-xxx
```

设好之后，任何 LangChain/LangGraph 调用都会自动上报，代码无需改动：

```ts
// autoTrace.ts
import "dotenv/config"; // 确保环境变量在 import 链路前加载
import { ChatOpenAI } from "@langchain/openai";

const model = new ChatOpenAI({ model: "gpt-4o-mini" });

async function main() {
  // 这次调用会自动出现在 LangSmith 的 kb-agent 项目里
  const res = await model.invoke("用一句话解释什么是 RAG");
  console.log(res.content);
}
main();
```

**第二步：给裸 OpenAI SDK 调用手动埋点。** 不是所有代码都走 LangChain，用 `traceable` 包一层即可：

```ts
// manualTrace.ts
import "dotenv/config";
import { traceable } from "langsmith/traceable";
import { wrapOpenAI } from "langsmith/wrappers";
import OpenAI from "openai";

// wrapOpenAI 让每次 openai 调用自动成为一个 Run
const openai = wrapOpenAI(
  new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: process.env.OPENAI_BASE_URL,
  }),
);

// 用 traceable 把整个 RAG 流程包成一个父 Run，子调用自动挂在它下面
const ragPipeline = traceable(
  async (question: string) => {
    // 这里假设 retrieve 也用 traceable 包过
    const context = await retrieve(question);
    const res = await openai.chat.completions.create({
      model: process.env.LLM_MODEL!,
      messages: [
        { role: "system", content: "基于上下文回答：
" + context },
        { role: "user", content: question },
      ],
    });
    return res.choices[0].message.content;
  },
  { name: "rag-pipeline", run_type: "chain" },
);

const retrieve = traceable(
  async (q: string) => {
    // ...你的混合检索逻辑（第 27 节）
    return "检索到的上下文文本";
  },
  { name: "retrieve", run_type: "retriever" },
);

// const answer = await ragPipeline("怎么退款？");
```

**第三步：离线评估。** 先建一个数据集，再写评估器，最后跑评估。

```ts
// evaluate.ts
import "dotenv/config";
import { Client } from "langsmith";
import { evaluate } from "langsmith/evaluation";
import { ragPipeline } from "./manualTrace"; // 你的被测应用

const client = new Client();

// 1. 创建数据集（只需一次，之后复用）
async function seedDataset() {
  const ds = await client.createDataset("kb-rag-eval", {
    description: "知识库问答评估集",
  });
  await client.createExamples({
    datasetId: ds.id,
    inputs: [
      { question: "怎么申请退款？" },
      { question: "ERR_2048 是什么错误？" },
    ],
    outputs: [
      { answer: "在订单页点击退款，3-5 个工作日到账。" },
      { answer: "ERR_2048 表示鉴权 token 过期。" },
    ],
  });
}

// 2. 定义评估器：用 LLM 当裁判判断答案正确性
import OpenAI from "openai";
const judge = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_BASE_URL,
});

async function correctness({ run, example }: any) {
  const res = await judge.chat.completions.create({
    model: process.env.LLM_MODEL!,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          '判断"实际答案"是否与"参考答案"语义一致，返回 {"score":0或1,"reason":""}',
      },
      {
        role: "user",
        content:
          `问题：${example.inputs.question}
` +
          `参考答案：${example.outputs.answer}
` +
          `实际答案：${run.outputs.output}`,
      },
    ],
  });
  const { score, reason } = JSON.parse(res.choices[0].message.content ?? "{}");
  return { key: "correctness", score, comment: reason };
}

// 3. 跑评估
async function runEval() {
  await evaluate(
    (input: { question: string }) => ragPipeline(input.question),
    {
      data: "kb-rag-eval",
      evaluators: [correctness],
      experimentPrefix: "hybrid-v1", // 给本次实验起名，方便和下次对比
    },
  );
}

// seedDataset().then(runEval);
```

跑完后在 LangSmith 网页的 Datasets & Experiments 里，能看到每个实验的平均分。你改完检索策略再跑一次（换个 `experimentPrefix`），两列分数一对比，提升与否一目了然。

### 动手步骤

1. 注册 [smith.langchain.com](https://smith.langchain.com)，拿到 `LANGSMITH_API_KEY`。
2. 配好环境变量，跑 `autoTrace.ts`，去网页 Projects → kb-agent 里看那条 trace。
3. 把第 27 节的 `hybridSearch` 和 LLM 调用用 `traceable` / `wrapOpenAI` 包起来，跑一次完整 RAG，观察追踪树的层级。
4. 建一个 10~20 条的评估集（真实业务问题），写 `correctness` + `faithfulness` 两个评估器。
5. 跑评估，记下基线分数。然后改一个变量（如召回数量、rerank topN），重跑，对比分数——这就是数据驱动调优。

### 小结 / 常见坑

- **环境变量要在任何 LangChain import 之前加载**（用 `import "dotenv/config"` 放最顶，或用 `-r dotenv/config` 启动）。否则 tracing 不生效，这是最常见的"为什么没数据"。
- 注意是 `LANGSMITH_TRACING=true`（新版变量名）。老教程里的 `LANGCHAIN_TRACING_V2` 仍兼容，但建议用新名。
- **LLM-as-judge 不是绝对真理**。裁判模型也会错，评估集要定期人工抽检，并且裁判最好用比被测更强的模型。
- **评估集要覆盖边界 case**：长尾问题、需要拒答的问题、多跳问题。只测简单问题，分数虚高没意义。
- tracing 会上报输入输出，**注意脱敏**。生产环境涉及用户隐私时，配置数据脱敏规则或自建 LangSmith。
- 评估有成本（裁判要调 LLM），别在 CI 里每次提交都跑全量，挑关键节点跑。

---

## 30. DeepAgents：开箱即用的 skill、上下文压缩等 middleware

### 学习目标

- 理解什么是「Deep Agent（深度智能体）」，它和普通 ReAct Agent 的区别在哪。
- 认识 DeepAgents 框架的四大支柱：规划（planning）、子代理（sub-agents）、文件系统（virtual filesystem）、中间件（middleware）。
- 在 TypeScript 中用 `deepagents` 包创建一个带工具的 Deep Agent。
- 用内置 middleware：上下文压缩（summarization）、skill、planning todo。

### 核心概念讲解

**普通 Agent 的"短"在哪？** 阶段一的 ReAct Agent 是"想一步做一步"，没有全局规划、上下文一长就爆、复杂任务做着做着就跑偏。处理"写一份调研报告"这种需要几十步、跨越很长上下文的任务时，它撑不住。

**Deep Agent 的四个关键设计**（源自 Claude Code、Manus 这类产品的工程经验，被 LangChain 团队抽象成 `deepagents` 框架）：

1. **详细的系统 prompt + 规划工具（planning / todo）**：Agent 先把任务拆成 todo 列表，边做边更新，避免迷失。
2. **子代理（sub-agents）**：把子任务派给独立的子 Agent，子 Agent 有自己干净的上下文，做完只把结果汇报回来——这就是**上下文隔离**，避免主上下文被中间过程污染。
3. **虚拟文件系统（virtual filesystem）**：Agent 把中间产物（草稿、检索结果）写进一个虚拟文件系统（state 里的一个对象），需要时再读，而不是全塞进对话历史。这是**对抗上下文爆炸**的核心手段。
4. **中间件（middleware）**：DeepAgents 构建在 LangGraph 之上，用 middleware 机制插入能力，比如**上下文压缩（summarization middleware）**——当历史超过阈值，自动把旧消息总结压缩；**skill**——把一组能力/指令封装成可复用的技能。

一句话：Deep Agent = ReAct + 规划 + 子代理隔离 + 文件系统 + 可插拔中间件，专为**长程复杂任务**设计。

### 关键代码

```bash
npm i deepagents @langchain/anthropic @langchain/openai @langchain/core zod
```

```bash
# .env
OPENAI_API_KEY=sk-xxx
OPENAI_BASE_URL=https://api.openai.com/v1
TAVILY_API_KEY=tvly-xxx   # 联网搜索工具用
```

**最小示例：一个带搜索工具的 Deep Agent。**

```ts
// deepAgent.ts
import "dotenv/config";
import { createDeepAgent } from "deepagents";
import { ChatOpenAI } from "@langchain/openai";
import { tool } from "@langchain/core/tools";
import { z } from "zod";

// 自定义工具：联网搜索（这里用 Tavily 的 REST 接口示意）
const webSearch = tool(
  async ({ query }: { query: string }) => {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: process.env.TAVILY_API_KEY,
        query,
        max_results: 5,
      }),
    });
    const data = await res.json();
    return JSON.stringify(data.results ?? []);
  },
  {
    name: "web_search",
    description: "搜索互联网获取最新信息",
    schema: z.object({ query: z.string().describe("搜索关键词") }),
  },
);

const model = new ChatOpenAI({ model: "gpt-4o" });

// 创建 Deep Agent：自动带上 planning(todo)、virtual filesystem 工具
const agent = createDeepAgent({
  model,
  tools: [webSearch],
  systemPrompt:
    "你是一个严谨的调研助手。先用 write_todos 规划步骤，" +
    "把检索到的材料用文件系统工具存好，最后汇总成结论。",
});

async function main() {
  const result = await agent.invoke({
    messages: [{ role: "user", content: "调研 2025 年向量数据库的主流选型" }],
  });
  // 最终回答在最后一条 message
  console.log(result.messages.at(-1)?.content);
}
main();
```

**开启上下文压缩 middleware。** 长任务里历史会膨胀，用 summarization middleware 自动压缩：

```ts
// withSummarization.ts
import { createDeepAgent } from "deepagents";
import { summarizationMiddleware } from "langchain"; // middleware 来自 langchain 包
import { ChatOpenAI } from "@langchain/openai";

const model = new ChatOpenAI({ model: "gpt-4o" });

const agent = createDeepAgent({
  model,
  tools: [/* ... */],
  middleware: [
    summarizationMiddleware({
      model: new ChatOpenAI({ model: "gpt-4o-mini" }), // 用便宜模型做压缩
      maxTokensBeforeSummary: 8000, // 历史超过 8k token 触发压缩
      messagesToKeep: 6,            // 保留最近 6 条原文，其余压成摘要
    }),
  ],
});
```

**用 skill 封装可复用能力。** skill 把"一组指令 + 工具"打包，让 Agent 在合适时机调用：

```ts
// withSkill.ts
import { createDeepAgent } from "deepagents";

const agent = createDeepAgent({
  model,
  tools: [/* ... */],
  // skills：每个 skill 有名字、描述、详细指令。Agent 按需"加载"对应指令，
  // 避免把所有规则一股脑塞进系统 prompt（节省上下文）。
  skills: [
    {
      name: "rag-citation",
      description: "需要引用知识库并标注来源时使用",
      instructions:
        "回答时每个事实后用 [来源:文件名] 标注。" +
        "先调用 web_search 或知识库检索，再组织答案。",
    },
  ],
});
```

### 动手步骤

1. 装 `deepagents`，跑通最小示例，观察它**自动生成的 todo 列表**（在 trace 或返回的 messages 里能看到 `write_todos` 调用）。
2. 配合第 29 节的 LangSmith，给这个 Deep Agent 开 tracing，直观看它的规划→执行→文件读写全过程。
3. 加上 `summarizationMiddleware`，给它一个需要多轮搜索的任务，观察历史被压缩的时机。
4. 写一个 skill（比如"知识库引用规范"），验证 Agent 会在需要时遵循 skill 指令。

### 小结 / 常见坑

- DeepAgents 的 API 仍在快速演进，**以你安装版本的官方 README/类型定义为准**（`node_modules/deepagents` 里看导出）。本文示例展示的是稳定的核心心智模型，个别函数名可能随版本微调。
- **文件系统是虚拟的**，默认存在 Agent 的 state（内存）里，不是真实磁盘。要持久化需配 store/checkpointer（见下节）。
- summarization 是把双刃剑：压缩省 token，但也可能丢失关键细节。`messagesToKeep` 别设太小。
- Deep Agent 适合**长程复杂任务**，简单问答用它是杀鸡用牛刀，反而慢且贵。

---

## 31. DeepAgents 实战：多 Agent 架构的深度调研助手

### 学习目标

- 用 sub-agents 搭一个「主管 + 专员」的多 Agent 架构。
- 理解子代理的上下文隔离如何让长程调研任务稳定不跑偏。
- 把第 27 节的知识库检索接入，做成「企业内部深度调研助手」的雏形。

### 核心概念讲解

**为什么要多 Agent？** 一个 Agent 干所有事，上下文会被各种中间过程塞满，越到后面越糊涂。多 Agent 架构借鉴公司组织：

- **主管 Agent（orchestrator）**：只负责拆任务、派活、汇总。它的上下文干净，只看到"子任务 → 子任务结果"。
- **子代理（sub-agent）**：每个专注一个子任务（如"检索内部知识库""联网查最新进展""核对数据"），有**独立的上下文窗口**，做完把精炼结果交回主管。

这种隔离的关键价值：子代理探索过程中产生的几十条中间消息**不会污染主管的上下文**，主管只拿到结论。这就是 Deep Agent 能稳定处理长任务的核心机密。

### 关键代码

DeepAgents 通过 `subagents` 配置声明子代理，框架会自动给主 Agent 加一个 `task` 工具，让它能把活派给子代理。

```ts
// researchAgent.ts
import "dotenv/config";
import { createDeepAgent } from "deepagents";
import { ChatOpenAI } from "@langchain/openai";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { hybridSearch } from "./hybridSearch"; // 第 27 节

const model = new ChatOpenAI({ model: "gpt-4o" });

// 工具 A：企业内部知识库检索（混合检索）
const kbSearch = tool(
  async ({ query }: { query: string }) => {
    const docs = await hybridSearch(query, 5);
    return docs.map((d) => d.text).join("
---
");
  },
  {
    name: "kb_search",
    description: "检索企业内部知识库",
    schema: z.object({ query: z.string() }),
  },
);

// 工具 B：联网搜索
const webSearch = tool(
  async ({ query }: { query: string }) => {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: process.env.TAVILY_API_KEY,
        query,
        max_results: 5,
      }),
    });
    return JSON.stringify((await res.json()).results ?? []);
  },
  {
    name: "web_search",
    description: "搜索互联网最新信息",
    schema: z.object({ query: z.string() }),
  },
);

const agent = createDeepAgent({
  model,
  tools: [kbSearch, webSearch],
  systemPrompt:
    "你是深度调研主管。把复杂调研拆成子任务，用 task 工具派给子代理，" +
    "最后整合所有子代理的结论，写成结构化报告（含要点和来源）。",
  // 声明两个专员子代理
  subagents: [
    {
      name: "internal-researcher",
      description: "负责检索企业内部知识库，回答涉及内部资料的子问题",
      systemPrompt: "你专注内部知识库检索，只用 kb_search，给出有据可查的结论。",
      tools: [kbSearch],
    },
    {
      name: "web-researcher",
      description: "负责联网调研外部最新信息",
      systemPrompt: "你专注联网调研，用 web_search 找权威来源并标注链接。",
      tools: [webSearch],
    },
  ],
});

async function main() {
  const result = await agent.invoke({
    messages: [
      {
        role: "user",
        content:
          "调研：我们公司现有的向量检索方案，与业界 2025 年主流方案相比有哪些差距？给出升级建议。",
      },
    ],
  });
  console.log(result.messages.at(-1)?.content);
}
main();
```

整个流程会是：主管先 `write_todos` 规划 → 用 `task` 派"查内部现状"给 `internal-researcher` → 派"查业界进展"给 `web-researcher` → 两个子代理各自在隔离上下文里多轮检索 → 把结论交回 → 主管整合成报告。

### 动手步骤

1. 把第 27 节的 `hybridSearch` 接进来（确保知识库已灌数据）。
2. 跑这个调研 Agent，开 LangSmith tracing，观察 `task` 工具的调用——你会看到子代理是**独立的子 trace**。
3. 对比：把 subagents 去掉、让单个 Agent 用所有工具做同样任务，感受上下文混乱程度和最终质量的差异。
4. 加 `summarizationMiddleware`（第 30 节），让它能扛更长的调研。

### 小结 / 常见坑

- **子代理要职责单一**。一个子代理塞太多工具，等于没隔离。一个专员干一类活。
- **主管 prompt 要明确"先规划、再派活、最后整合"**，否则它可能自己上手干，不派给子代理。
- 多 Agent 调用层数深、token 消耗大、延迟高，**适合后台异步任务**（调研报告生成），不适合实时聊天。生产里用阶段二的队列异步跑。
- 子代理返回的内容是它的"最终结论"，所以子代理 prompt 要要求**输出精炼、带来源**，否则主管整合时质量打折。

---

## 32. PostgreSQL：AI 时代最适合的数据库（pgvector）

### 学习目标

- 理解为什么 PostgreSQL + pgvector 成为很多团队"一个数据库搞定 AI"的首选。
- 在 Postgres 中安装 pgvector、建带向量列的表、建向量索引（HNSW）。
- 在 TypeScript 中用 `pg` 写入 embedding、做向量相似度检索。
- 实现「向量检索 + 结构化过滤」一条 SQL 搞定的元数据过滤检索。

### 核心概念讲解

**为什么不直接上专用向量库？** Milvus、专用向量库性能强、规模大，但要多维护一个系统。对很多企业知识库（百万级以内的 chunk），**PostgreSQL + pgvector 扩展**就够了，而且带来巨大优势：

- **一库多用**：业务数据、用户数据、向量数据在同一个 Postgres 里，省去数据同步、跨库一致性的麻烦。
- **向量 + 关系联合查询**：可以在一条 SQL 里同时做"向量相似 + WHERE 过滤（按部门、时间、权限）"，这对企业知识库的**权限隔离/元数据过滤**极其关键。
- **事务、备份、运维**全部复用成熟的 Postgres 生态。

**pgvector 提供：**

- 一个 `vector` 数据类型，存固定维度的浮点数组。
- 距离运算符：`<->`（L2 欧氏距离）、`<#>`（负内积）、`<=>`（cosine 距离）。
- 两种索引：**IVFFlat** 和 **HNSW**。HNSW 召回质量和速度综合更好，是当前推荐默认。

注意：向量索引是**近似最近邻（ANN）**，用空间换召回近似。不建索引则是精确但慢的全表扫描。

### 关键代码

起带 pgvector 的 Postgres：

```bash
docker run -d --name pgvector \
  -p 5432:5432 \
  -e POSTGRES_PASSWORD=postgres \
  pgvector/pgvector:pg16
```

```bash
npm i pg openai
```

```bash
# .env
DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres
EMBEDDING_MODEL=text-embedding-3-small   # 输出 1536 维
```

**第一步：建扩展、建表、建索引（SQL）。**

```sql
-- schema.sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS kb_chunks (
  id        BIGSERIAL PRIMARY KEY,
  doc_id    TEXT NOT NULL,
  dept      TEXT,                 -- 用于权限/元数据过滤
  text      TEXT NOT NULL,
  embedding vector(1536)          -- 维度要和 embedding 模型对齐
);

-- HNSW 索引，cosine 距离。m / ef_construction 是建图参数
CREATE INDEX IF NOT EXISTS kb_chunks_embedding_idx
  ON kb_chunks
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- 普通字段也建索引，过滤更快
CREATE INDEX IF NOT EXISTS kb_chunks_dept_idx ON kb_chunks (dept);
```

**第二步：写入 embedding。**

```ts
// pgInsert.ts
import "dotenv/config";
import { Pool } from "pg";
import OpenAI from "openai";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_BASE_URL,
});

async function embed(text: string): Promise<number[]> {
  const res = await openai.embeddings.create({
    model: process.env.EMBEDDING_MODEL!,
    input: text,
  });
  return res.data[0].embedding;
}

export async function insertChunk(
  docId: string,
  dept: string,
  text: string,
): Promise<void> {
  const vec = await embed(text);
  // pgvector 接受 '[0.1,0.2,...]' 这种字符串字面量
  const vecLiteral = `[${vec.join(",")}]`;
  await pool.query(
    `INSERT INTO kb_chunks (doc_id, dept, text, embedding)
     VALUES ($1, $2, $3, $4::vector)`,
    [docId, dept, text, vecLiteral],
  );
}
```

**第三步：向量检索 + 元数据过滤（一条 SQL）。**

```ts
// pgSearch.ts
import "dotenv/config";
import { Pool } from "pg";
import OpenAI from "openai";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_BASE_URL,
});

export async function search(
  query: string,
  dept: string,        // 只检索该用户有权限的部门
  topK = 5,
) {
  const res = await openai.embeddings.create({
    model: process.env.EMBEDDING_MODEL!,
    input: query,
  });
  const vecLiteral = `[${res.data[0].embedding.join(",")}]`;

  // <=> 是 cosine 距离，越小越相似。这里同时按 dept 过滤
  const { rows } = await pool.query(
    `
    SELECT id, doc_id, text,
           1 - (embedding <=> $1::vector) AS similarity
    FROM kb_chunks
    WHERE dept = $2
    ORDER BY embedding <=> $1::vector
    LIMIT $3
    `,
    [vecLiteral, dept, topK],
  );
  return rows;
}

// const hits = await search("怎么报销差旅", "finance", 5);
```

### 动手步骤

1. Docker 起 `pgvector/pgvector`，用 `psql` 或任意客户端执行 `schema.sql`。
2. 跑 `insertChunk` 灌几十条带不同 `dept` 的数据。
3. 跑 `search`，验证：同样的 query，传不同 `dept` 会得到不同结果——这就是元数据过滤检索，企业知识库做权限隔离的关键。
4. 进阶：调 HNSW 的查询参数 `SET hnsw.ef_search = 100`（越大召回越准但越慢），观察召回变化。

### 小结 / 常见坑

- **embedding 维度必须和模型严格一致**。`text-embedding-3-small` 是 1536 维，换模型要改 `vector(N)` 并重灌数据。
- **HNSW 索引建好后，新插入数据会自动进索引**，但大批量初始化建议先灌数据再建索引，更快。
- `<=>` / `<->` / `<#>` 别用混。cosine 距离配 `vector_cosine_ops` 索引，内积配 `vector_ip_ops`，不匹配索引不生效。
- **过滤性强的 WHERE + 向量排序**有时会让 HNSW 索引失效（先过滤后排序）。数据量大且过滤很窄时，关注执行计划（`EXPLAIN ANALYZE`），必要时用 pgvector 的 iterative scan 或分区表。
- 向量字面量拼字符串要注意别有 `NaN`/`Infinity`，否则插入报错。

---

## 33. Redis：实现 Agent 短期记忆存储的最佳方案

### 学习目标

- 区分 Agent 的「短期记忆（会话/对话历史）」和「长期记忆」，明白各自该用什么存。
- 用 Redis 存储多轮对话历史，实现带 TTL 的会话记忆。
- 在 LangGraph 里用 Redis checkpointer 持久化 Agent 状态，实现"断线重连还能接着聊"。
- 理解滑动窗口 / 消息裁剪，控制喂给 LLM 的历史长度。

### 核心概念讲解

**短期记忆 = 当前会话的上下文。** 用户和 Agent 多轮对话，Agent 得记住前面说过什么。这部分数据特点是：**读写极频繁、有时效性、按 session 隔离**。Redis（内存 KV，毫秒级读写，原生支持 TTL 过期）天生适合。

为什么不用 Postgres 存对话历史？可以，但每轮对话都读写数据库，QPS 高时数据库压力大；而且会话本就是临时的，过期就该清掉。Redis 的 TTL 自动过期 + 内存速度，是短期记忆的最优解。

**两个层次：**

1. **应用层会话历史**：自己用 Redis 的 List/Hash 存 messages，简单直接。
2. **LangGraph checkpointer**：LangGraph Agent 的完整状态（消息、中间变量、todo）可以用 checkpointer 持久化到 Redis，按 `thread_id` 隔离。这样进程重启或分布式部署，Agent 都能恢复现场。

**历史不能无限长**：上下文窗口有限且贵。常用策略是**滑动窗口**（只保留最近 N 轮）或**token 裁剪**，更早的内容靠长期记忆（第 32、34 节）兜底。

### 关键代码

```bash
npm i ioredis
docker run -d --name redis -p 6379:6379 redis:7
```

```bash
# .env
REDIS_URL=redis://localhost:6379
```

**方案一：应用层会话历史（最直接）。** 用 Redis List 存每轮消息，配 TTL。

```ts
// sessionMemory.ts
import "dotenv/config";
import Redis from "ioredis";

const redis = new Redis(process.env.REDIS_URL!);

export interface Msg {
  role: "user" | "assistant";
  content: string;
}

const TTL_SECONDS = 60 * 60 * 24; // 会话保留 1 天
const MAX_TURNS = 20;             // 最多保留最近 20 条

function key(sessionId: string) {
  return `chat:history:${sessionId}`;
}

// 追加一条消息
export async function appendMessage(sessionId: string, msg: Msg) {
  const k = key(sessionId);
  await redis.rpush(k, JSON.stringify(msg));
  await redis.ltrim(k, -MAX_TURNS, -1); // 只保留最后 MAX_TURNS 条（滑动窗口）
  await redis.expire(k, TTL_SECONDS);   // 每次活动刷新过期时间
}

// 读取历史
export async function getHistory(sessionId: string): Promise<Msg[]> {
  const items = await redis.lrange(key(sessionId), 0, -1);
  return items.map((s) => JSON.parse(s) as Msg);
}
```

接到对话里：

```ts
// chat.ts
import OpenAI from "openai";
import { appendMessage, getHistory } from "./sessionMemory";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_BASE_URL,
});

export async function chat(sessionId: string, userInput: string) {
  await appendMessage(sessionId, { role: "user", content: userInput });
  const history = await getHistory(sessionId);

  const res = await openai.chat.completions.create({
    model: process.env.LLM_MODEL!,
    messages: [
      { role: "system", content: "你是企业知识库助手。" },
      ...history, // 带上滑动窗口内的历史
    ],
  });

  const answer = res.choices[0].message.content ?? "";
  await appendMessage(sessionId, { role: "assistant", content: answer });
  return answer;
}
```

**方案二：LangGraph Redis checkpointer（持久化 Agent 状态）。**

```bash
npm i @langchain/langgraph @langchain/langgraph-checkpoint-redis @langchain/openai
```

```ts
// graphWithRedis.ts
import "dotenv/config";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { RedisSaver } from "@langchain/langgraph-checkpoint-redis";
import { ChatOpenAI } from "@langchain/openai";

const model = new ChatOpenAI({ model: "gpt-4o-mini" });

// checkpointer 把每一步状态存进 Redis
const checkpointer = RedisSaver.fromUrl(process.env.REDIS_URL!);

const agent = createReactAgent({
  llm: model,
  tools: [],
  checkpointSaver: checkpointer,
});

async function main() {
  // thread_id 标识一个会话，同一个 thread_id 自动恢复历史
  const config = { configurable: { thread_id: "user-42" } };

  await agent.invoke(
    { messages: [{ role: "user", content: "我叫王五，记住。" }] },
    config,
  );

  // 即使进程重启，只要 thread_id 相同，下面这次仍记得"王五"
  const res = await agent.invoke(
    { messages: [{ role: "user", content: "我叫什么？" }] },
    config,
  );
  console.log(res.messages.at(-1)?.content); // 会答出"王五"
}
main();
```

### 动手步骤

1. Docker 起 Redis，跑方案一，连续多轮对话，验证 Agent 记得上文；用 `redis-cli` 看 `chat:history:*` 里的数据和 TTL。
2. 把 `MAX_TURNS` 改小（如 4），观察滑动窗口生效——更早的内容被丢弃。
3. 跑方案二，第一次告诉它名字，**重启进程**再问，验证 checkpointer 持久化生效。
4. 进阶：滑动窗口丢弃的旧消息，可在丢弃前用 LLM 总结成一句"摘要"另存，喂 prompt 时带上，做"短期记忆 + 摘要"混合。

### 小结 / 常见坑

- **务必按 session/thread 隔离 key**，否则不同用户对话串台，这是严重事故。
- **TTL 要在每次活动时刷新**（`expire`），否则活跃会话也会过期。
- 滑动窗口按"条数"裁剪简单但不精确，对话长短不一时更稳的是按 **token 数**裁剪（用 tokenizer 估算）。
- checkpointer 存的是完整状态，长期累积会占内存。给 Redis 配 `maxmemory` + 淘汰策略，或定期清理旧 thread。
- Redis 是内存库，**断电默认丢数据**。短期记忆丢了影响不大，但若用 checkpointer 存关键状态，需开 AOF 持久化或接受可丢失。

---

## 34. Mem0：分层记忆 + 三路召回的长期记忆方案

### 学习目标

- 理解"长期记忆"和"对话历史"的本质区别：长期记忆是**跨会话沉淀的事实/偏好**，不是原始聊天记录。
- 搞懂 Mem0 的核心机制：从对话中**自动抽取记忆**、分层（用户/会话/Agent）存储、检索时多路召回。
- 在 TypeScript 中用 `mem0ai` SDK 实现：写入记忆、检索记忆、把记忆接进 Agent 让它"越用越懂你"。
- 理解 Mem0 底层"向量 + 图 + 键值"三路召回的思想。

### 核心概念讲解

**对话历史 ≠ 长期记忆。** 第 33 节的 Redis 存的是原始多轮消息，会话结束就过期。但用户说过"我对花生过敏""我们公司用 TypeScript 不用 Python"这类**跨会话都该记住的事实/偏好**，应该沉淀为长期记忆，下次新开会话也能用上。

**直接把所有历史塞进 prompt 行不行？** 不行：贵、慢、且大量无关历史会干扰模型。正确做法是**抽取并结构化**：从对话里提炼出"值得长期记住的事实"，存起来，下次按需检索最相关的几条。这正是 Mem0 干的事。

**Mem0 的工作流：**

1. **写入（add）**：你把一段对话丢给 Mem0，它用 LLM **自动抽取**关键事实（"用户对花生过敏"），并和已有记忆比对——新增、更新还是忽略（去重/冲突消解）。
2. **分层存储**：记忆按 `user_id`（用户长期偏好）、`run_id`/`session`（单次任务）、`agent_id`（Agent 自身经验）分层隔离。
3. **检索（search）**：给一个 query，Mem0 做**多路召回**——向量检索（语义相似的记忆）、图检索（实体关系，如"用户-过敏-花生"）、再融合排序，返回最相关的几条记忆。这就是"三路召回"的来源（向量库 + 图存储 + 元数据/KV）。

接进 Agent 后，每轮：先 `search` 取相关记忆拼进 system prompt，对话结束后把新对话 `add` 进去。Agent 就有了跨会话的长期记忆。

### 关键代码

Mem0 有两种用法：托管云服务（`MemoryClient`，最省事）和自托管开源版（`Memory`，自己配向量库/LLM）。先看托管版：

```bash
npm i mem0ai
```

```bash
# .env
MEM0_API_KEY=m0-xxx          # 在 app.mem0.ai 申请
OPENAI_API_KEY=sk-xxx
OPENAI_BASE_URL=https://api.openai.com/v1
LLM_MODEL=gpt-4o-mini
```

**第一步：写入与检索记忆（托管云版）。**

```ts
// mem0Client.ts
import "dotenv/config";
import MemoryClient from "mem0ai";

const memory = new MemoryClient({ apiKey: process.env.MEM0_API_KEY! });

const USER_ID = "user-42";

// 写入：丢一段对话，Mem0 自动抽取该记的事实
export async function remember(messages: { role: string; content: string }[]) {
  const res = await memory.add(messages, { user_id: USER_ID });
  return res; // 返回它抽取/更新了哪些记忆
}

// 检索：按 query 取最相关的记忆
export async function recall(query: string) {
  const results = await memory.search(query, { user_id: USER_ID });
  // results: [{ memory: "用户对花生过敏", score: 0.9, ... }]
  return results;
}
```

**第二步：把长期记忆接进 Agent。**

```ts
// agentWithMemory.ts
import "dotenv/config";
import OpenAI from "openai";
import MemoryClient from "mem0ai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_BASE_URL,
});
const memory = new MemoryClient({ apiKey: process.env.MEM0_API_KEY! });

export async function chatWithMemory(userId: string, userInput: string) {
  // 1. 检索相关长期记忆
  const memories = await memory.search(userInput, { user_id: userId });
  const memoryText = memories.map((m) => `- ${m.memory}`).join("
");

  // 2. 把记忆拼进 system prompt
  const res = await openai.chat.completions.create({
    model: process.env.LLM_MODEL!,
    messages: [
      {
        role: "system",
        content:
          "你是个性化助手。以下是关于该用户的已知信息：
" +
          (memoryText || "(暂无)"),
      },
      { role: "user", content: userInput },
    ],
  });
  const answer = res.choices[0].message.content ?? "";

  // 3. 把这轮对话写回记忆，供以后使用
  await memory.add(
    [
      { role: "user", content: userInput },
      { role: "assistant", content: answer },
    ],
    { user_id: userId },
  );

  return answer;
}

// 第一次：chatWithMemory("user-42", "我对花生过敏，记一下")
// 隔几天新会话：chatWithMemory("user-42", "推荐个下午茶") → 它会避开花生
```

**第三步（可选）：自托管开源版**，记忆数据存在自己的基础设施（呼应前几节的 pgvector / Neo4j）。

```ts
// mem0SelfHosted.ts
import { Memory } from "mem0ai/oss";

const memory = new Memory({
  version: "v1.1",
  llm: {
    provider: "openai",
    config: { model: process.env.LLM_MODEL!, apiKey: process.env.OPENAI_API_KEY! },
  },
  embedder: {
    provider: "openai",
    config: { model: "text-embedding-3-small", apiKey: process.env.OPENAI_API_KEY! },
  },
  // 向量存储用 pgvector（第 32 节那套）
  vectorStore: {
    provider: "pgvector",
    config: {
      connectionString: process.env.DATABASE_URL!,
      collectionName: "mem0_memories",
      dimension: 1536,
    },
  },
  // 开启图记忆（Neo4j，第 28 节那套），实现关系型召回
  graphStore: {
    provider: "neo4j",
    config: {
      url: process.env.NEO4J_URI!,
      username: process.env.NEO4J_USER!,
      password: process.env.NEO4J_PASSWORD!,
    },
  },
});

// API 与托管版一致
// await memory.add(messages, { userId: "user-42" });
// const res = await memory.search("下午茶", { userId: "user-42" });
```

看这段配置就懂了：Mem0 的"三路召回"本质是 **vectorStore（语义）+ graphStore（关系）+ 元数据**的组合，正好把本阶段第 28、32 节的能力整合进一个记忆层。

### 动手步骤

1. 注册 [app.mem0.ai](https://app.mem0.ai) 拿 API Key，跑 `remember` 写入"我对花生过敏"，看返回里它抽取了什么记忆。
2. 跑 `recall("吃的")`，验证语义检索能召回过敏这条记忆（query 没出现"花生"也能召回）。
3. 跑 `chatWithMemory` 完整闭环：先告知偏好，再新开一轮问推荐，验证它记住了。
4. 进阶：用自托管版，把 vectorStore 指向第 32 节的 pgvector、graphStore 指向第 28 节的 Neo4j，做到记忆完全自主可控。

### 小结 / 常见坑

- **记忆是被抽取/改写过的，不是原文**。Mem0 存的是"用户对花生过敏"这种事实陈述，不是原始聊天记录。别指望用它做精确的对话回放（那是第 33 节短期记忆的活）。
- **user_id 隔离是命脉**。漏传或传错 user_id 会导致记忆串户，企业场景是隐私事故。
- **写入有 LLM 成本和延迟**（抽取要调模型）。高频对话别每轮都同步 add，可异步/批量写。
- **抽取会出错**，可能记错或漏记。关键事实建议提供显式接口让用户确认/修正记忆。
- 自托管版的 `embedder` 维度要和 vectorStore 的 `dimension` 对齐，和第 32 节一个道理。
- 长期记忆会随时间累积"过时信息"（用户偏好变了）。Mem0 的 update 机制会处理一部分冲突，但仍建议定期审视/清理。

---

> **本阶段回顾**：你已经把企业级知识库 Agent 的"检索质量、可观测性、记忆体系"三块硬骨头啃下来了——混合检索 + rerank 拉满召回，Graph RAG 解决多跳，LangSmith 让一切可追踪可量化，DeepAgents 撑起多 Agent 深度调研，pgvector/Redis/Mem0 组成短期 + 长期的完整记忆栈。下一阶段我们将深入更底层的原理与综合实战，把这些能力拼装成最终交付的项目。

---

⬅️ 上一节：[02-阶段二-工程化与后端.md](./02-阶段二-工程化与后端.md)　|　下一节 ➡️：[04-阶段四-进阶底层与综合实战.md](./04-阶段四-进阶底层与综合实战.md)
