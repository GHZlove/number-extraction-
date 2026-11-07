# Release history

This page preserves the development notes moved out of the project introduction. Current behaviour, downloads and verification are described in the [English README](../README.md), [Chinese README](../README.zh-CN.md) and [testing notes](TESTING.md). Older versions describe their state at that release; later rules can supersede them.

## English release notes

v0.11.3 adds temporary review of up to eight anonymous exports, duplicate/overlap checks, build/difficulty cohorts and at most two investigation priorities. It keeps imported reports out of progress/journal storage and retains the existing tuning while real data is collected. The matching CLI writes review reports without overwriting source data. See [review rules and sample limits](MULTI_REPORT_REVIEW_V0113.md).

v0.11.2 adds a local 100-run journal, optional structured feedback and deliberate anonymous export. It records modifier choices, outcomes, exit usage and actual hunter arrivals to guide the next 10–20 real runs. Progress remains separate, v0.11.1 tuning is retained, and eight Phase 2 interactions are documented as paper proposals only. See [journal and privacy](LOCAL_PLAYTEST_V0112.md).

v0.11.1 adjusts heat escalation, high-tier movement, Fog, Volatile and Glass Firepower, and adds small rewards to existing special exits. It keeps the western fallback and warehouse progress intact. A finite-health diagnostic harness and an anonymous 2–4 day playtest guide accompany the tuning candidate; outside-player feedback remains uncollected. See [measured changes and limits](BALANCE_V0111.md).

v0.11 deepens the expedition loop before adding more content: choose up to three of ten mutators, manage rising heat and warned hunter squads, grow into number tiers with different movement and collision bodies, and plan around seeded extraction requirements. A western fallback exit remains available after its opening time. See the [run-depth rules](RUN_DEPTH_V011.md). Later roadmap phases are planned, not included in this build.

v0.10 added an upgradeable warehouse that preserves extracted equipment, four-slot deployment planning, repairs and explicit recycling. Excess gear stays in a pending area. Six new bosses bring the roster to nine, with a codex, selectable targets, new warned attack geometry and distinct weapon rewards.

v0.9.2 added automatic recycling of lower-number enemy remnants and an unlimited resource pouch. Equipment alone uses backpack slots; coins can be spent at field traders or banked on extraction.

The v0.9.1 fix for homepage numeral overflow is retained: it sizes text against each tile and reduces type for longer numbers. Native layout checks cover wide and narrow windows and 125%/150% zoom.

## 中文版本记录

**v0.11.3 合并审查**：可临时导入最多8份匿名报告，核对完全重复和可能重叠，按版本、数值版本与难度分组。样本不足10局时只展示数据；达到门槛后最多列两项优先排查信号，不自动调参。报告不写入游戏和日志存档，不上传。附两三位志愿者的匿名五局安排与每补丁1—2项变更模板；真人试玩和志愿者参与情况以实际交付的报告为准。

**v0.11.2 观察工具**：新增独立的本地100局试玩记录、结构化体验反馈和主动匿名导出。统计词条、时长、热度、真正刷出的追猎、死因和出口选择，中断、放弃与战斗死亡分开。仓库及v0.11.1战斗数值保留；8项附魔联动与武器套装仅为纸面方案。先收集10—20局真实记录，再决定调优方向。

**v0.11.1 调优**：降低战斗带来的热度正反馈，1024体型略小且移动更快，扩大浓雾视野，延长残爆预警；玻璃火力明确增加25%承伤。特殊出口等待缩短，窗口改为40/70秒，成功撤离额外获得8–15%币和材料；情报显示首领名字、钥卡位置与路线收益。西侧保底与仓库保留。提供有限生命诊断和2—4天匿名试玩清单；真人反馈尚未收集，第二阶段尚未开始。

**v0.11 新增**：出击前从十个词条中最多选三个，风险与结算奖励提前展示；热度随时间、搜箱和战斗增长，25/50/75/100触发更强的有限追猎队；数字达到64、256、1024后体型、速度和防御产生取舍；特殊撤离点按种子分配窗口、钥卡、数字或首领条件。西侧保底出口按原时限开放且持续可用，局内右上角可暂停查看撤离情报。保留白底主页、彩色地图、仓库及旧进度。后续阵营、契约、套装、无尽与每日种子属于规划，尚未加入。见 [规则](RUN_DEPTH_V011.md)。

**v0.10 新增**：撤离装备存入局外战备仓库，初始24格、每级+12格、最高144格，满仓进入待收区。保留品质、附魔、等级和护甲耐久，可选装出击、修理或确认回收。仓库带入装备失败会丢失，未带入库存保留。首领从3类扩到9类，新增雷暴、霜核、影刃、熔炉、引力和虫巢机制，配套图鉴、目标选择和专属掉落，设计对照十款游戏的公开资料。见 [详细规则与参考](WAREHOUSE_BOSSES_V010.md)。

**v0.9.2 新增**：低等级敌人残骸靠近后回收成金币，同数优先合成；2048时可回收同级残骸。金币可在局内消费，成功撤离后入库。只有武器、护甲和配件占装备格，碎片、金币与材料不限量；满装备包仍可开箱和拾取资源。B界面将资源汇总与装备分开，商人优先消费残骸金币。详见 [回收规则](REMNANTS_V092.md)。

**v0.9.1 修复**：首页字号按每个方块宽度和数字位数缩放，1024、2048、4096 保留边距，不再随窗口扩大溢出。兼容 v0.9.0 存档。

- **白底主页与立体方块**：恢复白色庇护所和鲜艳多彩的战区。按参考图重绘圆角、厚边、高光和大号白字数字块；玩家有 YOU 标记，敌人有红边与警示。保留出击、基地、工坊页签和独立首领血条。
- **新增八种附魔，总数十二种**：烈焰、寒霜、流血、破甲、爆裂、暴击、重力、回能；保留吸血、闪电、眩晕、毒雾，均有实际效果、状态限制与首领抗性。
- **新增六类武器，总数二十类**：重型左轮、双管霰弹枪、能量手枪、火焰喷射器、火箭筒、战斧。新军械箱提供直接试用，商人新增两种武器。
- **桌面版**：免安装EXE、独立窗口、全屏快捷键、固定存档目录、未结算退出确认。支持存档导入导出与备份恢复。
