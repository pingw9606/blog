---
---
# 换个域名为什么还不通 —— 前端视角：CNAME、证书、CORS 三道关

> 背景：这次给埋点上报换了个自己品牌的域名（`event.vibeshort.live`，CNAME 到共用的 `event.shorttv.live`），本以为"运维配个 CNAME 就完事"，结果连环踩坑：域名解析不出 → 证书报错 → CORS 403 → 部署灰度没全量……前后折腾大半天。这篇把"换域名/接 CDN 时到底要过哪几道关"讲清楚——**CNAME 只是第一关，证书和 CORS 各是独立的一关，谁都不会自动帮你搞定。**

---

## 0. 先认识 CNAME

**CNAME（别名记录）= DNS 里把「一个域名」指向「另一个域名」。**

| DNS 记录 | 指向 | 例子 |
|---|---|---|
| A 记录 | 域名 → **IP** | `event.shorttv.live` → `54.x.x.x` |
| **CNAME** | 域名 → **另一个域名** | `event.vibeshort.live` → `event.shorttv.live` |

前端类比：CNAME ≈ **软链接 / 变量别名**——`event.vibeshort.live = event.shorttv.live`，你访问别名，最终落到它指向的真实服务器。

**为什么这么用**：想用自己品牌的域名对外（`event.vibeshort.live`），但请求实际打到共用的那套后端服务（`event.shorttv.live`）——换个"马甲"域名，隐藏两者关联。

## 1. 关键认知：CNAME 只管 DNS 解析，别的都不管

这是所有坑的根源。CNAME 只负责"域名 → 域名 → IP"这一层，**不会顺带帮你搞定证书、CORS、服务配置**。它们是三件独立的事：

```
浏览器访问 https://event.vibeshort.live/web/event
   ①DNS：event.vibeshort.live 解析到哪台 IP？        ← CNAME 管这个
   ②TLS：那台服务器的证书，认不认 event.vibeshort.live？ ← 证书管这个（CNAME 不管）
   ③CORS：服务器允不允许我这个页面来源跨域？          ← 服务端白名单管这个（CNAME 不管）
```
**三关全过才通。** 下面是我这次每一关怎么挂的。

## 2. 第 ① 关 · DNS：先解析得出来

**坑：域名拼错了。** 运维把 CNAME 配成了 `events`（复数）→ `events.shorttv.live`，而前端代码用的是 `event`（单数），且 `events.shorttv.live` 根本不存在 → 解析不出、连不上。

**排查**（看解析到哪个 IP、通不通）：
```bash
curl -s -o /dev/null -w "code=%{http_code} ip=%{remote_ip}\n" https://event.vibeshort.live/xxx
# code=000 ip=(空) → 域名没解析 / DNS 没配对
```

## 3. 第 ② 关 · 证书：HTTPS 要证书域名匹配

DNS 通了、解析到 IP 了，第二关是 **HTTPS 证书**。CNAME 让你指到了 shorttv 的服务器，但那台服务器的证书是 `*.shorttv.live` 的——**不包含 `vibeshort.live`**。浏览器一看"证书域名对不上"，直接拒绝：

```bash
curl -sv https://event.vibeshort.live/xxx 2>&1 | grep -iE "subject:|does not match"
#  subject: CN=*.shorttv.live
#  subjectAltName does not match host name event.vibeshort.live   ← 证书不认新域名
```
报错类似 `NET::ERR_CERT_COMMON_NAME_INVALID`。

**要点：CNAME 不改证书。** 换了新域名，必须在服务的接入层（LB/CDN/Nginx）**给新域名配一张覆盖它的 SSL 证书**（比如 `*.vibeshort.live`）。

## 4. 第 ③ 关 · CORS：服务端按「来源」放行，跟目标域名无关

证书也过了，第三关是 **CORS（跨域）**。这关最反直觉：

**CORS 检查的是「请求从哪个页面发出（Origin）」，不是「请求打到哪个域名」。** 所以哪怕你 CNAME 到了 shorttv、目标是 shorttv 的服务，只要**发请求的页面是 `vibeshort.live`**，服务端的 CORS 白名单里没有 `*.vibeshort.live`，就一律拦：

```bash
curl -X OPTIONS -H "Origin: https://www.vibeshort.live" \
  -H "Access-Control-Request-Method: POST" https://event.vibeshort.live/web/event -i
# HTTP 403，且响应里没有 Access-Control-Allow-Origin → 白名单没放行 vibeshort
```
浏览器控制台报：`blocked by CORS policy: No 'Access-Control-Allow-Origin' header`。

**要点：CNAME 不改 CORS。** 得让服务端把新来源加进 CORS 白名单（我们这次是在后端 `@CrossOrigin` 加 `https://*.vibeshort.live`）。

> 有个反直觉的验证：用 vibeshort 来源**直接打 shorttv 域名**（绕开 CNAME），如果还是 403——就证明"不是 CNAME 的问题，是白名单没放行来源"。（我们就是这么定位的。）

## 5. 还有第 ④ 关（部署）· 灰度没全量

代码（CORS 白名单）改了、合并了、部署也"成功"了，线上还是 403。最后发现是**灰度发布只更新了部分节点**，域名背后两台机器没全更新，请求大多打到旧白名单的节点上。**全量后才生效。**（详见《[灰度发布·前端视角](./灰度发布-前端视角)》。）

## 6. 换域名 / 接 CDN 的完整 checklist

下次要给某个服务换域名或接 CDN，照这几关逐一确认，别只配 CNAME 就以为完事：

- [ ] **DNS**：CNAME/A 记录配对（拼写、单复数、目标存在），能解析出 IP
- [ ] **证书**：新域名有覆盖它的 SSL 证书（`*.新域名`），HTTPS 不报证书不匹配
- [ ] **CORS**：服务端把新来源域名加进白名单（若涉及浏览器跨域请求）
- [ ] **服务端其它校验**：防盗链 Referer、网关白名单等，是否也认新域名
- [ ] **部署**：改动全量生效（别停在灰度）

## 7. 前端排查三层法（curl 分层定位卡在哪关）

```bash
# ① DNS 通不通、解析到哪
curl -s -o /dev/null -w "code=%{http_code} ip=%{remote_ip}\n" https://新域名/路径
# ② 证书认不认这个域名
curl -sv https://新域名/路径 2>&1 | grep -iE "subject:|does not match|verify"
# ③ CORS 放不放行这个来源
curl -X OPTIONS -H "Origin: https://你的页面域名" https://新域名/路径 -i | grep -i access-control-allow-origin
```
一层层往下试，哪层挂了就知道是 DNS / 证书 / CORS 哪一关的事，不会再"一个 403 查半天不知道该找谁"。

## 8. 一句话总结

- **CNAME = 域名别名，只管 DNS 解析**，把请求导到另一个域名/服务器。
- **换域名不是配个 CNAME 就通**——还要过**证书**（新域名要有匹配证书）和 **CORS**（服务端要放行新来源）两关，它俩 CNAME 都不管。
- 排查用 **curl 三层法**（DNS → 证书 → CORS）逐层定位，比盯着一个笼统的报错猜快得多。
