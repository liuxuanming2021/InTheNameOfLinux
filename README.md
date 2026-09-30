# LinuxWeb —— InTheNameOfLinux 官网

`InTheNameOfLinux` 插件的官方网站 / 使用文档。**纯静态、零依赖、零构建**：两个 HTML 文件直接双击就能看，丢到任何静态托管（GitHub Pages / 宝塔 / Nginx）都能跑。

> 同一台服务器的官网在另一个目录：`../NalxerWeb/`（`nalxer.top`）。
> 两者关系：**LinuxWeb 是这个插件的官网，NalxerWeb 是跑这个插件的服务器官网**，
> 两个站之间互相有跳转（LinuxWeb 导航栏的「Nalxer 服务器 →」）。

---

## 1. 目录结构

```
LinuxWeb/
├─ index.html          产品页（功能介绍 / 封禁体系 / 命令列表 / 技术亮点）
├─ help.html           帮助中心（快速开始 / 命令详解 / 配置 / 权限 / 故障排查 / FAQ）
├─ icon.svg            favicon 与 apple-touch-icon
├─ _tools/
│  └─ check_html.py    结构校验脚本（Python 标准库，无需安装依赖）
└─ README.md           本文件
```

没有打包器、没有 npm、没有 CSS 框架 —— 所有样式都写在各自文件的 `<style>` 里。

## 2. 本地预览

直接双击 `index.html` 即可。若要用 HTTP 方式预览（推荐，避免个别浏览器对 `file://` 的限制）：

```powershell
cd E:\Plugins\LinuxWeb
python -m http.server 8080
# 然后打开 http://127.0.0.1:8080
```

## 3. 页面结构

### index.html（1663 行）

| 区块 id | 内容 |
|---|---|
| `#whatsnew` | **本版更新亮点**（26.11.3 新增：fs1 保护接管 / 命令接管 / 插件所有权 / 审计防篡改 / 监听器自检 / 变量扩展修复 / 尊重他人取消 / 口令升级） |
| `#features` | 核心功能九宫格（身份验证 / 封禁管理 / 功能封禁 / 举报系统 / 协管体系 / 玩家保护 / 插件联动 / 数据持久化 / 交互式帮助） |
| `#penalty` | 封禁系统（账号封禁 / 时间格式 / 功能封禁 / 历史查询） |
| `#report` | 举报系统（提交流程 / 分流规则 / 离线缓存 / 批量清理） |
| `#moderator` | 协管权限体系（可用 / 不可用 / 时长限制 / 界面分流） |
| `#commands` | 命令列表（管理员通用 / 封禁 / 功能封禁 / 其他） |
| `#tech` | 技术亮点（安全 / 性能 / 并发 / 健壮） |

顶部导航锚点指向上述前五个区块。

### help.html（2177 行）

左侧目录 + 右侧正文，10 个章节：

| 章节 | id |
|---|---|
| 更新日志 | `#changelog` |
| 1 快速开始 | `#quickstart` |
| 2 命令详解 | `#commands` |
| 3 举报系统 | `#report` |
| 4 二次确认机制 | `#confirm` |
| 5 权限说明 | `#permissions` |
| 6 配置说明 | `#config` |
| 7 插件联动 | `#integration` |
| 8 故障排查 | `#troubleshooting` |
| 9 常见问题 | `#faq` |
| 10 卸载与备份 | `#uninstall` |

目录高亮由 `IntersectionObserver` 驱动，滚动时自动切换当前章节。

## 4. 内容同步（最重要的一节）

这个网站是**手工同步**的，没有自动生成。插件那边改了东西，必须回来改对应条目，否则网站会和实际行为不一致。

当前基线：**插件版本 26.11.3-Alpha**。

| 插件侧变动 | 网站要改哪里 |
|---|---|
| 版本号 `plugin.yml` 的 `version` | `index.html` 的 hero 徽章 + 页脚；`help.html` 页脚（共 3 处，搜索 `v26.`） |
| **每次发版的新增功能** | `index.html` 的 `#whatsnew`「更新亮点」区块 + `help.html` 的 `#changelog`「更新日志」表（**26.11.3 起新增的两处，以前没有，最容易被忘**） |
| 新增 / 删除 / 改名子命令 | `help.html` §2 命令表、`index.html` §commands 命令表、`help.html` §9 相关 FAQ |
| `config.yml` 增删配置项或改默认值 | `help.html` §6 关键配置项表 |
| 权限节点变化 | `help.html` §5 权限表 |
| 用户可见的行为变化 | `help.html` §8 故障排查（旧的排查建议会变成误导） |
| 新增占位符变量 | `help.html` §7「PlaceholderAPI 变量」表 |
| 数据文件增减 | `help.html` §7「数据文件」表 |
| 登录 / 密码流程变化 | `help.html` §1 快速开始、§2 登录相关表、§9 相关 FAQ |
| fs1 突破通道的开关 / 行为变化 | `help.html` §7 配置说明表（`fs1-refuse-enabled`、`fs1-offline-console`）、§9 FAQ「"突破 fs1 拦截"是什么」 |
| 命令接管 / 插件所有权 / 审计防篡改等新机制 | `help.html` §6 配置说明表（`command-takeover`、`command-takeover-exclude`、`owner-force-permissions`）、`#changelog` |
| 监听器冲突、被其他插件取消等对抗行为 | `index.html` `#whatsnew`、`help.html` `#changelog`；**不要**写进"使用说明"，那属于实现细节 |

**已经踩过的坑**（写下来避免重复）：

- 版本号曾长期停在 `v26.10.5-Alpha`，而插件早已是 26.11.x —— 改版本号要三处一起改。
- `fs1-refuse-enabled` 的默认值在插件里改成 `false`（提权通道默认关闭），网站上却还写着 `true` —— **默认值必须逐项核对，不能凭印象**。
- `/linux login <密码>` 这种用法在 26.11.2 已被移除（会进服务端日志），网站 FAQ 原来只"建议"用聊天栏，现在改成了明确说明「不支持」。
- fs1 突破通道：源码里的默认值一度改成 `false`（提权通道不默认开启），而网站仍写 `true`；后续又新增了 `fs1-offline-console` 配置项，网站也必须同步 —— **这类"开关 + 默认值"的条目最容易漏，改插件配置后请逐项回来核对**。
- hero 徽章曾长期写着「SHA-256 加密存储」，而实现早就是 **PBKDF2-HMAC-SHA256 12 万次迭代**；`index.html` §tech 的「安全」卡片同样是旧文案。**加密算法这类"技术描述"最容易被忽略，因为它不属于配置项，没有对照表可查**。
- 26.11.3 之前网站**没有任何"本版改了什么"的入口**，用户升级后只能靠 FAQ 猜。现已补上 `#whatsnew` 与 `#changelog`，发版时请一并更新。

## 5. 样式约定

### 设计变量

两个页面各自维护一份 CSS 变量，**改配色时两边都要改**：

```css
--blue: #0071e3;        /* 主色 */
--blue-hover: ...;
--bg / --bg-secondary / --bg-tertiary;
--text / --text-secondary;
--border-light;
--code-bg / --code-keyword / --code-value / --code-comment;
```

风格取向：圆角卡片 + 细边框 + 轻阴影，Apple 风格的留白，靠 `IntersectionObserver` 做滚动淡入（`.reveal`）。

### 移动端断点

| 断点 | 作用 |
|---|---|
| `≤ 900px` | 导航折叠为汉堡菜单；`help.html` 侧栏变横向胶囊；表格解除 `nowrap` |
| `≤ 768px` | `index.html` 表格折行、字号下调、区块内边距收紧 |
| `≤ 480px` | `help.html` 进一步缩小字号与内边距 |

### 移动端排版的四条硬规矩

这几条是修「手机上字挤在一起」时踩出来的，**新增样式时请遵守**：

1. **不要把 `white-space: nowrap` 用在会装长内容的单元格上。**
   桌面上好看，手机上会让首列（如 36 字符的 `/linux banblock <玩家> [时间] [原因]`）占满宽度，把相邻列压成一条缝，中文只能挤成一团。窄屏必须覆盖为 `white-space: normal`。

2. **中文标题不要用负 `letter-spacing`。**
   负字距是为西文排印（`InTheNameOfLinux`、`v26.11.2`）准备的；中文没有字母间隙，负值会让汉字重叠发糊。中文标题统一 `letter-spacing: 0`，局部紧凑改用 `padding` 或 `margin` 收。

3. **CJK 要显式给断行兜底。**
   中文默认不在字与字之间断行：
   ```css
   word-break: break-word;
   overflow-wrap: break-word;
   ```
   长命令 / 变量名 / 域名再补 `overflow-wrap: anywhere`。`break-word` 不会破坏正常英文单词。

4. **超宽表格用横向滚动，不要压缩列。**
   `overflow-x: auto` + `-webkit-overflow-scrolling: touch`；配合窄屏负外边距做通栏。

## 6. 改完必跑：结构校验

```powershell
python E:\Plugins\LinuxWeb\_tools\check_html.py `
       E:\Plugins\LinuxWeb\index.html E:\Plugins\LinuxWeb\help.html
```

全部通过时输出 `总体: 全部通过` 且退出码为 `0`。它检查：

- 标签配对（有多余闭合标签、或有非可选标签未闭合就报错）
- 重复 `id`
- 页内锚点是否有对应目标
- 可疑占位符（`{{ }}`、`TODO`、`undefined`、`NaN`）

**建议的改动流程**：改 HTML → 跑校验 → 浏览器开 DevTools 的设备模拟（375×667 / 390×844）确认无横向滚动条 → 提交。

## 7. 部署

静态站点，把 `LinuxWeb/` 下的文件（不含 `_tools/` 与 README）上传到站点目录即可。GitHub Pages 的话直接推到仓库根或 `/docs`。

页面指向服务器官网 `http://nalxer.top` 的位置共 5 处：`index.html` 3 处（导航外链、页脚链接、页脚「Nalxer 服务器 → nalxer.top」文字）、`help.html` 2 处（导航外链、页脚链接）。域名如果换了，直接搜索 `nalxer.top` 一并替换。

## 8. 当前状态与已知事项

**已完成**

- 两页结构校验通过；页内锚点全部有目标；`id` 无重复
- `icon.svg` 已补齐（此前缺失，浏览器 404）
- 移动端排版四项根因已修（`nowrap` 压列、负字距、CJK 不断行、表格挤压）

**未覆盖 / 待确认**

- `index.html` 的表格折行规则在 `≤768px` 生效；**769–900px 区间只折叠了导航，没处理表格**。若在竖屏平板上发现表格偏挤，把断点提到 900px 即可。
- 两页各自维护一份 CSS 变量，容易漂移。若日后要抽公共样式，建议外链一个 `style.css`（目前为了"单文件可分享"刻意内联）。
- 版本号在 3 处硬编码，没有自动注入。若接入构建流程，可用占位符替换。

---

相关文档：插件源码与完整改动记录见 `../InTheNameOfLinux/`（`FIXES-2026-09-25-round2.md` 第 8 节记录了网站同步的每一项）。
