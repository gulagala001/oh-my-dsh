(() => {
  'use strict';
  const english = document.documentElement.lang === 'en';
  const text = (zh, en) => english ? en : zh;
  const status = document.querySelector('.copy-status');
  const resetTimers = new WeakMap();
  document.querySelectorAll('.code-copy').forEach(button => {
    button.hidden = false;
    button.addEventListener('click', async () => {
      const code = button.closest('.code-block').querySelector('code');
      const source = code.textContent.replace(/\n$/, '');
      clearTimeout(resetTimers.get(button));
      button.disabled = true;
      try {
        await navigator.clipboard.writeText(source);
        button.textContent = text('已复制', 'Copied');
        status.textContent = text('代码已复制。', 'Code copied.');
      } catch {
        const selection = window.getSelection(), range = document.createRange();
        range.selectNodeContents(code); selection.removeAllRanges(); selection.addRange(range);
        button.textContent = text('请手动复制', 'Copy manually');
        status.textContent = text('浏览器未允许直接复制，已选中代码。请使用复制快捷键。', 'Direct copying is unavailable. The code is selected; use your copy shortcut.');
      } finally {
        button.disabled = false;
        resetTimers.set(button, setTimeout(() => { button.textContent = text('复制', 'Copy'); }, 2500));
      }
    });
  });

  document.querySelectorAll('.doc-article img').forEach(image => {
    const parent = image.parentElement;
    const linkedImage = parent.tagName === 'A' && parent.children.length === 1 && !parent.textContent.trim() ? parent : null;
    let notice, message, retry;
    image.addEventListener('load', () => {
      image.hidden = false;
      if (linkedImage) linkedImage.hidden = false;
      if (notice) { if (notice.contains(document.activeElement)) { image.tabIndex = -1; image.focus({ preventScroll: true }); } notice.hidden = true; notice.removeAttribute('aria-busy'); retry.disabled = false; }
    });
    const failed = () => {
      if (!notice) {
        notice = document.createElement('span'); notice.className = 'image-fallback'; notice.setAttribute('role', 'status');
        message = document.createElement('span'); message.className = 'image-fallback-text';
        retry = document.createElement('button'); retry.type = 'button'; retry.textContent = text('重试图片', 'Retry image');
        const original = document.createElement('a'); original.href = image.currentSrc || image.src;
        original.target = '_blank'; original.rel = 'noreferrer'; original.textContent = text('打开原图 ↗', 'Open original ↗');
        notice.append(message, retry, original);
        (linkedImage || image).after(notice);
        retry.addEventListener('click', () => {
          retry.disabled = true; notice.setAttribute('aria-busy', 'true'); message.textContent = text('正在加载图片…', 'Loading image...');
          image.src = image.src;
        });
      }
      message.textContent = image.alt ? `${text('图片未能加载：', 'Image could not be loaded: ')}${image.alt}` : text('图片未能加载。', 'Image could not be loaded.');
      retry.disabled = false; notice.removeAttribute('aria-busy'); notice.hidden = false;
      image.hidden = true; if (linkedImage) linkedImage.hidden = true;
    };
    image.addEventListener('error', failed);
    if (image.complete && !image.naturalWidth && image.getAttribute('src')) failed();
  });

  function revealHash() {
    if (!location.hash) return;
    let id;
    try { id = decodeURIComponent(location.hash.slice(1)); } catch { return; }
    const target = document.getElementById(id);
    if (!target) return;
    let ancestor = target.parentElement;
    while (ancestor) { if (ancestor.tagName === 'DETAILS') ancestor.open = true; ancestor = ancestor.parentElement; }
    // Authored section anchors may sit just before a details block. Marked
    // wraps standalone inline anchors in an otherwise empty paragraph.
    if (target.tagName === 'A' && !target.textContent.trim()) {
      let boundary = target;
      if (!boundary.nextElementSibling && boundary.parentElement.tagName === 'P' && boundary.parentElement.children.length === 1 && !boundary.parentElement.textContent.trim()) boundary = boundary.parentElement;
      if (boundary.nextElementSibling?.tagName === 'DETAILS') boundary.nextElementSibling.open = true;
    }
    target.scrollIntoView({ block: 'start', behavior: 'instant' });
  }
  window.addEventListener('hashchange', revealHash);
  document.addEventListener('click', event => {
    if (event.defaultPrevented || event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = event.target.closest('a[href]');
    if (!link || (link.target && link.target !== '_self')) return;
    const url = new URL(link.href);
    if (url.origin === location.origin && url.pathname === location.pathname && url.search === location.search && url.hash && url.hash === location.hash) revealHash();
  });
  revealHash();
  document.addEventListener('focusin', event => {
    const element = event.target;
    if (!(element instanceof HTMLElement) || !element.closest('.doc-main')) return;
    const header = document.querySelector('.doc-header').getBoundingClientRect(), bounds = element.getBoundingClientRect();
    if (bounds.top < header.bottom + 8) window.scrollBy({ top: bounds.top - header.bottom - 8, behavior: 'instant' });
    else if (bounds.bottom > innerHeight - 8) window.scrollBy({ top: Math.min(bounds.top - header.bottom - 8, bounds.bottom - innerHeight + 8), behavior: 'instant' });
  });

  document.querySelectorAll('.mobile-nav a, .mobile-toc a').forEach(link => link.addEventListener('click', () => {
    link.closest('details').open = false;
    const url = new URL(link.href);
    const target = url.origin === location.origin && url.pathname === location.pathname && url.hash && document.getElementById(decodeURIComponent(url.hash.slice(1)));
    if (target) { target.tabIndex = -1; target.focus({ preventScroll: true }); }
  }));
  document.querySelectorAll('.mobile-nav, .mobile-toc').forEach(menu => menu.addEventListener('keydown', event => {
    if (event.key === 'Escape' && menu.open) { event.preventDefault(); menu.open = false; menu.querySelector('summary').focus(); }
  }));
  const tocLinks = [...document.querySelectorAll('.doc-toc a, .mobile-toc a')];
  const headings = tocLinks.map(link => document.getElementById(decodeURIComponent(link.hash.slice(1)))).filter(Boolean);
  if (!headings.length || !('IntersectionObserver' in window)) return;
  const visible = new Set();
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) { if (entry.isIntersecting) visible.add(entry.target); else visible.delete(entry.target); }
    const current = headings.find(heading => visible.has(heading));
    if (!current) return;
    for (const link of tocLinks) {
      if (decodeURIComponent(link.hash.slice(1)) === current.id) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    }
  }, { rootMargin: '-94px 0px -55% 0px' });
  for (const heading of headings) observer.observe(heading);
})();
