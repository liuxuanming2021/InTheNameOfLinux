# LinuxWeb —— 插件官网与帮助中心

`InTheNameOfLinux` 这一套插件（以及 LinuxAPP 手机端）的**官网 / 使用文档**仓库。
纯静态：一个页面就是一个 `.html`，样式写在各自的 `<style>` 里，没有构建步骤，
推到 GitHub Pages 就能看。

线上地址：**<https://linux.nalxer.top/>**（仓库里的 `CNAME`）

---

## 1. 仓库里有什么

```
/
├── index.html                  首页：9 张插件卡片 + 导航
├── CNAME                       linux.nalxer.top
├── icon.svg                    favicon / apple-touch-icon
│
├── linux.html                  InTheNameOfLinux 总览
├── linuxhelp.html              总帮助入口
├── linuxpluginhelp.html        插件说明（命令、权限、配置全量）
│
├── ace.html        acehelp.html          LinuxACE（箱子锁 / 锁容器）
├── chest.html      chesthelp.html        LinuxChestGUI
├── fakeplayer.html fakeplayerhelp.html   FakePlayerPlugin（假人挂机）
├── linuxtab.html   linuxtabhelp.html     LinuxTAB（TAB 列表 / 称号前缀）
├── sync.html       synchelp.html         LinuxSync
├── team.html       teamhelp.html         LinuxTeam（队伍）
├── title.html      titlehelp.html        LinuxTitle（头衔）
│
├── nalxerapp.html               LinuxAPP（手机端）介绍页
├── nalxerapphelp.html           LinuxAPP 使用帮助（安装 / 配置 / 接口 / 排错）
│
├── download/                   所有 jar / apk / ipa 都放这里
│   ├── LinuxAPP.jar
│   ├── InTheNameOfLinux.jar
│   ├── LinuxAPP-<版本>.apk
│   ├── LinuxAPP-ios-native-{adhoc,unsigned}.ipa
│   └── Nalxer-<版本>-ios12-{adhoc,unsigned}.ipa
│
└── _tools/                     check_html.py（结构校验）、文本版使用说明
```

每个插件都是「介绍页 + 帮助页」成对出现。

## 2. 本地预览

双击 `index.html` 就能看，但**下载链接和相对路径建议用 HTTP 方式**打开：

```bash
cd LinuxWeb
python -m http.server 8080
# http://127.0.0.1:8080
```

## 3. 当前版本（与服务端 `plugins/` 里的 jar 对齐）

| 插件 | 版本 |
| --- | --- |
| InTheNameOfLinux | 26.11.6-RC |
| LinuxACE | 26.11.5 |
| LinuxChestGUI | 26.11.7-Beta |
| LinuxSync | 26.11.5 |
| LinuxTAB | 26.11.8 |
| LinuxTeam | 26.11.5 |
| LinuxTitle | 26.11.5 |
| FakePlayerPlugin | 26.12.11 |
| LinuxAPP（插件 + 手机端） | 26.13.55 |

## 4. 发新版本时要改的地方

1. `download/` 里放新包（老包可以删，只留最新一版）；
2. 对应页面的 `<span class="plug-hero-ver">` 版本串；
3. 帮助页顶部「这一版改了什么」的表格；
4. `index.html` 卡片里的 `<p class="plug-ver">`；
5. 首页 `LinuxAPP` 卡片的正文（功能变了就顺手改）。

## 5. 部署

推 `main`，GitHub Pages 自己构建（大约 1~5 分钟）。仓库 → Settings → Pages 确认分支是 `main` / 根目录。

```bash
git add -A
git commit -m "站点：更新到 26.13.55"
git push
```

## 6. 手机端源码

客户端与插件源码在另一个仓库：**<https://github.com/liuxuanming2021/LinuxAPP>**
（插件 `src/`、网页版 `app/mobile/www`、iOS 12 壳 `app/mobile-ios12`、原生 iOS `app/mobile-ios-native`、CI）。

## 7. 注意

- 页面里不要写死服务端 IP；对外统一 `https://api.nalxer.top:49283`。
- `download/` 里的 ipa 都是**未签名**的，用户要自己用 Sideloadly / AltStore 自签；`*-adhoc.ipa` 是 CI 假签名，作用只是能被安装工具识别。
- 帮助页里旧的 `verify.*`（二次验证）配置已经废弃，页面里明确标了「已废弃」，别再照着配。
