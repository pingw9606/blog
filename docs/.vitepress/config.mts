import { defineConfig } from 'vitepress'

export default defineConfig({
  base: '/blog/',
  title: 'woody 的博客',
  description: 'woody 的技术学习笔记与实战记录',
  markdown: {
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
      { text: '重构实战', link: '/java-refactor/' }
    ],
    sidebar: {
      '/articles/': [
        {
          text: '前端文章',
          items: [
            { text: 'React面试学习-对比Vue', link: '/articles/React面试学习-对比Vue' },
            { text: 'Next.js面试学习-对比Nuxt', link: '/articles/Nextjs面试学习-对比Nuxt' },
            { text: '前端手写代码题', link: '/articles/前端手写代码题' },
            { text: 'SEO要点总结-面试与实战', link: '/articles/SEO要点总结-面试与实战' },
            { text: 'Kiro规范接入-面试备战', link: '/articles/Kiro规范接入-面试备战' }
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
            { text: '08 HTTPS与上线', link: '/java-refactor/08-HTTPS与上线' }
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
