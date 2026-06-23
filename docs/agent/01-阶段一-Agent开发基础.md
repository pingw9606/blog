---
---
# 阶段一：Agent 开发基础

> **本阶段导读**
>
> 这是「转型 AI Agent 全栈工程师」教程的第一阶段。你需要的前置知识只有：会写 TypeScript / Node.js，理解 `async/await` 和 npm 包管理。
>
> 本阶段的目标是把 LangChain.js 这套「Agent 开发地基」打牢：从最小的 `chat.invoke()` 一路走到 Tool Calling、MCP、RAG、向量数据库、Memory、结构化输出，最后用 LCEL 把所有东西组装成 chain。学完后你应该能独立写出一个「会调用工具 + 能检索知识库 + 有记忆」的命令行 Agent。
>
> 全程使用 **OpenAI 兼容 API**（任何兼容 OpenAI 协议的服务都行：OpenAI 官方、DeepSeek、通义千问、Moonshot、本地 Ollama 等），通过环境变量配置，不绑定任何具体厂商。
>
> **统一环境准备（每节代码都依赖它）**
>
> ```bash
> mkdir agent-stage1 && cd agent-stage1
> npm init -y
> npm pkg set type=module
> npm i langchain @langchain/core @langchain/openai
> npm i -D typescript tsx @types/node
> npx tsc --init
> ```
>
> 在项目根目录建一个 `.env`：
>
> ```bash
> # OpenAI 兼容服务的 Key
> OPENAI_API_KEY=sk-xxxxxxxx
> # 兼容服务地址，OpenAI 官方可省略；用 DeepSeek 则填 https://api.deepseek.com/v1
> OPENAI_BASE_URL=https://api.deepseek.com/v1
> # 聊天模型名
> CHAT_MODEL=deepseek-chat
> # 向量模型名（后面 RAG 章节会用）
> EMBED_MODEL=text-embedding-3-small
> ```
>
> 用 `tsx` 直接跑 TS：`npx tsx xxx.ts`（无需先编译）。读 `.env` 推荐 Node 20.6+ 自带的 `--env-file`：`node --env-file=.env --import tsx xxx.ts`，或装 `dotenv` 在代码里 `import 'dotenv/config'`。本教程示例统一假设环境变量已经注入到 `process.env`。

---

## 1. AI Agent 开发要学什么？

### 学习目标
- 搞清楚「调用大模型」和「开发 Agent」的本质区别。
- 建立本阶段的知识地图，知道每一节在解决什么问题。
- 跑通第一个 LangChain.js 调用，验证环境 OK。

### 核心概念讲解

很多人以为「AI 应用开发 = 调 ChatGPT 接口」。其实那只是最底层的一环。一个真正的 **Agent**，指的是一个能够 **自主决策、调用工具、观察结果、再决策** 的循环系统。它的核心公式是：

```
Agent = LLM（大脑） + Tools（手脚） + Memory（记忆） + Loop（决策循环）
```

- **LLM** 负责「思考」：根据当前上下文决定下一步做什么。
- **Tools** 负责「行动」：读文件、查数据库、调 API、执行命令。
- **Memory** 负责「记住」：多轮对话、历史检索、长期知识。
- **Loop** 是把上面三者串起来的引擎：`思考 → 行动 → 观察 → 再思考`，直到任务完成。

光会调模型，你只能做一个「问答机器人」；学会上面四件事，你才能做出像 Cursor、Devin 那样能干活的 Agent。

本阶段的 17 节正是沿着这条主线展开：

| 节 | 解决的问题 | 对应能力 |
|----|-----------|---------|
| 2-3 | 让模型调用工具读文件、执行命令 | Tools + Loop |
| 4-5 | 把工具变成可跨进程复用的标准（MCP） | Tools 工程化 |
| 6-10 | 让模型「读得懂」海量文档（RAG + 向量库） | 外部知识 |
| 11 | 让模型「记得住」长对话 | Memory |
| 12-13 | 让模型输出结构化数据 | 可控输出 |
| 14-16 | 用 LCEL 把逻辑组装成 chain | 工程化编排 |
| 17 | 总结 | 复盘 |

### 关键代码：你的第一个 LangChain 调用

```ts
// hello.ts
import { ChatOpenAI } from '@langchain/openai';

const chat = new ChatOpenAI({
  model: process.env.CHAT_MODEL,           // e.g. "deepseek-chat"
  apiKey: process.env.OPENAI_API_KEY,
  configuration: {
    baseURL: process.env.OPENAI_BASE_URL,  // OpenAI 兼容地址
  },
  temperature: 0.3,
});

async function main() {
  // invoke 接收一个消息数组或字符串，返回 AIMessage
  const res = await chat.invoke('用一句话解释什么是 AI Agent');
  console.log(res.content);
}

main();
```

```bash
node --env-file=.env --import tsx hello.ts
```

如果能打印出一句中文解释，说明环境通了。`ChatOpenAI` 是 LangChain 对 OpenAI 协议的封装，`configuration.baseURL` 让它能指向任意兼容服务——这就是我们「不绑定厂商」的关键。

### 动手步骤
1. 按导读完成环境准备，建好 `.env`。
2. 新建 `hello.ts`，粘贴上面代码。
3. 运行，确认能输出模型回复。
4. 把 `OPENAI_BASE_URL` / `CHAT_MODEL` 换成你手头能用的服务，再跑一次。

### 小结 / 常见坑
- **Agent ≠ 调模型**，重点是工具 + 循环。这一节先建立全局观。
- 坑 1：`401 Unauthorized` → Key 错或 `baseURL` 没带 `/v1`。
- 坑 2：`model not found` → `CHAT_MODEL` 名字和服务商对不上（DeepSeek 是 `deepseek-chat`，不是 `gpt-4`）。
- 坑 3：`fetch is not defined` → Node 版本太低，升级到 18+（推荐 20+）。

---

## 2. 从 Tool 开始：让大模型自动调工具读文件

### 学习目标
- 理解「Tool Calling（函数调用）」的底层机制。
- 用 `tool()` + zod 定义一个读文件工具。
- 让模型自己决定何时调用工具，并把结果喂回去。

### 核心概念讲解

大模型本身**不能**读你的文件、也不能联网。所谓「Tool Calling」，是模型厂商提供的一种协议：

1. 你在请求里告诉模型「我有哪些工具，每个工具叫什么、参数是什么 schema」。
2. 模型不直接回答，而是返回一个结构化的 `tool_calls`：「请帮我调用 `read_file`，参数 `{path: "a.txt"}`」。
3. **你的代码**真正去执行这个函数，拿到结果。
4. 把结果作为一条 `ToolMessage` 再发给模型，模型据此生成最终回答。

注意：**模型只负责「决定调用」，真正执行的是你**。LangChain 用 `tool()` 帮你把「JS 函数 + 参数 schema + 描述」打包成模型能理解的格式。

### 关键代码：定义一个读文件工具并让模型调用

```ts
// read-file-tool.ts
import { ChatOpenAI } from '@langchain/openai';
import { tool } from '@langchain/core/tools';
import { HumanMessage, ToolMessage, type BaseMessage } from '@langchain/core/messages';
import { z } from 'zod';
import { readFile } from 'node:fs/promises';

// 1) 定义工具：名字 + 描述 + 参数 schema（用 zod 描述，模型靠这些信息决策）
const readFileTool = tool(
  async ({ path }) => {
    const content = await readFile(path, 'utf-8');
    return content.slice(0, 2000); // 防止内容过长撑爆上下文
  },
  {
    name: 'read_file',
    description: '读取本地文本文件的内容。当用户想知道某个文件里写了什么时调用。',
    schema: z.object({
      path: z.string().describe('要读取的文件路径，可以是相对或绝对路径'),
    }),
  },
);

// 2) 把工具绑定到模型
const chat = new ChatOpenAI({
  model: process.env.CHAT_MODEL,
  apiKey: process.env.OPENAI_API_KEY,
  configuration: { baseURL: process.env.OPENAI_BASE_URL },
}).bindTools([readFileTool]);

const toolMap = { read_file: readFileTool };

async function main() {
  const messages: BaseMessage[] = [
    new HumanMessage('请告诉我 package.json 里 type 字段的值是什么'),
  ];

  // 第一次调用：模型可能返回 tool_calls 而不是答案
  let ai = await chat.invoke(messages);
  messages.push(ai);

  // 3) 如果模型要求调用工具，就逐个执行并回传结果
  while (ai.tool_calls && ai.tool_calls.length > 0) {
    for (const call of ai.tool_calls) {
      const selected = toolMap[call.name as keyof typeof toolMap];
      const result = await selected.invoke(call.args as any);
      messages.push(
        new ToolMessage({ content: String(result), tool_call_id: call.id! }),
      );
    }
    // 把工具结果喂回模型，让它继续（可能再次调用工具，也可能给最终答案）
    ai = await chat.invoke(messages);
    messages.push(ai);
  }

  console.log('最终回答：', ai.content);
}

main();
```

```bash
node --env-file=.env --import tsx read-file-tool.ts
```

运行后模型会先「决定」调用 `read_file({path:"package.json"})`，你的代码读出文件、回传，模型再回答 `type` 的值。这就是一个最小但完整的「Tool Calling 循环」。

### 动手步骤
1. 新建 `read-file-tool.ts`。
2. 确保项目里有 `package.json`（npm init 已生成）。
3. 运行，观察是否正确回答出 `type` 的值。
4. 改提问为「读 README.md 第一行讲了什么」，看模型会不会自动换参数调用。

### 小结 / 常见坑
- `bindTools` 后模型才「知道」有工具；不绑定永远不会触发调用。
- `description` 写得越清楚，模型越知道什么时候调——这是 prompt 工程的一部分。
- 坑：`tool_call_id` 必须原样回传，否则模型对不上是哪次调用的结果。
- 坑：必须用 **while 循环**，因为模型可能连续调用多个工具（多轮 tool calling）。

---

## 3. 实现 mini cursor：大模型自动调用 tool 执行命令

### 学习目标
- 在上一节基础上，加一个「执行 shell 命令」的工具。
- 体会「多工具 Agent」的威力：模型自己编排读文件 + 跑命令。
- 理解执行命令类工具的**安全风险**与最小防护。

### 核心概念讲解

Cursor 这类 AI 编程工具的内核，本质就是「LLM + 一堆工具（读文件、写文件、跑命令、搜代码）+ 循环」。我们把上一节的 read_file 扩展一下，再加 `run_command` 和 `write_file`，就有了一个 mini cursor 雏形。

关键点：**工具越多，模型的自主性越强**。它会自己规划「先读文件 → 再改 → 再跑测试」。但执行命令是把双刃剑——模型可能生成危险命令（如 `rm -rf`），所以真实产品里必须加白名单或人工确认。本节只做教学，加一个简单的危险词拦截。

### 关键代码：多工具 mini cursor

```ts
// mini-cursor.ts
import { ChatOpenAI } from '@langchain/openai';
import { tool } from '@langchain/core/tools';
import {
  HumanMessage,
  SystemMessage,
  ToolMessage,
  type BaseMessage,
} from '@langchain/core/messages';
import { z } from 'zod';
import { readFile, writeFile } from 'node:fs/promises';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

const readFileTool = tool(
  async ({ path }) => (await readFile(path, 'utf-8')).slice(0, 3000),
  {
    name: 'read_file',
    description: '读取文本文件内容',
    schema: z.object({ path: z.string() }),
  },
);

const writeFileTool = tool(
  async ({ path, content }) => {
    await writeFile(path, content, 'utf-8');
    return `已写入 ${path}`;
  },
  {
    name: 'write_file',
    description: '把内容写入文件（会覆盖原内容）',
    schema: z.object({ path: z.string(), content: z.string() }),
  },
);

const DANGER = ['rm -rf', 'mkfs', ':(){', 'shutdown', 'dd if='];
const runCommandTool = tool(
  async ({ command }) => {
    // 最小安全防护：拦截明显危险的命令
    if (DANGER.some((d) => command.includes(d))) {
      return `拒绝执行危险命令: ${command}`;
    }
    try {
      const { stdout, stderr } = await execAsync(command, { timeout: 10_000 });
      return (stdout || stderr || '(无输出)').slice(0, 3000);
    } catch (e: any) {
      return `命令出错: ${e.message}`;
    }
  },
  {
    name: 'run_command',
    description: '在当前目录执行一条 shell 命令并返回输出，比如 ls、cat、node -v',
    schema: z.object({ command: z.string().describe('要执行的 shell 命令') }),
  },
);

const tools = [readFileTool, writeFileTool, runCommandTool];
const toolMap = Object.fromEntries(tools.map((t) => [t.name, t]));

const chat = new ChatOpenAI({
  model: process.env.CHAT_MODEL,
  apiKey: process.env.OPENAI_API_KEY,
  configuration: { baseURL: process.env.OPENAI_BASE_URL },
}).bindTools(tools);

async function run(task: string) {
  const messages: BaseMessage[] = [
    new SystemMessage(
      '你是一个命令行助手。可以读写文件、执行命令。完成任务后用中文总结你做了什么。',
    ),
    new HumanMessage(task),
  ];

  let ai = await chat.invoke(messages);
  messages.push(ai);

  while (ai.tool_calls?.length) {
    for (const call of ai.tool_calls) {
      console.log(`🔧 调用 ${call.name}:`, call.args);
      const result = await toolMap[call.name].invoke(call.args as any);
      messages.push(new ToolMessage({ content: String(result), tool_call_id: call.id! }));
    }
    ai = await chat.invoke(messages);
    messages.push(ai);
  }
  console.log('
✅ ', ai.content);
}

// 试试看：让它统计当前目录有多少个 .ts 文件，并写进 report.txt
run('统计当前目录下有多少个 .ts 文件，把数量写到 report.txt，然后读出来确认');
```

```bash
node --env-file=.env --import tsx mini-cursor.ts
```

模型会自己规划：`run_command("ls *.ts | wc -l")` → `write_file("report.txt", "...")` → `read_file("report.txt")` → 总结。你会在控制台看到每一步的工具调用日志。

### 动手步骤
1. 新建 `mini-cursor.ts`，运行默认任务。
2. 换任务：「把所有 .ts 文件名列出来写进 files.md」。
3. 故意输入「删除所有文件」，验证危险拦截是否生效。

### 小结 / 常见坑
- 这就是 Agent 的精髓：你给工具 + 目标，模型自己编排步骤。
- **安全第一**：生产环境绝不能让模型裸跑 shell，必须白名单 / 沙箱 / 人工确认。
- 坑：命令超时要设 `timeout`，否则模型生成的死循环命令会卡住进程。
- 坑：工具返回内容要截断，否则大输出（如 `cat` 大文件）会撑爆上下文 token。

---

## 4. MCP：可跨进程调用的 Tool

### 学习目标
- 理解 MCP（Model Context Protocol）要解决什么问题。
- 搞清 MCP 的 Client / Server 架构与两种传输方式（stdio / HTTP）。
- 用 `@modelcontextprotocol/sdk` 写一个最小 MCP Server，并在 LangChain 里调用它。

### 核心概念讲解

上一节的工具是「写死在代码里」的。问题来了：

- 别的团队写了个好用的工具，我想用，得把代码拷过来。
- 我的工具想给 Cursor、Claude Desktop、我自己的 Agent 同时用，得各写一遍适配。

**MCP（Model Context Protocol）** 是 Anthropic 提出的开放协议，目标是把「工具/资源/提示词」标准化成一个**跨进程、跨语言**的服务。类比一下：

> Tool Calling 是「函数」，MCP 是「微服务」。MCP Server 把工具做成独立进程，任何支持 MCP 的客户端（Cursor、Claude、你的 LangChain Agent）都能即插即用。

MCP 架构：
- **MCP Server**：提供能力（tools / resources / prompts），是个独立进程。
- **MCP Client**：发现并调用 Server 的能力。
- **传输层**：
  - `stdio`：Client 把 Server 当子进程拉起，通过标准输入输出通信（本地工具最常用）。
  - `streamable-http` / `SSE`：Server 是个 HTTP 服务，远程也能连。

### 关键代码：写一个最小 MCP Server（stdio）

```bash
npm i @modelcontextprotocol/sdk
```

```ts
// mcp-server.ts —— 一个提供「加法」和「当前时间」两个工具的 MCP Server
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const server = new McpServer({ name: 'demo-tools', version: '1.0.0' });

// 注册工具：名字、schema、实现
server.tool(
  'add',
  '计算两个数字之和',
  { a: z.number(), b: z.number() },
  async ({ a, b }) => ({
    content: [{ type: 'text', text: String(a + b) }],
  }),
);

server.tool(
  'now',
  '返回当前 ISO 时间字符串',
  {},
  async () => ({
    content: [{ type: 'text', text: new Date().toISOString() }],
  }),
);

// 用 stdio 传输：被客户端当子进程拉起
const transport = new StdioServerTransport();
await server.connect(transport);
// 注意：stdio 模式下不要 console.log 到 stdout，会污染协议；用 console.error 调试
```

### 关键代码：在 LangChain 里调用 MCP Server

LangChain 官方提供了 `@langchain/mcp-adapters`，能把 MCP 工具自动转成 LangChain Tool：

```bash
npm i @langchain/mcp-adapters
```

```ts
// mcp-client.ts
import { MultiServerMCPClient } from '@langchain/mcp-adapters';
import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, ToolMessage, type BaseMessage } from '@langchain/core/messages';

const mcpClient = new MultiServerMCPClient({
  mcpServers: {
    demo: {
      // stdio：告诉它怎么把 server 拉起来
      transport: 'stdio',
      command: 'npx',
      args: ['tsx', 'mcp-server.ts'],
    },
  },
});

// 自动发现所有 MCP Server 的工具，转成 LangChain Tool
const tools = await mcpClient.getTools();
const toolMap = Object.fromEntries(tools.map((t) => [t.name, t]));

const chat = new ChatOpenAI({
  model: process.env.CHAT_MODEL,
  apiKey: process.env.OPENAI_API_KEY,
  configuration: { baseURL: process.env.OPENAI_BASE_URL },
}).bindTools(tools);

const messages: BaseMessage[] = [new HumanMessage('帮我算 123 加 456，再告诉我现在几点')];
let ai = await chat.invoke(messages);
messages.push(ai);

while (ai.tool_calls?.length) {
  for (const call of ai.tool_calls) {
    const result = await toolMap[call.name].invoke(call.args as any);
    messages.push(new ToolMessage({ content: String(result), tool_call_id: call.id! }));
  }
  ai = await chat.invoke(messages);
  messages.push(ai);
}
console.log(ai.content);
await mcpClient.close();
```

```bash
node --env-file=.env --import tsx mcp-client.ts
```

模型会分别调用 MCP 的 `add` 和 `now` 工具——而这些工具运行在**另一个进程**里。

### 动手步骤
1. 写好 `mcp-server.ts`。
2. 写好 `mcp-client.ts`，运行。
3. 观察模型是否调用了跨进程的两个工具。
4. 给 server 再加一个工具（如 `multiply`），不改 client 代码，重跑，验证「自动发现」。

### 小结 / 常见坑
- MCP 让工具变成可复用的「微服务」，是 Agent 工程化的关键一步。
- 坑：stdio 模式下 **Server 千万不能往 stdout 打日志**，会破坏 JSON-RPC 协议帧，调试请用 `console.error`（走 stderr）。
- 坑：`MultiServerMCPClient` 用完要 `close()`，否则子进程会残留。
- `@modelcontextprotocol/sdk` 的 API 版本变化较快，以你安装版本的 README 为准（核心概念不变）。

---

## 5. 高德 MCP + 浏览器 MCP：LangChain 复用别人的 MCP Server

### 学习目标
- 学会接入**第三方现成的** MCP Server（不用自己写工具）。
- 配置高德地图 MCP（查路线/地点）和浏览器 MCP（Playwright，自动操作网页）。
- 体会 MCP 生态「拿来即用」的价值。

### 核心概念讲解

上一节我们自己写了 Server，但 MCP 真正的威力在于**生态**：高德、GitHub、Playwright、文件系统、数据库……社区已经有大量现成的 MCP Server。你只要在配置里写一行，就能让自己的 Agent 拥有「查地图」「操作浏览器」的能力。

- **高德 MCP**：官方提供 `@amap/amap-maps-mcp-server`，能做地理编码、路线规划、周边搜索。需要去高德开放平台申请一个免费 Key。
- **浏览器 MCP**：微软的 `@playwright/mcp`，让模型能打开网页、点击、填表、截图——相当于给 Agent 装了个浏览器。

接入方式和上一节完全一样：在 `MultiServerMCPClient` 里多配几个 server 即可。

### 关键代码：同时接入高德 + 浏览器 MCP

```bash
# 这两个 server 用 npx 直接拉起，无需提前全局安装
# 高德需要先申请 key: https://lbs.amap.com/
```

在 `.env` 里加：

```bash
AMAP_MAPS_API_KEY=你的高德key
```

```ts
// multi-mcp.ts
import { MultiServerMCPClient } from '@langchain/mcp-adapters';
import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, ToolMessage, type BaseMessage } from '@langchain/core/messages';

const mcpClient = new MultiServerMCPClient({
  mcpServers: {
    // 1) 高德地图 MCP（stdio，npx 拉起官方包）
    amap: {
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@amap/amap-maps-mcp-server'],
      env: { AMAP_MAPS_API_KEY: process.env.AMAP_MAPS_API_KEY! },
    },
    // 2) 浏览器 MCP（Playwright）
    browser: {
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@playwright/mcp@latest'],
    },
  },
});

const tools = await mcpClient.getTools();
console.log('可用工具：', tools.map((t) => t.name)); // 会列出高德和浏览器的一堆工具
const toolMap = Object.fromEntries(tools.map((t) => [t.name, t]));

const chat = new ChatOpenAI({
  model: process.env.CHAT_MODEL,
  apiKey: process.env.OPENAI_API_KEY,
  configuration: { baseURL: process.env.OPENAI_BASE_URL },
}).bindTools(tools);

async function ask(question: string) {
  const messages: BaseMessage[] = [new HumanMessage(question)];
  let ai = await chat.invoke(messages);
  messages.push(ai);
  while (ai.tool_calls?.length) {
    for (const call of ai.tool_calls) {
      console.log(`🔧 ${call.name}`, call.args);
      const result = await toolMap[call.name].invoke(call.args as any);
      messages.push(new ToolMessage({ content: String(result), tool_call_id: call.id! }));
    }
    ai = await chat.invoke(messages);
    messages.push(ai);
  }
  console.log(ai.content);
}

// 高德示例：模型会自动调用地理编码 + 路线规划工具
await ask('从北京西站到天安门怎么走？给我驾车路线大概多远');
await mcpClient.close();
```

```bash
node --env-file=.env --import tsx multi-mcp.ts
```

### 动手步骤
1. 去高德开放平台申请 Key，填进 `.env`。
2. 先只配 `amap`，跑「路线规划」问题。
3. 再加 `browser`，问「打开 example.com 并告诉我标题」，观察 Playwright 工具被调用（首次会自动下载浏览器内核，稍慢）。
4. `console.log` 出 `tools` 列表，感受一下拿到了多少现成工具。

### 小结 / 常见坑
- 复用现成 MCP Server = 站在巨人肩膀上，几行配置换来一整套能力。
- 坑：高德 `AMAP_MAPS_API_KEY` 必须通过 `env` 传给子进程，不是写在 args 里。
- 坑：Playwright MCP 首次运行会下载浏览器（几百 MB），需联网且耐心等待。
- 坑：第三方 server 工具很多，全部 `bindTools` 会让 prompt 很长、token 变贵——生产中可按需筛选工具。

---

## 6. RAG：把文档向量化，基于向量实现语义搜索

### 学习目标
- 理解 RAG（检索增强生成）为什么是 Agent 接入私有知识的核心手段。
- 搞懂 Embedding（向量化）和「语义相似度」的原理。
- 用 LangChain 跑通一个最小 RAG：向量化 → 检索 → 拼进 prompt → 回答。

### 核心概念讲解

大模型有两个硬伤：**不知道你的私有数据**、**知识有时间截止**。最直接的解法不是重新训练（太贵），而是 **RAG（Retrieval-Augmented Generation）**：

> 提问时，先从你的知识库里**检索**出最相关的几段文字，把它们拼进 prompt，再让模型基于这些「参考资料」回答。

关键技术是 **Embedding（向量化）**：把一段文字变成一个高维数字向量（比如 1536 维）。语义相近的文字，向量在空间里也靠得近。于是「语义搜索」就变成了「找向量距离最近的几条」——通常用**余弦相似度**衡量。

RAG 最小流程：
1. **离线**：文档切块 → 每块算 embedding → 存起来（向量 + 原文）。
2. **在线**：用户问题算 embedding → 找最相似的 k 块 → 拼进 prompt → 模型回答。

本节先用 LangChain 内存版向量库 `MemoryVectorStore` 跑通全流程，第 9-10 节再换成生产级的 Milvus。

### 关键代码：最小 RAG

```ts
// rag-min.ts
import { OpenAIEmbeddings, ChatOpenAI } from '@langchain/openai';
import { MemoryVectorStore } from 'langchain/vectorstores/memory';
import { Document } from '@langchain/core/documents';

// 1) 向量模型（OpenAI 兼容）
const embeddings = new OpenAIEmbeddings({
  model: process.env.EMBED_MODEL,        // e.g. text-embedding-3-small
  apiKey: process.env.OPENAI_API_KEY,
  configuration: { baseURL: process.env.OPENAI_BASE_URL },
});

// 2) 准备知识（真实场景来自文件，这里手写几条）
const docs = [
  new Document({ pageContent: '本公司年假政策：入职满 1 年享 5 天年假，满 3 年享 10 天。' }),
  new Document({ pageContent: '报销流程：登录 OA 系统提交发票，主管审批后 3 个工作日到账。' }),
  new Document({ pageContent: '远程办公：每周可申请最多 2 天居家办公，需提前一天报备。' }),
];

async function main() {
  // 3) 离线：把文档向量化并存入内存向量库
  const store = await MemoryVectorStore.fromDocuments(docs, embeddings);

  const question = '我入职两年了能休几天年假？';

  // 4) 在线：语义检索 top-2
  const hits = await store.similaritySearch(question, 2);
  const context = hits.map((d) => d.pageContent).join('
');
  console.log('检索到的参考资料：
', context);

  // 5) 拼进 prompt 让模型基于资料回答
  const chat = new ChatOpenAI({
    model: process.env.CHAT_MODEL,
    apiKey: process.env.OPENAI_API_KEY,
    configuration: { baseURL: process.env.OPENAI_BASE_URL },
  });
  const res = await chat.invoke(
    `你是 HR 助手。只能根据下面的资料回答，资料没提到就说不知道。

资料：
${context}

问题：${question}`,
  );
  console.log('
回答：', res.content);
}

main();
```

```bash
node --env-file=.env --import tsx rag-min.ts
```

即使问法（「入职两年」）和原文（「满 1 年」「满 3 年」）字面不一样，语义检索也能命中年假那条——这就是向量搜索胜过关键词搜索的地方。

### 动手步骤
1. 确认 `.env` 里 `EMBED_MODEL` 是你服务商支持的向量模型。
2. 跑 `rag-min.ts`，看检索结果和回答。
3. 加几条文档，问一个跨文档的问题，观察检索质量。
4. 把「只能根据资料回答」去掉，对比模型会不会乱编（体会约束 prompt 的作用）。

### 小结 / 常见坑
- RAG = 检索 + 生成，是给 Agent「外挂知识」的标准做法。
- 坑：聊天模型和向量模型是**两个不同的模型**，名字别填混了。
- 坑：有些国产服务向量模型维度不同，换库时要保证维度一致。
- 坑：检索 + 生成两段都花钱（embedding 也计费），生产中要对文档 embedding 做缓存。

---

## 7. 知识库的 loader 和 splitter：从各种来源加载文档并分割成小块

### 学习目标
- 用 LangChain 的 **Loader** 从 txt / markdown / PDF / 网页加载文档。
- 用 **Splitter** 把长文档切成适合 embedding 的小块。
- 理解 `chunkSize` / `chunkOverlap` 怎么影响检索效果。

### 核心概念讲解

上一节的文档是手写的，真实知识库来自各种文件。LangChain 把这件事拆成两步：

- **Loader（加载器）**：把不同来源（文本、PDF、网页、Notion…）统一加载成 `Document[]`。每个 `Document` 有 `pageContent`（正文）和 `metadata`（来源、页码等）。
- **Splitter（分割器）**：embedding 和模型上下文都有长度上限，而且「块太大」会让检索不精准、「块太小」会丢上下文。所以要把长文切成合适大小的 chunk。

两个核心参数：
- `chunkSize`：每块最大字符数（不是 token，但近似）。常用 500~1000。
- `chunkOverlap`：相邻块重叠多少字符。防止「一句话被从中间切断」导致语义断裂。常用 chunkSize 的 10%~20%。

### 关键代码：加载 + 分割

```bash
# PDF 加载需要额外依赖
npm i pdf-parse
# 部分社区 loader 在 @langchain/community
npm i @langchain/community
```

```ts
// load-split.ts
import { TextLoader } from 'langchain/document_loaders/fs/text';
import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf';
import { CheerioWebBaseLoader } from '@langchain/community/document_loaders/web/cheerio';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';

async function main() {
  // 1) 从文本文件加载
  const textDocs = await new TextLoader('./docs/handbook.txt').load();

  // 2) 从 PDF 加载（每页一个 Document）
  // const pdfDocs = await new PDFLoader('./docs/manual.pdf').load();

  // 3) 从网页加载（抓正文）
  // const webDocs = await new CheerioWebBaseLoader('https://example.com').load();

  console.log('加载到文档数：', textDocs.length);

  // 4) 分割：递归字符分割器（最通用，见下一节）
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 500,
    chunkOverlap: 80,
  });
  const chunks = await splitter.splitDocuments(textDocs);

  console.log('切分后块数：', chunks.length);
  console.log('第一块内容：
', chunks[0].pageContent);
  console.log('第一块元数据：', chunks[0].metadata);
}

main();
```

```bash
# 先准备一个测试文件
mkdir -p docs && printf '员工手册

年假政策...
报销流程...
（写长一点测试切分）' > docs/handbook.txt
node --env-file=.env --import tsx load-split.ts
```

把上一节 RAG 里手写的 `docs` 换成这里 `splitter.splitDocuments()` 的输出，就是一个能吃真实文件的知识库了。

### 动手步骤
1. 准备一个较长的 txt（几千字），跑加载 + 分割，看切了多少块。
2. 把 `chunkSize` 从 500 改成 200 再改成 1500，观察块数变化。
3. 取消注释 PDF / 网页 loader，分别试一份 PDF 和一个网页。

### 小结 / 常见坑
- Loader 统一来源、Splitter 控制粒度，是 RAG 的「数据预处理」环节。
- 坑：PDF 扫描件（图片版）loader 抽不出文字，需要 OCR。
- 坑：`chunkOverlap` 设太大浪费存储、太小丢语义，先用 chunkSize 的 15% 起步再调。
- 坑：`metadata`（来源、页码）一定要保留，方便回答时给出「引用出处」。

---

## 8. LangChain 全部 Splitter，其实只需要其中一个

### 学习目标
- 认识 LangChain 提供的各类 Splitter。
- 理解为什么 `RecursiveCharacterTextSplitter` 是绝大多数场景的默认选择。
- 知道什么时候需要特殊 Splitter（代码、Markdown、token 精确控制）。

### 核心概念讲解

LangChain 的 splitter 有一堆：`CharacterTextSplitter`、`RecursiveCharacterTextSplitter`、`MarkdownTextSplitter`、`TokenTextSplitter`、各语言的代码分割器……新手容易挑花眼。结论先给：

> **90% 的情况，用 `RecursiveCharacterTextSplitter` 就够了。**

为什么？它的策略最聪明：按一个**优先级分隔符列表**递归切分，默认是 `["

", "
", " ", ""]`——先尽量按段落切，段落还太大就按行，再不行按词，最后才按字符。这样能**尽可能保持语义完整**，而普通 `CharacterTextSplitter` 只会用单一分隔符硬切。

其他的什么时候用：
- **MarkdownTextSplitter / 代码分割器**：内容是 Markdown 或源代码，想按标题/函数边界切，保持结构。本质是 `RecursiveCharacterTextSplitter` 换了套针对性的分隔符。
- **TokenTextSplitter**：当你要**精确**控制 token 数（贴着模型上限切）时用，因为字符数 ≠ token 数。

### 关键代码：对比与「从代码/语言创建」

```ts
// splitters.ts
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';

const text = `# 第一章 标题

这是第一段，内容比较长，用来演示递归分割。

这是第二段。

## 1.1 小节
列表项一
列表项二`;

async function main() {
  // 1) 通用首选：递归字符分割
  const recursive = new RecursiveCharacterTextSplitter({ chunkSize: 60, chunkOverlap: 10 });
  console.log('递归分割：', (await recursive.splitText(text)).length, '块');

  // 2) 针对 Markdown：用预设分隔符（本质还是递归分割器）
  const md = RecursiveCharacterTextSplitter.fromLanguage('markdown', {
    chunkSize: 60,
    chunkOverlap: 10,
  });
  const mdChunks = await md.splitText(text);
  console.log('Markdown 分割：', mdChunks.length, '块');
  console.log(mdChunks);

  // 3) 针对代码：同样用 fromLanguage
  const code = `function add(a, b) {
  return a + b;
}
function sub(a, b) {
  return a - b;
}`;
  const jsSplitter = RecursiveCharacterTextSplitter.fromLanguage('js', {
    chunkSize: 40,
    chunkOverlap: 0,
  });
  console.log('JS 代码分割：', await jsSplitter.splitText(code));
}

main();
```

```bash
node --env-file=.env --import tsx splitters.ts
```

可以看到 `fromLanguage('markdown' | 'js' | ...)` 就是给递归分割器换了一套贴合该语言结构的分隔符——所以说「学会一个就够了」。

### 动手步骤
1. 跑 `splitters.ts`，对比三种结果的边界差异。
2. 把一段真实 Markdown 文档丢进去，看是否在标题处自然断开。
3. 用 `fromLanguage('python')` 切一段 Python 代码。

### 小结 / 常见坑
- 记住一句话：**默认 `RecursiveCharacterTextSplitter`，特殊结构用 `fromLanguage`**。
- 坑：`chunkSize` 是字符数，对中文要注意——同样字符数，中文信息量比英文大。
- 坑：需要严格贴 token 上限时才上 `TokenTextSplitter`，它依赖 tokenizer，稍慢。
- `@langchain/textsplitters` 是独立包，记得安装（`langchain` 主包通常已带）。

---

## 9. 向量数据库 Milvus：做 AI Agent 开发必备技术

### 学习目标
- 理解为什么内存向量库不够用，要上专业向量数据库。
- 用 Docker 跑起 Milvus，理解 Collection / Schema / Index 概念。
- 用 LangChain 的 `Milvus` 向量库完成「存 + 查」。

### 核心概念讲解

第 6 节用的 `MemoryVectorStore` 有致命问题：**进程一停数据就没了，而且全量暴力比对，几万条就慢到不可用**。生产级 RAG 必须用**向量数据库**。

Milvus 是目前最主流的开源向量数据库，专门为「海量向量的高速近似最近邻（ANN）检索」设计。核心概念：

- **Collection**：相当于「表」，一类向量数据的集合。
- **Schema / Field**：每条记录的字段，至少有一个向量字段 + 主键，可带标量字段（用于过滤，如 `category`）。
- **Index（索引）**：让检索从 O(n) 暴力变成近似快查的关键。常用 `HNSW`、`IVF_FLAT`。
- **Metric（距离度量）**：`COSINE`（余弦）、`L2`（欧氏）、`IP`（内积）。文本检索常用 `COSINE`。

### 关键代码：启动 Milvus + 用 LangChain 读写

先用官方脚本起一个单机版 Milvus（最简单）：

```bash
# 下载并启动 Milvus standalone（需要本地有 Docker）
curl -sfL https://raw.githubusercontent.com/milvus-io/milvus/master/scripts/standalone_embed.sh -o standalone_embed.sh
bash standalone_embed.sh start
# 默认监听 localhost:19530
```

```bash
npm i @langchain/community @zilliz/milvus2-sdk-node
```

在 `.env` 里加：

```bash
MILVUS_URL=http://localhost:19530
```

```ts
// milvus-store.ts
import { Milvus } from '@langchain/community/vectorstores/milvus';
import { OpenAIEmbeddings } from '@langchain/openai';
import { Document } from '@langchain/core/documents';

const embeddings = new OpenAIEmbeddings({
  model: process.env.EMBED_MODEL,
  apiKey: process.env.OPENAI_API_KEY,
  configuration: { baseURL: process.env.OPENAI_BASE_URL },
});

async function main() {
  const docs = [
    new Document({ pageContent: 'Milvus 是开源向量数据库', metadata: { topic: 'db' } }),
    new Document({ pageContent: 'LangChain 是 LLM 应用开发框架', metadata: { topic: 'framework' } }),
    new Document({ pageContent: 'Embedding 把文本变成向量', metadata: { topic: 'concept' } }),
  ];

  // 1) 写入：自动建 collection、建索引、灌数据
  const store = await Milvus.fromDocuments(docs, embeddings, {
    collectionName: 'stage1_demo',
    url: process.env.MILVUS_URL,
  });
  console.log('已写入 Milvus');

  // 2) 检索：语义搜索 top-2
  const hits = await store.similaritySearch('什么是向量数据库', 2);
  console.log('检索结果：', hits.map((d) => d.pageContent));

  // 3) 复用已有 collection（下次不用重新灌）
  const existing = await Milvus.fromExistingCollection(embeddings, {
    collectionName: 'stage1_demo',
    url: process.env.MILVUS_URL,
  });
  const hits2 = await existing.similaritySearchWithScore('LLM 框架', 1);
  console.log('带分数的结果：', hits2);
}

main();
```

```bash
node --env-file=.env --import tsx milvus-store.ts
```

`Milvus.fromDocuments` 帮你把建库、建索引、灌数据全干了；`fromExistingCollection` 用于服务重启后直接接着用。

### 动手步骤
1. 装好 Docker，用 `standalone_embed.sh start` 起 Milvus。
2. 跑 `milvus-store.ts`，确认写入和检索都成功。
3. 重跑一次「只检索」的代码（用 `fromExistingCollection`），验证数据持久化了。
4. （可选）装 Attu（Milvus 可视化工具）连上 `localhost:19530` 看 collection。

### 小结 / 常见坑
- 内存库用于 demo，**生产必上向量数据库**（Milvus / pgvector / Elasticsearch 等）。
- 坑：`Milvus.fromDocuments` 会按第一批向量的维度建 collection，**换了向量模型（维度变了）必须换 collection 名或删库重建**。
- 坑：Docker 内存不够 Milvus 起不来，给 Docker 至少 4G。
- 坑：`@zilliz/milvus2-sdk-node` 是必须的底层依赖，别漏装。

---

## 10. Milvus + RAG 实战：电子书语义检索助手

### 学习目标
- 把第 7、8、9 节串起来：加载电子书 → 分割 → 存 Milvus → 检索问答。
- 写一个完整的「问书」命令行工具。
- 加上「引用出处」，让回答可溯源。

### 核心概念讲解

这是本阶段第一个完整小项目。流程就是标准 RAG 工程化版本：

```
电子书(txt/pdf) → Loader → Splitter → Embedding → Milvus(离线建库，只做一次)
                                                          ↓
用户提问 → Embedding → Milvus 检索 top-k → 拼 prompt + 出处 → LLM 回答
```

工程上要把「建库」和「问答」拆成两个脚本：建库慢且只需一次，问答要快且反复用。

### 关键代码

**① 建库脚本（一次性）：**

```ts
// book-ingest.ts —— 把电子书灌进 Milvus
import { TextLoader } from 'langchain/document_loaders/fs/text';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { Milvus } from '@langchain/community/vectorstores/milvus';
import { OpenAIEmbeddings } from '@langchain/openai';

const embeddings = new OpenAIEmbeddings({
  model: process.env.EMBED_MODEL,
  apiKey: process.env.OPENAI_API_KEY,
  configuration: { baseURL: process.env.OPENAI_BASE_URL },
});

async function main() {
  const bookPath = process.argv[2] ?? './docs/book.txt';
  const raw = await new TextLoader(bookPath).load();

  const splitter = new RecursiveCharacterTextSplitter({ chunkSize: 800, chunkOverlap: 120 });
  const chunks = await splitter.splitDocuments(raw);
  // 给每块标上序号，便于回答时引用
  chunks.forEach((c, i) => (c.metadata = { ...c.metadata, chunk: i, source: bookPath }));

  await Milvus.fromDocuments(chunks, embeddings, {
    collectionName: 'ebook',
    url: process.env.MILVUS_URL,
  });
  console.log(`✅ 已灌入 ${chunks.length} 块到 Milvus collection: ebook`);
}

main();
```

**② 问答脚本（反复用）：**

```ts
// book-ask.ts —— 命令行问书
import { Milvus } from '@langchain/community/vectorstores/milvus';
import { OpenAIEmbeddings, ChatOpenAI } from '@langchain/openai';
import { createInterface } from 'node:readline/promises';

const embeddings = new OpenAIEmbeddings({
  model: process.env.EMBED_MODEL,
  apiKey: process.env.OPENAI_API_KEY,
  configuration: { baseURL: process.env.OPENAI_BASE_URL },
});
const chat = new ChatOpenAI({
  model: process.env.CHAT_MODEL,
  apiKey: process.env.OPENAI_API_KEY,
  configuration: { baseURL: process.env.OPENAI_BASE_URL },
  temperature: 0,
});

async function main() {
  const store = await Milvus.fromExistingCollection(embeddings, {
    collectionName: 'ebook',
    url: process.env.MILVUS_URL,
  });

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  console.log('📖 电子书问答助手，输入问题（exit 退出）');

  while (true) {
    const q = await rl.question('
你问：');
    if (q.trim() === 'exit') break;

    const hits = await store.similaritySearchWithScore(q, 4);
    const context = hits
      .map(([d], i) => `[#${i + 1} chunk:${d.metadata.chunk}]
${d.pageContent}`)
      .join('

');

    const res = await chat.invoke(
      `根据下面的书摘回答问题，并在答案末尾用 [#编号] 标注引用了哪几段。书摘没提到就说"书里没找到"。

书摘：
${context}

问题：${q}`,
    );
    console.log('
答：', res.content);
  }
  rl.close();
}

main();
```

```bash
# 1) 准备一本 txt 电子书放到 docs/book.txt
node --env-file=.env --import tsx book-ingest.ts ./docs/book.txt
# 2) 开始问
node --env-file=.env --import tsx book-ask.ts
```

### 动手步骤
1. 找一本公版电子书（如古典小说）存成 `docs/book.txt`。
2. 跑 `book-ingest.ts` 建库（看灌了多少块）。
3. 跑 `book-ask.ts`，问书里的情节，验证回答 + 引用编号。
4. 问一个书里没有的问题，确认它会回答「书里没找到」而不是瞎编。

### 小结 / 常见坑
- 建库 / 问答分离是 RAG 工程的标准结构。
- 坑：`temperature: 0` 让问答更稳定、少幻觉，RAG 场景推荐。
- 坑：检索 k 太小可能漏关键信息，太大则 prompt 变长变贵，4~6 是常用起点。
- 坑：超大电子书建库时 embedding 调用很多，注意服务商的限流（必要时分批 + sleep）。

---

## 11. Memory 管理的三大策略：截断、总结、检索

### 学习目标
- 理解为什么对话越长越「贵」也越「忘」。
- 掌握三种 Memory 策略：截断、总结、检索，及各自适用场景。
- 用代码实现这三种策略。

### 核心概念讲解

模型是**无状态**的——它不会自己记住上一轮说了什么，全靠你每次把历史消息一起发过去。但上下文窗口有限（token 上限），对话一长就会：① 超出窗口报错；② token 暴涨变贵；③ 旧信息把新信息「挤掉」。

于是有了三大 Memory 管理策略：

1. **截断（Trimming）**：只保留最近 N 轮 / N 个 token，老的直接丢。最简单，适合「不太依赖远古上下文」的闲聊。
2. **总结（Summarization）**：把早期对话用模型压缩成一段摘要，摘要 + 最近几轮一起发。省 token 又留住关键信息，适合长对话。
3. **检索（Retrieval）**：把所有历史存进向量库，每轮只检索出**和当前问题相关**的几条历史。适合超长、跨会话的「长期记忆」——这其实就是把 RAG 用在对话历史上（第 12 阶段会接触 Mem0 这类专门的记忆库）。

### 关键代码：三种策略实现

```ts
// memory.ts
import { ChatOpenAI, OpenAIEmbeddings } from '@langchain/openai';
import { HumanMessage, AIMessage, SystemMessage, type BaseMessage } from '@langchain/core/messages';
import { trimMessages } from '@langchain/core/messages';
import { MemoryVectorStore } from 'langchain/vectorstores/memory';
import { Document } from '@langchain/core/documents';

const chat = new ChatOpenAI({
  model: process.env.CHAT_MODEL,
  apiKey: process.env.OPENAI_API_KEY,
  configuration: { baseURL: process.env.OPENAI_BASE_URL },
});

// 假设这是一段很长的历史
const history: BaseMessage[] = [
  new HumanMessage('我叫小明，是后端工程师'),
  new AIMessage('你好小明！'),
  new HumanMessage('我喜欢用 TypeScript'),
  new AIMessage('TS 很棒～'),
  new HumanMessage('我最近在学 Milvus'),
  new AIMessage('向量数据库，好选择'),
];

// ---------- 策略 1：截断（按消息条数）----------
async function strategyTrim() {
  // 只保留最近 2 条（LangChain 提供 trimMessages，可按 token 或条数）
  const trimmed = await trimMessages(history, {
    maxTokens: 2,          // 这里用 "条数" 计数器演示
    strategy: 'last',      // 保留最后的
    tokenCounter: (msgs) => msgs.length,
  });
  console.log('截断后剩：', trimmed.map((m) => m.content));
}

// ---------- 策略 2：总结 ----------
async function strategySummary() {
  const text = history.map((m) => `${m._getType()}: ${m.content}`).join('
');
  const summary = await chat.invoke(`把下面的对话压缩成一句话用户画像：
${text}`);
  // 之后只需带着这条摘要 + 最新问题
  const reply = await chat.invoke([
    new SystemMessage(`已知用户信息：${summary.content}`),
    new HumanMessage('根据你了解的我，推荐一个学习方向'),
  ]);
  console.log('摘要：', summary.content);
  console.log('基于摘要的回答：', reply.content);
}

// ---------- 策略 3：检索 ----------
async function strategyRetrieval() {
  const embeddings = new OpenAIEmbeddings({
    model: process.env.EMBED_MODEL,
    apiKey: process.env.OPENAI_API_KEY,
    configuration: { baseURL: process.env.OPENAI_BASE_URL },
  });
  // 把每条历史存进向量库
  const store = await MemoryVectorStore.fromDocuments(
    history.map((m) => new Document({ pageContent: String(m.content) })),
    embeddings,
  );
  // 当前问题只检索相关历史
  const q = '我用什么编程语言来着？';
  const related = await store.similaritySearch(q, 2);
  const reply = await chat.invoke([
    new SystemMessage(`相关历史：${related.map((d) => d.pageContent).join('; ')}`),
    new HumanMessage(q),
  ]);
  console.log('检索到的相关历史：', related.map((d) => d.pageContent));
  console.log('回答：', reply.content);
}

await strategyTrim();
await strategySummary();
await strategyRetrieval();
```

```bash
node --env-file=.env --import tsx memory.ts
```

### 动手步骤
1. 跑 `memory.ts`，对比三种策略的输出。
2. 把 `history` 加长到 20 条，看截断 / 总结 / 检索分别保留了什么。
3. 思考：你的「问书助手」该用哪种？（提示：长对话 + 跨会话 → 检索）

### 小结 / 常见坑
- 三选一不是绝对的，**生产常组合**：最近几轮原样保留 + 更早的做摘要 + 关键事实进向量库检索。
- 坑：`trimMessages` 的 `tokenCounter` 决定按什么计数，真实场景应传真正的 token 计数函数。
- 坑：总结策略要小心「摘要丢信息」；关键事实（如用户 ID）建议单独结构化存储。
- 坑：检索策略要保证 `SystemMessage` 始终在最前，别被截断逻辑误删。

---

## 12. 结构化大模型输出：output parser 还是 tool？

### 学习目标
- 理解为什么要让模型输出「结构化数据」而不是自由文本。
- 掌握两条技术路线：Output Parser（约束 + 解析文本）vs Tool / `withStructuredOutput`（用函数调用机制拿结构）。
- 知道什么时候选哪个。

### 核心概念讲解

很多场景我们不想要一段散文，而要**程序能直接用的数据**：比如从简历里抽出 `{name, email, skills[]}`。让模型输出 JSON 有两条路：

**路线 A：Output Parser（结构化解析器）**
- 思路：在 prompt 里告诉模型「请按这个格式输出」，拿到文本后用 parser 解析成对象。
- 代表：`StructuredOutputParser`（基于 zod 生成格式说明 + 解析）。
- 优点：任何模型都能用，连不支持 function calling 的也行。
- 缺点：模型可能不严格遵守格式，需要容错 / 重试。

**路线 B：Tool / `withStructuredOutput`（函数调用机制）**
- 思路：复用第 2 节的 Tool Calling 协议——把「目标结构」当成一个工具的参数 schema，模型通过 `tool_calls` 返回严格符合 schema 的结构化参数。
- 代表：`model.withStructuredOutput(zodSchema)`，LangChain 封装好了。
- 优点：**结构最可靠**（厂商在协议层保证 JSON 合法）。
- 缺点：依赖模型支持 function calling（主流模型都支持）。

**结论**：模型支持 function calling 就**优先用 `withStructuredOutput`**；要兼容老模型 / 特殊场景才用 Output Parser。

### 关键代码：两条路线对比

```ts
// structured.ts
import { ChatOpenAI } from '@langchain/openai';
import { StructuredOutputParser } from '@langchain/core/output_parsers';
import { z } from 'zod';

const chat = new ChatOpenAI({
  model: process.env.CHAT_MODEL,
  apiKey: process.env.OPENAI_API_KEY,
  configuration: { baseURL: process.env.OPENAI_BASE_URL },
  temperature: 0,
});

const schema = z.object({
  name: z.string().describe('姓名'),
  email: z.string().describe('邮箱'),
  skills: z.array(z.string()).describe('技能列表'),
});

const resume = '我叫张伟，邮箱 zhangwei@example.com，擅长 TypeScript、Node.js 和 Milvus。';

// ---------- 路线 A：Output Parser ----------
async function viaParser() {
  const parser = StructuredOutputParser.fromZodSchema(schema);
  const formatInstructions = parser.getFormatInstructions(); // 生成"请按此格式输出"的说明
  const res = await chat.invoke(
    `从下面文本抽取信息。
${formatInstructions}

文本：${resume}`,
  );
  const obj = await parser.parse(String(res.content)); // 文本 → 对象
  console.log('Parser 结果：', obj);
}

// ---------- 路线 B：withStructuredOutput（推荐）----------
async function viaStructuredOutput() {
  const structured = chat.withStructuredOutput(schema, { name: 'extract_resume' });
  const obj = await structured.invoke(`从这段文本抽取信息：${resume}`);
  console.log('StructuredOutput 结果：', obj); // 直接是符合 schema 的对象
}

await viaParser();
await viaStructuredOutput();
```

```bash
node --env-file=.env --import tsx structured.ts
```

两者都能拿到 `{name, email, skills}` 对象，但路线 B 通常更稳，不用自己处理「模型多输出了一句废话导致 JSON.parse 失败」的问题。

### 动手步骤
1. 跑 `structured.ts`，对比两条路线的输出。
2. 把文本换成信息不全的（没邮箱），看模型怎么处理（可把 email 设为 `.optional()`）。
3. 在 schema 里加一个枚举字段，如 `level: z.enum(['初级','中级','高级'])`，体会约束。

### 小结 / 常见坑
- 优先 `withStructuredOutput`，它把可靠性交给协议层。
- 坑：Parser 路线下模型爱加 ```json 代码块包裹，`StructuredOutputParser` 一般能容错，自己手撸 `JSON.parse` 则要先剥壳。
- 坑：`temperature` 设 0，结构化抽取不需要创造性。
- 坑：zod 的 `.describe()` 很重要，它会变成给模型的字段说明，写清楚抽得更准。

---

## 13. Output Parser 实战：智能录入 + 流式版 mini cursor

### 学习目标
- 用结构化输出做一个「自然语言 → 结构化表单」的智能录入功能。
- 学会**流式输出（streaming）**，让 mini cursor 边想边打字。
- 理解 `.stream()` 和普通 `.invoke()` 的区别。

### 核心概念讲解

这一节把第 12 节（结构化输出）和第 3 节（mini cursor）各推进一步：

- **智能录入**：用户用一句大白话「帮老王登记一下，13800001111，要订 3 间会议室下周二下午」，系统自动解析成结构化工单。本质是 `withStructuredOutput` 的应用。
- **流式 mini cursor**：之前 `invoke()` 要等模型全部生成完才返回，体验差。`stream()` 能拿到一个个 token chunk，实现「打字机效果」。Agent 产品几乎都用流式。

### 关键代码

**① 智能录入：**

```ts
// smart-intake.ts
import { ChatOpenAI } from '@langchain/openai';
import { z } from 'zod';

const chat = new ChatOpenAI({
  model: process.env.CHAT_MODEL,
  apiKey: process.env.OPENAI_API_KEY,
  configuration: { baseURL: process.env.OPENAI_BASE_URL },
  temperature: 0,
});

const orderSchema = z.object({
  customer: z.string().describe('客户姓名'),
  phone: z.string().describe('手机号'),
  roomCount: z.number().describe('会议室数量'),
  date: z.string().describe('预订日期，格式 YYYY-MM-DD 或自然语言描述'),
  period: z.enum(['上午', '下午', '全天']).describe('时段'),
});

const extractor = chat.withStructuredOutput(orderSchema, { name: 'create_order' });

const input = '帮老王登记一下，电话13800001111，要订3间会议室下周二下午';
const order = await extractor.invoke(
  `今天是 2026-06-18 周四。把下面这句话解析成预订工单：${input}`,
);
console.log('结构化工单：', order);
```

```bash
node --env-file=.env --import tsx smart-intake.ts
```

**② 流式 mini cursor（在第 3 节基础上把 invoke 换成 stream）：**

```ts
// stream-cursor.ts
import { ChatOpenAI } from '@langchain/openai';
import { tool } from '@langchain/core/tools';
import { HumanMessage, ToolMessage, type BaseMessage } from '@langchain/core/messages';
import { z } from 'zod';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

const runCommand = tool(
  async ({ command }) => {
    const { stdout, stderr } = await execAsync(command, { timeout: 10_000 });
    return (stdout || stderr || '(无输出)').slice(0, 2000);
  },
  {
    name: 'run_command',
    description: '执行 shell 命令',
    schema: z.object({ command: z.string() }),
  },
);

const chat = new ChatOpenAI({
  model: process.env.CHAT_MODEL,
  apiKey: process.env.OPENAI_API_KEY,
  configuration: { baseURL: process.env.OPENAI_BASE_URL },
}).bindTools([runCommand]);

async function main() {
  const messages: BaseMessage[] = [new HumanMessage('当前目录有哪些文件？用一句话总结')];

  // 先非流式判断是否要调工具（工具调用阶段不适合流式展示）
  let ai = await chat.invoke(messages);
  messages.push(ai);
  while (ai.tool_calls?.length) {
    for (const call of ai.tool_calls) {
      const result = await runCommand.invoke(call.args as any);
      messages.push(new ToolMessage({ content: String(result), tool_call_id: call.id! }));
    }
    ai = await chat.invoke(messages);
    messages.push(ai);
  }

  // 最终回答用流式重新生成，打字机输出
  process.stdout.write('
助手：');
  const stream = await chat.stream(messages.slice(0, -1)); // 去掉刚才的完整回答，重新流式生成
  for await (const chunk of stream) {
    process.stdout.write(String(chunk.content)); // 一块一块打印
  }
  process.stdout.write('
');
}

main();
```

```bash
node --env-file=.env --import tsx stream-cursor.ts
```

你会看到回答是「一个字一个字蹦出来」的——这就是流式。

### 动手步骤
1. 跑 `smart-intake.ts`，换几种说法（漏掉电话、换日期表达），看解析鲁棒性。
2. 跑 `stream-cursor.ts`，观察流式打字效果。
3. 把流式逻辑封装成 `streamReply(messages)` 函数，方便复用。

### 小结 / 常见坑
- 智能录入是结构化输出最实用的落地场景之一（客服、CRM、工单）。
- 坑：日期这种相对表达（「下周二」）一定要在 prompt 里给「今天是几号」做锚点。
- 坑：流式时 `chunk.content` 可能是空字符串（某些 chunk 只带 metadata），直接拼接即可。
- 坑：工具调用阶段一般不流式（要拿完整 `tool_calls`），**最终回答**才流式，是常见做法。

---

## 14. Prompt Template：组件化管理 prompt

### 学习目标
- 用 `PromptTemplate` / `ChatPromptTemplate` 把 prompt 从硬编码字符串变成可复用模板。
- 掌握变量占位、System/Human 角色、`MessagesPlaceholder` 插入历史。
- 理解模板化是走向「chain 组装」的前置基础。

### 核心概念讲解

前面我们一直用模板字符串拼 prompt（`` `资料：${context}` ``）。项目一大就乱：prompt 散落各处、难复用、难测试。LangChain 的 **Prompt Template** 把 prompt 变成「带变量插槽的组件」：

- `PromptTemplate`：纯文本模板，`{var}` 占位。
- `ChatPromptTemplate`：聊天模板，能定义 system / human / ai 多角色，是最常用的。
- `MessagesPlaceholder`：在模板里预留一个「插历史消息」的位置——多轮对话必备。

模板的 `invoke()` 接收变量对象，产出可直接喂给模型的消息。它还是下一节 LCEL chain 的第一块「积木」。

### 关键代码

```ts
// prompt-template.ts
import { ChatOpenAI } from '@langchain/openai';
import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';
import { HumanMessage, AIMessage } from '@langchain/core/messages';

const chat = new ChatOpenAI({
  model: process.env.CHAT_MODEL,
  apiKey: process.env.OPENAI_API_KEY,
  configuration: { baseURL: process.env.OPENAI_BASE_URL },
});

// 1) 定义一个可复用的聊天模板：带 system 人设、历史插槽、用户问题变量
const prompt = ChatPromptTemplate.fromMessages([
  ['system', '你是一个{role}，回答要{style}。'],
  new MessagesPlaceholder('history'), // 历史消息插这里
  ['human', '{question}'],
]);

async function main() {
  // 2) 填充变量，产出真正的消息数组
  const messages = await prompt.invoke({
    role: 'Python 老师',
    style: '简洁、带一个例子',
    history: [
      new HumanMessage('我是新手'),
      new AIMessage('好的，我会讲得简单些'),
    ],
    question: '什么是列表推导式？',
  });

  console.log('渲染出的消息：', messages.toChatMessages());

  // 3) 喂给模型
  const res = await chat.invoke(messages);
  console.log('
回答：', res.content);
}

main();
```

```bash
node --env-file=.env --import tsx prompt-template.ts
```

同一个 `prompt` 模板，换 `role` / `style` 就能复用成不同人设的助手，历史也通过 placeholder 干净地注入。

### 动手步骤
1. 跑 `prompt-template.ts`，把 `role` 改成「严厉的代码审查员」，对比风格变化。
2. 用 `PromptTemplate.fromTemplate('翻译成{lang}：{text}')` 做一个翻译模板。
3. 把第 10 节问书的 prompt 改写成 `ChatPromptTemplate`，体会可维护性提升。

### 小结 / 常见坑
- 模板化让 prompt 可复用、可测试、可版本管理，是工程化第一步。
- 坑：模板里写字面量大括号要转义成 `{{` `}}`，否则会被当变量解析报错。
- 坑：`MessagesPlaceholder` 对应的变量必须是**消息数组**，不能传字符串。
- 坑：`invoke` 返回的是 `PromptValue`，喂模型直接传即可；想看内容用 `.toChatMessages()`。

---

## 15. Runnable：把写逻辑变成组装 chain

### 学习目标
- 理解 LangChain 的核心抽象 **Runnable**：一切组件都是 Runnable。
- 掌握用 `.pipe()` 把组件串成链（chain）。
- 认识 `RunnableSequence` / `RunnableLambda` / `RunnablePassthrough` / `RunnableParallel`。

### 核心概念讲解

到目前为止我们都是手写「调模板 → 调模型 → 解析」的流程代码。LangChain 的设计哲学是：**把每一步都抽象成统一接口 `Runnable`，然后像搭水管一样 `.pipe()` 起来。**

Runnable 的统一接口：每个组件都有 `invoke()` / `stream()` / `batch()`。因为接口统一，prompt 模板、模型、parser、甚至一个普通函数都能互相拼接。

几个核心 Runnable：
- **`.pipe(next)`**：把上一步的输出作为下一步的输入，串成链。这就是 LCEL（LangChain Expression Language）的核心。
- **`RunnableLambda`**：把任意普通函数包成 Runnable，插进链里做自定义处理。
- **`RunnablePassthrough`**：原样透传输入，常配合「在透传的同时并行加字段」。
- **`RunnableParallel`（对象写法）**：并行跑多个 Runnable，结果合并成一个对象——RAG 里「同时算 context 和 question」就靠它。

### 关键代码：从手写到 chain

```ts
// runnable.ts
import { ChatOpenAI } from '@langchain/openai';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { RunnableLambda, RunnablePassthrough } from '@langchain/core/runnables';

const chat = new ChatOpenAI({
  model: process.env.CHAT_MODEL,
  apiKey: process.env.OPENAI_API_KEY,
  configuration: { baseURL: process.env.OPENAI_BASE_URL },
});

// 1) 最基础的 chain：模板 → 模型 → 字符串解析器
const prompt = ChatPromptTemplate.fromTemplate('用一句话介绍 {topic}');
const parser = new StringOutputParser(); // 把 AIMessage 转成纯字符串

const chain = prompt.pipe(chat).pipe(parser);
console.log(await chain.invoke({ topic: 'Milvus' })); // 直接得到字符串

// 2) 插入自定义函数：把输出转大写（演示 RunnableLambda）
const upper = new RunnableLambda({ func: (s: string) => s.toUpperCase() });
const chain2 = prompt.pipe(chat).pipe(parser).pipe(upper);
console.log(await chain2.invoke({ topic: 'LangChain' }));

// 3) 并行 + 透传：同时保留原输入并加工
const chain3 = RunnablePassthrough.assign({
  // 在原输入对象上，新增一个 length 字段
  length: new RunnableLambda({ func: (x: { topic: string }) => x.topic.length }),
});
console.log(await chain3.invoke({ topic: 'agent' })); // { topic: 'agent', length: 5 }

// 4) chain 也支持流式（因为接口统一）
const stream = await chain.stream({ topic: '向量数据库' });
for await (const c of stream) process.stdout.write(c);
process.stdout.write('
');
```

```bash
node --env-file=.env --import tsx runnable.ts
```

注意 `chain.invoke({topic})` 一行就完成了「填模板 → 调模型 → 取文本」三步——这就是组装的威力。而且 chain 自动获得了 `.stream()` / `.batch()` 能力。

### 动手步骤
1. 跑 `runnable.ts`，理解 `.pipe()` 的数据流向。
2. 自己加一个 `RunnableLambda` 给结果加前缀「【AI】」。
3. 用 `chain.batch([{topic:'a'},{topic:'b'}])` 一次跑多个输入。

### 小结 / 常见坑
- **一切皆 Runnable**，`.pipe()` 串联，是 LangChain 现代写法的核心。
- 坑：`.pipe()` 要求前一步的输出类型能匹配后一步的输入类型，类型对不上就报错。
- 坑：`StringOutputParser` 很常用——没有它，链的输出是 `AIMessage` 对象而非字符串。
- 坑：`RunnablePassthrough.assign` 输入必须是对象，它在对象上「加字段」。

---

## 16. 实战练习 LCEL 组装 chain

### 学习目标
- 用 LCEL 把第 10 节的 RAG「问书」流程重写成一条优雅的 chain。
- 掌握 RAG chain 的标准范式：`{context, question} → prompt → model → parser`。
- 体会 LCEL 相比手写流程的简洁与可组合性。

### 核心概念讲解

LCEL（LangChain Expression Language）就是上一节 `.pipe()` 那套表达式。它最经典的应用就是 **RAG chain**。回忆第 10 节我们手写了：检索 → 拼 context → 填 prompt → 调模型 → 取文本。用 LCEL 可以声明式地表达成一条链：

```
输入(question 字符串)
  → RunnableParallel { context: 检索器, question: 原样透传 }
  → ChatPromptTemplate
  → ChatModel
  → StringOutputParser
  → 输出(答案字符串)
```

`RunnableParallel`（用对象字面量表示）让「检索 context」和「透传 question」**并行**完成，再把 `{context, question}` 一起喂给模板。这是 RAG chain 的标准写法，务必记住。

### 关键代码：LCEL 版 RAG chain

```ts
// rag-chain.ts
import { Milvus } from '@langchain/community/vectorstores/milvus';
import { OpenAIEmbeddings, ChatOpenAI } from '@langchain/openai';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { RunnablePassthrough, RunnableSequence } from '@langchain/core/runnables';
import type { Document } from '@langchain/core/documents';

const embeddings = new OpenAIEmbeddings({
  model: process.env.EMBED_MODEL,
  apiKey: process.env.OPENAI_API_KEY,
  configuration: { baseURL: process.env.OPENAI_BASE_URL },
});
const chat = new ChatOpenAI({
  model: process.env.CHAT_MODEL,
  apiKey: process.env.OPENAI_API_KEY,
  configuration: { baseURL: process.env.OPENAI_BASE_URL },
  temperature: 0,
});

async function main() {
  // 复用第 10 节灌好的 ebook collection，转成 retriever（也是个 Runnable）
  const store = await Milvus.fromExistingCollection(embeddings, {
    collectionName: 'ebook',
    url: process.env.MILVUS_URL,
  });
  const retriever = store.asRetriever({ k: 4 });

  const prompt = ChatPromptTemplate.fromTemplate(
    `根据书摘回答问题，没提到就说"书里没找到"。

书摘：
{context}

问题：{question}`,
  );

  // 把检索到的文档拼成纯文本
  const formatDocs = (docs: Document[]) => docs.map((d) => d.pageContent).join('

');

  // 用 LCEL 组装 RAG chain
  const ragChain = RunnableSequence.from([
    {
      // 并行：context 走检索器再格式化；question 原样透传
      context: retriever.pipe(formatDocs),
      question: new RunnablePassthrough(),
    },
    prompt,
    chat,
    new StringOutputParser(),
  ]);

  // 输入就是一个问题字符串，输出就是答案字符串
  const answer = await ragChain.invoke('书里的主角叫什么名字？');
  console.log(answer);

  // 同样自动支持流式
  // const stream = await ragChain.stream('简述第一章讲了什么');
  // for await (const c of stream) process.stdout.write(c);
}

main();
```

```bash
# 需先完成第 10 节的 book-ingest 建库
node --env-file=.env --import tsx rag-chain.ts
```

对比第 10 节几十行手写流程，这里核心就是一个 `RunnableSequence.from([...])` 声明式数组，逻辑一目了然，还白嫖了 `stream` / `batch`。

### 动手步骤
1. 确保第 10 节的 `ebook` collection 已建好。
2. 跑 `rag-chain.ts`，验证答案正确。
3. 取消注释流式部分，体验流式 RAG。
4. 给 chain 末尾再 `.pipe()` 一个 `RunnableLambda`，给答案加上「— 来自电子书助手」签名。

### 小结 / 常见坑
- RAG chain 范式：`{context: retriever.pipe(format), question: passthrough} → prompt → model → parser`，背下来。
- 坑：`retriever` 的输出是 `Document[]`，**必须先格式化成字符串**才能进 prompt 的 `{context}`。
- 坑：`RunnablePassthrough` 在这里把「整个输入字符串」当作 question 传下去。
- 坑：对象字面量里的 key（`context` / `question`）必须和 prompt 模板里的 `{变量名}` 完全对应。

---

## 17. LangChain 整体总结：Agent 第一阶段学习完成

### 学习目标
- 把本阶段所有知识点连成一张完整地图。
- 明确你现在已具备的能力，以及它们如何支撑后续阶段。
- 给自己一个可检验的「毕业标准」。

### 核心概念讲解：你已经学到的完整链路

回看这 17 节，其实是在拼一个完整的 Agent 能力栈：

```
            ┌─────────────────────────────────────────────┐
            │                  Agent                        │
            ├───────────────┬───────────────┬──────────────┤
   大脑     │   ChatOpenAI   │               │              │
   (LLM)    │  (OpenAI兼容)  │               │              │
            ├───────────────┼───────────────┼──────────────┤
   手脚     │  Tool Calling  │     MCP       │  第三方 MCP   │
   (Tools)  │  (节2-3)       │  (节4)        │  (节5)        │
            ├───────────────┴───────────────┴──────────────┤
   知识     │  RAG: Loader→Splitter→Embedding→Milvus 检索    │
   (Know)   │  (节6-10)                                      │
            ├───────────────────────────────────────────────┤
   记忆     │  Memory 三策略：截断 / 总结 / 检索              │
   (Memory) │  (节11)                                        │
            ├───────────────────────────────────────────────┤
   输出     │  结构化输出 withStructuredOutput / Parser       │
   (Output) │  (节12-13) + 流式 stream                        │
            ├───────────────────────────────────────────────┤
   编排     │  Prompt Template → Runnable → LCEL chain        │
   (Compose)│  (节14-16)                                      │
            └───────────────────────────────────────────────┘
```

把它们组合起来，你就能搭出一个「会查知识库、能调工具、有记忆、输出可控、代码优雅」的 Agent——这正是企业级知识库 Agent 的雏形。

### 关键代码：一个把多项能力捏在一起的迷你 Agent

```ts
// mini-agent.ts —— 综合：模板 + 工具 + RAG retriever + LCEL 思路
import { ChatOpenAI, OpenAIEmbeddings } from '@langchain/openai';
import { tool } from '@langchain/core/tools';
import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';
import { HumanMessage, ToolMessage, type BaseMessage } from '@langchain/core/messages';
import { Milvus } from '@langchain/community/vectorstores/milvus';
import { z } from 'zod';

const embeddings = new OpenAIEmbeddings({
  model: process.env.EMBED_MODEL,
  apiKey: process.env.OPENAI_API_KEY,
  configuration: { baseURL: process.env.OPENAI_BASE_URL },
});

// 把"查知识库"包装成一个工具，让模型自己决定要不要查
async function buildKbTool() {
  const store = await Milvus.fromExistingCollection(embeddings, {
    collectionName: 'ebook',
    url: process.env.MILVUS_URL,
  });
  return tool(
    async ({ query }) => {
      const docs = await store.similaritySearch(query, 3);
      return docs.map((d) => d.pageContent).join('

');
    },
    {
      name: 'search_knowledge_base',
      description: '当需要查阅电子书内容回答问题时使用',
      schema: z.object({ query: z.string().describe('检索关键词') }),
    },
  );
}

async function main() {
  const kbTool = await buildKbTool();
  const tools = [kbTool];
  const toolMap = { search_knowledge_base: kbTool };

  const chat = new ChatOpenAI({
    model: process.env.CHAT_MODEL,
    apiKey: process.env.OPENAI_API_KEY,
    configuration: { baseURL: process.env.OPENAI_BASE_URL },
  }).bindTools(tools);

  const messages: BaseMessage[] = [
    new HumanMessage('结合那本电子书，回答主角经历了什么转折？'),
  ];
  let ai = await chat.invoke(messages);
  messages.push(ai);
  while (ai.tool_calls?.length) {
    for (const call of ai.tool_calls) {
      const result = await toolMap[call.name as keyof typeof toolMap].invoke(call.args as any);
      messages.push(new ToolMessage({ content: String(result), tool_call_id: call.id! }));
    }
    ai = await chat.invoke(messages);
    messages.push(ai);
  }
  console.log(ai.content);
}

main();
```

这个 Agent 把「RAG 检索」做成了一个**工具**，由模型自主决定何时查库——这是比固定 RAG chain 更「智能体」的形态，也是下一阶段 LangGraph 要深入的方向。

### 动手步骤（毕业自检）
能独立做到以下几条，本阶段就算过关：
1. ✅ 不看教程，写出一个带 `read_file` + `run_command` 工具的循环 Agent。
2. ✅ 把一份文档灌进 Milvus 并完成语义问答。
3. ✅ 用 `withStructuredOutput` 从文本抽出结构化对象。
4. ✅ 用 LCEL 写出一条 `prompt → model → parser` 的 chain。
5. ✅ 说清截断 / 总结 / 检索三种 Memory 的适用场景。

### 小结 / 承上启下
- 本阶段你掌握了 Agent 的四大支柱（LLM / Tools / Memory / Output）和 LangChain 的编排范式（Runnable + LCEL）。
- 但目前的「循环」还是手写 while——**控制流不够灵活**（不好做分支、回退、人工介入）。这正是下一阶段 **LangGraph** 要解决的：用「图」来描述 Agent 的状态流转。
- 下一阶段还会把这些能力**工程化**：用 Nest 搭后端、接入 PostgreSQL/pgvector、Redis、ElasticSearch，让 Agent 从「能跑的脚本」变成「能上线的服务」。

---

### 导航

- 上一节：（本阶段为起点，无）
- 下一阶段：[02-阶段二-工程化与后端.md](./02-阶段二-工程化与后端.md)
