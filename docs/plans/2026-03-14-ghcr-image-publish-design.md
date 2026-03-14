## 背景

当前仓库已经有 `.github/workflows/publish.yml`，会在 `main` 分支 push 后自动构建多架构镜像并发布 release。

但现状存在两个问题：

1. 镜像仓库写死到上游作者名下，当前 fork 推送后不会得到“属于自己”的镜像。
2. 同时推 Docker Hub 和 GHCR，超出本次目标，且增加了 secrets 和失败面。

## 最终方案

本次采用最小改动方案：

1. 保留现有 `publish.yml` 的 release 判断、版本同步、多架构构建、manifest 合并逻辑。
2. 删除 Docker Hub 相关登录、标签、manifest 发布步骤。
3. 将 GHCR 镜像地址改为根据当前仓库自动计算：
   `ghcr.io/<repository_owner>/<repository_name_lowercase>`
4. 默认继续为每次 `main` push 发布 `:edge`。
5. 若本次 push 新增了 `changelog/vX.Y.Z.md`，继续额外发布 `:latest` 与 `:X.Y.Z`，并创建 GitHub Release。

对当前仓库 `1354427059/NeutralPress`，实际镜像地址会变成：

`ghcr.io/1354427059/neutralpress`

## 服务器侧使用方式

服务器 `docker-compose.yml` 保持现有 `image:` 模式不变，只需要把 `.env` 中的 `NEUTRALPRESS_IMAGE` 改成：

```env
NEUTRALPRESS_IMAGE=ghcr.io/1354427059/neutralpress:edge
```

之后每次代码推到 `main`，等待 GitHub Actions 构建完成，再在服务器执行：

```bash
docker compose pull web
docker compose up -d web init bootstrap-cache
```

如果服务器上保存的是仓库工作树，也可以先 `git pull`，但真正决定容器内容的是镜像 tag，不是服务器本地源码本身。

## 风险与限制

1. 首次推送成功后，GHCR 包的可见性可能需要在 GitHub Packages 页面手动确认是否允许服务器匿名拉取。
2. 如果 GHCR 包保持私有，服务器需要先执行 `docker login ghcr.io`。
3. 本次不修改 `docker-compose.yml` 默认镜像，避免把通用部署文档和 fork 私有发布策略混在一起。
