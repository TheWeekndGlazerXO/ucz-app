/* ============================================================
   Trinity Church Zambia — app.js
   All client-side logic: API calls, rendering, admin, modal.
   ============================================================ */
   'use strict';

   // ── Helpers ──────────────────────────────────────────────────
   
   function el(id) { return document.getElementById(id); }
   
   function toast(msg, duration = 2600) {
     const t = el('toast');
     t.textContent = msg;
     t.classList.add('show');
     clearTimeout(toast._timer);
     toast._timer = setTimeout(() => t.classList.remove('show'), duration);
   }
   
   function fmtDate(dateStr) {
     if (!dateStr) return '';
     const d = new Date(dateStr + 'T12:00:00');
     return d.toLocaleDateString('en-ZM', {
       weekday: 'short', day: 'numeric', month: 'long', year: 'numeric',
     });
   }
   
   function fmtDateShort(dateStr) {
     if (!dateStr) return '';
     const d = new Date(dateStr + 'T12:00:00');
     return d.toLocaleDateString('en-ZM', { day: 'numeric', month: 'short', year: 'numeric' });
   }
   
   // ── API ──────────────────────────────────────────────────────
   
   async function api(method, path, body = null, isForm = false) {
     const opts = {
       method,
       credentials: 'same-origin',
     };
     if (body) {
       if (isForm) {
         opts.body = body;                      // FormData
       } else {
         opts.headers = { 'Content-Type': 'application/json' };
         opts.body = JSON.stringify(body);
       }
     }
     const res = await fetch('/api' + path, opts);
     if (!res.ok) {
       const err = await res.json().catch(() => ({ error: res.statusText }));
       throw new Error(err.error || 'Request failed');
     }
     return res.json();
   }
   
   // ── Tab switching ─────────────────────────────────────────────
   
   const TAB_IDS = ['brochure', 'news', 'links', 'hymns', 'admin'];
   
   function switchTab(id) {
     TAB_IDS.forEach(t => {
       const panel = el('tab-' + t);
       const btn   = el('tbtn-' + t);
       if (panel) panel.classList.toggle('active', t === id);
       if (btn) {
         btn.classList.toggle('active', t === id);
         btn.setAttribute('aria-selected', t === id ? 'true' : 'false');
       }
     });
   
     // Lazy-load on first switch
     if (id === 'brochure') loadBrochures();
     if (id === 'news')     loadNews();
     if (id === 'links')    loadLinks();
     if (id === 'hymns')    loadHymns();
     if (id === 'admin')    checkAdminStatus();
   }
   
   // ── FILE PREVIEW ─────────────────────────────────────────────
   
   function previewFile(input, previewId, labelId) {
     const file = input.files[0];
     if (!file) return;
     if (labelId) el(labelId).textContent = file.name;
     const preview = el(previewId);
     if (file.type.startsWith('image/')) {
       const reader = new FileReader();
       reader.onload = e => {
         preview.src = e.target.result;
         preview.hidden = false;
       };
       reader.readAsDataURL(file);
     } else {
       preview.hidden = true;
     }
   }
   window.previewFile = previewFile;
   
   // ── MODAL ────────────────────────────────────────────────────
   
   function openModal(title, bodyHTML) {
     el('modal-title').textContent = title;
     el('modal-body').innerHTML    = bodyHTML;
     el('viewer-modal').hidden     = false;
     document.body.style.overflow  = 'hidden';
   }
   
   function closeModal() {
     el('viewer-modal').hidden    = true;
     el('modal-body').innerHTML   = '';
     document.body.style.overflow = '';
   }
   window.closeModal = closeModal;
   
   // Close on backdrop click
   el('viewer-modal').addEventListener('click', function (e) {
     if (e.target === this) closeModal();
   });
   // Close on Escape
   document.addEventListener('keydown', e => {
     if (e.key === 'Escape' && !el('viewer-modal').hidden) closeModal();
   });
   
   // ═══════════════════════════════════════════════════════════
   //  BROCHURES
   // ═══════════════════════════════════════════════════════════
   
   let _brochures   = [];
   let _brochureIdx = 0;
   
   async function loadBrochures() {
     try {
       _brochures = await api('GET', '/brochures');
       renderBrochurePills();
     } catch (e) {
       el('brochure-viewer').innerHTML =
         `<div class="empty-state"><p>Could not load brochures.</p></div>`;
     }
   }
   
   function renderBrochurePills() {
     const pills  = el('brochure-pills');
     const viewer = el('brochure-viewer');
   
     if (!_brochures.length) {
       pills.innerHTML  = '';
       viewer.innerHTML = `<div class="empty-state">
         <div class="empty-icon">📋</div>
         <p>No brochures uploaded yet.<br/>Check back soon.</p>
       </div>`;
       return;
     }
   
     // Find nearest upcoming brochure
     const today = new Date().toISOString().slice(0, 10);
     let auto = _brochures.findIndex(b => b.service_date >= today);
     if (auto === -1) auto = _brochures.length - 1;
     _brochureIdx = auto;
   
     pills.innerHTML = _brochures.map((b, i) => `
       <button class="date-pill${i === auto ? ' active' : ''}"
               onclick="selectBrochure(${i})"
               aria-pressed="${i === auto ? 'true' : 'false'}">
         ${fmtDateShort(b.service_date)}
       </button>`).join('');
   
     showBrochure(_brochures[auto]);
   }
   
   function selectBrochure(idx) {
     _brochureIdx = idx;
     document.querySelectorAll('.date-pill').forEach((p, i) => {
       p.classList.toggle('active', i === idx);
       p.setAttribute('aria-pressed', i === idx ? 'true' : 'false');
     });
     showBrochure(_brochures[idx]);
   }
   window.selectBrochure = selectBrochure;
   
   function showBrochure(b) {
     const viewer = el('brochure-viewer');
     if (b.file_type === 'pdf') {
       viewer.innerHTML = `<iframe class="brochure-frame"
         src="${b.file_path}"
         title="Brochure for ${fmtDate(b.service_date)}"
         loading="lazy">
       </iframe>`;
     } else {
       viewer.innerHTML = `<img class="brochure-img"
         src="${b.file_path}"
         alt="Brochure for ${fmtDate(b.service_date)}"
         loading="lazy"/>`;
     }
   }
   
   // Admin
   async function saveBrochure() {
     const date = el('b-date').value;
     const file = el('b-file').files[0];
     if (!date || !file) { toast('Please select a date and file'); return; }
   
     const fd = new FormData();
     fd.append('service_date', date);
     fd.append('file', file);
   
     try {
       await api('POST', '/brochures', fd, true);
       el('b-date').value = '';
       el('b-file').value = '';
       el('b-file-label').textContent = 'Tap to choose PDF or image';
       el('b-preview').hidden = true;
       toast('Brochure saved ✓');
       loadAdminBrochures();
       _brochures = [];            // invalidate cache
     } catch (e) {
       toast('Error: ' + e.message);
     }
   }
   window.saveBrochure = saveBrochure;
   
   async function loadAdminBrochures() {
     try {
       const list = await api('GET', '/brochures');
       const el2  = el('admin-brochure-list');
       if (!list.length) {
         el2.innerHTML = '<p style="font-size:.82rem;color:var(--ink-muted)">None yet</p>';
         return;
       }
       el2.innerHTML = list.map(b => `
         <div class="admin-item">
           <div class="admin-item-info">
             <div class="name">${fmtDate(b.service_date)}</div>
             <div class="meta">${b.original_name} · <span class="badge">${b.file_type === 'pdf' ? 'PDF' : 'Image'}</span></div>
           </div>
           <button class="btn btn-sm btn-danger" onclick="deleteBrochure('${b.id}')">Delete</button>
         </div>`).join('');
     } catch (e) {
       el('admin-brochure-list').innerHTML = '<p class="error-msg">Failed to load</p>';
     }
   }
   
   async function deleteBrochure(id) {
     if (!confirm('Delete this brochure? This cannot be undone.')) return;
     try {
       await api('DELETE', '/brochures/' + id);
       toast('Deleted');
       loadAdminBrochures();
       _brochures = [];
     } catch (e) { toast('Error: ' + e.message); }
   }
   window.deleteBrochure = deleteBrochure;
   
   // ═══════════════════════════════════════════════════════════
   //  NEWS
   // ═══════════════════════════════════════════════════════════
   
   let _news = [];
   
   async function loadNews() {
     const list = el('news-list');
     list.innerHTML = `<div class="empty-state"><span class="spinner"></span> Loading…</div>`;
     try {
       _news = await api('GET', '/news');
       renderNews();
     } catch (e) {
       list.innerHTML = `<div class="empty-state"><p>Could not load news.</p></div>`;
     }
   }
   
   function renderNews() {
     const list = el('news-list');
     if (!_news.length) {
       list.innerHTML = `<div class="empty-state">
         <div class="empty-icon">📰</div>
         <p>No news articles yet.</p>
       </div>`;
       return;
     }
     list.innerHTML = _news.map(n => `
       <article class="news-card" onclick="openArticle('${n.id}')" role="button" tabindex="0"
                onkeydown="if(event.key==='Enter')openArticle('${n.id}')">
         ${n.cover_path
           ? `<img class="news-thumb" src="${n.cover_path}" alt="" loading="lazy"/>`
           : (n.id ? '' : '<div class="news-thumb-placeholder">No image</div>')}
         <div class="news-body">
           <div class="news-date">${fmtDate(n.published_on)}</div>
           <div class="news-title">${escHtml(n.title)}</div>
           <div class="news-excerpt">${escHtml(n.body.slice(0, 160))}${n.body.length > 160 ? '…' : ''}</div>
         </div>
       </article>`).join('');
   }
   
   function openArticle(id) {
     const n = _news.find(x => x.id === id);
     if (!n) return;
     const coverHTML = n.cover_path
       ? `<img src="${n.cover_path}" style="width:100%;display:block;max-height:260px;object-fit:cover" alt=""/>`
       : '';
     openModal(n.title, `
       ${coverHTML}
       <div class="modal-article">
         <div class="news-date">${fmtDate(n.published_on)}</div>
         <h2>${escHtml(n.title)}</h2>
         <p>${escHtml(n.body)}</p>
       </div>`);
   }
   window.openArticle = openArticle;
   
   // Admin
   async function saveNews() {
     const title   = el('n-title').value.trim();
     const date    = el('n-date').value;
     const content = el('n-content').value.trim();
     const file    = el('n-file').files[0];
   
     if (!title || !date || !content) { toast('Please fill in title, date and content'); return; }
   
     const fd = new FormData();
     fd.append('title',        title);
     fd.append('published_on', date);
     fd.append('body',         content);
     if (file) fd.append('cover', file);
   
     try {
       await api('POST', '/news', fd, true);
       el('n-title').value = '';
       el('n-date').value  = '';
       el('n-content').value = '';
       el('n-file').value  = '';
       el('n-file-label').textContent = 'Tap to choose an image';
       el('n-preview').hidden = true;
       toast('Article published ✓');
       loadAdminNews();
       _news = [];
     } catch (e) { toast('Error: ' + e.message); }
   }
   window.saveNews = saveNews;
   
   async function loadAdminNews() {
     try {
       const list = await api('GET', '/news?published=all');
       const el2  = el('admin-news-list');
       if (!list.length) { el2.innerHTML = '<p style="font-size:.82rem;color:var(--ink-muted)">None yet</p>'; return; }
       el2.innerHTML = list.map(n => `
         <div class="admin-item">
           <div class="admin-item-info">
             <div class="name">${escHtml(n.title)}</div>
             <div class="meta">${fmtDateShort(n.published_on)}</div>
           </div>
           <button class="btn btn-sm btn-danger" onclick="deleteNews('${n.id}')">Delete</button>
         </div>`).join('');
     } catch (e) {
       el('admin-news-list').innerHTML = '<p class="error-msg">Failed to load</p>';
     }
   }
   
   async function deleteNews(id) {
     if (!confirm('Delete this article?')) return;
     try {
       await api('DELETE', '/news/' + id);
       toast('Deleted');
       loadAdminNews();
       _news = [];
     } catch (e) { toast('Error: ' + e.message); }
   }
   window.deleteNews = deleteNews;
   
   // ═══════════════════════════════════════════════════════════
   //  LINKS
   // ═══════════════════════════════════════════════════════════
   
   let _links = [];
   
   async function loadLinks() {
     const container = el('links-list');
     container.innerHTML = `<div class="empty-state"><span class="spinner"></span> Loading…</div>`;
     try {
       _links = await api('GET', '/links');
       renderLinks();
     } catch (e) {
       container.innerHTML = `<div class="empty-state"><p>Could not load links.</p></div>`;
     }
   }
   
   function renderLinks() {
     const container = el('links-list');
     if (!_links.length) {
       container.innerHTML = `<div class="empty-state">
         <div class="empty-icon">🔗</div>
         <p>No links added yet.</p>
       </div>`;
       return;
     }
     container.innerHTML = _links.map(l => `
       <a class="link-item" href="${escHtml(l.url)}" target="_blank" rel="noopener noreferrer">
         <div class="link-icon" aria-hidden="true">🔗</div>
         <div style="flex:1;min-width:0">
           <div class="link-name">${escHtml(l.name)}</div>
           ${l.description ? `<div class="link-desc">${escHtml(l.description)}</div>` : ''}
         </div>
         <span class="link-arrow" aria-hidden="true">↗</span>
       </a>`).join('');
   }
   
   // Admin
   async function saveLink() {
     const name = el('l-name').value.trim();
     const url  = el('l-url').value.trim();
     const desc = el('l-desc').value.trim();
     if (!name || !url) { toast('Please enter a name and URL'); return; }
   
     try {
       await api('POST', '/links', { name, url, description: desc });
       el('l-name').value = '';
       el('l-url').value  = '';
       el('l-desc').value = '';
       toast('Link saved ✓');
       loadAdminLinks();
       _links = [];
     } catch (e) { toast('Error: ' + e.message); }
   }
   window.saveLink = saveLink;
   
   async function loadAdminLinks() {
     try {
       const list = await api('GET', '/links');
       const el2  = el('admin-links-list');
       if (!list.length) { el2.innerHTML = '<p style="font-size:.82rem;color:var(--ink-muted)">None yet</p>'; return; }
       el2.innerHTML = list.map(l => `
         <div class="admin-item">
           <div class="admin-item-info">
             <div class="name">${escHtml(l.name)}</div>
             <div class="meta" style="word-break:break-all">${escHtml(l.url)}</div>
           </div>
           <button class="btn btn-sm btn-danger" onclick="deleteLink('${l.id}')">Delete</button>
         </div>`).join('');
     } catch (e) {
       el('admin-links-list').innerHTML = '<p class="error-msg">Failed to load</p>';
     }
   }
   
   async function deleteLink(id) {
     if (!confirm('Delete this link?')) return;
     try {
       await api('DELETE', '/links/' + id);
       toast('Deleted');
       loadAdminLinks();
       _links = [];
     } catch (e) { toast('Error: ' + e.message); }
   }
   window.deleteLink = deleteLink;
   
   // ═══════════════════════════════════════════════════════════
   //  HYMN BOOK
   // ═══════════════════════════════════════════════════════════
   
   let _hymns = [];
   
   async function loadHymns() {
     const grid = el('hymn-grid');
     grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><span class="spinner"></span> Loading…</div>`;
     try {
       _hymns = await api('GET', '/hymns');
       renderHymns();
     } catch (e) {
       grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><p>Could not load hymns.</p></div>`;
     }
   }
   
   function renderHymns() {
     const grid = el('hymn-grid');
     if (!_hymns.length) {
       grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
         <div class="empty-icon">🎵</div>
         <p>No hymn pages yet.</p>
       </div>`;
       return;
     }
     grid.innerHTML = _hymns.map(h => `
       <div class="hymn-card" onclick="openHymn('${h.id}')" role="button" tabindex="0"
            onkeydown="if(event.key==='Enter')openHymn('${h.id}')">
         ${h.file_type === 'image'
           ? `<img class="hymn-thumb" src="${h.file_path}" alt="${escHtml(h.label)}" loading="lazy"/>`
           : `<div class="hymn-thumb-placeholder"><span>📄</span><span>PDF</span></div>`}
         <div class="hymn-label">${escHtml(h.label)}</div>
       </div>`).join('');
   }
   
   function openHymn(id) {
     const h = _hymns.find(x => x.id === id);
     if (!h) return;
     const body = h.file_type === 'pdf'
       ? `<iframe src="${h.file_path}" title="${escHtml(h.label)}" style="width:100%;border:none;display:block;min-height:calc(100svh - 60px)"></iframe>`
       : `<img src="${h.file_path}" alt="${escHtml(h.label)}" style="width:100%;display:block"/>`;
     openModal(h.label, body);
   }
   window.openHymn = openHymn;
   
   // Admin
   async function saveHymn() {
     const label = el('h-label').value.trim();
     const file  = el('h-file').files[0];
     if (!label || !file) { toast('Please enter a label and choose a file'); return; }
   
     const fd = new FormData();
     fd.append('label', label);
     fd.append('file',  file);
   
     try {
       await api('POST', '/hymns', fd, true);
       el('h-label').value = '';
       el('h-file').value  = '';
       el('h-file-label').textContent = 'Tap to choose image or PDF';
       el('h-preview').hidden = true;
       toast('Hymn page added ✓');
       loadAdminHymns();
       _hymns = [];
     } catch (e) { toast('Error: ' + e.message); }
   }
   window.saveHymn = saveHymn;
   
   async function loadAdminHymns() {
     try {
       const list = await api('GET', '/hymns');
       const el2  = el('admin-hymn-list');
       if (!list.length) { el2.innerHTML = '<p style="font-size:.82rem;color:var(--ink-muted)">None yet</p>'; return; }
       el2.innerHTML = list.map(h => `
         <div class="admin-item">
           <div class="admin-item-info">
             <div class="name">${escHtml(h.label)}</div>
             <div class="meta"><span class="badge">${h.file_type === 'pdf' ? 'PDF' : 'Image'}</span></div>
           </div>
           <button class="btn btn-sm btn-danger" onclick="deleteHymn('${h.id}')">Delete</button>
         </div>`).join('');
     } catch (e) {
       el('admin-hymn-list').innerHTML = '<p class="error-msg">Failed to load</p>';
     }
   }
   
   async function deleteHymn(id) {
     if (!confirm('Delete this hymn page?')) return;
     try {
       await api('DELETE', '/hymns/' + id);
       toast('Deleted');
       loadAdminHymns();
       _hymns = [];
     } catch (e) { toast('Error: ' + e.message); }
   }
   window.deleteHymn = deleteHymn;
   
   // ═══════════════════════════════════════════════════════════
   //  ADMIN AUTH
   // ═══════════════════════════════════════════════════════════
   
   async function checkAdminStatus() {
     try {
       const { authenticated } = await api('GET', '/admin/status');
       if (authenticated) showAdminPanel();
       else showAdminGate();
     } catch (_) {
       showAdminGate();
     }
   }
   
   function showAdminGate() {
     el('admin-gate').hidden  = false;
     el('admin-panel').hidden = true;
   }
   
   function showAdminPanel() {
     el('admin-gate').hidden  = true;
     el('admin-panel').hidden = false;
     loadAdminBrochures();
     loadAdminNews();
     loadAdminLinks();
     loadAdminHymns();
   }
   
   async function login() {
     const pw = el('admin-pw').value;
     try {
       await api('POST', '/admin/login', { password: pw });
       el('pw-error').hidden = true;
       el('admin-pw').value  = '';
       showAdminPanel();
     } catch (_) {
       el('pw-error').hidden = false;
       el('admin-pw').select();
     }
   }
   window.login = login;
   
   async function logout() {
     try { await api('POST', '/admin/logout'); } catch (_) {}
     showAdminGate();
   }
   window.logout = logout;
   
   // ── Security: XSS escape ─────────────────────────────────────
   
   function escHtml(str) {
     return String(str)
       .replace(/&/g, '&amp;')
       .replace(/</g, '&lt;')
       .replace(/>/g, '&gt;')
       .replace(/"/g, '&quot;')
       .replace(/'/g, '&#39;');
   }
   
   // ── Init ─────────────────────────────────────────────────────
   // Brochure tab is shown by default — load it immediately.
   loadBrochures();