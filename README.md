# GitHub 热门项目雷达

这是一个科技风实时网页，用 GitHub Search API 提取今日、本周、本月创建的热门项目，并按 Stars 排序展示。

## 使用方式

直接打开 `index.html` 即可使用。

## GitHub Pages 部署

1. 登录 GitHub，点击右上角 `+`，选择 `New repository`。
2. 仓库名建议填写 `github-hot-projects`，权限选择 `Public`，然后创建仓库。
3. 把本项目里的 `index.html`、`styles.css`、`app.js`、`README.md`、`.nojekyll` 上传到仓库根目录。
4. 进入仓库 `Settings` → `Pages`。
5. 在 `Build and deployment` 里，`Source` 选择 `Deploy from a branch`。
6. `Branch` 选择 `main`，目录选择 `/root`，点击 `Save`。
7. 等待 1-2 分钟，GitHub 会生成访问地址，通常是 `https://你的用户名.github.io/github-hot-projects/`。

## 功能

页面支持今日、本周、本月切换，支持按语言过滤，项目卡片可打开整理后的详情面板。详情包含项目概览、中文摘要、上手建议、Stars、Forks、Issues、语言、创建时间、更新时间和 License。

如果项目简介为英文，项目卡片会显示“翻译简介”按钮，详情面板也会显示“翻译为中文”按钮。点击后会调用公开翻译服务生成中文译文；若翻译接口不可用，会使用内置术语表做降级翻译提示。

## 注意

GitHub 未认证 API 通常每小时限制 60 次请求。如果提示速率限制，请稍后再试，或在 `app.js` 的 fetch 请求 headers 中加入 GitHub token。
