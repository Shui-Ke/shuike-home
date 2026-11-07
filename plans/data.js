/*
 * Plans — 星图数据
 * 所有可见内容都在这里维护。新增计划后，星图会自动生成对应的星点与层级连线；
 * 只有跨方向关联需要手动补充到 links 里。
 * progress 为 0–100 的整数，100 表示已实现。
 */
(function () {
  'use strict';

  window.ShuikePlansData = {
    updated: '2026.10',

    self: {
      id: 'self',
      name: '我',
      en: 'SHUIKE',
      caption: '正在成为的人',
      summary:
        '这张星图不是待办清单。每一个星点都是一件正在发生的事，连线的亮度来自完成度；已经实现的星不会熄灭，它们留在原来的位置，成为下一段路径的参照。',
      note: '转动视角，看看这些方向如何彼此照亮。'
    },

    directions: [
      {
        id: 'research',
        name: '求真',
        en: 'RESEARCH',
        color: '#8fb9ff',
        motto: '把好奇变成可以被验证的问题。',
        summary:
          '研究不是收集答案，而是练习把模糊的直觉变成可以被检验的路径。这个方向由阅读、笔记和写作组成。',
        plans: [
          {
            id: 'proposal',
            name: '完成开题报告',
            en: 'PROPOSAL',
            progress: 100,
            timeline: '完成于 2026.03',
            summary:
              '把散在一年里的问题收束成一条可以执行的研究路径：边界、方法和时间表。完成后，它成为整张星图里第一颗被点亮的星。',
            steps: [
              { label: '确定研究问题', done: true },
              { label: '完成文献地图', done: true },
              { label: '通过开题答辩', done: true },
              { label: '把开题文档整理成可引用的短文', done: true }
            ],
            tags: ['研究', '写作']
          },
          {
            id: 'reading',
            name: '精读 48 篇论文',
            en: 'READING',
            progress: 64,
            timeline: '持续进行',
            summary:
              '不是读完清单，而是让每一篇都留下可检索的痕迹——问题、方法、可复用的论证，以及它和我的研究之间的距离。',
            steps: [
              { label: '建立文献池', done: true },
              { label: '精读 31 / 48 篇', done: true },
              { label: '补完剩余的 17 篇', done: false },
              { label: '输出一份主题索引', done: false }
            ],
            tags: ['阅读', '研究']
          },
          {
            id: 'notes',
            name: '研究笔记系统',
            en: 'NOTES',
            progress: 100,
            timeline: '完成于 2025.11',
            summary:
              '用双向链接把摘录、疑问和自己的话放在同一张网里。已经稳定运行一年，成为所有写作的地基。',
            steps: [
              { label: '统一标签与命名', done: true },
              { label: '建立双向链接', done: true },
              { label: '坚持每周回顾', done: true }
            ],
            tags: ['系统', '写作']
          },
          {
            id: 'review',
            name: '第一篇综述投稿',
            en: 'REVIEW',
            progress: 28,
            timeline: '目标 2026.12',
            summary:
              '把阅读地图折叠成一篇有立场的综述。先在内部讲清，再交给同行审阅。',
            steps: [
              { label: '搭出综述大纲', done: true },
              { label: '完成第一版初稿', done: false },
              { label: '收集同行反馈', done: false },
              { label: '投稿并记录审稿意见', done: false }
            ],
            tags: ['写作', '研究']
          }
        ]
      },
      {
        id: 'create',
        name: '创作',
        en: 'CREATE',
        color: '#e8c681',
        motto: '让作品先于表达欲完成。',
        summary:
          '创作是给世界一个具体的回音。不追求数量，只让每一次输出都更接近自己的语言。',
        plans: [
          {
            id: 'portfolio',
            name: '作品集 3.0',
            en: 'PORTFOLIO',
            progress: 82,
            timeline: '目标 2026.06',
            summary:
              '重做信息架构和视觉，把过去三年的项目放在同一条叙事线上。剩下的不是加法，而是删减。',
            steps: [
              { label: '重做信息架构', done: true },
              { label: '建立新的视觉系统', done: true },
              { label: '重写三个核心案例', done: true },
              { label: '部署与整体校订', done: false }
            ],
            tags: ['设计', '作品']
          },
          {
            id: 'nightfall',
            name: '影像实验《夜航》',
            en: 'NIGHTFALL',
            progress: 100,
            timeline: '完成于 2026.01',
            summary:
              '十二段夜间行走的片段，没有旁白，只保留环境声与字幕。已在一次小范围放映中完成。',
            steps: [
              { label: '完成拍摄', done: true },
              { label: '剪辑与声音设计', done: true },
              { label: '完成一次小范围放映', done: true }
            ],
            tags: ['影像', '声音']
          },
          {
            id: 'zine',
            name: '年度 zine',
            en: 'ZINE',
            progress: 22,
            timeline: '目标 2026.12',
            summary:
              '把这一年散落的观察做成一本可以拿在手里的册子。先有主题，再决定开本。',
            steps: [
              { label: '确定主题与关键词', done: true },
              { label: '收集今年的观察素材', done: false },
              { label: '完成排版', done: false },
              { label: '小批量印刷', done: false }
            ],
            tags: ['纸本', '编辑']
          }
        ]
      },
      {
        id: 'body',
        name: '身体',
        en: 'BODY',
        color: '#86d6b2',
        motto: '把身体放回生活的主线。',
        summary:
          '身体不是完成计划的工具，而是计划本身。睡眠、跑步和攀岩共同构成稳定的底盘。',
        plans: [
          {
            id: 'run',
            name: '跑步 500km',
            en: 'RUN',
            progress: 46,
            timeline: '持续进行',
            summary:
              '不为配速，只为让身体重新习惯持续。每一次记录都汇入同一条缓慢增长的线。',
            steps: [
              { label: '跑过第一个 100km', done: true },
              { label: '建立每周三次的节律', done: true },
              { label: '累计完成 230 / 500km', done: false },
              { label: '完成一次半程马拉松', done: false }
            ],
            tags: ['运动', '长期']
          },
          {
            id: 'climb',
            name: '攀岩 V3',
            en: 'CLIMB',
            progress: 35,
            timeline: '目标 2027.03',
            summary:
              '从抱石馆开始，学习在不确定的支点上保持呼吸。目标不是难度，是更稳定的身体判断。',
            steps: [
              { label: '完成入门课程', done: true },
              { label: '稳定完成 V2', done: true },
              { label: '挑战第一条 V3', done: false },
              { label: '完成一次户外抱石', done: false }
            ],
            tags: ['运动', '练习']
          },
          {
            id: 'sleep',
            name: '23:30 入睡',
            en: 'SLEEP',
            progress: 74,
            timeline: '持续进行',
            summary:
              '把夜晚还给睡眠。已经持续记录 74 天，周末也尽量不例外。',
            steps: [
              { label: '连续记录 30 天', done: true },
              { label: '稳定在 23:30 前入睡', done: false },
              { label: '周末保持同样的节律', done: false }
            ],
            tags: ['作息', '恢复']
          }
        ]
      },
      {
        id: 'connect',
        name: '连接',
        en: 'CONNECT',
        color: '#dda6d8',
        motto: '在场，比抵达更重要。',
        summary:
          '关系需要被有意识地维护。这里记录的不是社交数量，而是几段愿意持续投入的关系。',
        plans: [
          {
            id: 'talk',
            name: '每月一次深谈',
            en: 'DEEP TALK',
            progress: 58,
            timeline: '持续进行',
            summary:
              '和一个人坐下来，把最近真正困扰的事讲清楚。不解决问题，先完整地听。',
            steps: [
              { label: '列出想深谈的人', done: true },
              { label: '完成 7 / 12 次', done: true },
              { label: '把每次的收获写下来', done: false },
              { label: '完成全年 12 次', done: false }
            ],
            tags: ['关系', '倾听']
          },
          {
            id: 'call',
            name: '给家人打电话',
            en: 'CALL HOME',
            progress: 100,
            timeline: '持续中 · 已完成一年',
            summary:
              '固定每周一次，不再等到节日。聊什么都可以，重要的是让他们知道我在。',
            steps: [
              { label: '固定每周一次', done: true },
              { label: '连续坚持一年', done: true },
              { label: '把通话变成真正的交流', done: true }
            ],
            tags: ['家人', '习惯']
          },
          {
            id: 'gather',
            name: '组织一次小型聚会',
            en: 'GATHER',
            progress: 16,
            timeline: '目标 2026.11',
            summary:
              '把彼此欣赏但还不认识的人聚在一起，做一顿饭，交换最近在读的东西。',
            steps: [
              { label: '确定邀请名单', done: true },
              { label: '找到合适的场地', done: false },
              { label: '设计菜单', done: false },
              { label: '发出邀请', done: false }
            ],
            tags: ['朋友', '发起']
          }
        ]
      },
      {
        id: 'world',
        name: '世界',
        en: 'WORLD',
        color: '#86d2e4',
        motto: '把地图折小一点。',
        summary:
          '语言与地理决定了一个人能看见多远。这个方向关于移动、阅读和把陌生变成熟悉。',
        plans: [
          {
            id: 'japan',
            name: '日语 N2',
            en: 'NIHONGO',
            progress: 43,
            timeline: '目标 2027.07',
            summary:
              '每周三次，从听力开始。不是为了考试，是为了下一次独自出发时能少一层翻译。',
            steps: [
              { label: '五十音与基础语法', done: true },
              { label: '完成 N3 模拟', done: true },
              { label: '听力专项训练', done: false },
              { label: '报名 N2', done: false }
            ],
            tags: ['语言', '学习']
          },
          {
            id: 'solo',
            name: '独自旅行一次',
            en: 'SOLO',
            progress: 100,
            timeline: '完成于 2026.02',
            summary:
              '在完全陌生的城市生活十天，不排满行程。已经完成：京都与金泽，冬天。',
            steps: [
              { label: '选定城市', done: true },
              { label: '订下住处', done: true },
              { label: '独自出发', done: true },
              { label: '写一篇旅行笔记', done: true }
            ],
            tags: ['旅行', '独处']
          },
          {
            id: 'history',
            name: '读完《世界史》',
            en: 'HISTORY',
            progress: 31,
            timeline: '持续进行',
            summary:
              '用一年时间读完，做时间线和地理标注。让新闻里的地名慢慢有重量。',
            steps: [
              { label: '读完前三分之一', done: true },
              { label: '绘制时间线', done: false },
              { label: '读完近代部分', done: false },
              { label: '写一篇读书笔记', done: false }
            ],
            tags: ['阅读', '历史']
          }
        ]
      },
      {
        id: 'build',
        name: '事业',
        en: 'BUILD',
        color: '#aca8f2',
        motto: '让生活结构由作品支撑。',
        summary:
          '独立不是一句口号，而是可持续的作品、收入和时间结构。它需要长期、缓慢、可复利地搭建。',
        plans: [
          {
            id: 'website',
            name: '上线个人网站',
            en: 'WEBSITE',
            progress: 100,
            timeline: '完成于 2026.08',
            summary:
              '从域名、内容结构到每一处动效都自己完成。它是作品，也是我的地址。',
            steps: [
              { label: '完成信息架构', done: true },
              { label: '完成视觉与动效', done: true },
              { label: '部署上线', done: true }
            ],
            tags: ['网站', '作品']
          },
          {
            id: 'product',
            name: '发布第一个独立产品',
            en: 'PRODUCT',
            progress: 37,
            timeline: '目标 2027.03',
            summary:
              '做一个小而完整的东西，解决一个具体问题。先从愿意付费的十个人开始。',
            steps: [
              { label: '选定要解决的问题', done: true },
              { label: '访谈 10 位潜在用户', done: true },
              { label: '做出可用原型', done: false },
              { label: '上线并完成第一次收费', done: false }
            ],
            tags: ['产品', '独立']
          },
          {
            id: 'income',
            name: '建立稳定收入',
            en: 'INCOME',
            progress: 19,
            timeline: '长期目标',
            summary:
              '让收入结构和时间一样稳定：可以预期、可以安排、不被单一来源绑住。',
            steps: [
              { label: '整理现有收入来源', done: true },
              { label: '设定最低月目标', done: false },
              { label: '找到第二个稳定来源', done: false },
              { label: '连续三个月达标', done: false }
            ],
            tags: ['收入', '长期']
          }
        ]
      }
    ],

    // 只连接不同方向的具体计划。这些关联默认隐藏，点击任务时才从该星点展开。
    links: [
      { from: 'proposal', to: 'portfolio', note: '开题时练的叙事结构，后来成了作品集的骨架。' },
      { from: 'review', to: 'product', note: '综述的写法让我学会把复杂问题拆成可读的段落。' },
      { from: 'notes', to: 'talk', note: '深谈里出现的问题，最后都进了笔记系统。' },
      { from: 'portfolio', to: 'income', note: '作品集是收入结构真正开始的地方。' },
      { from: 'zine', to: 'gather', note: 'zine 的首发，想做成一次小聚。' },
      { from: 'nightfall', to: 'solo', note: '旅行中拍下的素材，正在成为《夜航》的续章。' },
      { from: 'solo', to: 'gather', note: '把旅行里认识的人，带回自己的城市。' },
      { from: 'history', to: 'review', note: '历史阅读给综述提供了更长的坐标。' },
      { from: 'sleep', to: 'product', note: '稳定作息是长期构建的底盘。' },
      { from: 'climb', to: 'solo', note: '户外抱石，是下一次独自出发的预演。' },
      { from: 'website', to: 'portfolio', note: '同一个人的两种自我介绍：一个给人看，一个给搜索看。' },
      { from: 'japan', to: 'nightfall', note: '日语听力改变了剪辑时对声音的注意力。' },
      { from: 'reading', to: 'history', note: '两条阅读线：一条向内，一条向更远处。' },
      { from: 'run', to: 'talk', note: '长跑时想清楚的话，留到下一次深谈再说。' },
      { from: 'call', to: 'solo', note: '独自出发之后，更愿意在电话里讲路上的事。' }
    ]
  };
})();
