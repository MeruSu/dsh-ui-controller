# dsh-ui-controller · 开发记录点

> 规则：只记用户纠正过我什么、我改了什么、怎么改的，以及**已经定稿、不许再动**的部分。
> 目的只有一个：同一件事不要被优化第二遍。

## 2026-11-17 06:5x · 聊天页滚轮阻尼（0.2.6）

**用户原话**（m21832）：「uic里加个功能，给聊天页的滑动加个阻尼」
**事实**：聊天滚动容器是 `div[data-conversation-scroll]`（宿主 5.3.5 实测，`overflow-y:auto`、`overscroll-behavior-y:auto`、`scroll-behavior:auto`，scrollHeight 2503 / clientHeight 729）；旁边的 class 是哈希，不能当选择器。侧栏 `div.GAkraW_list` 和 `div.SNx2jG_scroller` 是另外两个滚动器，本轮不碰。
**已做**：`createChatDamping()` 在 `[data-conversation-scroll]` 上挂 `wheel {passive:false}`；`normalizeWheelDelta()`（0=px / 1=行×16 / 2=页×clientHeight×0.9）→ `clampScrollTop()` → `dampNext()` 的指数缓动（k 由 `strengthToK()` 从 `[0.10,0.14,0.18,0.24,0.32]` 取），`|target-cur|<1px` 时精确落点。设置项 `chatScroll.damping`（默认 true）+ 强度 1–5（默认 3），设置页新组「对话区滚动 / Chat scrolling」。三条硬规则：①任何与上次写入偏差 >2px 的 `scroll` 事件视为宿主接管，立刻取消缓动并重同步；②顶/底方向滚不动时不 `preventDefault`，原生回弹还在；③`event.target` 落在会自己滚的元素（`.xterm`、溢出代码块、内层列表）里就完全放过。键盘（PageUp/PageDown/Home/End/方向键/空格）、pointerdown、touchstart、window blur 都取消；`prefers-reduced-motion: reduce` 不挂监听。
**不许再动**：不要用哈希 class 选聊天滚动器；不要加全局 `scroll-behavior:smooth`；不要把缓动时长写成固定 timeout（必须是 rAF 指数步进，才可随时取消）。

**已发布的语义（Lead 2026-11-17 验收结论追加）**：强度档位表 `k = [0.10, 0.14, 0.18, 0.24, 0.32]` 自 0.2.6 发布起即为**冻结语义**——用户已经按这套手感调过档。以后想改手感只能①加新档位 ②加新字段（如 `chatScroll.k`），**绝不允许原地改这五个系数**，也不允许偷偷改「强度 N 代表哪个 k」。前车之鉴：better-notice 私自改「播放频率」的语义，被用户当场抓住。

## 2026-11-15 · 设置页左栏三态：整块删除，不再恢复

**用户的纠正**（m18515）：「这一栏完全是错的…我的需求是主页面的设置页有一栏抽屉可以把很多的设置收起来，参考 codexui 那个…现在的实现方式和我们一开始说的完全不一样」
**用户的裁定**（回答我的二选一）：「整块删掉」——即展开 / 图标栏 / 收起三档宽度整套删掉，不留附加开关。
**用户的范围收口**（m18611）：「设置页别管，我们只做首页聊天页的左栏就行了」

**已做**：0.2.0 删除 `NAV_ATTR` / `PANEL_NAV_STATES` / `NAV_WIDTHS` / `navWidthOf` / `navColumnsOf` / `NAV_CSS` / `resolveNavState` / `applyNavStateTo` / `clearNavState` 等整块逻辑与 8×2 个 `settings.nav.*` 文案键。

**不许再动**：设置页左栏的宽度控制**永久不做**。本插件的左栏能力只做「首页侧栏把多行收进一个『更多 (N)』」。

## 2026-11-15 · 「更多 (N)」的数字：改成数 DOM，不再数我们的记录

**用户的纠正**（m20574）：「它现在更多后面那个阿拉伯数字显示也是有问题的 现在显示的是 我目前桌面端显示的是2 但是它实际上里面是5」
**用户的收口**（m20594）：「不管是一个按钮全部展开 还是每一行都有一个按钮 它不算bug 所以我们不需要改 我们只需要把它的bug…就是那个激素错误给改正就行」

**事实**：`sidebarMoreCount()` 数的是我们的折叠记录（`foldAll` 推导或 `record.folded`），而侧栏真正藏了哪几行由宿主的 pin 状态 + 我们的 `display:none` 决定，两者会漂；于是记录 2 条时画 `更多 (2)`，屏幕上却藏着 5 行。
**已做**（0.2.3）：`foldedRowCount(doc, panels)` = 我们知道的非 `plugins` 面板数 − 侧栏里仍然显示着的 `button[class*="panelRow"]` 行数（行自身或祖先 `display:none` 都算藏了，启动器那行按 `MORE_TITLES` 排除）；读不到侧栏（收起/未挂载）返回 `null`，只画「更多」不猜 0；`paintMoreCount` 删掉 settings/storage 两个不再用的参数，计数改由 DOM 提供，折叠 pass 先跑、计数后读。
**不许再动**：每行开关保持原样；不再加任何批量按钮（用户明确说不算 bug）；数字只能来自 DOM，不许回到「数记录」的老路。

## 2026-11-15 · 「更多 (N)」折叠：计数、加载即折叠、行样式跟宿主、删批量按钮

**用户的纠正**（m19190）：「样式得统一一下…现在有三个按钮 自动收进更多 / 全部放回按钮 / 还有一个动态切换的按钮…唯独不可以三个都出现」
**用户的纠正**（m19190）：「既然是半完成品 那就继续推进吧」

**怎么改的**（0.2.1）：
1. 计数改成按 `button[aria-label="更多"|"More"]` + 祖先含 `nav[class*="panelList"]` 定位（旧的 `[data-shortcut-modal="sidebar"]` 在当前宿主匹配不到任何元素，所以 `(N)` 一次都没画出来）；
2. 加载即折叠：`[data-uic-hidden="1"]{display:none}` + `record` 回放；
3. 行样式运行时采样宿主行（同名 class、34px / 13px / 8px），**不硬编码哈希类名**；
4. 删掉「全部收进更多」「全部放回外面」两颗批量按钮，只留每行的动态开关。

**不许再动**：每行只出现**一个**动态开关。批量行为只允许存在于设置页，不允许出现在菜单里。

## 2026-11-15 · 「更多」菜单的行要带侧栏那个图标

**用户的纠正**（m20462）：「那个更多 把东西收进去的时候 只收了文字 为什么那个图标没收进去 这个得改一下 去改吧」
**查出的事实**：宿主的行是 `button[class*="panelRow"]`，图标在它内部的 `span[class*="panelGlyph"]`（第一个子节点）；我们自己渲染的菜单行只有名字 + 开关，所以收起后左栏只剩文字。折叠走 `applyFoldState`，隐藏的是 `button.panelRow` 本身——图标在按钮内时一起消失，但若某个面板把图标画在按钮外面，图标会留在屏幕上。
**已做**（0.2.2）：`mountMoreGlyph` 运行时从活的侧栏行克隆 glyph 到菜单行左侧的 `[data-uic-more-glyph]` 占位（先清空再填，重挂幂等；克隆里的 id 全部剥掉；拿不到就留空、不报错）；`panelRowOf` 按 aria-label 再按标题找行；`foldUnitOf` 把折叠目标上升到同时包住图标与文字的那个容器，`nav` 永不被隐藏；版本 0.2.2。
**不许再动**：图标只能运行时克隆，**不许**在本包里硬编码任何 SVG / 图标库 / 宿主哈希类名；菜单行只许有名字 + 图标 + 一个动态开关。

## 记录格式

```
## YYYY-MM-DD HH:MM · 一句话标题
**用户的纠正**：「原话摘录」
**查出的事实**：可复核的证据（行号 / 哈希 / 版本）
**已做**：落地的改动
**不许再动**：已定稿、再优化就是倒退的部分
```

## 0.2.4 — 2026-11-15 · the More menu flashed a bordered frame

- **User (m20671)**: 「这个展开功能 点开会先闪一下这个界面 然后变成正常界面 看一下是不是在旧的内容上改什么代码实现了新的内容 然后旧的功能就没删」
- **Fact**: the sample was taken in `setTimeout(…, 0)`, so the first paint used our own `.uic-moreRow` fallback, and that fallback still carried `padding: 4px 2px` plus `.uic-moreRow + .uic-moreRow { border-top: … }` — the bordered rows in the screenshot. The next tick swapped in the sampled host class.
- **Done in 0.2.4**: the sample moved into the first row's `ref` (commit time, before paint), and the fallback class was reshaped to host metrics with the border rule deleted. One test group pins both facts.
- **Do not**: never let a fallback style reach the screen — the first paint must already look host-drawn; keep the fallback host-shaped if it is ever visible; do not reintroduce a timer for the sample.
