import { defineConfig } from 'vitepress'

export default defineConfig({
  base: '/blog/',
  title: '前端教程博客',
  description: 'AI 生成的前端学习笔记',
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
      { text: 'Agent教程', link: '/agent/00-课程大纲速览' }
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
      ]
    },
    socialLinks: [
      { icon: 'github', link: 'https://github.com' }
    ],
    search: { provider: 'local' }
  }
})
