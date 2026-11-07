/*
 * PROJECT / 项目数据
 *
 * 想换项目时只改这个文件；页面会按数组顺序，把项目依次放到
 * 深色波与浅色波的波峰上（第 1 个在上方，第 2 个在下方，依此交替）。
 *
 * 必填：title、category、year、month、description、tags
 * 可选：github（完整 https 链接）、href（站内相对路径或完整链接）
 *       hrefLabel（默认 OPEN）、subtitle（中文短标题）
 *
 * year 与 month 决定项目属于哪个年份 / 月份。右侧年份保险柜会列出
 * 当前年及之前六年（并自动扩展到更早的项目年份）；某年没有项目时
 * 会显示空白档案状态。
 * 这里的日期只写真实值，不为演示而挪动项目。
 *
 * 这里只放真实存在、可以打开的项目。没有链接的项目就留空，
 * 页面不会生成假的按钮或虚构的仓库地址。
 */
(function () {
  'use strict';

  window.ShuikeProjects = [
    {
      id: 'dsh-approval-hud',
      title: 'DSH Approval HUD',
      subtitle: 'DeepSeek Harness 常驻审批浮层',
      category: 'DESKTOP / PLUGIN',
      year: 2026,
      month: 10,
      description:
        '把 DeepSeek Harness 的权限请求放进一个始终置顶、却不抢走焦点的 Windows 小窗。共享队列、托盘控制与限时自动批准，让 agent 等待时不必把 DSH 拉回前台。',
      tags: ['WINDOWS', 'POWERSHELL', 'WPF'],
      github: 'https://github.com/Shui-Ke/dsh-approval-hud'
    },
    {
      id: 'shuike-home',
      title: 'SHUIKE',
      subtitle: '可漫游的个人桌面',
      category: 'WEB / PERSONAL',
      year: 2026,
      month: 10,
      description:
        '一座可漫游的个人主页：点阵地球、粒子喷流、轨道终端，以及可以拖拽、缩放和重排的玻璃窗口。全部由原生 HTML、CSS 与 Canvas 完成。',
      tags: ['HTML', 'CSS', 'CANVAS'],
      href: '../index.html',
      hrefLabel: 'OPEN'
    },
    {
      id: 'plans-constellation',
      title: 'Plans',
      subtitle: '计划星图',
      category: 'WEB / INTERACTIVE',
      year: 2026,
      month: 10,
      description:
        '六条长期方向与十九项具体计划，被放进一片可以旋转、缩放和漂移的星图。进度不是一排统计条，而是会沿着连线慢慢亮起的光。',
      tags: ['THREE.JS', 'WEBGL', 'CANVAS'],
      href: '../plans/index.html',
      hrefLabel: 'OPEN'
    },
    {
      id: 'personal-archive',
      title: 'Personal Archive',
      subtitle: '像终端一样打开的个人档案',
      category: 'WEB / ARCHIVE',
      year: 2026,
      month: 10,
      description:
        '角色、新闻、音乐库、时间与项目入口被收进同一块玻璃界面。内容与声音在这个空间里继续生长，而不是被排成一张静止的履历。',
      tags: ['HTML', 'WEB AUDIO', 'SVG'],
      href: '../profile/index.html',
      hrefLabel: 'OPEN'
    }
  ];
})();
