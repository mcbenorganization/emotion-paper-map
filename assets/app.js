(() => {
  "use strict";
  const catalog = window.PAPER_CATALOG;
  if (!catalog) {
    document.body.innerHTML = '<p style="padding:3rem">数据未生成，请运行 scripts/build_site.py。</p>';
    return;
  }

  const papers = catalog.papers;
  const schools = catalog.schools;
  const schoolMap = Object.fromEntries(schools.map(item => [item.id, item]));
  const els = Object.fromEntries([
    "search", "school-filter", "year-filter", "status-filter", "sort-order", "paper-list",
    "result-summary", "active-filters", "empty-state", "clear-filters", "school-grid",
    "paper-count", "school-count", "year-range", "reviewed-count", "updated-at", "theme-toggle",
    "weekly-updates"
  ].map(id => [id, document.getElementById(id)]));

  const escapeHtml = value => String(value ?? "").replace(/[&<>'"]/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
  })[char]);

  function option(select, value, label) {
    const node = document.createElement("option");
    node.value = value;
    node.textContent = label;
    select.appendChild(node);
  }

  const years = [...new Set(papers.map(p => p.year).filter(Boolean))].sort((a, b) => b - a);
  const statuses = [...new Set(papers.map(p => p.review_status))];
  schools.filter(s => s.id !== "unclassified" || papers.some(p => p.primary_school === s.id))
    .forEach(s => option(els["school-filter"], s.id, s.name));
  years.forEach(year => option(els["year-filter"], String(year), String(year)));
  statuses.forEach(status => option(els["status-filter"], status, status));

  els["paper-count"].textContent = papers.length;
  els["school-count"].textContent = new Set(papers.map(p => p.primary_school)).size;
  els["year-range"].textContent = years.length ? `${Math.min(...years)}–${Math.max(...years)}` : "—";
  els["reviewed-count"].textContent = papers.filter(p => p.review_status !== "待核验").length;
  els["updated-at"].textContent = `最近更新 · ${catalog.meta.last_updated} · Review status: provisional`;

  function renderSchools() {
    const counts = Object.fromEntries(schools.map(s => [s.id, papers.filter(p => p.primary_school === s.id).length]));
    els["school-grid"].innerHTML = schools.filter(s => counts[s.id] > 0).map((school, index) => `
      <article class="school-card" data-index="${String(index + 1).padStart(2, "0")}">
        <span class="school-count">${counts[school.id]} 篇</span>
        <h3>${escapeHtml(school.name)}</h3>
        <p>${escapeHtml(school.definition)}</p>
        <button type="button" data-school="${escapeHtml(school.id)}">查看该派别 →</button>
      </article>`).join("");
    els["school-grid"].querySelectorAll("button[data-school]").forEach(button => {
      button.addEventListener("click", () => {
        els["school-filter"].value = button.dataset.school;
        renderPapers();
        document.getElementById("papers").scrollIntoView();
      });
    });
  }

  function matches(paper) {
    const query = els.search.value.trim().toLocaleLowerCase("zh-CN");
    const haystack = [paper.title, ...paper.authors, paper.venue, paper.task, paper.problem, paper.approach].join(" ").toLocaleLowerCase("zh-CN");
    return (!query || haystack.includes(query))
      && (!els["school-filter"].value || [paper.primary_school, ...paper.secondary_schools].includes(els["school-filter"].value))
      && (!els["year-filter"].value || String(paper.year) === els["year-filter"].value)
      && (!els["status-filter"].value || paper.review_status === els["status-filter"].value);
  }

  function paperCard(paper) {
    const school = schoolMap[paper.primary_school] || {name: "待分类"};
    const authors = paper.authors.length ? paper.authors.slice(0, 4).join(" · ") + (paper.authors.length > 4 ? " 等" : "") : "作者待核验";
    const classificationLabel = paper.classification_origin === "manual" ? "分类：人工核验" : "分类：规则初分";
    const summaryLabel = paper.summary_origin === "abstract-evidence-plus-analyst-inference"
      ? "摘要证据 + 分析者归纳" : (paper.evidence_level === "metadata-only" ? "仅元数据" : "人工摘要卡片");
    const sourceLine = paper.source
      ? `<a href="${escapeHtml(paper.source)}" target="_blank" rel="noreferrer">${escapeHtml(paper.source_kind)} ↗</a>`
      : "公开来源待补";
    return `<article class="paper-card">
      <div class="paper-year">${paper.year || "TBD"}</div>
      <div>
        <h3 class="paper-title"><a href="${escapeHtml(paper.detail_url)}">${escapeHtml(paper.title)}</a></h3>
        <div class="paper-meta"><span>${escapeHtml(authors)}</span><span>${escapeHtml(paper.venue)}</span></div>
        <div class="paper-meta"><span class="tag">${escapeHtml(school.name)}</span><span class="tag status">${escapeHtml(paper.review_status)}</span><span class="tag provenance">${escapeHtml(classificationLabel)}</span><span>${escapeHtml(paper.task)}</span></div>
        <div class="paper-summary">
          <div><strong>PROBLEM · 解决什么</strong><p>${escapeHtml(paper.problem)}</p></div>
          <div><strong>APPROACH · 大致思路</strong><p>${escapeHtml(paper.approach)}</p></div>
        </div>
        <p class="paper-detail-link"><a href="${escapeHtml(paper.detail_url)}">查看动机图、方法图与论文详情 →</a></p>
        <details>
          <summary>查看证据边界与摘要原句</summary>
          <p class="evidence-level">内容来源：${escapeHtml(summaryLabel)}。自动分类和分析者归纳均待全文复核。</p>
          <blockquote class="evidence"><strong>问题证据：</strong>“${escapeHtml(paper.problem_quote || paper.evidence_quote || "尚无摘要证据，待人工核验。") }”<br>${escapeHtml(paper.problem_translation || paper.evidence_translation || "")}</blockquote>
          ${paper.approach_quote ? `<blockquote class="evidence"><strong>方法证据：</strong>“${escapeHtml(paper.approach_quote)}”<br>${escapeHtml(paper.approach_translation || "")}</blockquote>` : ""}
          <p>来源：${sourceLine} · 语料状态：${escapeHtml(paper.evidence_level)}</p>
        </details>
      </div>
    </article>`;
  }

  function renderWeeklyUpdates() {
    const updates = catalog.meta.weekly_updates || [];
    els["weekly-updates"].innerHTML = updates.length ? updates.map((update, index) => `
      <article class="update-entry ${index === 0 ? "latest" : ""}">
        <div class="update-date"><time datetime="${escapeHtml(update.date)}">${escapeHtml(update.date)}</time>${index === 0 ? "<span>最新</span>" : ""}</div>
        <div><h3>${escapeHtml(update.title)}</h3><ul>${update.items.map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ul></div>
      </article>`).join("") : "<p>暂无周更记录。</p>";
  }

  function renderPapers() {
    const result = papers.filter(matches);
    const order = els["sort-order"].value;
    result.sort((a, b) => order === "title" ? a.title.localeCompare(b.title) : order === "oldest" ? (a.year || 9999) - (b.year || 9999) : (b.year || 0) - (a.year || 0));
    els["paper-list"].innerHTML = result.map(paperCard).join("");
    els["result-summary"].textContent = `显示 ${result.length} / ${papers.length} 篇`;
    els["empty-state"].hidden = result.length !== 0;

    const labels = [];
    if (els.search.value.trim()) labels.push(`关键词：${els.search.value.trim()}`);
    if (els["school-filter"].value) labels.push(`派别：${schoolMap[els["school-filter"].value].name}`);
    if (els["year-filter"].value) labels.push(`年份：${els["year-filter"].value}`);
    if (els["status-filter"].value) labels.push(`状态：${els["status-filter"].value}`);
    els["active-filters"].innerHTML = labels.map(label => `<span class="filter-chip">${escapeHtml(label)}</span>`).join("");
  }

  ["search", "school-filter", "year-filter", "status-filter", "sort-order"].forEach(id => {
    els[id].addEventListener(id === "search" ? "input" : "change", renderPapers);
  });
  els["clear-filters"].addEventListener("click", () => {
    ["search", "school-filter", "year-filter", "status-filter"].forEach(id => { els[id].value = ""; });
    renderPapers();
  });

  const preferred = localStorage.getItem("paper-theme") || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  document.documentElement.dataset.theme = preferred;
  els["theme-toggle"].addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    localStorage.setItem("paper-theme", next);
  });

  renderSchools();
  renderPapers();
  renderWeeklyUpdates();
})();
