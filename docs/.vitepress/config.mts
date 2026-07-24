import { defineConfig } from 'vitepress'

export default defineConfig({
  base: '/blog/',
  title: 'woody 的博客',
  description: 'woody 的技术学习笔记与实战记录',
  markdown: {
    // 关闭裸 HTML 解析：正文中未包裹在代码块里的 <tag> 会被转义为文本，
    // 避免飞书导入文档里大量裸露的 HTML/JSX 标签被 Vue 当作组件解析而报错。
    // 代码块（``` 与行内 `）内的内容不受影响，正常按代码展示。
    html: false,
    config(md) {
      // 包裹所有内容为 v-pre，防止 {{ }} 被 Vue 解析
      const defaultRender = md.render.bind(md)
      md.render = (src, env) => {
        return `<div v-pre>${defaultRender(src, env)}</div>`
      }
    }
  },
  themeConfig: {
    nav: [
      { text: '首页', link: '/' },
      { text: '文章', link: '/articles/React面试学习-对比Vue' },
      { text: 'Agent教程', link: '/agent/00-课程大纲速览' },
      { text: '后端运维笔记', link: '/backend/' },
      { text: '重构实战', link: '/java-refactor/' },
      { text: '前端面试题', link: '/interview/' },
      { text: 'SSR实战', link: '/ssr/' }
    ],
    sidebar: {
      '/articles/': [
        {
          text: '前端文章',
          items: [
            { text: 'React面试学习-对比Vue', link: '/articles/React面试学习-对比Vue' },
            { text: 'React + TypeScript 实战', link: '/articles/React-TypeScript实战' },
            { text: 'Next.js面试学习-对比Nuxt', link: '/articles/Nextjs面试学习-对比Nuxt' },
            { text: '前端手写代码题', link: '/articles/前端手写代码题' },
            { text: 'SEO要点总结-面试与实战', link: '/articles/SEO要点总结-面试与实战' },
            { text: 'Kiro规范接入-面试备战', link: '/articles/Kiro规范接入-面试备战' },
            { text: 'AI时代与SDD规范驱动-自学路线', link: '/articles/AI时代与SDD规范驱动-自学路线' },
            { text: 'TikTok小程序·H5改造完整指南', link: '/articles/TikTok小程序-H5改造完整指南' },
            { text: 'TikTok小程序·登录与支付时序详解', link: '/articles/TikTok小程序-登录与支付时序详解' }
          ]
        }
      ],
      '/agent/': [
        {
          text: 'Agent 全栈教程',
          items: [
            { text: '课程大纲速览', link: '/agent/00-课程大纲速览' },
            { text: '阶段一：Agent开发基础', link: '/agent/01-阶段一-Agent开发基础' },
            { text: '阶段二：工程化与后端', link: '/agent/02-阶段二-工程化与后端' },
            { text: '阶段三：高级RAG记忆与可观测', link: '/agent/03-阶段三-高级RAG记忆与可观测' },
            { text: '阶段四：进阶底层与综合实战', link: '/agent/04-阶段四-进阶底层与综合实战' }
          ]
        }
      ],
      '/backend/': [
        {
          text: '后端 & 运维学习笔记',
          items: [
            { text: '总览', link: '/backend/' },
            { text: '01 服务器安全加固', link: '/backend/01-服务器安全加固' },
            { text: '02 Linux运维-apt卡死排查', link: '/backend/02-Linux运维-apt卡死排查' },
            { text: '03 Git与GitHub协作', link: '/backend/03-Git与GitHub协作' },
            { text: '04 CICD与Docker部署', link: '/backend/04-CICD与Docker部署' },
            { text: '05 全栈架构与鉴权原理', link: '/backend/05-全栈架构与鉴权原理' },
            { text: '06 数据库选型与运维', link: '/backend/06-数据库选型与运维' },
            { text: '07 后端查库找问题流程', link: '/backend/07-后端查库找问题流程' },
            { text: '08 JVM调优与排查', link: '/backend/08-JVM调优与排查' },
            { text: '09 MySQL索引优化', link: '/backend/09-MySQL索引优化' },
            { text: '10 前端转后端学习路线图', link: '/backend/10-前端转后端学习路线图' }
          ]
        },
        {
          text: '前端视角 · 后端/运维科普',
          items: [
            { text: '这套SEO项目的后端全景·前端视角', link: '/backend/这套SEO项目的后端全景-前端视角' },
            { text: 'SSR/CSR/SSG/ISR 渲染模式·前端视角', link: '/backend/SSR-CSR-SSG-ISR渲染模式-前端视角' },
            { text: 'Kubernetes与Pod·前端视角', link: '/backend/Kubernetes与Pod-前端视角' },
            { text: '一套代码跑多产品与数据隔离·前端视角', link: '/backend/一套代码跑多产品与数据隔离-前端视角' },
            { text: 'Nacos配置中心·前端视角', link: '/backend/Nacos配置中心-前端视角' },
            { text: '消息队列与Kafka·前端视角', link: '/backend/消息队列与Kafka-前端视角' },
            { text: '定时任务与XXL-Job·前端视角', link: '/backend/定时任务与XXL-Job-前端视角' },
            { text: '接口加密与验签·前端视角', link: '/backend/接口加密与验签-前端视角' },
            { text: '埋点从前端到数仓全链路·前端视角', link: '/backend/埋点全链路-前端视角' },
            { text: 'OAuth2令牌与飞书登录·前端视角', link: '/backend/OAuth2令牌与飞书登录-前端视角' },
            { text: '灰度发布·前端视角', link: '/backend/灰度发布-前端视角' },
            { text: '看懂DMS里的数据库实例·前端视角', link: '/backend/看懂DMS里的数据库实例-前端视角' },
            { text: 'Web性能指标与Lighthouse·前端视角', link: '/backend/Web性能指标与Lighthouse-前端视角' },
            { text: 'CDN内容分发网络·前端视角', link: '/backend/CDN内容分发网络-前端视角' },
            { text: '换域名为什么还不通·CNAME/证书/CORS', link: '/backend/换域名为什么还不通-CNAME证书CORS-前端视角' },
            { text: '从一行代码到线上容器·运维入门', link: '/backend/从一行代码到线上容器-前端视角的运维入门' },
            { text: '前端自测指南·从界面到数据库', link: '/backend/前端自测指南-从界面到数据库' }
          ]
        }
      ],
      '/java-refactor/': [
        {
          text: '全栈重构实战（Java + React）',
          items: [
            { text: '系列总览', link: '/java-refactor/' },
            { text: '01 重构总览与项目结构', link: '/java-refactor/01-重构总览与项目结构' },
            { text: '02 Java后端搭建', link: '/java-refactor/02-Java后端搭建' },
            { text: '03 鉴权重构 Session→JWT', link: '/java-refactor/03-鉴权重构-Session到JWT' },
            { text: '04 数据库与Flyway迁移', link: '/java-refactor/04-数据库与Flyway迁移' },
            { text: '05 React前端搭建', link: '/java-refactor/05-React前端搭建' },
            { text: '06 Docker与本地全栈联调', link: '/java-refactor/06-Docker与本地全栈联调' },
            { text: '07 CICD与镜像发布', link: '/java-refactor/07-CICD与镜像发布' },
            { text: '08 HTTPS与上线', link: '/java-refactor/08-HTTPS与上线' },
            { text: '09 老站零影响迁移与灰度切换', link: '/java-refactor/09-老站零影响迁移与灰度切换' }
          ]
        }
      ],
      '/interview/': [
        {
          text: '前端面试题（16 专题）',
          items: [
            { text: '总览', link: '/interview/' },
            {
              text: '01 JavaScript（323题）',
              collapsed: true,
              items: [
                { text: '总览', link: '/interview/js/' },
                { text: '异步与事件循环', link: '/interview/js/01-异步与事件循环' },
                { text: '框架 React/Vue', link: '/interview/js/02-框架-React-Vue' },
                { text: '浏览器与DOM', link: '/interview/js/03-浏览器与DOM' },
                { text: '网络与安全', link: '/interview/js/04-网络与安全' },
                { text: '工程化与模块', link: '/interview/js/05-工程化与模块' },
                { text: '手写与编程题', link: '/interview/js/06-手写与编程题' },
                { text: '原型与继承', link: '/interview/js/07-原型与继承' },
                { text: '作用域与闭包', link: '/interview/js/08-作用域与闭包' },
                { text: '数据类型与转换', link: '/interview/js/09-数据类型与转换' },
                { text: '函数与对象', link: '/interview/js/10-函数与对象' },
                { text: 'ES语法特性', link: '/interview/js/11-ES语法特性' },
                { text: 'JS核心与其他（1）', link: '/interview/js/12-JS核心与其他-1' },
                { text: 'JS核心与其他（2）', link: '/interview/js/13-JS核心与其他-2' },
                { text: 'JS核心与其他（3）', link: '/interview/js/14-JS核心与其他-3' }
              ]
            },
            { text: '02 CSS（61题）', link: '/interview/02-CSS（61题）' },
            { text: '03 HTML（57题）', link: '/interview/03-HTML（57题）' },
            { text: '04 React（83题）', link: '/interview/04-React（83题）' },
            { text: '05 Vue（80题）', link: '/interview/05-Vue（80题）' },
            { text: '06 算法（19题）', link: '/interview/06-算法（19题）' },
            { text: '07 计算机网络（71题）', link: '/interview/07-计算机网络（71题）' },
            { text: '08 Node.js（27题）', link: '/interview/08-Node.js（27题）' },
            { text: '09 TypeScript（46题）', link: '/interview/09-TypeScript（46题）' },
            { text: '10 性能优化（25题）', link: '/interview/10-性能优化（25题）' },
            { text: '11 前端安全（21题）', link: '/interview/11-前端安全（21题）' },
            { text: '12 小程序（9题）', link: '/interview/12-小程序（9题）' },
            { text: '13 ES6（32题）', link: '/interview/13-ES6（32题）' },
            { text: '14 编程题（50题）', link: '/interview/14-编程题（50题）' },
            { text: '15 设计模式（7题）', link: '/interview/15-设计模式（7题）' },
            { text: '16 工程化（34题）', link: '/interview/16-工程化（34题）' }
          ]
        }
      ],
      '/ssr/': [
        {
          text: 'SSR 项目实战 · 总览',
          items: [
            { text: '课题总览 · 两套SSR对比', link: '/ssr/' },
            { text: '跨栈对比 · 概念映射与复刻方法论', link: '/ssr/跨栈对比-概念映射与复刻方法论' }
          ]
        },
        {
          text: 'Nuxt 3 老站篇（shorttv）',
          items: [
            { text: '① 项目结构与文件路由', link: '/ssr/nuxt-01-项目结构与文件路由' },
            { text: '② 数据获取与 SSR', link: '/ssr/nuxt-02-数据获取与SSR' },
            { text: '③ Pinia 状态管理', link: '/ssr/nuxt-03-Pinia状态管理' },
            { text: '④ @nuxtjs/i18n 国际化', link: '/ssr/nuxt-04-i18n国际化' },
            { text: '⑤ SEO（useHead/hreflang）', link: '/ssr/nuxt-05-SEO' },
            { text: '⑥ 播放器 xgplayer', link: '/ssr/nuxt-06-播放器xgplayer' },
            { text: '⑦ Nitro 与部署', link: '/ssr/nuxt-07-Nitro与部署' }
          ]
        },
        {
          text: 'Next 16 新站篇（vibeshort）',
          items: [
            { text: '① 项目结构与 App Router', link: '/ssr/next-01-项目结构与AppRouter' },
            { text: '② 数据获取与 SSR', link: '/ssr/next-02-数据获取与SSR' },
            { text: '③ Server/Client 组件与状态', link: '/ssr/next-03-Server与Client组件' },
            { text: '④ next-intl 国际化', link: '/ssr/next-04-next-intl国际化' },
            { text: '⑤ SEO（metadata/canonical/hreflang）', link: '/ssr/next-05-SEO' },
            { text: '⑥ 播放器 hls.js 与媒体', link: '/ssr/next-06-播放器hls.js与媒体' },
            { text: '⑦ 渲染模式与部署', link: '/ssr/next-07-渲染模式与部署' }
          ]
        }
      ]
    },
    socialLinks: [
      { icon: 'github', link: 'https://github.com' }
    ],
    search: { provider: 'local' }
  }
})
