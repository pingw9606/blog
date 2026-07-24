---
---
# Nuxt 老站篇⑥：播放器 xgplayer

> 老站用 **xgplayer**（西瓜播放器，成品播放器含 UI）播 HLS。本篇讲 xgplayer + HLS 插件、加密 HLS 的解密 loader、动态加载。对照 Next 新站"脱掉 xgplayer 壳、直接用 hls.js"。

---

## 0. xgplayer + HLS 插件

xgplayer 是**成品播放器**（自带 UI/控制条），播 HLS 要配 HLS 插件。老站按需**动态 import**：
```ts
const { default: Player } = await import('xgplayer')
await import('xgplayer/dist/index.min.css')
const HlsJsPlugin = (await import('xgplayer-hls.js')).default
player.value = new Player({ el, url, plugins: [HlsJsPlugin, ...], ... })
```
动态 import 让播放器代码不进首屏包（首屏更快）。

## 1. 加密 HLS 的解密 loader

加密 HLS 需要自定义 loader 解密切片。老站两条路：
- **`hls-decryts-plugin` 的 `VideoHlsPlugin()`**（现成解密插件）：
  ```ts
  const { VideoHlsPlugin } = await import('hls-decryts-plugin')
  // 作为 hls.js 的 loader 传入
  ```
- **自定义 `utils/video-hls-loader.ts` 的 `VideoBaseHlsPlugin()`**：扩展 `Hls.DefaultConfig.loader`，在 `load`/`onSuccess` 钩子里处理 m3u8/切片：
  ```ts
  class HlsCustomLoader extends Hls.DefaultConfig.loader {
    load(context, config, callbacks) { /* 拦截、按需解密后回调 onSuccess */ }
  }
  ```

## 2. 清晰度与自定义插件

`xgplugins/RateDefinitionPlugin.js` 是自定义清晰度插件，接入 xgplayer 的插件体系，做多档清晰度切换。

## 3. 关键：新站没有沿用 xgplayer

复刻到 Next 时**播放器是重写**的——新站**脱掉 xgplayer 这层成品壳，直接用 `hls.js`**，UI 自己封装（`HlsPlayer` 组件）。但**加密 HLS 的解密插件 `hls-decryts-plugin` 两站共用**（新站也 `import('hls-decryts-plugin').VideoHlsPlugin` 当 loader）。

为什么脱壳：xgplayer 是 Vue 生态友好的成品播放器；到 React 里再包一层成品播放器不如直接用底层 `hls.js` 灵活（竖屏 UI、原地切集、埋点都要深度定制）。

## 4. 对照 Next 新站

| | Nuxt 3 老站 xgplayer | Next 16 新站 hls.js |
|---|---|---|
| 播放器 | xgplayer（成品，含 UI） | hls.js（底层引擎，UI 自封装） |
| HLS | `xgplayer-hls.js` 插件 | hls.js 原生 + Safari 原生 |
| 加密 HLS | `hls-decryts-plugin` / 自定义 loader | **同款 `hls-decryts-plugin`** + `enableSoftwareAES` |
| 加载 | 动态 import xgplayer/插件 | 动态 import hls.js |
| 清晰度 | xgplayer 插件（RateDefinition） | 读 `hls.levels` + 自定义控制条 |

## 5. 小结

- 老站 = **xgplayer 成品播放器 + xgplayer-hls.js + hls-decryts-plugin/自定义 loader** 播（加密）HLS，动态 import 减首屏。
- 新站**脱掉 xgplayer 壳、直接 hls.js**，但**解密插件 `hls-decryts-plugin` 两站共用**；播放器是复刻里少数"完全重写"的部分。

下一篇：**Nitro 与部署**。
