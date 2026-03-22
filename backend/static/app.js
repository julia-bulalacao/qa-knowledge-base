// ??? STATE ????????????????????????????????????????????????????????????????????
let _modalOpen = false; // Prevent render from clearing open modals
const S = {
  user: null, token: null, perms: {}, darkMode: false, announcement: '', announcementId: null,
  page: 'home',
  categories: [], tags: [],
  articles: [], articleTotal: 0, articlePages: 1, articlePage: 1,
  filters: { q: '', content_type: '', tag: '', status: '' },
  currentArticle: null,
  currentCategoryId: null,
  dashboardData: null,
  editingArticle: null,
  editorMode: 'write',
  loginError: null,
};

// ??? API ??????????????????????????????????????????????????????????????????????
const API = {
  async req(method, path, body) {
    const opts = { method, headers: {}, credentials: 'include' };
    if (S.token) opts.headers['X-Auth-Token'] = S.token;
    if (body) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
    if (path === '/auth/profile') path = '/auth/profile-update';
    const r = await fetch('/api' + path, opts);
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || 'Error');
    return data;
  },
  get: p => API.req('GET', p),
  patch: (p, b) => API.req('PATCH', p, b),
  post: (p, b) => API.req('POST', p, b),
  put: (p, b) => API.req('PUT', p, b),
  del: p => API.req('DELETE', p),
};

// ??? TOAST ????????????????????????????????????????????????????????????????????
function toast(msg, type = 'success') {
  let c = document.getElementById('toasts');
  if (!c) { c = document.createElement('div'); c.id = 'toasts'; c.className = 'toast-container'; document.body.appendChild(c); }
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.textContent = msg;
  c.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

// ??? UTILS ????????????????????????????????????????????????????????????????????
function esc(s) { return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function relTime(iso) {
  if (!iso) return '—';
  // Append Z if no timezone info so browser treats it as UTC, not local time
  const utcIso = iso.includes('Z') || iso.includes('+') ? iso : iso + 'Z';
  const d = new Date(utcIso), diff = (Date.now() - d) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff/60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff/3600)}h ago`;
  return d.toLocaleDateString('en-PH', {month:'short',day:'numeric',year:'numeric'});
}
function avatar(user, size=28) {
  const initials = (user?.name||'?').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
  return `<div class="avatar" style="width:${size}px;height:${size}px;background:${user?.avatar_color||'#6366f1'};font-size:${Math.round(size*0.36)}px">${initials}</div>`;
}
function typeBadge(t) {
  const labels = {sop:'📋',onboarding:'Onboarding',bug_fix:'Bug Fix',procedure:'Procedure',guide:'Guide',article:'Article'};
  return `<span class="content-type-badge type-${t}">${labels[t]||t}</span>`;
}
function typeIcon(t) {
  const icons = {sop:'📋',onboarding:'🚀',bug_fix:'🐛',procedure:'⚙️',guide:'📖',article:'📄'};
  return icons[t] || '📄';
}
function typeColor(t) {
  const colors = {sop:'#dbeafe',onboarding:'#d1fae5',bug_fix:'#fee2e2',procedure:'#ede9fe',guide:'#fef3c7',article:'#f1ede8'};
  return colors[t] || '#f1ede8';
}
function roleBadge(r) {
  const base = {admin:'Admin',qa_engineer:'QA Engineer',developer:'Developer',viewer:'Viewer'};
  const label = base[r] || (S.allRoles||[]).find(x=>x.slug===r)?.name || (r||'').split('_').map(w=>w[0].toUpperCase()+w.slice(1)).join(' ');
  if (['admin','qa_engineer','developer','viewer'].includes(r)) {
    return `<span class="role-badge role-${r}">${label}</span>`;
  }
  const color = toHex((S.allRoles||[]).find(x=>x.slug===r)?.color) || '#6366f1';
  return `<span class="role-badge" style="background:${color}22;color:${color};border:1px solid ${color}44">${label}</span>`;
}

// ??? MARKDOWN RENDERER ????????????????????????????????????????????????????????
function renderMarkdown(md) {
  // Delegate to the full renderer from editor.js
  if (window.renderMarkdownFull) return renderMarkdownFull(md);
  if (!md) return '';
  // Minimal fallback
  return md.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/```([\w-]*)\n?([\s\S]*?)```/g, '<pre class="code-block" data-lang="$1"><code>$2</code></pre>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .split('\n\n').map(p => p.trim() ? '<p>' + p + '</p>' : '').join('\n');
}

function render() {
  const app = document.getElementById('app');
  if (!S.user) { app.innerHTML = renderLogin(); bindLoginEvents(); return; }
  app.innerHTML = `
    <div class="app-layout">
      ${renderSidebar()}
      <div class="main-content" id="main">
        ${renderTopbar()}
        <div class="page-body" id="page-body">${renderPage()}</div>
      </div>
    </div>
    <div id="modal-root"></div>
    <div id="toasts" class="toast-container"></div>`;
  bindEvents();
}

// ??? LOGIN ????????????????????????????????????????????????????????????????????
function renderLogin() {
  return `<div class="login-page">
    <div class="login-grid-bg"></div>
    <div class="login-card">
      <div class="login-card-header">
        <div class="login-brand-pill">📚 QA Knowledge Base</div>
        <button class="login-theme-btn" id="login-dark-toggle" onclick="toggleDarkMode();render()" title="Toggle theme">
          ${S.darkMode ? '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg> Light' : '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg> Dark'}
        </button>
      </div>
      <div class="login-hero">
        <h1 class="login-title">Welcome</h1>
        <p class="login-sub">Sign in to your team's knowledge hub</p>
      </div>
      ${S.loginError ? `<div class="login-error">${esc(S.loginError)}</div>` : ''}
      <div class="login-field"><label>Email</label><input type="email" id="l-email" placeholder="you@company.com" autocomplete="email"></div>
      <div class="login-field"><label>Password</label><input type="password" id="l-pass" placeholder="••••••••" autocomplete="current-password"></div>
      <button class="btn btn-primary" style="width:100%;justify-content:center" id="login-btn">Sign In →</button>

    </div>
  </div>`;
}

// ??? SIDEBAR ?????????????????????????????????????????????????????????????????
function renderSidebar() {
  const canEdit = can('create_articles') || can('edit_own_articles') || can('edit_any_article');
  return `<div class="sidebar">
    <div class="sidebar-header">
      <div class="sidebar-brand">
        <div class="brand-icon">📚</div>
        <div class="brand-name">QA Knowledge Base<small>Team Wiki</small></div>
      </div>
      <div class="sidebar-search">
        <svg class="s-icon" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" style="width:13px;height:13px;position:absolute;left:9px;top:50%;transform:translateY(-50%);pointer-events:none;stroke:var(--text3);stroke-width:1.5;stroke-linecap:round">
          <circle cx="6.5" cy="6.5" r="4"/>
          <line x1="10" y1="10" x2="14" y2="14"/>
        </svg>
        <input type="text" id="global-search" placeholder="Search..." value="${esc(S.filters.q)}" style="padding-left:28px">
      </div>
    </div>
    <div class="sidebar-body">

      <!-- Main Navigation -->
      <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.07em;color:var(--text3);padding:4px 8px 2px">Navigation</div>
      <div class="nav-item ${S.page==='home'?'active':''}" data-page="home">
        <span class="nav-icon">🏠</span><span>Home</span>
      </div>
      <div class="nav-item ${S.page==='all'?'active':''}" data-page="all">
        <span class="nav-icon">📄</span><span>All Articles</span>
      </div>
      ${(can('create_articles')||can('edit_own_articles')) ? `
      <div class="nav-item ${S.page==='drafts'?'active':''}" data-page="drafts">
        <span class="nav-icon">✏️</span><span>My Drafts</span>
      </div>` : ''}

      <!-- Content -->
      ${can('manage_categories') ? `
      <div class="nav-divider"></div>
      <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.07em;color:var(--text3);padding:4px 8px 2px">Organize</div>
      <div class="nav-item ${S.page==='categories'?'active':''}" data-page="categories">
        <span class="nav-icon">📂</span><span>Categories</span>
      </div>
      <div class="nav-item ${S.page==='tags'?'active':''}" data-page="tags">
        <span class="nav-icon">🏷️</span><span>Tags</span>
      </div>` : ''}

      <!-- Admin -->
      ${can('manage_users') ? `
      <div class="nav-divider"></div>
      <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.07em;color:var(--text3);padding:4px 8px 2px">Admin</div>
      <div class="nav-item ${S.page==='users'?'active':''}" data-page="users">
        <span class="nav-icon">👥</span><span>Users</span>
      </div>
      <div class="nav-item ${S.page==='roles'?'active':''}" data-page="roles">
        <span class="nav-icon">🔒</span><span>Roles</span>
      </div>` : ''}

      <!-- Mobile dark mode toggle -->
      <div class="nav-item" id="mobile-dark-toggle" onclick="toggleDarkMode()">
        <span class="nav-icon">${S.darkMode ? '☀️' : '🌙'}</span><span>${S.darkMode ? 'Light' : 'Dark'}</span>
      </div>

      <!-- Categories list -->
      ${(S.categories||[]).length ? `
      <div class="nav-divider"></div>
      <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.07em;color:var(--text3);padding:4px 8px 2px">Categories</div>
      ${(S.categories||[]).map(c => `
        <div class="sidebar-cat ${S.currentCategoryId===c.id?'active':''}" data-cat="${c.id}">
          <span class="cat-icon">${c.icon}</span>
          <span>${esc(c.name)}</span>
        </div>`).join('')}` : ''}

    </div>
    <div class="sidebar-footer">
      <div class="user-pill" id="profile-btn" style="cursor:pointer" title="My Profile" onclick="if(!event.target.closest('#dark-toggle'))navigateTo('profile')">
        ${avatar(S.user, 28)}
        <div class="user-info">
          <div style="font-weight:600;font-size:12px">${esc(S.user?.name||'')}</div>
          <div style="font-size:10px;color:var(--text3);text-transform:capitalize">${S.user?.role?.replace('_',' ')||''}</div>
        </div>
        <div id="dark-toggle" style="width:32px;height:18px;border-radius:9px;background:${S.darkMode?'var(--accent)':'var(--border)'};cursor:pointer;position:relative;transition:background 0.2s;flex-shrink:0;margin-left:auto" onclick="event.stopPropagation();toggleDarkMode()">
          <div style="position:absolute;top:3px;${S.darkMode?'right:3px':'left:3px'};width:12px;height:12px;border-radius:50%;background:white;transition:all 0.2s"></div>
        </div>
      </div>

      <div class="sign-out" id="logout-btn">Sign out</div>
    </div>
  </div>`;
}


function renderTopbar() {
  const canCreate = ['admin','qa_engineer','developer'].includes(S.user?.role);
  const pages = { home:'Home', all:'All Articles', drafts:'My Drafts', profile:'Profile', read:'Reading', edit:'Editor' };
  const crumbs = [];
  if (S.page === 'category' && S.currentCategoryId) {
    const cat = (S.categories||[]).find(c=>c.id===S.currentCategoryId);
    crumbs.push(`<span class="crumb">${cat?.icon} ${esc(cat?.name||'Category')}</span>`);
  } else {
    crumbs.push(`<span class="crumb active">${pages[S.page]||''}</span>`);
  }
  return `<div class="topbar">
    <div class="topbar-breadcrumb">
      <span class="crumb" style="cursor:pointer" data-page="home">Home</span>
      ${crumbs.length ? `<span class="sep">&gt;</span>${crumbs.join('<span class="sep">&gt;</span>')}` : ''}
    </div>
    <div class="topbar-actions">
      ${canCreate ? `<button class="btn btn-primary btn-sm" id="new-article-btn">+ New Article</button>` : ''}
    </div>
  </div>`;
}

// ??? PAGE ROUTER ?????????????????????????????????????????????????????????????
function renderPage() {
  switch(S.page) {
    case 'home': return renderHome();
    case 'all': return renderArticleList(S.articles, 'All Articles', 'All published articles and guides');
    case 'category': return renderCategoryPage();
    case 'drafts': return renderDraftsPage();
    case 'read': return S.currentArticle ? renderReader(S.currentArticle) : '<div class="empty-state"><div class="empty-icon">📭</div><div class="empty-title">Select an article</div></div>';
    case 'edit': return renderEditor();
    case 'profile': return renderProfile();
    case 'users': return renderUsersPage();
    case 'roles': return renderRolesPage();
    case 'categories': return renderCategoriesPage();
    case 'tags': return renderTagsPage();
    default: return renderHome();
  }
}

// ??? HOME ?????????????????????????????????????????????????????????????????????

function renderHome() {
  const d = S.dashboardData;
  if (!d) return `<div class="home-page"><div class="empty-state"><div class="empty-icon">📭</div><div class="empty-title">Loading...</div></div></div>`;
  return `<div class="home-page">
    <div class="home-hero">
      ${S.announcement && (can('manage_users') || localStorage.getItem('wiki_ack_announcement') === String(S.announcementId)) ? `
      <div style="background:var(--yellow-light);border:1px solid var(--yellow);border-radius:var(--radius);padding:10px 16px;margin-bottom:16px;display:flex;align-items:flex-start;gap:10px;font-size:13px">
        <span style="font-size:16px;flex-shrink:0">📢</span>
        <span style="color:var(--yellow);font-weight:600;flex:1;line-height:1.6;white-space:pre-wrap">${S.announcement}</span>
        ${can('manage_users') ? `<button class="btn btn-ghost btn-sm" id="clear-announcement" style="color:var(--yellow);padding:2px 8px;flex-shrink:0">✕</button>` : ''}
      </div>` : ''}
      ${can('manage_users') ? `
      <div style="margin-bottom:10px">
        <button class="btn btn-secondary btn-sm" id="set-announcement-btn" style="font-size:12px">📢 ${S.announcement ? 'Edit' : 'Post'} Announcement</button>
      </div>` : ''}
      <h1>👋 Welcome, ${esc(S.user.name.split(' ')[0])}!</h1>
      <p>Your team's living documentation hub — SOPs, onboarding guides, bug fixes, and more.</p>
    </div>
    <div class="stats-row" style="grid-template-columns:repeat(3,1fr)">
      <div class="stat-box"><div class="stat-num">${d.total_articles}</div><div class="stat-lbl">Published</div></div>
      <div class="stat-box"><div class="stat-num">${d.draft_articles}</div><div class="stat-lbl">Drafts</div></div>
      <div class="stat-box"><div class="stat-num">${d.total_categories}</div><div class="stat-lbl">Categories</div></div>

    </div>
    <div class="section-title">Browse by Category</div>
    <div class="category-grid">
      <div class="cat-card" style="cursor:pointer" onclick="navigateTo('all')">
        <div class="cat-card-icon">📋</div>
        <div class="cat-card-name">All Articles</div>
        <div class="cat-card-desc">Browse all published articles</div>
        <div class="cat-card-count">${S.dashboardData?.total_articles||0} article${(S.dashboardData?.total_articles||0)!==1?'s':''}</div>
      </div>
      ${(S.categories||[]).map(c=>`
        <div class="cat-card" data-cat="${c.id}">
          <div class="cat-card-icon">${c.icon}</div>
          <div class="cat-card-name">${esc(c.name)}</div>
          <div class="cat-card-desc">${esc(c.description||'')}</div>
          <div class="cat-card-count">${c.article_count} article${c.article_count!==1?'s':''}</div>
        </div>`).join('')}
    </div>
    <div class="home-grid">
      <div>
        <div class="section-title">Pinned & Recent</div>
        ${(d.recent_articles||[]).slice(0,6).map(a=>articleCard(a)).join('')}
      </div>
      <div>
        <div class="section-title">🔥 Most Viewed</div>
        ${(d.top_viewed||[]).map(a=>articleCard(a)).join('')}
      </div>
    </div>
  </div>`;
}

function articleCard(a) {
  return `<div class="article-card" data-article="${a.id}">
    <div class="article-card-icon" style="background:${typeColor(a.content_type)}">${typeIcon(a.content_type)}</div>
    <div class="article-card-body">
      <div class="article-card-title">${a.is_pinned?'<span class="pinned-badge">[pinned]</span>':''}${esc(a.title)}</div>
      <div class="article-card-meta">${typeBadge(a.content_type)} - ${esc(a.category?.name||'Uncategorized')} - ${relTime(a.updated_at)}</div>
    </div>
  </div>`;
}

// ??? ARTICLE LIST ?????????????????????????????????????????????????????????????
function renderArticleList(articles, title, subtitle) {
  const canEdit = can('create_articles') || can('edit_own_articles') || can('edit_any_article');
  return `<div class="articles-page">
    <div class="page-header">
      <div class="page-header-text">
        <h2>${title}</h2>
        <p>${subtitle}</p>
      </div>
    </div>
    <div class="filter-row">
      <div class="search-wrap">
        <svg class="s-icon" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" style="width:13px;height:13px;position:absolute;left:9px;top:50%;transform:translateY(-50%);pointer-events:none;stroke:var(--text3);stroke-width:1.5;stroke-linecap:round">
          <circle cx="6.5" cy="6.5" r="4"/>
          <line x1="10" y1="10" x2="14" y2="14"/>
        </svg>
        <input type="text" id="art-search" placeholder="Search articles..." value="${esc(S.filters.q)}">
      </div>
      <select id="art-type" style="width:140px">
        <option value="">All Types</option>
        ${[['sop','SOP'],['onboarding','Onboarding'],['bug_fix','Bug Fix'],['procedure','Procedure'],['guide','Guide'],['article','Article']].map(([v,l])=>`<option value="${v}" ${S.filters.content_type===v?'selected':''}>${l}</option>`).join('')}
      </select>
      ${can('view_drafts') ? `<select id="art-status" style="width:120px">
        <option value="">All Status</option>
        <option value="published" ${S.filters.status==='published'?'selected':''}>Published</option>
        <option value="draft" ${S.filters.status==='draft'?'selected':''}>Draft</option>
        <option value="archived" ${S.filters.status==='archived'?'selected':''}>Archived</option>
      </select>` : ''}
      <button class="btn btn-secondary btn-sm" id="clear-art-filters">Clear</button>
    </div>
    ${articles.length ? articles.map(a => `
      <div class="article-row" data-article="${a.id}">
        <div class="article-row-icon" style="background:${typeColor(a.content_type)}">${typeIcon(a.content_type)}</div>
        <div class="article-row-body">
          <div class="article-row-title">${a.is_pinned?'📌 ':''}${highlight(esc(a.title), S.filters.q)}</div>
          <div class="article-row-excerpt">${highlight(esc(a.excerpt||'No description.'), S.filters.q)}</div>
          <div class="article-row-footer">
            ${typeBadge(a.content_type)}
            <span class="tag" style="cursor:default">${esc(a.category?.name||'Uncategorized')}</span>
            ${a.tags?.slice(0,3).map(t=>`<span class="tag" style="cursor:default">${esc(t.name)}</span>`).join('')}
            <span class="article-row-meta">by ${esc(a.author?.name||'?')} - ${relTime(a.updated_at)} - 👁 ${a.view_count}</span>
            <div class="article-row-status">
              ${a.status==='draft'?'<span class="draft-pill">Draft</span>':''}
              ${a.status==='archived'?'<span class="archived-pill">Archived</span>':''}
              ${(can('edit_any_article')||(can('edit_own_articles')&&a.author?.id===S.user?.id))?`<button class="btn btn-ghost btn-icon btn-sm edit-article-btn" data-article="${a.id}" title="Edit" onclick="event.stopPropagation()"></button>`:''}
              ${S.user?.role==='admin'?`<button class="btn btn-ghost btn-icon btn-sm del-article-btn" data-article="${a.id}" title="Delete" onclick="event.stopPropagation()">✕</button>`:''}
            </div>
          </div>
        </div>
      </div>`).join('') : `
      <div class="empty-state">
        <div class="empty-icon">📭</div>
        <div class="empty-title">No articles found</div>
        <div class="empty-sub">Try a different search or create a new article</div>
      </div>`}
    ${S.articlePages > 1 ? `<div class="pagination">
      <button class="page-btn" id="prev-page" ${S.articlePage<=1?'disabled':''}>✕</button>
      ${Array.from({length:S.articlePages},(_,i)=>`<button class="page-btn${S.articlePage===i+1?' active':''}" data-page="${i+1}">${i+1}</button>`).join('')}
      <button class="page-btn" id="next-page" ${S.articlePage>=S.articlePages?'disabled':''}>✕</button>
    </div>` : ''}
  </div>`;
}

function renderCategoryPage() {
  const cat = (S.categories||[]).find(c=>c.id===S.currentCategoryId);
  const title = cat ? `${cat.icon} ${cat.name}` : 'Category';
  const sub = cat?.description || '';
  return renderArticleList(S.articles, title, sub);
}

function renderDraftsPage() {
  return renderArticleList(S.articles, 'My Drafts', 'Articles you\'re currently working on');
}

// ??? READER ???????????????????????????????????????????????????????????????????
function renderReader(a) {
  const canEdit = can('edit_any_article') || (can('edit_own_articles') && a.author?.id === S.user?.id);
  const canComment = can('add_comments');
  return `<div class="reader-layout">
    <div class="reader-main">
      <div class="article-header">
        <div class="article-type-row">
          ${typeBadge(a.content_type)}
          ${a.is_pinned ? '<span class="pinned-badge">[pinned]</span>' : ''}
          ${a.status !== 'published' ? `<span class="draft-pill">${a.status}</span>` : ''}
        </div>
        <h1 class="article-title">${esc(a.title)}</h1>
        <div class="article-meta">
          <span class="article-meta-item">${avatar(a.author,20)} ${esc(a.author?.name||'?')}</span>
          <span class="article-meta-item">${esc(a.category?.name||'Uncategorized')}</span>
          <span class="article-meta-item">Updated ${relTime(a.updated_at)}</span>
          <span class="article-meta-item">👁 ${a.view_count}</span>
          ${a.last_editor && a.last_editor.id !== a.author?.id ? `<span class="article-meta-item">?? Last edited by ${esc(a.last_editor.name)}</span>` : ''}
        </div>
        <div id="article-lock-banner"></div>
      
      <div class="article-actions">
          ${(can('edit_any_article') || (can('edit_own_articles') && a.author?.id === S.user?.id)) ? `<button class="btn btn-secondary btn-sm" id="edit-this-btn" data-article="${a.id}">✏️ Edit</button>` : ''}
          ${can('publish_articles') && a.status === 'draft' ? `<button class="btn btn-success btn-sm" id="publish-btn" data-article="${a.id}">🚀 Publish</button>` : ''}
          ${can('export_pdf') ? `<a class="btn btn-secondary btn-sm" href="/api/articles/${a.id}/pdf" target="_blank" download title="Export as PDF">📄 Export PDF</a>` : ''}
          ${can('delete_articles') ? `<button class="btn btn-danger btn-sm" id="del-this-btn">Delete</button>` : ''}
        </div>
      </div>
      <div class="article-content">${renderMarkdown(a.content)}</div>
      
      <div class="comments-section">
        <div class="comments-title">💬 Comments (${a.comments?.length||0})</div>
        ${a.comments?.length ? a.comments.map(c=>`
          <div class="comment">
            ${avatar(c.author, 32)}
            <div class="comment-body">
              <div class="comment-header">
                <span class="comment-author">${esc(c.author?.name||'?')}</span>
                ${roleBadge(c.author?.role)}
                <span class="comment-time">${relTime(c.created_at)}</span>
                ${(S.user?.id===c.author?.id||S.user?.role==='admin') ? `<button class="btn btn-ghost btn-icon btn-sm del-comment" data-comment="${c.id}" style="margin-left:auto;padding:2px 6px">✕</button>` : ''}
              </div>
              <div class="comment-text">${esc(c.content)}</div>
            </div>
          </div>`).join('') : '<p style="color:var(--text3);font-size:13px;margin-bottom:12px">No comments yet.</p>'}
        ${canComment ? `<div class="comment-input-area">
          <textarea id="new-comment" rows="2" placeholder="Add a comment..."></textarea>
          <button class="btn btn-primary btn-sm" id="post-comment" data-article="${a.id}" style="align-self:flex-end">Post</button>
        </div>` : ''}
      </div>
    </div>
    <!-- Floating info button for mobile -->
    <button id="mobile-info-btn" onclick="var p=document.getElementById('mobile-info-panel');var open=p.dataset.open==='1';if(open){p.style.opacity='0';p.style.transform='translateY(8px) scale(0.97)';setTimeout(function(){p.style.display='none';p.dataset.open='0';},180);}else{p.style.display='block';p.dataset.open='1';requestAnimationFrame(function(){p.style.opacity='1';p.style.transform='translateY(0) scale(1)';});}this.classList.toggle('info-btn-active',!open);" style="position:fixed;bottom:70px;right:16px;z-index:200;width:42px;height:42px;border-radius:50%;background:var(--surface);border:1px solid var(--border);box-shadow:0 2px 16px rgba(0,0,0,0.18);cursor:pointer;display:none;align-items:center;justify-content:center;transition:background 0.15s,color 0.15s,border-color 0.15s"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="8" r="0.5" fill="currentColor"/><line x1="12" y1="12" x2="12" y2="16"/></svg></button>
    <div id="mobile-info-panel" data-open="0" style="display:none;position:fixed;bottom:122px;right:16px;z-index:199;width:264px;background:var(--surface);border:1px solid var(--border);border-radius:14px;box-shadow:0 8px 32px rgba(0,0,0,0.14);overflow-y:auto;max-height:62vh;padding:16px;opacity:0;transform:translateY(8px) scale(0.97);transition:opacity 0.18s ease,transform 0.18s ease"></div>
    <div class="reader-aside">
      <div class="aside-section">
        <div class="aside-title">Article Info</div>
        <div class="aside-meta-item">
          <div class="aside-meta-label">Version</div>
          <div class="aside-meta-value"><span class="version-badge">v${a.version}</span></div>
        </div>
        <div class="aside-meta-item">
          <div class="aside-meta-label">Category</div>
          <div class="aside-meta-value">${a.category?.icon||''} ${esc(a.category?.name||'—')}</div>
        </div>
        <div class="aside-meta-item">
          <div class="aside-meta-label">Author</div>
          <div class="aside-meta-value" style="display:flex;align-items:center;gap:6px">${avatar(a.author,18)} ${esc(a.author?.name||'—')}</div>
        </div>
        <div class="aside-meta-item">
          <div class="aside-meta-label">Created</div>
          <div class="aside-meta-value">${relTime(a.created_at)}</div>
        </div>
        <div class="aside-meta-item">
          <div class="aside-meta-label">Last updated</div>
          <div class="aside-meta-value">${relTime(a.updated_at)}</div>
        </div>
      </div>
      <div class="aside-section" id="toc-section">
        <div class="aside-title">Table of Contents</div>
        <div id="toc-list" style="display:flex;flex-direction:column;gap:2px"></div>
      </div>
      ${a.tags?.length ? `<div class="aside-section">
        <div class="aside-title">Tags</div>
        <div class="aside-tags">${a.tags.map(t=>`<span class="tag" style="cursor:default">${esc(t.name)}</span>`).join('')}</div>
      </div>` : ''}
      ${a.history?.length ? `<div class="aside-section">
        <div class="aside-title">Edit History</div>
        ${a.history.map(h=>`<div class="history-item">
          <div style="display:flex;align-items:center;gap:5px">
            <span class="history-version">v${h.version}</span>
            <span style="font-size:11px;color:var(--text2)">${esc(h.change_summary||'Updated')}</span>
          </div>
          <div class="history-meta">by ${esc(h.editor?.name||'?')} - ${relTime(h.created_at)}</div>
        </div>`).join('')}
      </div>` : ''}
    </div>
  </div>`;
}

// ─── EDITOR ─────────────────────────────────────────────────────────────────
function renderEditor() {
  const a = S.editingArticle || {};
  const isEdit = !!a.id;
  const selectedTags = (a.tags||[]).map(t => t.id);
  return `<div class="editor-page">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;flex-wrap:wrap;gap:10px">
      <div>
        <h2 style="font-family:var(--font-serif);font-size:20px;font-weight:600">${isEdit ? 'Edit Article' : 'New Article'}</h2>
        ${isEdit ? '<div style="font-size:12px;color:var(--text3);margin-top:2px">v' + a.version + ' &nbsp;&middot;&nbsp; Last saved ' + relTime(a.updated_at) + '</div>' : ''}
      </div>
      <div style="display:flex;gap:8px;align-items:center">
        <button class="btn btn-secondary btn-sm" id="back-btn">Back</button>
        <button class="btn btn-secondary btn-sm" id="save-draft-btn">Save Draft</button>
        ${can('publish_articles') ? '<button class="btn btn-primary btn-sm" id="publish-article-btn">Publish</button>' : ''}
      </div>
    </div>
    <div class="form-group">
      <input type="text" id="e-title" value="${esc(a.title||'')}" placeholder="Article title..."
        style="font-size:22px;font-weight:700;font-family:var(--font-serif);border:none;border-bottom:2px solid var(--border);border-radius:0;padding:8px 0;background:transparent;width:100%;outline:none;"
        onfocus="this.style.borderColor='var(--accent)'" onblur="this.style.borderColor='var(--border)'">
    </div>
    <div class="form-row cols-3" style="margin-bottom:16px">
      <div class="form-group"><label>Type</label>
        <select id="e-type">
          ${[['sop','SOP'],['onboarding','Onboarding'],['bug_fix','Bug Fix'],['procedure','Procedure'],['guide','Guide'],['article','Article']].map(([v,l]) => '<option value="' + v + '" ' + ((a.content_type||'article')===v?'selected':'') + '>' + l + '</option>').join('')}
        </select>
      </div>
      <div class="form-group"><label>Category</label>
        <select id="e-cat">
          <option value="">Uncategorized</option>
          ${S.categories.map(c => '<option value="' + c.id + '" ' + (a.category?.id===c.id?'selected':'') + '>' + esc(c.name) + '</option>').join('')}
        </select>
      </div>
      <div class="form-group"><label>Pin to Top</label>
        <select id="e-pin">
          <option value="false" ${!a.is_pinned?'selected':''}>No</option>
          <option value="true" ${a.is_pinned?'selected':''}>Yes - Pin it!</option>
        </select>
      </div>
    </div>
    <div class="form-group">
      <label>Excerpt / Summary</label>
      <input type="text" id="e-excerpt" value="${esc(a.excerpt||'')}" placeholder="Brief description shown in article lists...">
    </div>
    <div class="form-group">
      <label>Tags</label>
      <div style="display:flex;flex-wrap:wrap;gap:6px" id="tag-picker">
        ${(S.tags||[]).map(t => '<span class="tag ' + (selectedTags.includes(t.id)?'selected':'') + '" data-tag-id="' + t.id + '">' + esc(t.name) + '</span>').join('')}
        <span id="add-tag-btn" style="display:inline-flex;align-items:center;gap:4px;padding:2px 10px;border-radius:4px;border:1px dashed var(--border);font-size:12px;color:var(--text3);cursor:pointer">+ New Tag</span>
      </div>
    </div>

    <div class="form-group">
      <label>Visibility</label>
      <div style="display:flex;flex-wrap:wrap;gap:8px" id="vis-picker">
        ${[{slug:'all',name:'Everyone'},{slug:'admin',name:'Admin'},{slug:'qa_engineer',name:'QA Engineer'},{slug:'developer',name:'Developer'},{slug:'viewer',name:'Viewer'}].map(r => {
          const vis = a?.visibility || 'all';
          const checked = vis === 'all' ? r.slug === 'all' : (r.slug !== 'all' && vis.split(',').includes(r.slug));
          return '<label class="vis-label" data-slug="' + r.slug + '" style="display:inline-flex;align-items:center;gap:6px;padding:5px 12px;border-radius:20px;border:1px solid var(--border);cursor:pointer;font-size:12px;font-weight:500;background:' + (checked?'var(--accent-light)':'var(--surface)') + ';color:' + (checked?'var(--accent)':'var(--text2)') + '">' +
            '<input type="checkbox" id="vis-' + r.slug + '" ' + (checked?'checked':'') + ' style="display:none">' + esc(r.name) + '</label>';
        }).join('')}
      </div>
    </div>
    <div class="form-group">
      <label>Content</label>
      <div id="rte-container"></div>
    </div>
    <div class="form-group" style="margin-top:12px">
      <label>Change Summary</label>
      <input type="text" id="e-summary" placeholder="What changed? e.g. Updated installation steps">
    </div>
  </div>`;
}



// ─── TAGS PAGE ────────────────────────────────────────────────────────────────
function renderTagsPage() {
  const tags = (S.tags || []).slice().sort((a,b) => a.name.localeCompare(b.name));
  return `<div style="max-width:700px;margin:0 auto;padding:28px 24px">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:24px">
      <div>
        <h2 style="font-size:20px;font-weight:700;color:var(--text);margin:0">🏷️ Tags</h2>
        <div style="font-size:13px;color:var(--text3);margin-top:4px">${tags.length} tag${tags.length!==1?'s':''}</div>
      </div>
      <button class="btn btn-primary" id="add-tag-page-btn">+ New Tag</button>
    </div>
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius2);overflow:hidden">
      ${tags.length ? tags.map((t,i) => `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 20px;${i>0?'border-top:1px solid var(--border)':''}">
          <span style="font-size:14px;color:var(--text)">${esc(t.name)}</span>
          <div style="display:flex;gap:6px">
            <button class="btn btn-secondary btn-sm edit-tag-btn" data-tag-id="${t.id}" data-tag-name="${esc(t.name)}">Edit</button>
            <button class="btn btn-sm del-tag-btn" style="background:var(--red-light);color:var(--red);border:1px solid #f5b4b0" data-tag-id="${t.id}" data-tag-name="${esc(t.name)}">Delete</button>
          </div>
        </div>`).join('') : '<div style="padding:48px;text-align:center;color:var(--text3)">No tags yet. Create your first tag!</div>'}
    </div>
  </div>`;
}

// ─── USERS PAGE ───────────────────────────────────────────────────────────────


// ─── CATEGORIES PAGE ──────────────────────────────────────────────────────────
const CAT_ICONS = ['📋','📄','🐛','⚙️','🔧','📖','🚀','💡','🔬','📊','🗂️','📝','🔐','🌐','⚡','🎯','🧪','📌','🔍','💼'];
const CAT_COLORS = ['#3b82f6','#10b981','#ef4444','#8b5cf6','#f59e0b','#06b6d4','#f97316','#6366f1','#ec4899','#14b8a6'];

function renderCategoriesPage() {
  const cats = S.categories || [];
  const canEdit = can('manage_categories');
  return `<div style="max-width:900px;margin:0 auto;padding:28px 24px">
    <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:24px">
      <div>
        <h2 style="font-family:var(--font-serif);font-size:22px;font-weight:600">📂 Categories</h2>
        <p style="color:var(--text3);font-size:13px;margin-top:4px">Organize your knowledge base into sections</p>
      </div>
      ${can('manage_categories') ? '<button class="btn btn-primary" id="new-cat-btn">+ New Category</button>' : ''}
    </div>
    <div style="display:grid;gap:10px">
      ${cats.map(cat => `
        <div class="cat-list-row" data-cid="${cat.id}" style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius2);padding:16px 20px;display:flex;align-items:center;gap:16px;border-left:4px solid ${cat.color||'#6366f1'}">
          <div style="width:42px;height:42px;background:${cat.color||'#6366f1'}22;border-radius:var(--radius);display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0">${cat.icon||'📁'}</div>
          <div style="flex:1;min-width:0">
            <div class="cat-list-row-name" style="font-size:15px;font-weight:600;margin-bottom:2px;transition:color 0.15s">${esc(cat.name)}</div>
            <div style="font-size:12px;color:var(--text3)">${esc(cat.description||'No description')} &nbsp;·&nbsp; <span style="font-family:var(--mono)">${cat.article_count} article${cat.article_count!==1?'s':''}</span></div>
          </div>
          <div style="display:flex;gap:8px;flex-shrink:0" onclick="event.stopPropagation()">
            ${can('manage_categories') ? `<button class="btn btn-secondary btn-sm edit-cat-btn" data-cid="${cat.id}">Edit</button>` : ''}
            ${can('manage_categories') && cat.article_count===0 ? `<button class="btn btn-sm del-cat-btn" style="background:var(--red-light);color:var(--red);border:1px solid #f5b4b0" data-cid="${cat.id}">Delete</button>` : ''}
          </div>
        </div>`).join('')}
      ${cats.length===0 ? '<div class="empty-state"><div class="empty-icon">📂</div><div class="empty-title">No categories yet</div><div class="empty-sub">Create your first category to organize articles</div></div>' : ''}
    </div>
  </div>`;
}

function renderCategoryForm(cat) {
  const isEdit = !!cat;
  const c = cat || {};
  const selectedColor = c.color || '#3b82f6';
  const selectedIcon = c.icon || '📁';
  return `<div class="modal" id="cat-modal">
    <div class="modal-header">
      <div class="modal-title">${isEdit ? 'Edit Category' : 'New Category'}</div>
      <button class="btn btn-ghost btn-sm" id="close-modal">✕</button>
    </div>
    <div class="modal-body">
      <div style="display:flex;align-items:center;gap:16px;padding:14px;background:var(--bg2);border-radius:var(--radius2);margin-bottom:20px">
        <div id="cat-preview" style="width:52px;height:52px;background:${selectedColor}22;border-radius:var(--radius);display:flex;align-items:center;justify-content:center;font-size:28px;border:2px solid ${selectedColor}44">${selectedIcon}</div>
        <div style="flex:1">
          <div style="font-size:12px;font-weight:600;color:var(--text3);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px">Preview</div>
          <div id="cat-preview-name" style="font-size:15px;font-weight:600">${esc(c.name||'Category Name')}</div>
        </div>
      </div>
      <div class="form-group">
        <label>Category Name *</label>
        <input type="text" id="c-name" value="${esc(c.name||'')}" placeholder="e.g. Meeting Notes, Release Notes, Changelogs">
      </div>
      <div class="form-group">
        <label>Description</label>
        <input type="text" id="c-desc" value="${esc(c.description||'')}" placeholder="What kind of articles belong here?">
      </div>
      <div class="form-group">
        <label>Color</label>
        <div id="cat-color-trigger" style="display:flex;align-items:center;gap:12px;margin-top:8px;padding:12px;background:var(--bg2);border:1px solid var(--border);border-radius:8px;cursor:pointer"
          onclick="showColorPicker('cat-color-trigger', document.getElementById('cat-color-swatch')?.style.background||'${selectedColor}', (c) => { document.getElementById('cat-color-swatch').style.background=c; document.getElementById('cat-color-hex').textContent=c; selCatColor=c; updateCatPreview && updateCatPreview(); })">
          <div id="cat-color-swatch" style="width:32px;height:32px;border-radius:50%;background:${selectedColor};border:2px solid var(--border);flex-shrink:0"></div>
          <div>
            <div style="font-size:13px;font-weight:500;color:var(--text)">Category color</div>
            <div id="cat-color-hex" style="font-size:11px;color:var(--text3);font-family:var(--mono)">${selectedColor}</div>
          </div>
          <span style="margin-left:auto;color:var(--text3);font-size:12px">▾</span>
        </div>
      </div>
      <div class="form-group">
        <label>Icon</label>
        <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px">
          ${CAT_ICONS.map(icon => `<div style="width:34px;height:34px;border-radius:var(--radius);display:flex;align-items:center;justify-content:center;font-size:18px;cursor:pointer;background:${icon===selectedIcon?'var(--accent-light)':'var(--bg2)'};border:2px solid ${icon===selectedIcon?'var(--accent)':'var(--border)'};transition:all 0.1s" class="cat-icon-pick" data-icon="${icon}">${icon}</div>`).join('')}
        </div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" id="close-modal">Cancel</button>
      <button class="btn btn-primary" id="save-cat-btn" data-cid="${c.id||''}">${isEdit?'Save Changes':'Create Category'}</button>
    </div>
  </div>`;
}

function bindCategoryModalEvents() {
  let selIcon = document.querySelector('.cat-icon-pick[style*="accent-light"]')?.dataset.icon || '📁';
  let selColor = document.getElementById('cat-color-swatch')?.style.background || '#3b82f6';
  window.selCatColor = selColor;
  window.updateCatPreview = null;

  const updatePreview = () => {
    selColor = document.getElementById('cat-color-swatch')?.style.background || selColor;
    window.updateCatPreview = updatePreview;
    const preview = document.getElementById('cat-preview');
    const previewName = document.getElementById('cat-preview-name');
    const name = document.getElementById('c-name')?.value || 'Category Name';
    if (preview) {
      preview.textContent = selIcon;
      preview.style.background = selColor + '22';
      preview.style.borderColor = selColor + '44';
    }
    if (previewName) previewName.textContent = name;
  };

  document.getElementById('c-name')?.addEventListener('input', updatePreview);

  document.querySelectorAll('.cat-icon-pick').forEach(el => {
    el.addEventListener('click', () => {
      selIcon = el.dataset.icon;
      document.querySelectorAll('.cat-icon-pick').forEach(e => {
        e.style.background = e.dataset.icon === selIcon ? 'var(--accent-light)' : 'var(--bg2)';
        e.style.borderColor = e.dataset.icon === selIcon ? 'var(--accent)' : 'var(--border)';
      });
      updatePreview();
    });
  });

  document.querySelectorAll('.cat-color-pick').forEach(el => {
    el.addEventListener('click', () => {
      selColor = el.dataset.color;
      document.querySelectorAll('.cat-color-pick').forEach(e =>
        e.style.border = '3px solid ' + (e.dataset.color === selColor ? 'var(--text)' : 'transparent'));
      updatePreview();
    });
  });

  document.getElementById('save-cat-btn')?.addEventListener('click', async () => {
    const cid = document.getElementById('save-cat-btn').dataset.cid;
    const name = document.getElementById('c-name').value.trim();
    if (!name) { toast('Name is required', 'error'); return; }
    const payload = { name, description: document.getElementById('c-desc').value.trim(), icon: selIcon, color: toHex(document.getElementById('cat-color-swatch')?.style.background) || '#3b82f6' };
    try {
      if (cid) { await API.put('/categories/' + cid, payload); toast('Category updated! ✅'); }
      else { await API.post('/categories', payload); toast('Category created! 🎉'); }
      closeModal();
      await loadMeta();
      refreshBody();
    } catch(e) { toast(e.message, 'error'); }
  });
}

// ─── ROLES PAGE ───────────────────────────────────────────────────────────────
const PERM_LABELS = {
  create_articles:   { label: 'Create Articles',   desc: 'Can write new articles' },
  edit_any_article:  { label: 'Edit Any Article',  desc: 'Can edit articles by anyone' },
  edit_own_articles: { label: 'Edit Own Articles', desc: 'Can edit their own articles' },
  publish_articles:  { label: 'Publish Articles',  desc: 'Can publish drafts publicly' },
  delete_articles:   { label: 'Delete Articles',   desc: 'Can permanently delete articles' },
  manage_categories: { label: 'Manage Categories', desc: 'Can create/edit/delete categories' },
  manage_users:      { label: 'Manage Users',      desc: 'Can create/edit/delete users' },
  export_pdf:        { label: 'Export PDF',        desc: 'Can export articles as PDF' },
  add_comments:      { label: 'Add Comments',      desc: 'Can post comments on articles' },
  view_drafts:       { label: 'View Drafts',       desc: 'Can see unpublished drafts' },
};

function renderRolesPage() {
  const roles = S.allRoles || [];
  return `<div style="max-width:1000px;margin:0 auto;padding:28px 24px">
    <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:24px">
      <div>
        <h2 style="font-family:var(--font-serif);font-size:22px;font-weight:600">Roles &amp; Permissions</h2>
        <p style="color:var(--text3);font-size:13px;margin-top:4px">Define what each role can do in the wiki</p>
      </div>
      <button class="btn btn-primary" id="new-role-btn">+ New Role</button>
    </div>
    <div style="display:grid;gap:14px">
      ${(S.allRoles||[]).map(role => `
        <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius2);overflow:hidden;border-left:4px solid ${role.color}">
          <div style="padding:16px 20px;display:flex;align-items:center;gap:14px;border-bottom:1px solid var(--border)">
            <div style="flex:1">
              <div style="display:flex;align-items:center;gap:10px;margin-bottom:3px;flex-wrap:wrap">
                <span style="font-size:15px;font-weight:700">${esc(role.name)}</span>
                ${role.is_system ? '<span style="font-size:10px;background:var(--bg3);color:var(--text3);border:1px solid var(--border);padding:1px 7px;border-radius:10px;font-weight:600">SYSTEM</span>' : ''}
                <span style="font-size:11px;font-family:var(--mono);color:var(--text4)">@${role.slug}</span>
                <span style="font-size:12px;color:var(--text3)">${role.user_count} user${role.user_count !== 1 ? 's' : ''}</span>
              </div>
              <div style="font-size:12px;color:var(--text3)">${esc(role.description||'No description')}</div>
            </div>
            <div style="display:flex;gap:8px;flex-shrink:0">
              <button class="btn btn-secondary btn-sm edit-role-btn" data-rid="${role.id}">Edit Permissions</button>
              ${!role.is_system ? '<button class="btn btn-sm del-role-btn" style="background:var(--red-light);color:var(--red);border:1px solid #f5b4b0" data-rid="' + role.id + '">Delete</button>' : ''}
            </div>
          </div>
          <div style="padding:14px 20px">
            <div style="display:flex;flex-wrap:wrap;gap:6px">
              ${Object.entries(PERM_LABELS).map(([key, info]) => {
                const has = role.permissions && role.permissions[key];
                return '<div title="' + esc(info.desc) + '" style="display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:500;background:' +
                  (has ? 'var(--green-light)' : 'var(--bg2)') + ';color:' + (has ? 'var(--green)' : 'var(--text4)') +
                  ';border:1px solid ' + (has ? '#a7dfbf' : 'var(--border)') + '">' +
                  (has ? '✓' : '✕') + ' ' + esc(info.label) + '</div>';
              }).join('')}
            </div>
          </div>
        </div>`).join('')}
      ${roles.length === 0 ? '<div class="empty-state"><div class="empty-title">No roles found</div></div>' : ''}
    </div>
  </div>`;
}

function renderRoleForm(role) {
  const isEdit = !!role;
  const r = role || {};
  const perms = r.permissions || {};
  const colors = ['#ef4444','#f97316','#f59e0b','#10b981','#3b82f6','#6366f1','#8b5cf6','#ec4899'];
  const selectedColor = r.color || '#6366f1';
  return `<div class="modal modal-lg" id="role-modal">
    <div class="modal-header">
      <div class="modal-title">${isEdit ? 'Edit: ' + esc(r.name) : 'New Role'}</div>
      <button class="btn btn-ghost btn-sm" id="close-modal">x</button>
    </div>
    <div class="modal-body">
      <div class="form-row cols-2" style="margin-bottom:16px">
        <div class="form-group">
          <label>Role Name *</label>
          <input type="text" id="r-name" value="${esc(r.name||'')}" placeholder="e.g. Team Lead, Intern" ${r.is_system?'disabled':''}>
          ${r.is_system ? '<div style="font-size:11px;color:var(--text3);margin-top:4px">System role names cannot be changed</div>' : ''}
        </div>
        <div class="form-group">
          <label>Description</label>
          <input type="text" id="r-desc" value="${esc(r.description||'')}" placeholder="Brief description of this role">
        </div>
      </div>
      <div class="form-group" style="margin-bottom:20px">
        <label>Role Color</label>
        <div id="role-color-trigger" style="display:flex;align-items:center;gap:12px;margin-top:8px;padding:12px;background:var(--bg2);border:1px solid var(--border);border-radius:8px;cursor:pointer"
          onclick="showColorPicker('role-color-trigger', document.getElementById('role-color-swatch')?.style.background||'${selectedColor}', (c) => { document.getElementById('role-color-swatch').style.background=c; document.getElementById('role-color-hex').textContent=c; })">
          <div id="role-color-swatch" style="width:32px;height:32px;border-radius:50%;background:${selectedColor};border:2px solid var(--border);flex-shrink:0"></div>
          <div>
            <div style="font-size:13px;font-weight:500;color:var(--text)">Role color</div>
            <div id="role-color-hex" style="font-size:11px;color:var(--text3);font-family:var(--mono)">${selectedColor}</div>
          </div>
          <span style="margin-left:auto;color:var(--text3);font-size:12px">▾</span>
        </div>
      </div>
      <div style="margin-bottom:12px">
        <label>Permissions</label>
        <div style="font-size:12px;color:var(--text3);margin-top:2px">Toggle what members with this role can do</div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        ${Object.entries(PERM_LABELS).map(([key, info]) => {
          const checked = perms[key] || false;
          return '<label id="perm-label-' + key + '" style="display:flex;align-items:flex-start;gap:10px;padding:11px 12px;background:' +
            (checked ? 'var(--green-light)' : 'var(--bg2)') +
            ';border-radius:var(--radius);cursor:pointer;border:1px solid ' + (checked ? '#a7dfbf' : 'var(--border)') +
            ';transition:all 0.12s">' +
            '<input type="checkbox" id="perm-' + key + '" ' + (checked?'checked':'') +
            ' style="width:15px;height:15px;accent-color:var(--green);cursor:pointer;margin-top:2px;flex-shrink:0">' +
            '<div><div style="font-size:13px;font-weight:600;color:var(--text)">' + esc(info.label) + '</div>' +
            '<div style="font-size:11px;color:var(--text3);margin-top:1px">' + esc(info.desc) + '</div></div></label>';
        }).join('')}
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" id="close-modal">Cancel</button>
      <button class="btn btn-primary" id="save-role-btn" data-rid="${r.id||''}">${isEdit ? 'Save Changes' : 'Create Role'}</button>
    </div>
  </div>`;
}

function bindRoleModalEvents() {
  // Color handled by showColorPicker inline onclick

  Object.keys(PERM_LABELS).forEach(key => {
    const cb = document.getElementById('perm-' + key);
    const label = document.getElementById('perm-label-' + key);
    if (!cb || !label) return;
    cb.addEventListener('change', () => {
      label.style.background = cb.checked ? 'var(--green-light)' : 'var(--bg2)';
      label.style.borderColor = cb.checked ? '#a7dfbf' : 'var(--border)';
    });
  });

  document.getElementById('save-role-btn')?.addEventListener('click', async () => {
    const rid = document.getElementById('save-role-btn').dataset.rid;
    const name = document.getElementById('r-name').value.trim();
    if (!name) { toast('Role name is required', 'error'); return; }
    const permissions = {};
    Object.keys(PERM_LABELS).forEach(key => {
      permissions[key] = document.getElementById('perm-' + key)?.checked || false;
    });
    const payload = {
      name,
      description: document.getElementById('r-desc').value.trim(),
      color: toHex(document.getElementById('role-color-swatch')?.style.background) || '#6366f1',
      permissions
    };
    try {
      if (rid) { await API.put('/roles/' + rid, payload); toast('Role updated!'); }
      else { await API.post('/roles', payload); toast('Role created!'); }
      closeModal();
      S.allRoles = await API.get('/roles');
      refreshBody();
    } catch(e) { toast(e.message, 'error'); }
  });
}

function renderUsersPage() {
  const users = S.allUsers || [];
  const roleColors = {admin:'#ef4444',qa_engineer:'#3b82f6',developer:'#10b981',viewer:'#6366f1'};
  const getRoleColor = (role) => {
    if (roleColors[role]) return roleColors[role];
    // Check S.allRoles for custom role color
    const customRole = (S.allRoles||[]).find(r => r.slug === role || r.name?.toLowerCase() === role?.toLowerCase());
    if (customRole?.color) return toHex(customRole.color);
    // Fallback: generate consistent color from role name
    let hash = 0;
    for (let i = 0; i < (role||'').length; i++) hash = role.charCodeAt(i) + ((hash << 5) - hash);
    const colors = ['#f59e0b','#8b5cf6','#ec4899','#14b8a6','#f97316','#06b6d4','#84cc16','#a855f7'];
    return colors[Math.abs(hash) % colors.length];
  };
  const roleLabels = {admin:'Admin',qa_engineer:'QA Engineer',developer:'Developer',viewer:'Viewer'};
  const getRoleLabel = (role) => {
    if (roleLabels[role]) return roleLabels[role];
    // Check S.allRoles for the actual name
    const found = (S.allRoles||[]).find(r => r.slug === role);
    if (found?.name) return found.name;
    // Fallback: format slug nicely (team_lead → Team Lead)
    return role.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  };
  return `<div style="max-width:900px;margin:0 auto;padding:28px 24px">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:24px">
      <div>
        <h2 style="font-family:var(--font-serif);font-size:22px;font-weight:600">Team Members</h2>
        <p style="color:var(--text3);font-size:13px;margin-top:4px">Manage team members and their access levels</p>
      </div>
      <button class="btn btn-primary" id="new-user-btn">+ New User</button>
    </div>

    <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius2);overflow:hidden">
      <table style="width:100%;border-collapse:collapse">
        <thead><tr style="background:var(--bg2)">
          <th style="padding:10px 16px;text-align:left;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:var(--text3)">User</th>
          <th style="padding:10px 16px;text-align:left;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:var(--text3)">Email</th>
          <th style="padding:10px 16px;text-align:left;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:var(--text3)">Role</th>
          <th style="padding:10px 16px;text-align:left;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:var(--text3)">Status</th>
          <th style="padding:10px 16px;text-align:left;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:var(--text3)">Joined</th>
          <th style="padding:10px 16px;text-align:right;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:var(--text3)">Actions</th>
        </tr></thead>
        <tbody>
          ${users.map(u => {
            const isMe = u.id === S.user.id;
            return '<tr style="border-top:1px solid var(--border)"><td style="padding:12px 16px"><div style="display:flex;align-items:center;gap:10px"><div class="avatar" style="width:34px;height:34px;background:' + (u.avatar_color||'#6366f1') + ';font-size:12px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;color:white">' + u.name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase() + '</div><div><div style="font-weight:600;font-size:13px">' + esc(u.name) + '</div>' + (isMe ? '<div style="font-size:10px;color:var(--accent);font-weight:600">You</div>' : '') + '</div></div></td><td style="padding:12px 16px;color:var(--text2);font-size:13px">' + esc(u.email) + '</td><td style="padding:12px 16px"><span style="display:inline-flex;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700;background:' + getRoleColor(u.role) + '22;color:' + getRoleColor(u.role) + ';border:1px solid ' + getRoleColor(u.role) + '44">' + (getRoleLabel(u.role)) + '</span></td><td style="padding:12px 16px"><span style="display:inline-flex;align-items:center;gap:5px;font-size:12px;font-weight:600;color:' + (u.is_active?'var(--green)':'var(--text3)') + '"><span style="width:7px;height:7px;border-radius:50%;background:' + (u.is_active?'var(--green)':'var(--text4)') + '"></span>' + (u.is_active?'Active':'Inactive') + '</span></td><td style="padding:12px 16px;color:var(--text3);font-size:12px">' + relTime(u.created_at) + '</td><td style="padding:12px 16px;text-align:right"><div style="display:flex;gap:6px;justify-content:flex-end"><button class="btn btn-secondary btn-sm edit-user-btn" data-uid="' + u.id + '">Edit</button>' + (!isMe ? '<button class="btn btn-sm del-user-btn" style="background:var(--red-light);color:var(--red);border:1px solid #f5b4b0" data-uid="' + u.id + '">Delete</button>' : '') + '</div></td></tr>';
          }).join('')}
        </tbody>
      </table>
    </div>
  </div>`;
}

function renderUserForm(user) {
  const isEdit = !!user;
  const u = user || {};
  const selectedColor = u.avatar_color || '#6366f1';
  const initials = u.name ? u.name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase() : 'NU';
  return `<div class="modal" id="user-modal">
    <div class="modal-header">
      <div class="modal-title">${isEdit ? 'Edit User' : 'New User'}</div>
      <button class="btn btn-ghost btn-sm" id="close-modal">x</button>
    </div>
    <div class="modal-body">
      <div style="display:flex;align-items:center;gap:16px;margin-bottom:20px;padding:14px;background:var(--bg2);border-radius:var(--radius2)">
        <div class="avatar" id="modal-avatar-preview" style="width:44px;height:44px;background:${selectedColor};font-size:16px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;color:white">${initials}</div>
        <div>
          <div style="font-size:13px;font-weight:600;margin-bottom:8px">Avatar Color</div>
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            <div id="modal-color-trigger" style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:var(--bg2);border:1px solid var(--border);border-radius:8px;cursor:pointer;width:100%"
              onclick="showColorPicker('modal-color-trigger', document.getElementById('modal-color-swatch')?.style.background||'${selectedColor}', (c) => { document.getElementById('modal-color-swatch').style.background=c; document.getElementById('modal-avatar-preview').style.background=c; document.getElementById('modal-color-hex').textContent=c; })">
              <div id="modal-color-swatch" style="width:28px;height:28px;border-radius:50%;background:${selectedColor};border:2px solid var(--border);flex-shrink:0"></div>
              <div>
                <div style="font-size:13px;font-weight:500;color:var(--text)">Avatar color</div>
                <div id="modal-color-hex" style="font-size:11px;color:var(--text3);font-family:var(--mono)">${selectedColor}</div>
              </div>
              <span style="margin-left:auto;color:var(--text3);font-size:12px">▾</span>
            </div>
          </div>
        </div>
      </div>
      <div class="form-row cols-2">
        <div class="form-group"><label>Full Name *</label><input type="text" id="u-name" value="${esc(u.name||'')}" placeholder="Juan dela Cruz"></div>
        <div class="form-group"><label>Email *</label><input type="email" id="u-email" value="${esc(u.email||'')}" placeholder="juan@company.com" ${isEdit?'disabled':''}></div>
      </div>
      <div class="form-row cols-2">
        <div class="form-group"><label>Role *</label>
          <select id="u-role">
            ${(S.allRoles||[]).map(r => '<option value="' + r.slug + '" ' + (u.role===r.slug?'selected':'') + '>' + esc(r.name) + '</option>').join('')}
          </select>
        </div>
        <div class="form-group"><label>Password ${isEdit?'(leave blank to keep)':' *'}</label>
          <input type="password" id="u-pass" placeholder="${isEdit?'Leave blank to keep':'Min. 8 characters'}">
        </div>
      </div>
      ${isEdit ? `<div class="form-group"><label>Account Status</label>
        <select id="u-active">
          <option value="true" ${u.is_active?'selected':''}>Active</option>
          <option value="false" ${!u.is_active?'selected':''}>Inactive</option>
        </select></div>` : ''}
      
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" id="close-modal">Cancel</button>
      <button class="btn btn-primary" id="save-user-btn" data-uid="${u.id||''}">${isEdit?'Save Changes':'Create User'}</button>
    </div>
  </div>`;
}

function bindUserModalEvents() {
  let selectedColor = document.getElementById('modal-avatar-preview')?.style.background || '#6366f1';
  // color handled by showColorPicker inline
  document.getElementById('save-user-btn')?.addEventListener('click', async () => {
    const uid = document.getElementById('save-user-btn').dataset.uid;
    const name = document.getElementById('u-name').value.trim();
    const email = document.getElementById('u-email').value.trim();
    const password = document.getElementById('u-pass').value;
    const role = document.getElementById('u-role').value;
    if (!name) { toast('Name is required', 'error'); return; }
    if (!uid && !email) { toast('Email is required', 'error'); return; }
    if (!uid && !password) { toast('Password is required', 'error'); return; }
    const payload = { name, role, avatar_color: toHex(document.getElementById('modal-color-swatch')?.style.background || selectedColor) };
    if (!uid) payload.email = email;
    if (password) payload.password = password;
    if (uid) payload.is_active = document.getElementById('u-active')?.value === 'true';
    try {
      if (uid) { await API.put('/users/' + uid, payload); toast('User updated!'); }
      else { await API.post('/users', payload); toast('User created!'); }
      closeModal();
      S.allUsers = await API.get('/users');
      refreshBody();
    } catch(e) { toast(e.message, 'error'); }
  });
}

// ─── PROFILE ─────────────────────────────────────────────────────────────────
function renderProfile() {
  const colors = ['#ef4444','#f97316','#f59e0b','#10b981','#3b82f6','#6366f1','#8b5cf6','#ec4899'];
  return `<div style="max-width:480px;margin:0 auto;padding:32px 24px">
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius2);padding:24px;margin-bottom:16px">
      <div style="font-size:15px;font-weight:700;margin-bottom:20px">My Profile</div>
      <div style="display:flex;align-items:center;gap:16px;margin-bottom:20px">
        ${avatar(S.user, 52)}
        <div>
          <div style="font-size:16px;font-weight:700">${esc(S.user.name)}</div>
          <div style="color:var(--text3);font-size:13px">${esc(S.user.email)}</div>
          <div style="margin-top:6px">${roleBadge(S.user.role)}</div>
        </div>
      </div>
      <div class="form-group"><label>Display Name</label><input type="text" id="p-name" value="${esc(S.user.name)}"></div>
      <div class="form-group"><label>Email</label><input type="email" id="p-email" value="${esc(S.user.email)}"></div>
      <div class="form-group">
        <label>Avatar Color</label>
        <div style="display:flex;align-items:center;gap:12px;margin-top:8px;padding:12px;background:var(--bg2);border-radius:8px;border:1px solid var(--border);cursor:pointer" id="p-color-trigger" onclick="showColorPicker('p-color-trigger', S.user.avatar_color||'#6366f1', (c) => { S.user.avatar_color=c; document.getElementById('p-color-preview').style.background=c; document.getElementById('p-color-trigger').querySelector('.p-hex').textContent=c; })">
          <div id="p-color-preview" style="width:36px;height:36px;border-radius:50%;background:${S.user.avatar_color||'#6366f1'};border:2px solid var(--border);flex-shrink:0;transition:background 0.15s"></div>
          <div>
            <div style="font-size:13px;font-weight:500;color:var(--text)">Pick a color</div>
            <div class="p-hex" style="font-size:12px;color:var(--text3);font-family:var(--mono);margin-top:2px">${S.user.avatar_color||'#6366f1'}</div>
          </div>
          <span style="margin-left:auto;font-size:12px;color:var(--text3)">▾</span>
        </div>
      </div>
      <button class="btn btn-primary btn-sm" id="save-profile-btn">Save Profile</button>
    </div>
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius2);padding:24px">
      <div style="font-size:15px;font-weight:700;margin-bottom:16px">Change Password</div>
      <div class="form-group"><label>Current Password</label><input type="password" id="cur-pass"></div>
      <div class="form-group"><label>New Password</label><input type="password" id="new-pass"></div>
      <button class="btn btn-secondary btn-sm" id="change-pass-btn">Update Password</button>
    </div>
  </div>`;
}

// ─── MODAL ────────────────────────────────────────────────────────────────────
function openModal(html) {
  document.getElementById('modal-root').innerHTML = `<div class="modal-overlay" id="overlay">${html}</div>`;
  document.querySelectorAll('#close-modal').forEach(el => el.addEventListener('click', closeModal));
  document.getElementById('overlay')?.addEventListener('click', e => { if (e.target.id === 'overlay') closeModal(); });
}

function closeModal() { console.log('closeModal called from:', new Error().stack.split('\n').slice(1,3).join(' | ')); document.getElementById('modal-root').innerHTML = ''; }

// ─── CUSTOM MODAL DIALOGS ─────────────────────────────────────────────────────
function showConfirm({ title, message, confirmText = 'Confirm', cancelText = 'Cancel', danger = false }) {
  return new Promise(resolve => {
    _modalOpen = true;
    const root = document.getElementById('modal-root');

    // Build modal directly as DOM nodes - no innerHTML timing issues
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;z-index:9999;padding:20px;animation:overlayIn 0.18s ease';

    const box = document.createElement('div');
    box.style.cssText = 'background:var(--surface);border-radius:12px;padding:24px;max-width:400px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,0.3);border:1px solid var(--border);animation:modalIn 0.2s cubic-bezier(0.34,1.56,0.64,1)';

    const ttl = document.createElement('div');
    ttl.style.cssText = 'font-size:16px;font-weight:600;color:var(--text);margin-bottom:10px';
    ttl.textContent = title;

    const msg = document.createElement('p');
    msg.style.cssText = 'font-size:14px;color:var(--text2);line-height:1.6;margin-bottom:20px';
    msg.textContent = message;

    const btns = document.createElement('div');
    btns.style.cssText = 'display:flex;justify-content:flex-end;gap:10px';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn btn-secondary';
    cancelBtn.textContent = cancelText;

    const confirmBtn = document.createElement('button');
    confirmBtn.className = danger ? 'btn btn-danger' : 'btn btn-primary';
    confirmBtn.textContent = confirmText;

    btns.appendChild(cancelBtn);
    btns.appendChild(confirmBtn);
    box.appendChild(ttl);
    box.appendChild(msg);
    box.appendChild(btns);
    overlay.appendChild(box);

    // Clear and append
    root.innerHTML = '';
    root.appendChild(overlay);

    const close = (result) => {
      box.style.animation = 'modalOut 0.15s ease forwards';
      overlay.style.animation = 'overlayOut 0.15s ease forwards';
      setTimeout(() => { _modalOpen = false; root.innerHTML = ''; resolve(result); }, 150);
    };

    confirmBtn.addEventListener('click', (e) => { e.stopPropagation(); close(true); });
    cancelBtn.addEventListener('click', (e) => { e.stopPropagation(); close(false); });

    // Only bind overlay dismiss after a delay to prevent bubbled clicks
    setTimeout(() => {
      overlay.addEventListener('click', (e) => { if (e.target === overlay) close(false); });
    }, 300);

    setTimeout(() => confirmBtn.focus(), 50);
  });
}


function showPrompt({ title, message = '', placeholder = '', defaultValue = '', confirmText = 'OK', cancelText = 'Cancel' }) {
  return new Promise(resolve => {
    const id = 'pm' + Date.now();
    document.getElementById('modal-root').innerHTML = `<div class="modal-overlay" id="${id}-ov">
      <div class="modal" style="max-width:440px">
        <div class="modal-header">
          <div class="modal-title">${title}</div>
          <button class="btn btn-ghost btn-sm" id="${id}-x">&#x2715;</button>
        </div>
        <div class="modal-body">
          ${message ? `<p style="font-size:13px;color:var(--text2);margin-bottom:12px">${message}</p>` : ''}
          <input type="text" id="${id}-inp" placeholder="${placeholder}" value="${defaultValue}"
            style="width:100%;font-size:14px;padding:9px 12px;border:1px solid var(--border);border-radius:var(--radius);background:var(--surface);color:var(--text);outline:none;"
            onfocus="this.style.borderColor='var(--accent)'" onblur="this.style.borderColor='var(--border)'">
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" id="${id}-no">${cancelText}</button>
          <button class="btn btn-primary" id="${id}-yes">${confirmText}</button>
        </div>
      </div>
    </div>`;
    const inp = document.getElementById(id+'-inp');
    const done = r => { document.getElementById('modal-root').innerHTML = ''; resolve(r); };
    document.getElementById(id+'-yes').onclick = () => done(inp.value);
    document.getElementById(id+'-no').onclick = () => done(null);
    document.getElementById(id+'-x').onclick = () => done(null);
    setTimeout(() => {
      const ov = document.getElementById(id+'-ov');
      if (ov) ov.onclick = e => { if(e.target.id===id+'-ov') done(null); };
    }, 200);
    inp.onkeydown = e => { if(e.key==='Enter') done(inp.value); if(e.key==='Escape') done(null); };
    setTimeout(() => { inp.focus(); inp.select(); }, 50);
  });
}
window.showConfirm = showConfirm;
window.showPrompt = showPrompt;

// closeModal defined below with showConfirm/showPrompt

// ─── DATA LOADERS ─────────────────────────────────────────────────────────────
async function loadMeta() {
  const [cats, tags] = await Promise.all([API.get('/categories'), API.get('/articles/tags')]);
  S.categories = cats;
  S.tags = tags;
}

async function loadPermissions() {
  try { S.perms = await API.get('/auth/permissions'); } catch(e) { S.perms = {}; }
}

function can(perm) { return S.perms[perm] === true; }

async function loadDashboard() {
  const [dash, ann] = await Promise.all([
    API.get('/dashboard'),
    API.get('/dashboard/announcement').catch(() => ({announcement:'', id: null}))
  ]);
  S.dashboardData = dash;
  S.announcement = ann.announcement || '';
  // If no id stored yet, generate one from the announcement text (for existing announcements)
  S.announcementId = ann.id || (ann.announcement ? 'legacy-' + ann.announcement.length + '-' + ann.announcement.slice(0,10).replace(/\s/g,'') : null);
}

async function loadArticles(extraFilters = {}) {
  const f = { ...S.filters, ...extraFilters };
  const params = new URLSearchParams({
    page: S.articlePage, per_page: 20,
    ...(f.q && { q: f.q }),
    ...(f.content_type && { content_type: f.content_type }),
    ...(f.tag && { tag: f.tag }),
    ...(f.status && { status: f.status }),
    ...(f.category_id && { category_id: f.category_id }),
  });
  const data = await API.get(`/articles?${params}`);
  S.articles = data.articles;
  S.articleTotal = data.total;
  S.articlePages = data.pages;
}

// ─── NAVIGATION ───────────────────────────────────────────────────────────────

// ─── PAGE LOADER ──────────────────────────────────────────────────────────────
function showPageLoader(msg = 'Loading...') {
  let el = document.getElementById('page-loader');
  if (!el) {
    el = document.createElement('div');
    el.id = 'page-loader';
    document.body.appendChild(el);
  }
  el.innerHTML = `
    <div class="page-loader-inner">
      <div class="page-loader-spinner"></div>
      <div class="page-loader-msg">${msg}</div>
    </div>`;
  el.style.display = 'flex';
  requestAnimationFrame(() => el.classList.add('visible'));
}
function hidePageLoader() {
  const el = document.getElementById('page-loader');
  if (!el) return;
  el.classList.remove('visible');
  setTimeout(() => { el.style.display = 'none'; }, 200);
}

async function navigateTo(page, opts = {}) {
  showPageLoader();
  // Fade out content area
  const pb = document.getElementById('page-body');
  if (pb && S.page !== page) {
    pb.classList.add('navigating');
    await new Promise(r => setTimeout(r, 120));
  }
  S.page = page;
  S.articlePage = 1;
  // Clear category highlight when not on category page
  if (page !== 'category') S.currentCategoryId = null;
  if (page === 'home') { await Promise.all([loadDashboard(), loadMeta()]); }
  if (page === 'all') { S.filters = { q:'', content_type:'', tag:'', status:'' }; await loadArticles(); }
  if (page === 'category' && opts.catId) {
    S.currentCategoryId = opts.catId;
    S.filters = { q:'', content_type:'', tag:'', status:'' };
    await loadArticles({ category_id: opts.catId });
  }
  if (page === 'drafts') { S.filters = { q:'', content_type:'', tag:'', status:'draft' }; await loadArticles({ status: 'draft' }); }
  if (page === 'read' && opts.articleId) { S.currentArticle = await API.get(`/articles/${opts.articleId}`); }
  if (page === 'edit') {
    S.editingArticle = opts.article || null;
    if (opts.article?.id) ArticleLock.acquire(opts.article.id);
  }
  if (page === 'users') { [S.allUsers, S.allRoles] = await Promise.all([API.get('/users'), API.get('/roles')]); }
  if (page === 'roles') { S.allRoles = await API.get('/roles'); }
  if (page === 'categories') { await loadMeta(); }
  if (page === 'tags') { S.tags = await API.get('/articles/tags'); }
  render();
  hidePageLoader();
  // Fade content back in
  requestAnimationFrame(() => {
    const pb2 = document.getElementById('page-body');
    if (pb2) pb2.classList.remove('navigating');
  });
}

function refreshBody() {
  const pb = document.getElementById('page-body');
  if (pb) { pb.innerHTML = renderPage(); bindPageEvents(); }
  const tb = document.querySelector('.topbar');
  if (tb) tb.outerHTML = renderTopbar();
}

// ─── EVENTS ───────────────────────────────────────────────────────────────────
function bindEvents() {
  document.querySelectorAll('[data-page]').forEach(el => {
    el.addEventListener('click', () => navigateTo(el.dataset.page));
  });
  document.querySelectorAll('[data-cat]').forEach(el => {
    el.addEventListener('click', () => navigateTo('category', { catId: parseInt(el.dataset.cat) }));
  });
  // dark-toggle handled via inline onclick

  document.getElementById('logout-btn')?.addEventListener('click', async () => {
    await API.post('/auth/logout');
    S.user = null; S.token = null; localStorage.removeItem('wiki_token');
    render();
  });

  document.getElementById('new-article-btn')?.addEventListener('click', () => {
    navigateTo('edit', { article: null });
  });
  const gs = document.getElementById('global-search');
  if (gs) {
    gs.addEventListener('keypress', async e => {
      if (e.key === 'Enter' && gs.value.trim()) {
        S.filters.q = gs.value.trim();
        S.page = 'all';
        S.articlePage = 1;
        await loadArticles();
        render();
      }
    });
  }
  bindPageEvents();
}

function bindPageEvents() {
  document.querySelectorAll('[data-article]').forEach(el => {
    if (!el.classList.contains('edit-article-btn') && !el.classList.contains('del-article-btn') && el.id !== 'del-this-btn') {
      el.addEventListener('click', e => {
        if (e.target.classList.contains('edit-article-btn') || e.target.classList.contains('del-article-btn')) return;
        navigateTo('read', { articleId: parseInt(el.dataset.article) });
      });
    }
  });
  document.querySelectorAll('.edit-article-btn').forEach(el => {
    el.addEventListener('click', async e => {
      e.stopPropagation();
      const a = await API.get(`/articles/${el.dataset.article}`);
      navigateTo('edit', { article: a });
    });
  });
  document.querySelectorAll('.del-article-btn').forEach(el => {
    el.addEventListener('click', async e => {
      e.stopPropagation();
      const ok = await showConfirm({ title: 'Delete Article', message: 'This article will be permanently deleted and cannot be recovered.', confirmText: 'Yes, Delete', danger: true });
      if (!ok) return;
      await API.del(`/articles/${el.dataset.article}`);
      toast('Article deleted');
      await navigateTo(S.page === 'read' ? 'all' : S.page);
    });
  });
  const _mp = document.getElementById('mobile-info-panel');
  const _as = document.querySelector('.reader-aside');
  if (_mp && _as) _mp.innerHTML = _as.innerHTML;

  const editBtn = document.getElementById('edit-this-btn');
  if (editBtn) editBtn.onclick = async () => {
    const a = await API.get(`/articles/${S.currentArticle.id}`);
    navigateTo('edit', { article: a });
  };
  const pubBtn = document.getElementById('publish-btn');
  if (pubBtn) pubBtn.onclick = async () => {
    await API.put(`/articles/${S.currentArticle.id}`, { status: 'published', change_summary: 'Published' });
    toast('Published!');
    S.currentArticle = await API.get(`/articles/${S.currentArticle.id}`);
    refreshBody();
  };
  const delBtn = document.getElementById('del-this-btn');
  if (delBtn) delBtn.onclick = async (e) => {
    e.stopPropagation();
    const ok = await showConfirm({ title: 'Delete Article', message: 'This article will be permanently deleted.', confirmText: 'Yes, Delete', danger: true });
    if (!ok) return;
    await API.del(`/articles/${S.currentArticle.id}`);
    toast('Article deleted');
    navigateTo('all');
  };
  document.getElementById('post-comment')?.addEventListener('click', async () => {
    const content = document.getElementById('new-comment')?.value?.trim();
    if (!content) return;
    const articleId = document.getElementById('post-comment').dataset.article;
    await API.post(`/comments/article/${articleId}`, { content });
    toast('Comment posted!');
    S.currentArticle = await API.get(`/articles/${articleId}`);
    refreshBody();
  });
  document.querySelectorAll('.del-comment').forEach(el => {
    el.addEventListener('click', async () => {
      await API.del(`/comments/${el.dataset.comment}`);
      toast('Comment deleted');
      S.currentArticle = await API.get(`/articles/${S.currentArticle.id}`);
      refreshBody();
    });
  });
  const aq = document.getElementById('art-search');
  if (aq) {
    aq.addEventListener('input', debounce(async () => {
      S.filters.q = aq.value;
      S.articlePage = 1;
      await loadArticles(S.page==='category'?{category_id:S.currentCategoryId}:{});
      refreshBody();
    }, 350));
  }
  document.getElementById('art-type')?.addEventListener('change', async e => {
    S.filters.content_type = e.target.value; S.articlePage = 1;
    await loadArticles(S.page==='category'?{category_id:S.currentCategoryId}:{}); refreshBody();
  });
  document.getElementById('art-status')?.addEventListener('change', async e => {
    S.filters.status = e.target.value; S.articlePage = 1;
    await loadArticles(S.page==='category'?{category_id:S.currentCategoryId}:{}); refreshBody();
  });
  document.getElementById('clear-art-filters')?.addEventListener('click', async () => {
    S.filters = { q:'', content_type:'', tag:'', status:'' }; S.articlePage = 1;
    await loadArticles(S.page==='category'?{category_id:S.currentCategoryId}:{}); refreshBody();
  });
  document.getElementById('prev-page')?.addEventListener('click', async () => {
    if (S.articlePage > 1) { S.articlePage--; await loadArticles(S.page==='category'?{category_id:S.currentCategoryId}:{}); refreshBody(); }
  });
  document.getElementById('next-page')?.addEventListener('click', async () => {
    if (S.articlePage < S.articlePages) { S.articlePage++; await loadArticles(S.page==='category'?{category_id:S.currentCategoryId}:{}); refreshBody(); }
  });
  document.querySelectorAll('.page-btn[data-page]').forEach(btn => {
    btn.addEventListener('click', async () => {
      S.articlePage = parseInt(btn.dataset.page);
      await loadArticles(S.page==='category'?{category_id:S.currentCategoryId}:{}); refreshBody();
    });
  });
  // Categories management
  document.getElementById('new-cat-btn')?.addEventListener('click', () => {
    openModal(renderCategoryForm()); bindCategoryModalEvents();
  });
  document.querySelectorAll('.cat-list-row').forEach(el => {
    el.addEventListener('click', () => navigateTo('category', { catId: parseInt(el.dataset.cid) }));
  });
  document.querySelectorAll('.edit-cat-btn').forEach(el => {
    el.addEventListener('click', () => {
      const c = (S.categories||[]).find(c => c.id === parseInt(el.dataset.cid));
      if (c) { openModal(renderCategoryForm(c)); bindCategoryModalEvents(); }
    });
  });
  document.querySelectorAll('.del-cat-btn').forEach(el => {
    el.addEventListener('click', async (e) => {
      e.stopPropagation();
      const ok = await showConfirm({ title: 'Delete Category', message: 'Are you sure you want to delete this category? This cannot be undone.', confirmText: 'Yes, Delete', danger: true });
      if (!ok) return;
      try {
        await API.del('/categories/' + el.dataset.cid);
        toast('Category deleted');
        await loadMeta();
        refreshBody();
      } catch(e) { toast(e.message, 'error'); }
    });
  });

  // Roles management
  document.getElementById('new-role-btn')?.addEventListener('click', () => {
    openModal(renderRoleForm()); bindRoleModalEvents();
  });
  document.querySelectorAll('.edit-role-btn').forEach(el => {
    el.addEventListener('click', () => {
      const r = (S.allRoles||[]).find(r => r.id === parseInt(el.dataset.rid));
      if (r) { openModal(renderRoleForm(r)); bindRoleModalEvents(); }
    });
  });
  document.querySelectorAll('.del-role-btn').forEach(el => {
    el.addEventListener('click', async () => {
      const ok = await showConfirm({ title: 'Delete Role', message: 'Are you sure you want to delete this role? Users assigned to it will need a new role.', confirmText: 'Yes, Delete', danger: true });
      if (!ok) return;
      try {
        await API.del('/roles/' + el.dataset.rid);
        toast('Role deleted');
        S.allRoles = await API.get('/roles');
        refreshBody();
      } catch(e) { toast(e.message, 'error'); }
    });
  });

  // User management
  document.getElementById('new-user-btn')?.addEventListener('click', () => {
    openModal(renderUserForm()); bindUserModalEvents();
  });
  document.querySelectorAll('.edit-user-btn').forEach(el => {
    el.addEventListener('click', () => {
      const u = (S.allUsers||[]).find(u => u.id === parseInt(el.dataset.uid));
      if (u) { openModal(renderUserForm(u)); bindUserModalEvents(); }
    });
  });
  document.querySelectorAll('.del-user-btn').forEach(el => {
    el.addEventListener('click', async (e) => {
      e.stopPropagation();
      const ok = await showConfirm({ title: 'Delete User', message: 'Are you sure you want to delete this user? This cannot be undone.', confirmText: 'Yes, Delete', danger: true });
      if (!ok) return;
      try {
        await API.del('/users/' + el.dataset.uid);
        toast('User deleted');
        S.allUsers = await API.get('/users');
        refreshBody();
      } catch(e) { toast(e.message, 'error'); }
    });
  });
  // Profile color picker handled by showColorPicker inline onclick
  // Profile
  document.querySelectorAll('.color-pick').forEach(el => {
    el.addEventListener('click', async () => {
      S.user.avatar_color = el.dataset.color;
      await API.put('/auth/profile-update', { avatar_color: el.dataset.color });
      refreshBody();
    });
  });
  document.getElementById('save-profile-btn')?.addEventListener('click', async () => {
    try {
      const name = document.getElementById('p-name')?.value?.trim();
      const newEmail = document.getElementById('p-email')?.value?.trim();
      const emailChanged = newEmail && newEmail !== S.user.email;
      const payload = { name, avatar_color: toHex(S.user.avatar_color) || '#6366f1' };
      if (emailChanged) payload.email = newEmail;
      await API.put('/auth/profile-update', payload);
      S.user.name = name;
      if (emailChanged) {
        S.user.email = newEmail;
        toast('Profile saved! Use new email to sign in next time. 📧');
      } else {
        toast('Profile saved! ✅');
      }
      refreshBody();
    } catch(e) { toast(e.message || 'Failed to save profile', 'error'); }
  });
  document.getElementById('change-pass-btn')?.addEventListener('click', async () => {
    try {
      await API.post('/auth/change-password', {
        current_password: document.getElementById('cur-pass').value,
        new_password: document.getElementById('new-pass').value,
      });
      toast('Password updated!');
    } catch(e) { toast(e.message, 'error'); }
  });
  // Reactions


  // TOC + Syntax highlighting - build after render
  setTimeout(() => {
    buildTOC();
    // Apply syntax highlighting to article content
    const articleContent = document.querySelector('.article-content');
    if (articleContent && window.SyntaxHL) {
      SyntaxHL.applyToContainer(articleContent);
      addCopyButtons(articleContent);
    }
  }, 100);

  // Article lock
  if (S.page === 'read' && S.currentArticle) {
    ArticleLock.start(S.currentArticle.id);
  } else {
    ArticleLock.stop();
  }

  // Tags page
  document.getElementById('add-tag-page-btn')?.addEventListener('click', async () => {
    const name = await showPrompt({ title: 'New Tag', message: 'Enter tag name:', placeholder: 'e.g. regression', confirmText: 'Create' });
    if (!name?.trim()) return;
    try {
      const newTag = await API.post('/articles/tags', { name: name.trim() });
      S.tags = await API.get('/articles/tags');
      refreshBody();
      toast('Tag created! 🏷️');
    } catch(e) { toast('Failed to create tag', 'error'); }
  });

  document.querySelectorAll('.edit-tag-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = parseInt(btn.dataset.tagId);
      const current = btn.dataset.tagName;
      const name = await showPrompt({ title: 'Edit Tag', message: 'Enter new tag name:', defaultValue: current, confirmText: 'Save' });
      if (!name?.trim() || name.trim() === current) return;
      try {
        await API.put('/articles/tags/' + id, { name: name.trim() });
        S.tags = await API.get('/articles/tags');
        refreshBody();
        toast('Tag updated!');
      } catch(e) { toast(e.message || 'Failed to update tag', 'error'); }
    });
  });

  document.querySelectorAll('.del-tag-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = parseInt(btn.dataset.tagId);
      const name = btn.dataset.tagName;
      const ok = await showConfirm({ title: 'Delete Tag', message: `Delete tag "${name}"? It will be removed from all articles.`, confirmText: 'Delete', danger: true });
      if (!ok) return;
      try {
        await API.del('/articles/tags/' + id);
        S.tags = await API.get('/articles/tags');
        refreshBody();
        toast('Tag deleted');
      } catch(e) { toast('Failed to delete tag', 'error'); }
    });
  });

  // Visibility selector
  document.querySelectorAll('.vis-label').forEach(label => {
    label.addEventListener('click', () => {
      const slug = label.dataset.slug;
      if (slug === 'all') {
        document.querySelectorAll('.vis-label').forEach(l => {
          const cb = l.querySelector('input'); const isAll = l.dataset.slug === 'all';
          if (cb) cb.checked = isAll;
          l.style.background = isAll ? 'var(--accent-light)' : 'var(--surface)';
          l.style.color = isAll ? 'var(--accent)' : 'var(--text2)';
        });
      } else {
        const allLabel = document.querySelector('.vis-label[data-slug="all"]');
        const allCb = document.getElementById('vis-all');
        if (allCb) allCb.checked = false;
        if (allLabel) { allLabel.style.background = 'var(--surface)'; allLabel.style.color = 'var(--text2)'; }
        const cb = document.getElementById('vis-' + slug);
        if (cb) { cb.checked = !cb.checked; label.style.background = cb.checked ? 'var(--accent-light)' : 'var(--surface)'; label.style.color = cb.checked ? 'var(--accent)' : 'var(--text2)'; }
        const anyChecked = [...document.querySelectorAll('.vis-label:not([data-slug="all"]) input')].some(c => c.checked);
        if (!anyChecked && allCb) { allCb.checked = true; if (allLabel) { allLabel.style.background = 'var(--accent-light)'; allLabel.style.color = 'var(--accent)'; } }
      }
    });
  });

  // Announcement
  document.getElementById('set-announcement-btn')?.addEventListener('click', () => {
    showAnnouncementEditor();
  });
  document.getElementById('clear-announcement')?.addEventListener('click', async () => {
    await API.put('/dashboard/announcement', { message: '' });
    S.announcement = ''; refreshBody(); toast('Announcement cleared');
  });

  // Editor
  bindEditorEvents();
}

function bindEditorEvents() {
  if (document.getElementById('rte-container')) {
    const initialContent = S.editingArticle?.content || '';
    Editor.init('rte-container', initialContent, (val) => { S._editorContent = val; }, S.token);
  }
  document.querySelectorAll('#tag-picker .tag').forEach(el => {
    el.addEventListener('click', () => el.classList.toggle('selected'));
  });

  // Add new tag inline
  document.getElementById('add-tag-btn')?.addEventListener('click', async (e) => {
    e.stopPropagation();
    const name = await showPrompt({ title: 'New Tag', message: 'Enter tag name:', placeholder: 'e.g. robot-framework', confirmText: 'Create' });
    if (!name?.trim()) return;
    try {
      const newTag = await API.post('/articles/tags', { name: name.trim() });
      if (!S.tags) S.tags = [];
      if (!S.tags.find(t => t.id === newTag.id)) S.tags.push(newTag);
      const picker = document.getElementById('tag-picker');
      if (picker) {
        const selected = [...picker.querySelectorAll('.tag.selected')].map(el => parseInt(el.dataset.tagId));
        selected.push(newTag.id);
        picker.innerHTML = S.tags.map(t =>
          '<span class="tag ' + (selected.includes(t.id) ? 'selected' : '') + '" data-tag-id="' + t.id + '">' + esc(t.name) + '</span>'
        ).join('') + '<span id="add-tag-btn" style="display:inline-flex;align-items:center;gap:4px;padding:2px 10px;border-radius:4px;border:1px dashed var(--border);font-size:12px;color:var(--text3);cursor:pointer">+ New Tag</span>';
        picker.querySelectorAll('.tag').forEach(el => el.addEventListener('click', () => el.classList.toggle('selected')));
        // Rebind add-tag-btn
        picker.querySelector('#add-tag-btn')?.addEventListener('click', arguments.callee);
      }
      toast('Tag created! 🏷️');
    } catch(e) { toast('Failed to create tag', 'error'); }
  });

  document.getElementById('save-draft-btn')?.addEventListener('click', () => saveArticle('draft'));
  document.getElementById('publish-article-btn')?.addEventListener('click', () => saveArticle('published'));
  const backBtn = document.getElementById('back-btn');
  if (backBtn) backBtn.onclick = () => {
    if (S.editingArticle?.id) { ArticleLock.release(S.editingArticle.id); navigateTo('read', { articleId: S.editingArticle.id }); }
    else navigateTo('all');
  };
}

async function saveArticle(status) {
  const title = document.getElementById('e-title')?.value?.trim();
  if (!title) { toast('Title is required', 'error'); return; }
  const tagIds = [...document.querySelectorAll('#tag-picker .tag.selected')].map(el => parseInt(el.dataset.tagId));
  const content = (typeof Editor !== 'undefined' && Editor.getValue) ? Editor.getValue() : (S._editorContent || '');
  // Get visibility
  const allChecked = document.getElementById('vis-all')?.checked;
  let visibility = 'all';
  console.log('[visibility] vis-all checked:', allChecked);
  console.log('[visibility] all vis inputs:', [...document.querySelectorAll('.vis-label input')].map(i => i.id + '=' + i.checked));
  if (!allChecked) {
    const selected = [...document.querySelectorAll('.vis-label:not([data-slug="all"]) input')]
      .filter(c => c.checked).map(c => c.id.replace('vis-', ''));
    visibility = selected.length > 0 ? selected.join(',') : 'all';
  }
  console.log('[visibility] final value:', visibility);
  const payload = {
    title,
    content,
    visibility,
    review_due_date: document.getElementById('e-review-date')?.value || '',
    excerpt: document.getElementById('e-excerpt')?.value || '',
    content_type: document.getElementById('e-type')?.value || 'article',
    category_id: document.getElementById('e-cat')?.value || null,
    is_pinned: document.getElementById('e-pin')?.value === 'true',
    status,
    tag_ids: tagIds,
    change_summary: document.getElementById('e-summary')?.value || (status === 'published' ? 'Published' : 'Saved draft'),
  };
  try {
    let saved;
    if (S.editingArticle?.id) saved = await API.put(`/articles/${S.editingArticle.id}`, payload);
    else saved = await API.post('/articles', payload);
    toast(status === 'published' ? 'Published! 🚀' : 'Draft saved! 💾');
    if (S.editingArticle?.id) ArticleLock.release(S.editingArticle.id);
    await loadMeta();
    navigateTo('read', { articleId: saved.id });
  } catch(e) { toast(e.message, 'error'); }
}

function bindLoginEvents() {
  document.getElementById('login-btn')?.addEventListener('click', doLogin);
  document.getElementById('l-pass')?.addEventListener('keypress', e => { if (e.key === 'Enter') doLogin(); });
}

async function doLogin() {
  showPageLoader('Signing in...');
  try {
    const data = await API.post('/auth/login', {
      email: document.getElementById('l-email').value,
      password: document.getElementById('l-pass').value,
    });
    S.user = data.user; S.token = data.token;
    S.page = 'home'; S.currentArticle = null; S.currentCategoryId = null;
    localStorage.setItem('wiki_token', data.token);
    await Promise.all([loadDashboard(), loadMeta(), loadPermissions()]);
    hidePageLoader();
    render();
    // Show announcement modal if unacknowledged
    if (S.announcement && S.announcementId) {
      const acked = localStorage.getItem('wiki_ack_announcement');
      console.log('[announcement] id:', S.announcementId, 'acked:', acked, 'match:', acked === String(S.announcementId));
      if (acked !== String(S.announcementId)) {
        setTimeout(() => showAnnouncementModal(S.announcement, S.announcementId), 600);
      }
    }
  } catch(e) { hidePageLoader(); S.loginError = e.message; render(); }
}

function debounce(fn, ms) {
  let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}


// ─── SEARCH HIGHLIGHT ────────────────────────────────────────────────────────
function highlight(text, query) {
  if (!query || query.length < 2) return text;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return text.replace(new RegExp('(' + escaped + ')', 'gi'),
    '<mark style="background:var(--yellow-light);color:var(--yellow);border-radius:2px;padding:0 2px">$1</mark>');
}

// ─── TABLE OF CONTENTS ───────────────────────────────────────────────────────
function buildTOC() {
  const tocList = document.getElementById('toc-list');
  if (!tocList) return;
  const content = document.querySelector('.article-content');
  if (!content) return;
  const headings = content.querySelectorAll('h1, h2, h3');
  if (headings.length < 2) { document.getElementById('toc-section')?.style && (document.getElementById('toc-section').style.display = 'none'); return; }
  tocList.innerHTML = '';
  headings.forEach((h, i) => {
    h.id = 'heading-' + i;
    const level = parseInt(h.tagName[1]);
    const item = document.createElement('a');
    item.href = '#heading-' + i;
    item.textContent = h.textContent;
    item.style.cssText = 'font-size:12px;color:var(--text2);text-decoration:none;padding:3px 0 3px ' + ((level-1)*12) + 'px;display:block;border-left:2px solid transparent;padding-left:' + (8+(level-1)*12) + 'px;transition:all 0.1s;line-height:1.4;';
    item.addEventListener('click', e => { e.preventDefault(); h.scrollIntoView({behavior:'smooth',block:'start'}); });
    item.addEventListener('mouseover', () => { item.style.color='var(--accent)'; item.style.borderLeftColor='var(--accent)'; });
    item.addEventListener('mouseout', () => { item.style.color='var(--text2)'; item.style.borderLeftColor='transparent'; });
    tocList.appendChild(item);
  });
}

// ─── ARTICLE LOCK ─────────────────────────────────────────────────────────────
const ArticleLock = {
  _interval: null,
  _articleId: null,
  start(articleId) {
    this._articleId = articleId;
    this.check();
    this._interval = setInterval(() => this.check(), 15000);
  },
  stop() { clearInterval(this._interval); this._articleId = null; },
  async check() {
    if (!this._articleId) return;
    try {
      const data = await API.get('/articles/' + this._articleId + '/lock-status');
      const banner = document.getElementById('article-lock-banner');
      if (!banner) return;
      if (data.locked_by && data.locked_by.id !== S.user?.id) {
        banner.innerHTML = '<div style="background:var(--yellow-light);border:1px solid var(--yellow);border-radius:var(--radius);padding:8px 14px;margin-bottom:14px;font-size:13px;color:var(--yellow);display:flex;align-items:center;gap:8px"><span>✏️</span> <strong>' + esc(data.locked_by.name) + '</strong> is currently editing this article</div>';
      } else { banner.innerHTML = ''; }
    } catch(e) {}
  },
  async acquire(articleId) {
    try { await API.post('/articles/' + articleId + '/lock'); } catch(e) {}
  },
  async release(articleId) {
    try { await API.del('/articles/' + articleId + '/lock'); } catch(e) {}
    this.stop();
  }
};


// ─── CODE COPY BUTTONS ───────────────────────────────────────────────────────
function addCopyButtons(container) {
  container.querySelectorAll('pre.code-block').forEach(pre => {
    if (pre.querySelector('.code-copy-btn')) return; // already added
    if (!pre.parentElement.classList.contains('code-block-wrapper')) {
      const wrapper = document.createElement('div');
      wrapper.className = 'code-block-wrapper';
      pre.parentNode.insertBefore(wrapper, pre);
      wrapper.appendChild(pre);
    }
    const btn = document.createElement('button');
    btn.className = 'code-copy-btn';
    btn.textContent = 'Copy';
    btn.addEventListener('click', async () => {
      const code = pre.querySelector('code')?.innerText || pre.innerText;
      try {
        await navigator.clipboard.writeText(code);
        btn.textContent = 'Copied!';
        btn.classList.add('copied');
        setTimeout(() => { btn.textContent = 'Copy'; btn.classList.remove('copied'); }, 2000);
      } catch(e) {
        // Fallback for older browsers
        const ta = document.createElement('textarea');
        ta.value = code;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        btn.textContent = 'Copied!';
        setTimeout(() => { btn.textContent = 'Copy'; }, 2000);
      }
    });
    pre.appendChild(btn);
  });
}


// ─── ANNOUNCEMENT FUNCTIONS ───────────────────────────────────────────────────

function showAnnouncementEditor() {
  const current = S.announcement || '';
  const root = document.getElementById('modal-root');
  _modalOpen = true;

  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;z-index:9999;padding:20px;animation:overlayIn 0.18s ease';

  const box = document.createElement('div');
  box.style.cssText = 'background:var(--surface);border-radius:12px;width:100%;max-width:560px;box-shadow:0 20px 60px rgba(0,0,0,0.25);border:1px solid var(--border);animation:modalIn 0.2s cubic-bezier(0.34,1.56,0.64,1);display:flex;flex-direction:column';

  box.innerHTML = `
    <div style="padding:20px 24px 16px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between">
      <div>
        <div style="font-size:16px;font-weight:600;color:var(--text)">📢 Post Announcement</div>
        <div style="font-size:12px;color:var(--text3);margin-top:3px">Shown as a banner to all users on their next login</div>
      </div>
      <button id="ann-close-btn" style="background:none;border:none;font-size:18px;cursor:pointer;color:var(--text3);padding:4px 8px">✕</button>
    </div>
    <div style="padding:20px 24px">
      <div style="margin-bottom:12px">
        <label style="font-size:12px;font-weight:600;color:var(--text2);text-transform:uppercase;letter-spacing:0.05em">Announcement</label>
        <textarea id="ann-text" rows="4" placeholder="e.g. System maintenance tonight at 9PM. All users will be logged out at 11PM." style="width:100%;margin-top:8px;padding:12px;border:1px solid var(--border);border-radius:var(--radius);background:var(--surface2);color:var(--text);font-size:14px;font-family:var(--font);line-height:1.6;resize:vertical;outline:none">${esc(current)}</textarea>
      </div>
      <div style="display:flex;align-items:center;gap:8px;padding:10px 12px;background:var(--yellow-light);border:1px solid var(--yellow);border-radius:var(--radius)">
        <span style="font-size:16px">💡</span>
        <span style="font-size:12px;color:var(--yellow)">Users will see a modal asking them to acknowledge the announcement on their next login.</span>
      </div>
    </div>
    <div style="padding:16px 24px;border-top:1px solid var(--border);display:flex;justify-content:space-between;align-items:center">
      <div>
        ${current ? `<button id="ann-clear-btn" class="btn" style="background:var(--red-light);color:var(--red);border:1px solid #f5b4b0;font-size:13px">🗑 Clear Announcement</button>` : ''}
      </div>
      <div style="display:flex;gap:10px">
        <button id="ann-cancel-btn" class="btn btn-secondary">Cancel</button>
        <button id="ann-post-btn" class="btn btn-primary">📢 Post</button>
      </div>
    </div>
  `;

  overlay.appendChild(box);
  root.innerHTML = '';
  root.appendChild(overlay);

  const close = () => {
    box.style.animation = 'modalOut 0.15s ease forwards';
    overlay.style.animation = 'overlayOut 0.15s ease forwards';
    setTimeout(() => { _modalOpen = false; root.innerHTML = ''; }, 150);
  };

  document.getElementById('ann-close-btn').onclick = close;
  document.getElementById('ann-cancel-btn').onclick = close;

  document.getElementById('ann-post-btn').onclick = async () => {
    const msg = document.getElementById('ann-text').value.trim();
    if (!msg) { toast('Please enter an announcement', 'error'); return; }
    const newId = Date.now();
    await API.put('/dashboard/announcement', { message: msg, id: newId });
    S.announcement = msg;
    S.announcementId = newId;
    close();
    refreshBody();
    toast('Announcement posted! 📢');
  };

  document.getElementById('ann-clear-btn')?.addEventListener('click', async () => {
    await API.put('/dashboard/announcement', { message: '', id: null });
    S.announcement = '';
    S.announcementId = null;
    close();
    refreshBody();
    toast('Announcement cleared');
  });

  // Focus textarea
  setTimeout(() => document.getElementById('ann-text')?.focus(), 100);

  setTimeout(() => {
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  }, 300);
}

function showAnnouncementModal(message, id) {
  // Don't show if already acknowledged
  if (localStorage.getItem('wiki_ack_announcement') === String(id)) return;

  const root = document.getElementById('modal-root');
  _modalOpen = true;

  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);display:flex;align-items:center;justify-content:center;z-index:9999;padding:20px;animation:overlayIn 0.25s ease';

  const box = document.createElement('div');
  box.style.cssText = 'background:var(--surface);border-radius:14px;width:100%;max-width:500px;box-shadow:0 24px 80px rgba(0,0,0,0.3);border:1px solid var(--border);animation:modalIn 0.25s cubic-bezier(0.34,1.56,0.64,1);overflow:hidden';

  box.innerHTML = `
    <div style="background:var(--yellow-light);border-bottom:2px solid var(--yellow);padding:20px 24px;display:flex;align-items:center;gap:14px">
      <div style="font-size:32px">📢</div>
      <div>
        <div style="font-size:15px;font-weight:700;color:var(--yellow)">Team Announcement</div>
        <div style="font-size:12px;color:var(--yellow);opacity:0.8;margin-top:2px">Please read before continuing</div>
      </div>
    </div>
    <div style="padding:24px">
      <div style="font-size:14px;color:var(--text);line-height:1.7;white-space:pre-wrap;word-break:break-word">${esc(message)}</div>
    </div>
    <div style="padding:16px 24px;border-top:1px solid var(--border);background:var(--bg2)">
      <label style="display:flex;align-items:center;gap:10px;cursor:pointer;margin-bottom:16px">
        <input type="checkbox" id="ann-ack-check" style="width:16px;height:16px;accent-color:var(--green);cursor:pointer">
        <span style="font-size:13px;color:var(--text2)">I have read and acknowledged this announcement</span>
      </label>
      <button id="ann-ack-btn" class="btn btn-primary" style="width:100%;justify-content:center;opacity:0.4;pointer-events:none">Continue</button>
    </div>
  `;

  overlay.appendChild(box);
  root.innerHTML = '';
  root.appendChild(overlay);

  // Enable button only when checkbox is checked
  const checkbox = document.getElementById('ann-ack-check');
  const ackBtn = document.getElementById('ann-ack-btn');

  checkbox.addEventListener('change', () => {
    ackBtn.style.opacity = checkbox.checked ? '1' : '0.4';
    ackBtn.style.pointerEvents = checkbox.checked ? 'auto' : 'none';
  });

  ackBtn.addEventListener('click', () => {
    if (!checkbox.checked) return;
    localStorage.setItem('wiki_ack_announcement', String(id));
    box.style.animation = 'modalOut 0.2s ease forwards';
    overlay.style.animation = 'overlayOut 0.2s ease forwards';
    setTimeout(() => {
      _modalOpen = false;
      root.innerHTML = '';
      // Now show the yellow banner
      if (S.page === 'home') refreshBody();
    }, 200);
  });
}


// ─── CUSTOM COLOR PICKER ──────────────────────────────────────────────────────
function toHex(color) {
  if (!color) return '#6366f1';
  color = String(color).trim();
  if (color.startsWith('#')) return color.slice(0, 7);
  const m = color.match(/rgb\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (m) return '#' + [m[1],m[2],m[3]].map(n => parseInt(n).toString(16).padStart(2,'0')).join('');
  return color;
}
function showColorPicker(anchorId, currentColor, onSelect) {
  currentColor = toHex(currentColor);
  const existing = document.getElementById('custom-color-picker');
  if (existing) { existing.remove(); return; }

  const swatches = [
    '#ffffff','#e2e8f0','#94a3b8','#64748b','#334155','#1e293b','#0f172a',
    '#fecaca','#fde68a','#bbf7d0','#a7f3d0','#bfdbfe','#c7d2fe','#f9a8d4',
    '#f87171','#fbbf24','#34d399','#10b981','#60a5fa','#818cf8','#f472b6',
    '#ef4444','#f59e0b','#10b981','#06b6d4','#3b82f6','#6366f1','#ec4899',
    '#dc2626','#d97706','#059669','#0891b2','#2563eb','#4f46e5','#db2777',
    '#b91c1c','#b45309','#047857','#0e7490','#1d4ed8','#4338ca','#be185d',
    '#7f1d1d','#78350f','#064e3b','#164e63','#1e3a8a','#312e81','#831843',
  ];

  const picker = document.createElement('div');
  picker.id = 'custom-color-picker';
  picker.style.cssText = `
    position:fixed;z-index:99999;background:var(--surface);border:1px solid var(--border);
    border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,0.2);padding:16px;width:260px;
    animation:modalIn 0.15s ease
  `;

  // Position near anchor
  const anchor = document.getElementById(anchorId);
  if (anchor) {
    const rect = anchor.getBoundingClientRect();
    picker.style.top = (rect.bottom + 8) + 'px';
    picker.style.left = Math.min(rect.left, window.innerWidth - 276) + 'px';
  } else {
    picker.style.top = '50%'; picker.style.left = '50%';
    picker.style.transform = 'translate(-50%,-50%)';
  }

  let selected = currentColor || '#6366f1';

  picker.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px;margin-bottom:12px">
      ${swatches.map(c => `
        <div data-color="${c}" style="width:28px;height:28px;border-radius:6px;background:${c};cursor:pointer;border:2px solid ${c===selected?'var(--text)':'transparent'};transition:border-color 0.1s;flex-shrink:0"
          title="${c}"></div>`).join('')}
    </div>
    <div style="display:flex;align-items:center;gap:8px;padding:10px;background:var(--bg2);border-radius:8px;border:1px solid var(--border)">
      <div id="cp-preview" style="width:32px;height:32px;border-radius:50%;background:${selected};border:2px solid var(--border);flex-shrink:0"></div>
      <div style="display:flex;align-items:center;gap:6px;flex:1">
        <span style="font-size:13px;color:var(--text3);font-family:var(--mono)">#</span>
        <input id="cp-hex-input" type="text" value="${selected.replace('#','')}" maxlength="6"
          style="flex:1;border:none;background:transparent;font-size:13px;font-family:var(--mono);color:var(--text);outline:none;width:70px">
      </div>
      <input type="color" id="cp-native" value="${selected}" style="width:28px;height:28px;border:none;background:none;cursor:pointer;padding:0;border-radius:4px">
    </div>
    <button id="cp-apply" class="btn btn-primary" style="width:100%;justify-content:center;margin-top:10px">Apply</button>
  `;

  document.body.appendChild(picker);

  // Swatch click
  picker.querySelectorAll('[data-color]').forEach(sw => {
    sw.addEventListener('click', () => {
      selected = sw.dataset.color;
      picker.querySelectorAll('[data-color]').forEach(s => s.style.border = '2px solid ' + (s.dataset.color===selected?'var(--text)':'transparent'));
      document.getElementById('cp-preview').style.background = selected;
      document.getElementById('cp-hex-input').value = selected.replace('#','');
      document.getElementById('cp-native').value = selected;
    });
  });

  // Hex input
  document.getElementById('cp-hex-input').addEventListener('input', (e) => {
    const val = '#' + e.target.value.replace(/[^0-9a-fA-F]/g,'');
    if (val.length === 7) {
      selected = val;
      document.getElementById('cp-preview').style.background = val;
      document.getElementById('cp-native').value = val;
    }
  });

  // Native color input
  document.getElementById('cp-native').addEventListener('input', (e) => {
    selected = e.target.value;
    document.getElementById('cp-preview').style.background = selected;
    document.getElementById('cp-hex-input').value = selected.replace('#','');
  });

  // Apply
  document.getElementById('cp-apply').addEventListener('click', () => {
    onSelect(selected);
    picker.remove();
  });

  // Click outside to close
  setTimeout(() => {
    document.addEventListener('click', function closePicker(e) {
      if (!picker.contains(e.target) && e.target.id !== anchorId) {
        picker.remove();
        document.removeEventListener('click', closePicker);
      }
    });
  }, 200);
}

// ─── BOOT ─────────────────────────────────────────────────────────────────────
function initDarkMode() {
  const saved = localStorage.getItem('wiki_dark');
  S.darkMode = saved === 'true' || (saved === null && window.matchMedia('(prefers-color-scheme: dark)').matches);
  applyDarkMode();
}
function applyDarkMode() {
  document.documentElement.classList.add('theme-transitioning');
  document.documentElement.setAttribute('data-theme', S.darkMode ? 'dark' : 'light');
  localStorage.setItem('wiki_dark', S.darkMode);
  setTimeout(() => document.documentElement.classList.remove('theme-transitioning'), 200);
}
function toggleDarkMode() {
  S.darkMode = !S.darkMode;
  applyDarkMode();
  // Update toggle visually without full re-render
  const toggle = document.getElementById('dark-toggle');
  if (toggle) {
    toggle.style.background = S.darkMode ? 'var(--accent)' : 'var(--border)';
    if (toggle.firstElementChild) toggle.firstElementChild.style.left = S.darkMode ? '16px' : '2px';
  }
  // Update mobile toggle text/icon
  const mobileTgl = document.getElementById('mobile-dark-toggle');
  if (mobileTgl) mobileTgl.innerHTML = `<span class="nav-icon">${S.darkMode ? '☀️' : '🌙'}</span><span>${S.darkMode ? 'Light' : 'Dark'}</span>`;

}

async function boot() {
  initDarkMode();
  const token = localStorage.getItem('wiki_token');
  if (token) {
    S.token = token;
    try {
      S.user = await API.get('/auth/me');
      S.page = 'home'; S.currentArticle = null; S.currentCategoryId = null;
      await Promise.all([loadDashboard(), loadMeta(), loadPermissions()]);
    } catch { S.token = null; localStorage.removeItem('wiki_token'); }
  }
  const ls = document.getElementById('loading-screen');
  if (ls) { ls.style.opacity = '0'; setTimeout(() => ls.remove(), 300); }
  render();
  // Show announcement modal on restore if unacknowledged
  if (S.announcement && S.announcementId) {
    const acked = localStorage.getItem('wiki_ack_announcement');
    if (acked !== String(S.announcementId)) {
      setTimeout(() => showAnnouncementModal(S.announcement, S.announcementId), 800);
    }
  }
}

boot();
