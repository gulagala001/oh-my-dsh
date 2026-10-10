(() => {
  'use strict';
  const status = document.querySelector('.copy-status');
  const resetTimers = new WeakMap();
  document.querySelectorAll('.code-copy').forEach(button => {
    button.hidden = false;
    button.addEventListener('click', async () => {
      const code = button.closest('.code-block').querySelector('code');
      const text = code.textContent.replace(/\n$/, '');
      clearTimeout(resetTimers.get(button));
      button.disabled = true;
      try {
        await navigator.clipboard.writeText(text);
        button.textContent = '已复制';
        status.textContent = '代码已复制。';
      } catch {
        const selection = window.getSelection(), range = document.createRange();
        range.selectNodeContents(code); selection.removeAllRanges(); selection.addRange(range);
        button.textContent = '请手动复制';
        status.textContent = '浏览器未允许直接复制，已选中代码。请使用复制快捷键。';
      } finally {
        button.disabled = false;
        resetTimers.set(button, setTimeout(() => { button.textContent = '复制'; }, 2500));
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
        retry = document.createElement('button'); retry.type = 'button'; retry.textContent = '重试图片';
        const original = document.createElement('a'); original.href = image.currentSrc || image.src;
        original.target = '_blank'; original.rel = 'noreferrer'; original.textContent = '打开原图 ↗';
        notice.append(message, retry, original);
        (linkedImage || image).after(notice);
        retry.addEventListener('click', () => {
          retry.disabled = true; notice.setAttribute('aria-busy', 'true'); message.textContent = '正在加载图片…';
          image.src = image.src;
        });
      }
      message.textContent = image.alt ? `图片未能加载：${image.alt}` : '图片未能加载。';
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

  document.querySelectorAll('.mobile-nav a, .mobile-toc a').forEach(link => link.addEventListener('click', () => {
    link.closest('details').open = false;
    const target = link.hash && document.getElementById(decodeURIComponent(link.hash.slice(1)));
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
