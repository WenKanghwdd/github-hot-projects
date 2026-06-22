const state = {
  range: "day",
  language: "",
  repos: [],
  selected: null,
  translations: new Map(),
};

const rangeConfig = {
  day: { label: "今日", days: 1 },
  week: { label: "本周", days: 7 },
  month: { label: "本月", days: 30 },
};

const els = {
  grid: document.querySelector("#repoGrid"),
  tabs: document.querySelectorAll(".tab"),
  language: document.querySelector("#languageSelect"),
  refresh: document.querySelector("#refreshBtn"),
  statusTitle: document.querySelector("#statusTitle"),
  statusText: document.querySelector("#statusText"),
  metricCount: document.querySelector("#metricCount"),
  metricStars: document.querySelector("#metricStars"),
  metricLang: document.querySelector("#metricLang"),
  drawer: document.querySelector("#detailDrawer"),
  drawerContent: document.querySelector("#drawerContent"),
};

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function sinceDate(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return formatDate(d);
}

function compactNumber(num = 0) {
  return Intl.NumberFormat("zh-CN", { notation: "compact", maximumFractionDigits: 1 }).format(num);
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function setStatus(title, text) {
  els.statusTitle.textContent = title;
  els.statusText.textContent = text;
}

function showSkeleton() {
  els.grid.innerHTML = Array.from({ length: 9 }, () => `
    <article class="repo-card skeleton">
      <div class="skeleton-line wide"></div>
      <div class="skeleton-line"></div>
      <div class="skeleton-line"></div>
      <div class="skeleton-line short"></div>
    </article>
  `).join("");
}

async function fetchTrendingRepos() {
  const cfg = rangeConfig[state.range];
  const created = sinceDate(cfg.days);
  const languageQuery = state.language ? ` language:${state.language}` : "";
  const query = `created:>${created}${languageQuery}`;
  const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&sort=stars&order=desc&per_page=24`;

  setStatus("同步中", `正在扫描 GitHub ${cfg.label}创建的热门项目…`);
  showSkeleton();

  try {
    const res = await fetch(url, {
      headers: { Accept: "application/vnd.github+json" },
    });

    if (!res.ok) {
      if (res.status === 403) throw new Error("GitHub API 速率限制已触发，请稍后再试，或在代码中添加 token。未登录请求通常每小时 60 次。 ");
      throw new Error(`GitHub API 返回 ${res.status}`);
    }

    const data = await res.json();
    state.repos = data.items || [];
    setStatus("同步完成", `已获取 ${state.repos.length} 个 ${cfg.label}热门项目，按 Star 降序排列。`);
    renderMetrics();
    renderRepos();
  } catch (error) {
    els.grid.innerHTML = `<div class="error"><strong>无法获取实时数据</strong><p>${escapeHtml(error.message)}</p><p>如果你直接从本地文件打开，浏览器通常允许访问 GitHub API；若所在网络限制 GitHub，请换网络或把项目部署到静态站点。</p></div>`;
    setStatus("同步失败", error.message);
    renderMetrics(true);
  }
}

function renderMetrics(reset = false) {
  if (reset || state.repos.length === 0) {
    els.metricCount.textContent = "--";
    els.metricStars.textContent = "--";
    els.metricLang.textContent = "--";
    return;
  }

  const topStars = Math.max(...state.repos.map(repo => repo.stargazers_count || 0));
  const languageCounts = state.repos.reduce((acc, repo) => {
    const lang = repo.language || "未知";
    acc[lang] = (acc[lang] || 0) + 1;
    return acc;
  }, {});
  const topLang = Object.entries(languageCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "未知";

  els.metricCount.textContent = state.repos.length;
  els.metricStars.textContent = compactNumber(topStars);
  els.metricLang.textContent = topLang;
}

function looksEnglish(text = "") {
  const letters = (text.match(/[A-Za-z]/g) || []).length;
  const chinese = (text.match(/[一-龥]/g) || []).length;
  return letters > 18 && chinese === 0;
}

function getChineseSummary(repo) {
  const desc = repo.description || "该项目暂未提供英文简介。";
  return `这是一个由 ${repo.owner.login} 维护的开源项目。原始简介为：“${desc}” 你可以重点关注它解决的问题、近期 Star 增长速度，以及 README 中是否提供清晰的安装与示例。`;
}

function localFallbackTranslation(text = "") {
  const glossary = [
    ["AI", "人工智能"],
    ["agent", "智能体"],
    ["agents", "智能体"],
    ["framework", "框架"],
    ["library", "库"],
    ["tool", "工具"],
    ["tools", "工具"],
    ["open source", "开源"],
    ["model", "模型"],
    ["models", "模型"],
    ["database", "数据库"],
    ["server", "服务器"],
    ["client", "客户端"],
    ["web", "网页"],
    ["app", "应用"],
    ["application", "应用"],
    ["developer", "开发者"],
    ["API", "API 接口"],
    ["workflow", "工作流"],
    ["automation", "自动化"],
    ["build", "构建"],
    ["deploy", "部署"],
    ["testing", "测试"],
    ["security", "安全"],
    ["privacy", "隐私"],
    ["fast", "快速"],
    ["simple", "简单"],
    ["modern", "现代化"],
    ["lightweight", "轻量级"],
  ];
  let translated = text;
  glossary.forEach(([source, target]) => {
    translated = translated.replace(new RegExp(`\\b${source}\\b`, "gi"), target);
  });
  if (translated === text) return `该英文简介的大意是：${text}`;
  return `机器辅助译文：${translated}`;
}

async function translateTextToChinese(text, repoId) {
  if (!text) return "该项目没有可翻译的简介。";
  if (state.translations.has(repoId)) return state.translations.get(repoId);

  try {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|zh-CN`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("翻译服务暂不可用");
    const data = await res.json();
    const translated = data?.responseData?.translatedText;
    if (!translated) throw new Error("翻译结果为空");
    state.translations.set(repoId, translated);
    return translated;
  } catch (error) {
    const fallback = localFallbackTranslation(text);
    state.translations.set(repoId, fallback);
    return fallback;
  }
}

function getProjectProfile(repo) {
  const lang = repo.language || "未标注语言";
  return [
    `定位：${repo.name} 是一个以 ${lang} 为主要技术栈的开源仓库，适合从“新项目热度”和“技术方向”两个角度观察。`,
    `核心功能：根据 GitHub 简介，它主要围绕“${repo.description || "暂无明确描述"}”展开。`,
    `适合人群：正在寻找新工具、学习样例、技术选型参考或竞品/趋势观察的开发者。`,
  ];
}

function getStarterAdvice(repo) {
  const advice = [
    "先进入 GitHub 仓库查看 README，确认是否有安装步骤、快速开始、示例代码和 License。",
    `优先检查最近更新时间：${new Date(repo.updated_at).toLocaleDateString("zh-CN")}。如果项目仍高频更新，试用价值更高。`,
    `关注 Issues 数量：当前开放 Issues 为 ${repo.open_issues_count}。数量高不一定是坏事，但需要结合维护者响应速度判断。`,
  ];
  if (repo.language) advice.push(`如果你熟悉 ${repo.language}，可以直接从示例和测试目录入手；如果不熟悉，建议先看文档和 release notes。`);
  return advice;
}

function renderRepos() {
  if (!state.repos.length) {
    els.grid.innerHTML = `<div class="empty">没有找到符合条件的项目。可以切换时间范围或取消语言过滤。</div>`;
    return;
  }

  els.grid.innerHTML = state.repos.map((repo, index) => {
    const shouldShowTranslate = looksEnglish(repo.description || "");
    const cachedTranslation = state.translations.get(repo.id);

    return `
    <article class="repo-card" style="animation-delay:${index * 38}ms">
      <p class="owner">${escapeHtml(repo.owner.login)}</p>
      <h2>${escapeHtml(repo.name)}</h2>
      <p class="desc">${escapeHtml(repo.description || "这个项目暂时没有填写简介，建议进入仓库查看 README。")}</p>
      ${shouldShowTranslate ? `
        <div class="card-translate">
          <button class="mini-translate-button" data-card-translate-id="${repo.id}">${cachedTranslation ? "刷新中文简介" : "翻译简介"}</button>
          <p class="card-translation-result" data-card-translation-result="${repo.id}">${cachedTranslation ? escapeHtml(cachedTranslation) : ""}</p>
        </div>
      ` : ""}
      <div class="badges">
        <span class="badge">${escapeHtml(repo.language || "Unknown")}</span>
        <span class="badge">${escapeHtml(rangeConfig[state.range].label)}热门</span>
      </div>
      <div class="stats">
        <span class="stat"><strong>★ ${compactNumber(repo.stargazers_count)}</strong></span>
        <span class="stat">Fork ${compactNumber(repo.forks_count)}</span>
        <span class="stat">Issues ${compactNumber(repo.open_issues_count)}</span>
      </div>
      <div class="card-actions">
        <button class="detail-button" data-id="${repo.id}">查看整理详情</button>
        <a class="github-link" href="${repo.html_url}" target="_blank" rel="noreferrer">GitHub</a>
      </div>
    </article>
  `;
  }).join("");
}

function openDrawer(repo) {
  state.selected = repo;
  const profile = getProjectProfile(repo);
  const advice = getStarterAdvice(repo);
  const shouldShowTranslate = looksEnglish(repo.description || "");
  const cachedTranslation = state.translations.get(repo.id);

  els.drawerContent.innerHTML = `
    <p class="owner">${escapeHtml(repo.full_name)}</p>
    <h2 id="drawerTitle">${escapeHtml(repo.name)}</h2>
    <p>${escapeHtml(getChineseSummary(repo))}</p>
    ${shouldShowTranslate ? `
      <div class="translate-panel">
        <button class="translate-button" data-translate-id="${repo.id}">${cachedTranslation ? "重新翻译中文简介" : "翻译为中文"}</button>
        <p id="translationResult" class="translation-result">${cachedTranslation ? escapeHtml(cachedTranslation) : "检测到英文项目简介，可点击按钮翻译为中文。"}</p>
      </div>
    ` : ""}

    <div class="detail-table">
      <div><span>Stars</span><strong>${compactNumber(repo.stargazers_count)}</strong></div>
      <div><span>Forks</span><strong>${compactNumber(repo.forks_count)}</strong></div>
      <div><span>主语言</span><strong>${escapeHtml(repo.language || "未知")}</strong></div>
      <div><span>License</span><strong>${escapeHtml(repo.license?.name || "未声明")}</strong></div>
      <div><span>创建时间</span><strong>${new Date(repo.created_at).toLocaleDateString("zh-CN")}</strong></div>
      <div><span>更新时间</span><strong>${new Date(repo.updated_at).toLocaleDateString("zh-CN")}</strong></div>
    </div>

    <h3>项目概览</h3>
    <ul>${profile.map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ul>

    <h3>中文摘要</h3>
    <p>${escapeHtml(repo.description || "项目没有提供描述。建议进入 README 查看作者对项目目标、用法和边界的说明。")}</p>

    <h3>上手建议</h3>
    <ul>${advice.map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ul>

    <h3>下一步</h3>
    <p>建议打开仓库后重点看 README、examples、docs、issues、releases 五个区域，判断项目成熟度与是否适合引入生产环境。</p>
    <p><a href="${repo.html_url}" target="_blank" rel="noreferrer">打开 GitHub 仓库 →</a></p>
  `;

  els.drawer.classList.add("open");
  els.drawer.setAttribute("aria-hidden", "false");
}

function closeDrawer() {
  els.drawer.classList.remove("open");
  els.drawer.setAttribute("aria-hidden", "true");
}

els.tabs.forEach(tab => {
  tab.addEventListener("click", () => {
    els.tabs.forEach(item => {
      item.classList.toggle("active", item === tab);
      item.setAttribute("aria-selected", item === tab ? "true" : "false");
    });
    state.range = tab.dataset.range;
    fetchTrendingRepos();
  });
});

els.language.addEventListener("change", event => {
  state.language = event.target.value;
  fetchTrendingRepos();
});

els.refresh.addEventListener("click", fetchTrendingRepos);

els.grid.addEventListener("click", async event => {
  const cardTranslateButton = event.target.closest("[data-card-translate-id]");
  if (cardTranslateButton) {
    const repo = state.repos.find(item => String(item.id) === cardTranslateButton.dataset.cardTranslateId);
    const result = document.querySelector(`[data-card-translation-result="${cardTranslateButton.dataset.cardTranslateId}"]`);
    if (!repo || !result) return;

    cardTranslateButton.disabled = true;
    cardTranslateButton.textContent = "翻译中…";
    result.textContent = "正在翻译简介…";

    const translated = await translateTextToChinese(repo.description || "", repo.id);
    result.textContent = translated;
    cardTranslateButton.disabled = false;
    cardTranslateButton.textContent = "刷新中文简介";
    return;
  }

  const button = event.target.closest("[data-id]");
  if (!button) return;
  const repo = state.repos.find(item => String(item.id) === button.dataset.id);
  if (repo) openDrawer(repo);
});

els.drawer.addEventListener("click", async event => {
  if (event.target.matches("[data-close]")) closeDrawer();

  const translateButton = event.target.closest("[data-translate-id]");
  if (!translateButton) return;

  const repo = state.repos.find(item => String(item.id) === translateButton.dataset.translateId);
  const result = document.querySelector("#translationResult");
  if (!repo || !result) return;

  translateButton.disabled = true;
  translateButton.textContent = "翻译中…";
  result.textContent = "正在调用翻译服务，请稍候。";

  const translated = await translateTextToChinese(repo.description || "", repo.id);
  result.textContent = translated;
  translateButton.disabled = false;
  translateButton.textContent = "重新翻译中文简介";
});

document.addEventListener("keydown", event => {
  if (event.key === "Escape") closeDrawer();
});

fetchTrendingRepos();
