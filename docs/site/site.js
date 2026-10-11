(() => {
  'use strict';
  const english = document.documentElement.lang === 'en';
  const text = (zh, en) => english ? en : zh;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const $ = selector => document.querySelector(selector);
  const imageRequests = new WeakMap();

  function feedbackFor(element, retryLabel) {
    const panel = element.closest('[role="tabpanel"]') || (element.parentElement.tagName === 'A' ? element.parentElement.parentElement : element.parentElement);
    let status = panel.querySelector(':scope > .preview-feedback');
    if (!status) {
      status = document.createElement('span'); status.className = 'preview-feedback'; status.setAttribute('role', 'status');
      const message = document.createElement('span'); message.className = 'preview-message';
      const retry = document.createElement('button'); retry.type = 'button'; retry.textContent = retryLabel;
      status.append(message, retry); panel.append(status);
    }
    return { panel, status, message: status.querySelector('.preview-message'), retry: status.querySelector('button') };
  }
  async function swapImage(element, src, alt, commit = () => {}) {
    const request = (imageRequests.get(element) || 0) + 1; imageRequests.set(element, request);
    const { panel, status, message, retry } = feedbackFor(element, text('重试预览', 'Retry preview'));
    panel.setAttribute('aria-busy', 'true'); panel.classList.remove('preview-failed'); panel.classList.add('preview-pending');
    status.hidden = false; message.textContent = text('正在加载预览…', 'Loading preview...'); retry.hidden = true;
    retry.onclick = () => { void swapImage(element, src, alt, commit); };
    const next = new Image(); next.src = src;
    try { await next.decode(); }
    catch {
      if (imageRequests.get(element) === request) {
        element.style.visibility = 'hidden';
        panel.setAttribute('aria-busy', 'false'); panel.classList.remove('preview-pending'); panel.classList.add('preview-failed');
        message.textContent = text('预览暂时无法加载。', 'The preview could not be loaded.'); retry.hidden = false;
      }
      return false;
    }
    if (imageRequests.get(element) !== request) return false;
    element.src = src; element.alt = alt; element.width = next.naturalWidth; element.height = next.naturalHeight; element.style.removeProperty('visibility'); commit(next);
    panel.setAttribute('aria-busy', 'false'); panel.classList.remove('preview-pending', 'preview-failed');
    if (status.contains(document.activeElement)) document.getElementById(panel.getAttribute('aria-labelledby'))?.focus();
    status.hidden = true;
    if (!reducedMotion.matches) element.animate([{ opacity: .65 }, { opacity: 1 }], { duration: 220, easing: 'ease-out' });
    return true;
  }
  // Initial, static and dialog images also retain a manual recovery path.
  document.querySelectorAll('main img, #detail-image').forEach(element => {
    let feedback;
    element.addEventListener('error', () => {
      feedback = feedbackFor(element, text('重试图片', 'Retry image')); const { panel, status, message, retry } = feedback;
      message.textContent = text('图片暂时无法加载。', 'The image could not be loaded.'); retry.hidden = false; retry.disabled = false; status.hidden = false;
      panel.setAttribute('aria-busy', 'false'); panel.classList.add('preview-failed');
      retry.onclick = () => { retry.disabled = true; message.textContent = text('正在加载图片…', 'Loading image...'); panel.setAttribute('aria-busy', 'true'); element.src = element.src; };
    });
    element.addEventListener('load', () => {
      if (!feedback) return; const { panel, status, retry } = feedback;
      if (status.contains(document.activeElement)) (element.closest('a') || panel.querySelector('button:not(.preview-feedback button)'))?.focus();
      status.hidden = true; retry.disabled = false; panel.removeAttribute('aria-busy'); panel.classList.remove('preview-failed');
    });
    if (element.complete && !element.naturalWidth && element.getAttribute('src')) element.dispatchEvent(new Event('error'));
  });

  function bindTabs(name, onChange) {
    const list = document.querySelector(`[data-tabs="${name}"]`);
    const tabs = [...list.querySelectorAll('[role="tab"]')];
    function select(tab) {
      for (const item of tabs) {
        item.setAttribute('aria-selected', String(item === tab));
        item.tabIndex = item === tab ? 0 : -1;
      }
      onChange(tab.dataset.value, tab);
    }
    list.addEventListener('click', event => {
      const tab = event.target.closest('[role="tab"]');
      if (tab && list.contains(tab)) select(tab);
    });
    list.addEventListener('keydown', event => {
      const current = tabs.indexOf(event.target);
      if (current < 0) return;
      let next;
      if (event.key === 'ArrowRight') next = (current + 1) % tabs.length;
      if (event.key === 'ArrowLeft') next = (current - 1 + tabs.length) % tabs.length;
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = tabs.length - 1;
      if (next === undefined) return;
      event.preventDefault();
      tabs[next].focus();
      select(tabs[next]);
    });
  }

  const heroScenes = {
    computer: { src: 'site/media/launchpad-workbench.jpg', alt: '发布清单的实际验收，对话、任务与文件核验输出并排显示', caption: '同一份发布清单：3 项待验收，2 项验证完成，下载文件已逐项核对。' },
    memory: { src: 'site/media/launchpad-recall.jpg', alt: '压缩后实际回查原话，核对 CSV 六列、编码与未验收项要求', caption: '按原话核对：UTF-8 + BOM、六列、保留未验收项。' },
    tasks: { src: 'site/media/launchpad-tasks.jpg', alt: '实际任务账本中的原始要求、文件路径与通过的 CSV 核验输出', caption: '要求对应任务，下载文件对应验证结果；每一项都有依据。' },
  };
  if (english) {
    Object.assign(heroScenes.computer, { alt: 'Actual release checklist verification, with conversation, tasks, and file checks side by side', caption: 'One release checklist: 3 items awaiting acceptance, 2 verifications complete, and downloaded files checked.' });
    Object.assign(heroScenes.memory, { alt: 'Original requirements recalled after compression to verify CSV columns, encoding, and pending items', caption: 'Checked against the original: UTF-8 + BOM, six columns, and pending items retained.' });
    Object.assign(heroScenes.tasks, { alt: 'A task ledger with original requirements, file paths, and successful CSV verification output', caption: 'Requirements connect to tasks; downloaded files connect to verification results.' });
  }
  bindTabs('hero', async (key, tab) => {
    const scene = heroScenes[key];
    $('#hero-panel').setAttribute('aria-labelledby', tab.id);
    await swapImage($('#hero-image'), scene.src, scene.alt, () => {
      $('[data-hero-original]').href = scene.src; $('#hero-caption').textContent = scene.caption;
    });
  });

  const memoryScenes = {
    record: { src: 'site/media/launchpad-requirements.jpg', crop: [395.390625,474,352.34375,107], title: '先把要求说清楚。', description: '保留负责人、优先级和未验收项；CSV 固定六列，使用 UTF-8 + BOM。原始消息成为后续验收的依据。', proofLabel: '这份清单的原始约定', proof: '六列 · UTF-8 + BOM', label: '原始要求 · 实拍局部', alt: 'Launchpad 原始用户消息中的六列编码与未验收项要求' },
    compress: { src: 'site/media/launchpad-context.jpg', crop: [781,74,659,926], title: '精简当前上下文，保留来源。', description: '本次先执行 summary 分段摘要，再执行 full 全量压缩。两份详细资料、原始日志、用户原话和附件保留，供之后回查。', proofLabel: '本次实际压缩后的状态', proof: 'summary + full · 两份详细资料留档', label: '工作上下文 · 实际完成状态', alt: '工作上下文中的分段摘要、两份详细资料存档和 summary 与 full 手动压缩入口' },
    recall: { src: 'site/media/launchpad-recall.jpg', crop: [300,475,465,152], title: '细节有疑问，直接回查原话。', description: '压缩后通过 recall 的 original 回查原始要求，核对编码、列顺序以及必须保留的未验收项。', proofLabel: '按来源核对，而不是猜测', proof: '原始要求 · 六列约定', label: '压缩后回查 · 实拍局部', alt: '原话回查后的核对回复：CSV 六列、BOM 和未验收项约定' },
    continue: { src: 'site/media/launchpad-tasks.jpg', crop: [801,153.390625,631,416.9375], title: '带着原始要求，核对交付文件。', description: '下载后的 CSV 由独立脚本逐字段检查：编码、六列、8 条事项和 3 条未验收项均一致。验证结果挂接到原始需求。', proofLabel: '实际下载文件的验证输出', proof: 'BOM · 六列 · 8 条事项', label: '任务证据 · 实际 PASS 输出', alt: '下载文件的原始需求、独立核验脚本和真实 PASS 输出' },
  };
  if (english) {
    Object.assign(memoryScenes.record, { title: 'Start with explicit requirements.', description: 'Keep owners, priorities, and pending items. Export a six-column CSV with UTF-8 + BOM. The original message provides the acceptance criteria.', proofLabel: 'The original checklist requirements', proof: 'Six columns · UTF-8 + BOM', label: 'Original requirements · Detail', alt: 'Original Launchpad message specifying CSV columns, encoding, and pending items' });
    Object.assign(memoryScenes.compress, { title: 'Reduce context, retain the sources.', description: 'The example runs summary compression, then full compression. Two detailed archives, original logs, user messages, and attachments remain available for recall.', proofLabel: 'Actual post-compression state', proof: 'summary + full · Two detail archives', label: 'Working context · Actual state', alt: 'Working context showing summaries, two detail archives, and summary and full compression controls' });
    Object.assign(memoryScenes.recall, { title: 'Retrieve the original for exact details.', description: 'After compression, original recall retrieves the requirements to check encoding, column order, and the pending items that must be retained.', proofLabel: 'Checked against the source', proof: 'Original requirements · Six columns', label: 'Recall after compression · Detail', alt: 'Recall response checking six CSV columns, BOM, and pending item requirements' });
    Object.assign(memoryScenes.continue, { title: 'Check the file against the requirements.', description: 'An independent script checks the downloaded CSV: encoding, six columns, eight items, and three pending items. The results attach to the original requirement.', proofLabel: 'Verification of the downloaded file', proof: 'BOM · Six columns · Eight items', label: 'Task evidence · Actual PASS output', alt: 'Original requirement, independent file verification script, and actual PASS output' });
  }
  bindTabs('memory', async (key, tab) => {
    const scene = memoryScenes[key];
    $('#memory-panel').setAttribute('aria-labelledby', tab.id);
    await swapImage($('#memory-image'), scene.src, scene.alt, next => {
    $('#memory-original').href = scene.src;
    const [x, y, width, height] = scene.crop;
    const crop = $('#memory-crop');
    crop.style.setProperty('--crop-ratio', `${width}/${height}`);
    crop.style.setProperty('--image-width', `${next.naturalWidth / width * 100}%`);
    crop.style.setProperty('--image-left', `${-x / width * 100}%`);
    crop.style.setProperty('--image-top', `${-y / height * 100}%`);
    $('#memory-step-title').textContent = scene.title;
    $('#memory-step-description').textContent = scene.description;
    $('#memory-proof-label').textContent = scene.proofLabel;
    $('#memory-proof-value').textContent = scene.proof;
    $('#memory-capture-label').textContent = scene.label;
    });
  });

  const themes = {
    codex: { name: 'Codex Desktop', description: '冷灰侧栏、系统字体与清晰的内容层级。' },
    glass: { name: 'iOS Liquid Glass', description: '通透材质、圆角面板与柔和的空间层次。' },
    terminal: { name: 'Claude CLI', description: '暖黑与纸白、陶土橙与等宽终端布局。' },
    material: { name: 'Google Material', description: 'Material 配色与舒展的导航、输入和设置。' },
    omd: { name: 'OMD 默认', description: '保留熟悉的 DSH 布局与蓝色强调。' },
  };
  if (english) {
    themes.codex.description = 'A cool gray sidebar, system fonts, and clear content hierarchy.';
    themes.glass.description = 'Translucent surfaces, rounded panels, and gentle depth.';
    themes.terminal.description = 'Dark and paper-white surfaces, terracotta accents, and a monospace layout.';
    themes.material.description = 'Material colors with spacious navigation, input, and settings.';
    themes.omd = { name: 'OMD Default', description: 'The familiar DSH layout with blue accents.' };
  }
  let activeTheme = 'codex';
  async function renderTheme() {
    const mode = $('[name="preview-mode"]:checked').value;
    const key = activeTheme;
    const theme = themes[key];
    const src = `site/media/theme-${key}-${mode}.jpg`;
    $('#theme-panel').setAttribute('aria-labelledby', `theme-tab-${key}`);
    await swapImage($('#theme-image'), src, english ? `Actual ${theme.name} interface in ${mode} mode` : `${theme.name} ${mode === 'dark' ? '深色' : '浅色'}主题的真实界面`, () => {
    $('#theme-original').href = src;
    $('#theme-name').textContent = theme.name;
    $('#theme-description').textContent = theme.description;
    $('#theme-image').dataset.preview = `${key}-${mode}`;
    });
  }
  bindTabs('theme', key => { activeTheme = key; renderTheme(); });
  document.querySelectorAll('[name="preview-mode"]').forEach(input => input.addEventListener('change', renderTheme));

  bindTabs('install', key => {
    $('#desktop-install').hidden = key !== 'desktop';
    $('#web-install').hidden = key !== 'web';
    $('.copy-status').textContent = '';
  });
  document.querySelectorAll('[data-copy]').forEach(button => button.addEventListener('click', async () => {
    const code = document.getElementById(button.dataset.copy), source = code.textContent.trim();
    button.disabled = true;
    try {
      await navigator.clipboard.writeText(source);
      $('.copy-status').textContent = text('已复制。按上方步骤继续安装即可。', 'Copied. Continue with the installation steps above.');
    } catch {
      const range = document.createRange(), selection = window.getSelection(); range.selectNodeContents(code); selection.removeAllRanges(); selection.addRange(range);
      $('.copy-status').textContent = text('当前浏览器无法直接复制，已选中命令，请使用复制快捷键。', 'Direct copying is unavailable. The commands are selected; use your copy shortcut.');
    } finally { button.disabled = false; }
  }));

  const menu = $('.menu-toggle');
  function closeMenu() { menu.setAttribute('aria-expanded', 'false'); $('#main-nav').classList.remove('is-open'); }
  menu.addEventListener('click', () => {
    const open = menu.getAttribute('aria-expanded') !== 'true';
    menu.setAttribute('aria-expanded', String(open));
    $('#main-nav').classList.toggle('is-open', open);
  });
  $('#main-nav').addEventListener('click', event => { if (event.target.closest('a')) closeMenu(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && menu.getAttribute('aria-expanded') === 'true') { closeMenu(); menu.focus(); } });
  document.addEventListener('pointerdown', event => { if (menu.getAttribute('aria-expanded') === 'true' && !event.target.closest('.nav-wrap')) closeMenu(); });
  matchMedia('(min-width: 761px)').addEventListener('change', closeMenu);

  const dialog = $('#media-dialog');
  const detailImage = $('#detail-image');
  const details = {
    tasks: { title: '需求、任务与验证证据', file: 'site/media/launchpad-tasks.jpg', alt: '原始要求、实际下载文件与独立核验的 PASS 结果', note: '真实原生任务账本。业务清单的初始勾选为演示数据，文件检查与浏览器操作单独验证。' },
  };
  if (english) Object.assign(details.tasks, { title: 'Requirements, Tasks, and Verification', alt: 'Original requirements, downloaded files, and an independent verification PASS result', note: 'An actual native task ledger. Initial checklist states are sample data; file checks and browser actions were verified separately.' });
  function openDialog(title) {
    $('#media-title').textContent = title;
    document.body.classList.add('dialog-open');
    dialog.showModal(); $('.dialog-close').focus();
  }
  document.querySelectorAll('[data-image]').forEach(button => button.addEventListener('click', () => {
    const item = details[button.dataset.image];
    detailImage.hidden = false;
    detailImage.src = item.file;
    const staleFeedback = $('.dialog-content .preview-feedback'); if (staleFeedback) staleFeedback.hidden = true;
    detailImage.alt = item.alt;
    $('#media-note').textContent = item.note;
    const original = document.createElement('a');
    original.href = item.file;
    original.textContent = text(' 打开完整原图 ↗', ' Open full screenshot ↗');
    original.target = '_blank';
    original.rel = 'noreferrer';
    $('#media-note').append(original);
    openDialog(item.title);
  }));
  $('.dialog-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    document.body.classList.remove('dialog-open');
  });
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
  });
})();
