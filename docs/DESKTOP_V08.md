# v0.8 · 战术界面与 Windows 桌面版

## 视觉方向

采用用户选择的“清晰战术界面＋荧光方块”。环境与面板降低饱和度，数字、附魔、攻击预警和交互保持鲜明颜色，不改动v0.7的伤害、敌人、掉落或经济规则。

| 层级 | 展示 |
| --- | --- |
| 环境 | 蓝灰地面、低对比风险分界、减少墨迹装饰；地形名称接近时出现 |
| 普通实体 | 数字始终可见；名称、速度主要在选中时显示，避免每个敌人悬浮多行文字 |
| 战斗信号 | 保留荧光方块、品质条、附魔、白/红瞄准线、毒雾与弹反反馈 |
| HUD | 左上生命/护甲、中央计时与首领条、右上小地图、底部武器/技能；次要信息按需显示 |
| 庇护所 | 出击终端、基地设施、武器工坊三个页签；货币与存档操作始终可访问 |

参考作品的用途不同：[Cubes 2048.io](https://www.crazygames.com/game/cubes-2048-io)用于研究移动数字方块与合成辨识；[RogueSlide](https://rogueslide.beepyeah.com/)用于研究2048与地牢玩法的结合。它们不是本项目的素材来源，也不表示战斗类型完全相同。

## 桌面实现

Windows x64免安装EXE，使用Electron内置的Chromium运行本地游戏。玩家双击EXE进入独立窗口，无需安装Python、Node.js、另开浏览器或运行本地HTTP服务。第一次启动需要展开内置运行环境，因此文件明显大于纯网页源码包。

不迁移游戏引擎：原有HTML/CSS/Canvas/ES modules继续作为共同游戏代码，桌面入口单独放在`desktop/`。`dist/`仍可通过原HTTP启动方式运行。

- 固定应用ID和`%APPDATA%\NumberExtraction`目录，更新EXE后继续使用同一存档。
- F11或Alt+Enter全屏，重复启动聚焦已有窗口。关闭未结算战局前确认，已入库进度保留。
- 自定义安全协议`nextract://game/`提供包内资源，支持相对ES模块。只服务`dist/`白名单类型，拒绝越界路径和其他来源。
- 渲染进程禁用Node集成、启用上下文隔离与沙箱，禁止外部导航、新窗口、网页权限和网络请求。
- 预加载桥只提供原生JSON导入、导出与战局状态通知；主进程校验请求来源和数据格式，不提供任意文件/命令执行接口。

技术依据：[Electron安全建议](https://www.electronjs.org/docs/latest/tutorial/security/)、[自定义协议API](https://www.electronjs.org/docs/latest/api/protocol)、[electron-builder portable配置](https://www.electron.build/v26/docs/api/app-builder-lib.interface.portableoptions/)。

## 存档迁移

浏览器和桌面版来源不同，不能自动读取彼此的localStorage。首次迁移：

1. 用v0.8源码包运行网页版，使用原来的浏览器与完全相同的网址，例如`http://127.0.0.1:8000`。不要将它替换成`localhost`，两者存档独立。
2. 庇护所底部选择“存档 · 导入 / 导出”，导出JSON。
3. 打开EXE的存档面板，选择JSON，核对资源与打造记录，点击“确认导入”。
4. 桌面版先备份原进度，再替换；可在面板中查看、恢复导入前备份。后续直接运行EXE即可。

支持旧结构版本1、2及当前版本3，校验后使用现有规范化流程；最大128KB。损坏JSON、未知版本和无效余额会被拒绝。未结束战局不保存，两个同时打开的游戏实例不会自动同步进度。桌面版使用单实例锁避免重复启动同一用户数据目录。

## 开发与构建

网页版仍无第三方运行依赖。桌面开发需要Node.js 24+及锁定的开发依赖：Electron 45.2.3、electron-builder 26.18.0。

```bash
npm ci
npm run check
npm test
npm run desktop:start
npm run desktop:build
```

Windows构建输出`release/NumberExtraction-0.8.0-Windows-x64.exe`。构建文件和运行数据均不提交到源码仓库；公共下载使用GitHub Release附件，避免将大体积二进制写入Git历史。此预览未配置付费代码签名，系统可能提示未知发布者，不要求关闭安全防护。

自动工作流先在Windows执行语法、逻辑和契约检查，再构建EXE。原生检查必须验证启动、出击按钮可见性/品牌文字对比、Canvas绘制、移动合成、暂停、重启存档及实际portable启动，才允许生成公开试玩下载；同时附带SHA256和应用截图。自动检查不能代替不同显卡、DPI、多显示器、音效与长时间试玩验收。

## 本地检查

157项测试通过，包括10项新增的来源/路径限制、内容策略、预加载桥边界、存档备份/校验、应用内迁移/页签与首领HUD契约。22个游戏模块和4个桌面文件通过语法检查。Windows原生结果以对应Release的构建记录和截图为准。
