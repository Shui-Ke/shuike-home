/*
 * PROJECT / 本地项目编辑器
 *
 * A small GUI workspace for the project archive. It edits a browser-local
 * snapshot so the static page can be updated without a backend. Saving writes
 * to localStorage and reloads; "下载 data.js" exports a ready-to-commit file.
 */
(function () {
  'use strict';

  const openButton = document.querySelector('[data-project-editor-open]');
  const mount = document.querySelector('[data-project-editor-root]');
  if (!openButton || !mount) return;

  const page = window.ShuikeProjectPage || null;
  const STORAGE_KEY = (page && page.storageKey) || 'shuike:projects:v1';
  const CURRENT_YEAR = new Date().getFullYear();
  const CURRENT_MONTH = new Date().getMonth() + 1;
  const FIELD_NAMES = ['title', 'subtitle', 'category', 'year', 'month', 'description', 'tags', 'github', 'href', 'hrefLabel'];
  const REQUIRED_FIELDS = ['title', 'category', 'year', 'month', 'description'];

  let projects = [];
  let initialProjects = [];
  let initialSnapshot = '';
  let selected = -1;
  let isOpen = false;
  let lastFocused = null;
  let backgroundInert = [];
  let restoreArmed = false;
  let restoreTimer = 0;
  let idSeed = Date.now().toString(36);
  let idCounter = 0;
  let nodes = {};

  const pad = (value) => String(value).padStart(2, '0');
  const clone = (value) => JSON.parse(JSON.stringify(value));

  function makeId() {
    idCounter += 1;
    return `custom-${idSeed}-${idCounter}`;
  }

  function nextId() {
    return makeId();
  }

  function safeLocalGet() {
    try {
      return window.localStorage.getItem(STORAGE_KEY);
    } catch (_) {
      return null;
    }
  }

  function localSnapshotExists() {
    const raw = safeLocalGet();
    if (raw === null) return false;
    try {
      return Array.isArray(JSON.parse(raw));
    } catch (_) {
      return false;
    }
  }

  function toDraft(project) {
    const year = Number.parseInt(project && project.year, 10);
    const month = Number.parseInt(project && project.month, 10);
    const tags = Array.isArray(project && project.tags)
      ? project.tags
      : String((project && project.tags) || '').split(',');
    return {
      id: String((project && project.id) || nextId()),
      title: String((project && project.title) || ''),
      subtitle: String((project && project.subtitle) || ''),
      category: String((project && project.category) || ''),
      year: Number.isFinite(year) ? String(year) : String(CURRENT_YEAR),
      month: Number.isFinite(month) && month >= 1 && month <= 12 ? String(month) : String(CURRENT_MONTH),
      description: String((project && project.description) || ''),
      tags: tags.map((tag) => String(tag).trim()).filter(Boolean).join(', '),
      github: String((project && project.github) || ''),
      href: String((project && project.href) || ''),
      hrefLabel: String((project && project.hrefLabel) || 'OPEN')
    };
  }

  function getPageProjects() {
    if (page && Array.isArray(page.projects)) {
      return page.projects.filter((project) => project && typeof project === 'object').map(toDraft);
    }
    const raw = safeLocalGet();
    if (raw !== null) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed.filter((project) => project && typeof project === 'object').map(toDraft);
      } catch (_) {}
    }
    return (Array.isArray(window.ShuikeProjects) ? window.ShuikeProjects : [])
      .filter((project) => project && typeof project === 'object')
      .map(toDraft);
  }

  function snapshot() {
    return JSON.stringify(projects);
  }

  function isDirty() {
    return snapshot() !== initialSnapshot;
  }

  function setStatus(message, tone = '') {
    if (!nodes.status) return;
    nodes.status.textContent = message;
    nodes.status.dataset.tone = tone;
  }

  function updateDirtyState() {
    if (!nodes.root) return;
    const dirty = isDirty();
    nodes.root.classList.toggle('is-dirty', dirty);
    if (nodes.discard) nodes.discard.disabled = !dirty;
    if (nodes.save) nodes.save.disabled = !dirty;
  }

  function parseTags(value) {
    const seen = new Set();
    return String(value || '')
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean)
      .filter((tag) => {
        const key = tag.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }

  function isGithubUrl(value) {
    return /^https:\/\/github\.com\/[^/\s]+\/[^/\s?#]+/i.test(value);
  }

  function isSafeHref(value) {
    if (/^https?:\/\//i.test(value)) return !/[\\\s"'<>]/.test(value);
    if (value.startsWith('//')) return false;
    if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return false;
    return !/[\\\s"'<>]/.test(value);
  }

  function validateProject(project) {
    const errors = {};
    const title = project.title.trim();
    const subtitle = project.subtitle.trim();
    const category = project.category.trim();
    const description = project.description.trim();
    const year = project.year.trim();
    const month = project.month.trim();
    const github = project.github.trim();
    const href = project.href.trim();
    const hrefLabel = project.hrefLabel.trim();

    if (!title) errors.title = '请填写项目标题';
    else if (title.length > 80) errors.title = '标题不能超过 80 个字符';
    if (subtitle.length > 90) errors.subtitle = '副标题不能超过 90 个字符';
    if (!category) errors.category = '请填写分类';
    else if (category.length > 44) errors.category = '分类不能超过 44 个字符';
    if (!/^\d{4}$/.test(year) || Number(year) < 1900 || Number(year) > 9999) {
      errors.year = '年份需为 1900–9999 的四位数字';
    }
    if (!/^\d{1,2}$/.test(month) || Number(month) < 1 || Number(month) > 12) {
      errors.month = '月份需为 1–12';
    }
    if (!description) errors.description = '请填写项目简介';
    else if (description.length > 600) errors.description = '简介不能超过 600 个字符';
    if (github && !isGithubUrl(github)) errors.github = '请填写完整的 https://github.com/owner/repo 链接';
    if (href && !isSafeHref(href)) errors.href = '请使用相对路径或 http(s) 链接';
    if (hrefLabel.length > 18) errors.hrefLabel = '按钮文字不能超过 18 个字符';
    return errors;
  }

  function validateAll() {
    const rows = projects.map((project, index) => ({
      index,
      project,
      errors: validateProject(project)
    }));
    const first = rows.find((row) => Object.keys(row.errors).length > 0);
    return { valid: !first, first, rows };
  }

  function cleanProject(project) {
    const result = {
      id: project.id || nextId(),
      title: project.title.trim(),
      category: project.category.trim(),
      year: Number(project.year),
      month: Number(project.month),
      description: project.description.trim(),
      tags: parseTags(project.tags)
    };
    if (project.subtitle.trim()) result.subtitle = project.subtitle.trim();
    if (project.github.trim()) result.github = project.github.trim();
    if (project.href.trim()) {
      result.href = project.href.trim();
      result.hrefLabel = project.hrefLabel.trim() || 'OPEN';
    }
    return result;
  }

  function cleanList() {
    return projects.map(cleanProject);
  }

  mount.innerHTML = `
    <div class="project-editor" data-project-editor hidden aria-hidden="true">
      <div class="project-editor__veil" data-editor-veil aria-hidden="true"></div>
      <section class="project-editor__window" role="dialog" aria-modal="true" aria-labelledby="project-editor-title" tabindex="-1">
        <header class="project-editor__head">
          <div class="project-editor__heading">
            <p class="project-editor__kicker">LOCAL / PROJECT STUDIO</p>
            <h2 class="project-editor__title" id="project-editor-title">项目编辑器</h2>
          </div>
          <div class="project-editor__head-actions">
            <span class="project-editor__local" data-editor-local hidden>LOCAL DRAFT</span>
            <button class="project-editor__close" type="button" data-editor-close aria-label="关闭项目编辑器">
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.15" aria-hidden="true"><path d="M4.5 4.5l11 11M15.5 4.5l-11 11"/></svg>
            </button>
          </div>
        </header>

        <div class="project-editor__body">
          <aside class="project-editor__sidebar">
            <div class="project-editor__side-head">
              <p>PROJECTS <span data-editor-count>00</span></p>
              <button class="project-editor__new" type="button" data-editor-new>+ 新建</button>
            </div>
            <div class="project-editor__list" data-editor-list role="group" aria-label="项目列表"></div>
            <div class="project-editor__side-foot">
              <div class="project-editor__side-actions">
                <button class="project-editor__textbtn" type="button" data-editor-download>下载 data.js</button>
                <button class="project-editor__textbtn" type="button" data-editor-restore>恢复内置</button>
              </div>
              <p class="project-editor__storage">保存会写入本机浏览器并重载；下载后可覆盖 projects/data.js。</p>
            </div>
          </aside>

          <div class="project-editor__formwrap">
            <div class="project-editor__blank" data-editor-blank hidden>
              <p class="project-editor__kicker">NO PROJECTS / 暂无项目</p>
              <h3>从第一个项目开始。</h3>
              <p>添加项目后，它会出现在波形、年份轴和月份计数里。</p>
              <button class="project-editor__button is-primary" type="button" data-editor-new-blank>+ 新建项目</button>
            </div>

            <form class="project-editor__form" data-editor-form novalidate>
              <div class="project-editor__scroll" data-editor-scroll>
                <div class="project-editor__formhead">
                  <div>
                    <p class="project-editor__kicker" data-editor-mode>EDIT / PROJECT 01</p>
                    <p class="project-editor__hint">编辑草稿先在左侧保存，点击「保存并重载」后才会进入页面。</p>
                  </div>
                  <div class="project-editor__order">
                    <button class="project-editor__delete" type="button" data-editor-delete>删除项目</button>
                    <button class="project-editor__icon-button" type="button" data-editor-move="up" aria-label="上移项目">↑</button>
                    <button class="project-editor__icon-button" type="button" data-editor-move="down" aria-label="下移项目">↓</button>
                  </div>
                </div>

                <div class="project-editor__grid">
                  <label class="editor-field editor-field--wide">
                    <span class="editor-field__label">TITLE / 标题 <em>必填</em></span>
                    <input class="editor-input" data-field="title" name="title" type="text" maxlength="80" autocomplete="off" placeholder="Project title" required aria-describedby="editor-error-title">
                    <span class="editor-field__error" id="editor-error-title" data-editor-error="title" hidden></span>
                  </label>

                  <label class="editor-field editor-field--wide">
                    <span class="editor-field__label">SUBTITLE / 副标题 <span>可选</span></span>
                    <input class="editor-input" data-field="subtitle" name="subtitle" type="text" maxlength="90" autocomplete="off" placeholder="中文短标题" aria-describedby="editor-error-subtitle">
                    <span class="editor-field__error" id="editor-error-subtitle" data-editor-error="subtitle" hidden></span>
                  </label>

                  <label class="editor-field editor-field--half">
                    <span class="editor-field__label">CATEGORY / 分类 <em>必填</em></span>
                    <input class="editor-input" data-field="category" name="category" type="text" maxlength="44" autocomplete="off" placeholder="WEB / PERSONAL" required aria-describedby="editor-error-category">
                    <span class="editor-field__error" id="editor-error-category" data-editor-error="category" hidden></span>
                  </label>

                  <label class="editor-field editor-field--quarter">
                    <span class="editor-field__label">YEAR / 年 <em>必填</em></span>
                    <input class="editor-input" data-field="year" name="year" type="number" min="1900" max="9999" inputmode="numeric" required aria-describedby="editor-error-year">
                    <span class="editor-field__error" id="editor-error-year" data-editor-error="year" hidden></span>
                  </label>

                  <label class="editor-field editor-field--quarter">
                    <span class="editor-field__label">MONTH / 月 <em>必填</em></span>
                    <input class="editor-input" data-field="month" name="month" type="number" min="1" max="12" inputmode="numeric" required aria-describedby="editor-error-month">
                    <span class="editor-field__error" id="editor-error-month" data-editor-error="month" hidden></span>
                  </label>

                  <label class="editor-field editor-field--wide">
                    <span class="editor-field__label">DESCRIPTION / 简介 <em>必填</em></span>
                    <textarea class="editor-input editor-textarea" data-field="description" name="description" rows="4" maxlength="600" placeholder="一到两句话的项目简介。" required aria-describedby="editor-error-description"></textarea>
                    <span class="editor-field__error" id="editor-error-description" data-editor-error="description" hidden></span>
                  </label>

                  <label class="editor-field editor-field--wide">
                    <span class="editor-field__label">TAGS / 标签 <span>逗号分隔</span></span>
                    <input class="editor-input" data-field="tags" name="tags" type="text" maxlength="160" autocomplete="off" placeholder="HTML, CSS, CANVAS" aria-describedby="editor-error-tags">
                    <span class="editor-field__error" id="editor-error-tags" data-editor-error="tags" hidden></span>
                  </label>

                  <label class="editor-field editor-field--wide">
                    <span class="editor-field__label">GITHUB / 仓库 <span>可选</span></span>
                    <input class="editor-input" data-field="github" name="github" type="url" maxlength="300" autocomplete="off" placeholder="https://github.com/owner/repo" aria-describedby="editor-error-github">
                    <span class="editor-field__hint">完整 GitHub 仓库链接</span>
                    <span class="editor-field__error" id="editor-error-github" data-editor-error="github" hidden></span>
                  </label>

                  <label class="editor-field editor-field--three">
                    <span class="editor-field__label">LINK / 站内路径或网址 <span>可选</span></span>
                    <input class="editor-input" data-field="href" name="href" type="text" maxlength="300" autocomplete="off" placeholder="../some-page/index.html" aria-describedby="editor-error-href">
                    <span class="editor-field__hint">相对路径或 https 链接；留空则不生成按钮</span>
                    <span class="editor-field__error" id="editor-error-href" data-editor-error="href" hidden></span>
                  </label>

                  <label class="editor-field editor-field--quarter">
                    <span class="editor-field__label">LABEL / 按钮</span>
                    <input class="editor-input" data-field="hrefLabel" name="hrefLabel" type="text" maxlength="18" autocomplete="off" placeholder="OPEN" aria-describedby="editor-error-hrefLabel">
                    <span class="editor-field__error" id="editor-error-hrefLabel" data-editor-error="hrefLabel" hidden></span>
                  </label>
                </div>
              </div>
            </form>
          </div>
        </div>

        <footer class="project-editor__foot">
          <p class="project-editor__status" data-editor-status role="status" aria-live="polite">编辑草稿不会立即改变页面。</p>
          <div class="project-editor__actions">
            <button class="project-editor__button" type="button" data-editor-discard disabled>放弃修改</button>
            <button class="project-editor__button is-primary" type="button" data-editor-save>保存并重载</button>
          </div>
        </footer>

        <div class="project-editor__confirm" data-editor-confirm hidden>
          <div>
            <p>还有未保存的修改。</p>
            <span>关闭会丢弃这次草稿，但不会影响已经保存的项目。</span>
          </div>
          <div class="project-editor__confirm-actions">
            <button class="project-editor__button" type="button" data-editor-stay>继续编辑</button>
            <button class="project-editor__button is-danger" type="button" data-editor-confirm-close>放弃并关闭</button>
          </div>
        </div>
      </section>
    </div>`;

  nodes = {
    root: mount.querySelector('[data-project-editor]'),
    window: mount.querySelector('.project-editor__window'),
    close: mount.querySelector('[data-editor-close]'),
    veil: mount.querySelector('[data-editor-veil]'),
    local: mount.querySelector('[data-editor-local]'),
    count: mount.querySelector('[data-editor-count]'),
    list: mount.querySelector('[data-editor-list]'),
    newButton: mount.querySelector('[data-editor-new]'),
    newBlank: mount.querySelector('[data-editor-new-blank]'),
    blank: mount.querySelector('[data-editor-blank]'),
    form: mount.querySelector('[data-editor-form]'),
    scroll: mount.querySelector('[data-editor-scroll]'),
    mode: mount.querySelector('[data-editor-mode]'),
    deleteButton: mount.querySelector('[data-editor-delete]') || null,
    moveUp: mount.querySelector('[data-editor-move="up"]'),
    moveDown: mount.querySelector('[data-editor-move="down"]'),
    download: mount.querySelector('[data-editor-download]'),
    restore: mount.querySelector('[data-editor-restore]'),
    status: mount.querySelector('[data-editor-status]'),
    discard: mount.querySelector('[data-editor-discard]'),
    save: mount.querySelector('[data-editor-save]'),
    confirm: mount.querySelector('[data-editor-confirm]'),
    stay: mount.querySelector('[data-editor-stay]'),
    confirmClose: mount.querySelector('[data-editor-confirm-close]'),
    fields: {},
    errors: {}
  };

  FIELD_NAMES.forEach((name) => {
    nodes.fields[name] = mount.querySelector(`[data-field="${name}"]`);
    nodes.errors[name] = mount.querySelector(`[data-editor-error="${name}"]`);
  });

  if (nodes.root) nodes.root.hidden = true;

  function renderList(scrollToSelected = false) {
    if (!nodes.list) return;
    const fragment = document.createDocumentFragment();
    projects.forEach((project, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'project-editor__item';
      button.dataset.editorIndex = String(index);
      if (index === selected) button.classList.add('is-selected');
      button.setAttribute('aria-current', index === selected ? 'true' : 'false');

      const number = document.createElement('span');
      number.className = 'project-editor__item-number';
      number.textContent = pad(index + 1);

      const body = document.createElement('span');
      body.className = 'project-editor__item-body';

      const title = document.createElement('span');
      title.className = 'project-editor__item-title';
      title.textContent = project.title.trim() || '未命名项目';

      const meta = document.createElement('span');
      meta.className = 'project-editor__item-meta';
      const date = `${project.year || '----'}.${project.month ? pad(project.month) : '--'}`;
      meta.textContent = `${date} · ${project.category.trim() || 'UNCATEGORIZED'}`;

      body.append(title, meta);
      const arrow = document.createElement('span');
      arrow.className = 'project-editor__item-arrow';
      arrow.setAttribute('aria-hidden', 'true');
      arrow.textContent = '↗';
      button.append(number, body, arrow);
      fragment.appendChild(button);
    });
    nodes.list.replaceChildren(fragment);
    nodes.count.textContent = pad(projects.length);
    if (scrollToSelected && selected >= 0) {
      const active = nodes.list.querySelector(`[data-editor-index="${selected}"]`);
      if (active) active.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
    updateDirtyState();
  }

  function updateListSelection() {
    if (!nodes.list) return;
    Array.from(nodes.list.children).forEach((child, index) => {
      const active = index === selected;
      child.classList.toggle('is-selected', active);
      child.setAttribute('aria-current', active ? 'true' : 'false');
    });
  }

  function updateSelectedListSummary() {
    if (!nodes.list || selected < 0) return;
    const item = nodes.list.querySelector(`[data-editor-index="${selected}"]`);
    const project = projects[selected];
    if (!item || !project) return;
    const title = item.querySelector('.project-editor__item-title');
    const meta = item.querySelector('.project-editor__item-meta');
    if (title) title.textContent = project.title.trim() || '未命名项目';
    if (meta) {
      const date = `${project.year || '----'}.${project.month ? pad(project.month) : '--'}`;
      meta.textContent = `${date} · ${project.category.trim() || 'UNCATEGORIZED'}`;
    }
  }

  function clearFieldError(name) {
    const input = nodes.fields[name];
    const error = nodes.errors[name];
    if (!input || !error) return;
    input.removeAttribute('aria-invalid');
    const field = input.closest('.editor-field');
    if (field) field.classList.remove('is-invalid');
    error.textContent = '';
    error.hidden = true;
  }

  function clearAllErrors() {
    FIELD_NAMES.forEach(clearFieldError);
  }

  function setFieldError(name, message) {
    const input = nodes.fields[name];
    const error = nodes.errors[name];
    if (!input || !error) return;
    input.setAttribute('aria-invalid', 'true');
    const field = input.closest('.editor-field');
    if (field) field.classList.add('is-invalid');
    error.textContent = message;
    error.hidden = false;
  }

  function renderForm() {
    const project = projects[selected];
    if (!project) {
      nodes.form.hidden = true;
      nodes.scroll.hidden = true;
      nodes.blank.hidden = false;
      nodes.mode.textContent = 'NO PROJECT / 暂无项目';
      nodes.deleteButton && (nodes.deleteButton.disabled = true);
      updateDirtyState();
      return;
    }

    nodes.form.hidden = false;
    nodes.blank.hidden = true;
    nodes.scroll.hidden = false;
    FIELD_NAMES.forEach((name) => {
      if (nodes.fields[name]) nodes.fields[name].value = project[name] || '';
    });
    nodes.mode.textContent = `EDIT / PROJECT ${pad(selected + 1)}`;
    nodes.moveUp.disabled = selected <= 0;
    nodes.moveDown.disabled = selected >= projects.length - 1;
    nodes.deleteButton && (nodes.deleteButton.disabled = false);
    nodes.scroll.scrollTop = 0;
    clearAllErrors();
    updateDirtyState();
  }

  function syncFormToDraft() {
    const project = projects[selected];
    if (!project) return;
    FIELD_NAMES.forEach((name) => {
      if (nodes.fields[name]) project[name] = nodes.fields[name].value;
    });
  }

  function selectProject(index) {
    if (index < 0 || index >= projects.length || index === selected) return;
    selected = index;
    updateListSelection();
    renderForm();
    setStatus('正在编辑草稿。保存并重载后才会进入页面。');
  }

  function addProject() {
    const project = {
      id: makeId(),
      title: '',
      subtitle: '',
      category: '',
      year: String(CURRENT_YEAR),
      month: String(CURRENT_MONTH),
      description: '',
      tags: '',
      github: '',
      href: '',
      hrefLabel: 'OPEN'
    };
    projects.push(project);
    selected = projects.length - 1;
    renderList(true);
    renderForm();
    updateDirtyState();
    setStatus('新项目草稿已创建。填写标题和简介后保存。', 'ok');
    nodes.fields.title.focus();
  }

  function removeProject() {
    if (selected < 0 || selected >= projects.length) return;
    projects.splice(selected, 1);
    if (projects.length === 0) selected = -1;
    else selected = Math.min(selected, projects.length - 1);
    renderList(true);
    renderForm();
    updateDirtyState();
    setStatus('项目已从草稿移除；保存后才会从页面消失。', 'warn');
    if (selected >= 0) {
      const item = nodes.list.querySelector(`[data-editor-index="${selected}"]`);
      if (item) item.focus();
    } else {
      nodes.newBlank.focus();
    }
  }

  function moveProject(direction) {
    if (selected < 0) return;
    const target = selected + direction;
    if (target < 0 || target >= projects.length) return;
    const [project] = projects.splice(selected, 1);
    projects.splice(target, 0, project);
    selected = target;
    renderList(true);
    renderForm();
    updateDirtyState();
    const button = direction < 0 ? nodes.moveUp : nodes.moveDown;
    if (button) button.focus();
  }

  function handleValidationFailure(validation) {
    if (!validation.first) return;
    const { index, errors } = validation.first;
    selected = index;
    renderList(true);
    renderForm();
    clearAllErrors();
    Object.entries(errors).forEach(([name, message]) => setFieldError(name, message));
    const firstField = Object.keys(errors)[0];
    const input = nodes.fields[firstField];
    if (input) {
      input.focus();
      input.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
    setStatus(`第 ${pad(index + 1)} 个项目：${errors[firstField]}`, 'error');
  }

  function save() {
    syncFormToDraft();
    updateDirtyState();
    if (!isDirty()) {
      setStatus('没有需要保存的修改。');
      return;
    }
    const validation = validateAll();
    if (!validation.valid) {
      handleValidationFailure(validation);
      return;
    }
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cleanList()));
    } catch (_) {
      setStatus('无法写入本机浏览器存储。请用「下载 data.js」保存到源码。', 'error');
      return;
    }
    setStatus('已保存到本机浏览器，正在重载…', 'ok');
    nodes.save.disabled = true;
    window.setTimeout(() => window.location.reload(), 220);
  }

  function buildSource() {
    const data = cleanList();
    return `/*
 * PROJECT / 项目数据
 *
 * 由 Project GUI 编辑器导出。替换 projects/data.js 即可写入源码。
 * 注意：本机浏览器里的草稿会优先于 data.js；如果之前点过「保存并重载」，
 * 请先在编辑器里「恢复内置」清除本机草稿，再使用这份文件。
 */
(function () {
  'use strict';

  window.ShuikeProjects = ${JSON.stringify(data, null, 2)};
})();
`;
  }

  function downloadSource() {
    syncFormToDraft();
    const validation = validateAll();
    if (!validation.valid) {
      handleValidationFailure(validation);
      return;
    }
    const blob = new Blob([buildSource()], { type: 'text/javascript;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'data.js';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1200);
    setStatus('已生成 data.js。覆盖 projects/data.js 后即可进入源码。', 'ok');
  }

  function disarmRestore() {
    restoreArmed = false;
    window.clearTimeout(restoreTimer);
    if (nodes.restore) {
      nodes.restore.textContent = '恢复内置';
      nodes.restore.classList.remove('is-danger');
    }
  }

  function handleRestore() {
    if (!restoreArmed) {
      restoreArmed = true;
      nodes.restore.textContent = '再次点击确认';
      nodes.restore.classList.add('is-danger');
      setStatus('恢复内置会删除本机保存的改动。再次点击确认。', 'warn');
      restoreTimer = window.setTimeout(disarmRestore, 4200);
      return;
    }
    window.clearTimeout(restoreTimer);
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch (_) {}
    setStatus('已清除本机草稿，正在恢复 data.js 内置数据…', 'ok');
    window.setTimeout(() => window.location.reload(), 220);
  }

  function resetDraft() {
    projects = clone(initialProjects);
    selected = projects.length ? 0 : -1;
    renderList(true);
    renderForm();
    updateDirtyState();
    setStatus('已放弃本次修改，回到已保存的数据。');
    if (selected >= 0) {
      const item = nodes.list.querySelector(`[data-editor-index="${selected}"]`);
      if (item) item.focus();
    } else {
      nodes.newBlank.focus();
    }
  }

  function syncLocalIndicator() {
    const local = localSnapshotExists();
    openButton.classList.toggle('has-local-projects', local);
    openButton.dataset.tooltip = local ? '添加 / 修改项目 · 本机草稿' : '添加 / 修改项目';
    if (nodes.local) nodes.local.hidden = !local;
  }

  function getFocusable() {
    if (!nodes.window) return [];
    const selector = 'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
    return Array.from(nodes.window.querySelectorAll(selector)).filter((element) => (
      !element.hidden && element.getClientRects().length > 0 && !element.closest('[hidden]')
    ));
  }

  function showCloseConfirm() {
    if (!nodes.confirm || !nodes.confirm.hidden) return;
    nodes.confirm.hidden = false;
    setStatus('还有未保存的修改。关闭会丢弃这次草稿。', 'warn');
    if (nodes.stay) nodes.stay.focus();
  }

  function hideCloseConfirm() {
    if (!nodes.confirm || nodes.confirm.hidden) return;
    nodes.confirm.hidden = true;
    if (nodes.close) nodes.close.focus();
  }

  function closeEditor() {
    if (!isOpen) return;
    isOpen = false;
    window.clearTimeout(restoreTimer);
    disarmRestore();
    if (nodes.confirm) nodes.confirm.hidden = true;
    if (nodes.root) {
      nodes.root.hidden = true;
      nodes.root.setAttribute('aria-hidden', 'true');
    }
    if (nodes.window) nodes.window.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('editor-open');
    openButton.setAttribute('aria-expanded', 'false');
    backgroundInert.forEach(({ node, inert }) => {
      node.inert = inert;
    });
    backgroundInert = [];
    if (lastFocused && lastFocused.isConnected && lastFocused !== document.body && typeof lastFocused.focus === 'function') {
      lastFocused.focus({ preventScroll: true });
    } else {
      openButton.focus({ preventScroll: true });
    }
  }

  function requestClose() {
    if (!isOpen) return;
    if (nodes.confirm && !nodes.confirm.hidden) return;
    if (isDirty()) showCloseConfirm();
    else closeEditor();
  }

  function openEditor() {
    if (isOpen) return;
    if (page && page.vaultOpen) page.closeVault({ restoreFocus: false });
    projects = getPageProjects();
    initialProjects = clone(projects);
    initialSnapshot = snapshot();
    const activeCard = document.querySelector('.project.is-active');
    const activeId = activeCard ? String(activeCard.dataset.projectId) : '';
    const activeIndex = projects.findIndex((project) => project.id === activeId);
    selected = activeIndex >= 0 ? activeIndex : (projects.length ? 0 : -1);
    lastFocused = document.activeElement;
    renderList(true);
    renderForm();
    updateDirtyState();
    syncLocalIndicator();
    setStatus(projects.length ? '选择一个项目，或新建一个项目。编辑草稿不会立即改变页面。' : '还没有项目，先新建一个。');
    if (nodes.confirm) nodes.confirm.hidden = true;
    if (nodes.root) {
      nodes.root.hidden = false;
      nodes.root.setAttribute('aria-hidden', 'false');
    }
    if (nodes.window) nodes.window.setAttribute('aria-hidden', 'false');
    document.body.classList.add('editor-open');
    openButton.setAttribute('aria-expanded', 'true');
    backgroundInert = [];
    Array.from(document.body.children).forEach((node) => {
      if (node === mount || node.tagName === 'SCRIPT' || node.tagName === 'NOSCRIPT') return;
      backgroundInert.push({ node, inert: node.inert });
      node.inert = true;
    });
    isOpen = true;
    window.requestAnimationFrame(() => {
      const item = nodes.list.querySelector(`[data-editor-index="${selected}"]`);
      if (item) item.focus({ preventScroll: true });
      else nodes.newBlank.focus();
    });
  }

  function handleKeydown(event) {
    if (!isOpen) return;
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      event.stopPropagation();
      save();
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      if (nodes.confirm && !nodes.confirm.hidden) {
        hideCloseConfirm();
      } else {
        requestClose();
      }
      return;
    }
    if (event.key === 'Tab') {
      const focusable = getFocusable();
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !nodes.window.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !nodes.window.contains(active))) {
        event.preventDefault();
        first.focus();
      }
      return;
    }
    if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
      event.stopPropagation();
    }
  }

  function updateField(event) {
    const input = event.target.closest('[data-field]');
    if (!input) return;
    const name = input.dataset.field;
    const project = projects[selected];
    if (!project) return;
    project[name] = input.value;
    clearFieldError(name);
    if (['title', 'category', 'year', 'month'].includes(name)) updateSelectedListSummary();
    updateDirtyState();
  }

  nodes.list.addEventListener('click', (event) => {
    const button = event.target.closest('[data-editor-index]');
    if (!button) return;
    selectProject(Number(button.dataset.editorIndex));
  });
  nodes.form.addEventListener('input', updateField);
  nodes.form.addEventListener('submit', (event) => {
    event.preventDefault();
    save();
  });
  nodes.newButton.addEventListener('click', addProject);
  nodes.newBlank.addEventListener('click', addProject);
  nodes.deleteButton && nodes.deleteButton.addEventListener('click', removeProject);
  nodes.moveUp.addEventListener('click', () => moveProject(-1));
  nodes.moveDown.addEventListener('click', () => moveProject(1));
  nodes.close.addEventListener('click', requestClose);
  nodes.veil.addEventListener('click', requestClose);
  nodes.discard.addEventListener('click', resetDraft);
  nodes.save.addEventListener('click', save);
  nodes.download.addEventListener('click', downloadSource);
  nodes.restore.addEventListener('click', handleRestore);
  nodes.stay.addEventListener('click', hideCloseConfirm);
  nodes.confirmClose.addEventListener('click', closeEditor);
  nodes.root.addEventListener('keydown', handleKeydown);
  openButton.addEventListener('click', openEditor);

  syncLocalIndicator();
  openButton.hidden = false;

  window.ShuikeProjectEditor = {
    open: openEditor,
    close: closeEditor,
    get isOpen() { return isOpen; },
    get projects() { return clone(projects); },
    get storageKey() { return STORAGE_KEY; },
    exportText() {
      syncFormToDraft();
      const validation = validateAll();
      if (!validation.valid) {
        handleValidationFailure(validation);
        return null;
      }
      return buildSource();
    }
  };
})();
