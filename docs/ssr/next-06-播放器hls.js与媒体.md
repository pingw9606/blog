---
---
# Next 新站篇⑥：播放器 hls.js 与媒体

> 短剧站核心是播放。老站用 xgplayer，新站换成 **hls.js** 自己封装了一个竖屏播放器 `HlsPlayer`。本篇讲 HLS 播放、加密 HLS 解密、SPA 内原地切集、同源代理规避 CORS，以及和埋点的配合。

---

## 0. 为什么是 hls.js

短剧视频是 **HLS**（`.m3u8` + `.ts` 切片）。浏览器里：
- **Safari/iOS 原生支持** HLS（`video` 直接播）；
- **其它浏览器（Chrome 等）不原生支持** → 用 **hls.js**（JS 解析 m3u8、喂给 `MediaSource`）。

所以 `HlsPlayer` 的策略：**非加密且浏览器原生支持 → 用原生；否则用 hls.js**。

## 1. 播放分支（普通 vs 加密 HLS）

```tsx
const isEncrypted = src.includes('/hls-encrypted/');
// 非加密 + 浏览器原生支持 HLS（Safari）→ 直接 video.src
if (!isEncrypted && vid.canPlayType('application/vnd.apple.mpegurl')) { vid.src = playSrc; return; }
// 其它 → hls.js
const { default: Hls } = await import('hls.js');   // 动态 import，不进首屏包
```
**加密 HLS**（地址含 `/hls-encrypted/`）：用专门的解密 loader，并开 `enableSoftwareAES`、关 `enableWorker`（和老站一致）：
```tsx
const hls = new Hls({ enableWorker: false, enableSoftwareAES: true, loader });
hls.loadSource(playSrc); hls.attachMedia(vid);
```
> 加密 HLS 只能走 hls.js（原生无法解密），所以对加密源强制用 hls.js + 解密插件。

## 2. 同源代理规避 CDN CORS

浏览器直接拉 CDN 的 m3u8/ts 可能有跨域限制。默认经**同源代理** `/api/hls?u=...` 转发（服务端代拉，规避 CDN CORS）；生产 CDN 放行站点域名后，可设 `NEXT_PUBLIC_HLS_DIRECT=1` 直连：
```tsx
const direct = process.env.NEXT_PUBLIC_HLS_DIRECT === '1';
const playSrc = direct || !src.includes('.shorttv.live') ? src : `/api/hls?u=${encodeURIComponent(src)}`;
```

## 3. SPA 内"原地切集"（不重载页面）

换集时不跳路由、不卸载 `<video>`，而是**原地换源**（对齐老站 SPA 体验）：
```tsx
useEffect(() => { /* src 变 → 重新 setup(loadSource/attachMedia)，video 元素复用 */ }, [src]);
```
配合父组件 `EpisodePlayerClient`：切集时 `setCurrentNumber` + `history.replaceState` 改 URL（不触发导航），播放器 `src` 变→原地换源。

## 4. 和埋点的配合

播放器是埋点密集区（`"use client"` 组件里直接 `track`）：
- **首次播放**上报 `reel_play`（每次换集重置，`play` 事件触发一次）；
- **播完自动续播**下一集免费时 `onEnded` → 上报 `reel_cut` + 切集；
- **`currentTimeRef`**：`timeupdate` 把当前进度写回父组件，供 `episode_click`/`reel_cut` 带 `seconds`。

（埋点细节见《[埋点全链路](../backend/埋点全链路-前端视角)》。）

## 5. 清晰度与控制条

`MANIFEST_PARSED` 时读 `hls.levels` 生成清晰度列表（含 Auto），交给自定义 `PlayerControls` 切换：
```tsx
hls.on(Hls.Events.MANIFEST_PARSED, () => setLevels([{label:'Auto',value:-1}, ...levels]));
// 选清晰度：hls.currentLevel = value  (-1 = Auto)
```

## 6. 对照 Nuxt（xgplayer）

| | 老站 xgplayer | 新站 hls.js |
|---|---|---|
| 定位 | 成品播放器（含 UI） | 底层 HLS 引擎，UI 自己封装 |
| 加密 HLS | xgplayer 插件 | hls.js + 解密 loader（`enableSoftwareAES`、关 worker） |
| 切集 | 组件内换源 | `src` 变 → `useEffect` 原地换源 |
| 组件形态 | Vue 组件 | `"use client"` React 组件 |

> 复刻时播放器基本是**重写**（不同库、不同 API），但"竖屏 9:16、原地切集、加密 HLS、清晰度"这些行为对齐老站。

## 7. 小结

- HLS 播放：**Safari 原生 / 其它 hls.js**；**加密 HLS 强制 hls.js + 解密 loader**（`enableSoftwareAES`、关 worker）。
- **同源代理 `/api/hls`** 规避 CDN CORS；生产放行后可直连。
- **SPA 内原地切集**（换 src 不卸载 video）+ `history.replaceState` 改 URL。
- 播放器是 `"use client"` 组件，埋点（reel_play/reel_cut）+ 进度（currentTimeRef）都在这。

下一篇：**渲染模式与部署**。
