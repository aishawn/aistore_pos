# 前后端独立部署指南

本仓库是一个 monorepo，但前端（Next.js）和后端（Spring Boot）**没有共享代码**，唯一的连接是一个 HTTP 地址。本文说明如何把两者各自拷出来独立构建、部署。

- **前端**：仓库根目录的 Next.js 应用（`src/`、`public/`、`package.json` …）
- **后端**：`backend/` 子目录里的 Spring Boot Maven 项目
- **唯一耦合点**：前端通过环境变量 `NEXT_PUBLIC_API_BASE_URL` 调后端；后端通过 `CORS_ALLOWED_ORIGINS` 放行前端域名

```
F:\ai-website-cloner-template\        ← 前端在这一层
├── src/  public/  package.json  next.config.ts  Dockerfile  docker-compose.yml
├── backend/                          ← 后端整个目录就是它
│   ├── pom.xml  Dockerfile  docker-compose.yml
│   └── src/main/...
└── docs/                             ← 逆向研究产物，部署时不需要
```

---

## 一、拷贝路径速查

| 部分 | 从这里拷 | 拷贝时排除 |
|---|---|---|
| **后端** | `F:\ai-website-cloner-template\backend\` 整个目录 | `target/`（构建缓存）、`.env` |
| **前端** | `F:\ai-website-cloner-template\` 根目录 | `backend/`、`docs/`、`node_modules/`、`.next/`、`.env.local` |

> 后端是完全自包含的——`backend/` 目录搬到任何地方都能独立 `mvn package`，不依赖仓库里的其他东西。
> 前端拷贝时**只要排除 `backend/` 和 `docs/`**，其余根目录文件都属于前端。

### 拷贝命令

**后端：**
```bash
# Git Bash / Linux / macOS
cp -r backend /path/to/shopfront-backend
rm -rf /path/to/shopfront-backend/target
```
```powershell
# PowerShell
Copy-Item -Recurse backend C:\deploy\shopfront-backend
Remove-Item -Recurse -Force C:\deploy\shopfront-backend\target
```

**前端：**
```bash
# Git Bash / Linux / macOS（rsync 排除不需要的目录）
rsync -a --exclude backend --exclude docs --exclude node_modules \
      --exclude .next --exclude .env.local \
      ./ /path/to/shopfront-frontend/
```
```powershell
# PowerShell
$dst = "C:\deploy\shopfront-frontend"
robocopy . $dst /E /XD backend docs node_modules .next .git /XF .env.local
```

---

## 二、部署后端（Spring Boot）

技术栈：Spring Boot 3.3 / Java 21 / MyBatis / MySQL 8 / Redis 7 / JWT。
运行依赖：**MySQL 8** 和 **Redis 7**。

### 方式 A：Docker Compose（推荐，一条命令带 DB + Redis）

```bash
cd shopfront-backend
cp .env.example .env          # 编辑 JWT_SECRET、CORS_ALLOWED_ORIGINS 等
docker compose up --build -d
```
- API 监听 `:8080`
- MySQL 首次启动会**自动**执行 `src/main/resources/db/schema.sql` + `seed.sql` 建库灌数据
- `DataInitializer` 自动创建管理员账号：**admin / 123456**

`.env` 可配项（见 `backend/.env.example`）：

| 变量 | 默认 | 说明 |
|---|---|---|
| `DB_NAME` / `DB_PORT` / `DB_PASSWORD` | shopfront / 3306 / root | MySQL |
| `REDIS_PORT` | 6379 | Redis |
| `BACKEND_PORT` | 8080 | API 对外端口 |
| `JWT_SECRET` | （示例值） | **生产必须改**，HS256 要求 ≥ 32 字节 |
| `CORS_ALLOWED_ORIGINS` | http://localhost:3000 | **填前端正式域名**，逗号分隔多个 |

### 方式 B：裸 JAR（已有外部 MySQL / Redis）

```bash
cd shopfront-backend

# 1. 建库 + 表（仅首次）
mysql -u root -p -e "CREATE DATABASE shopfront CHARACTER SET utf8mb4;"
mysql -u root -p shopfront < src/main/resources/db/schema.sql
mysql -u root -p shopfront < src/main/resources/db/seed.sql   # 可选种子数据

# 2. 配置（环境变量覆盖 application.yml 的默认值）
export DB_HOST=localhost DB_PORT=3306 DB_NAME=shopfront DB_USER=root DB_PASSWORD=yourpw
export REDIS_HOST=localhost REDIS_PORT=6379
export JWT_SECRET="一个至少32字节的生产密钥"
export CORS_ALLOWED_ORIGINS="https://app.your-domain.com"

# 3. 构建并运行
mvn clean package -DskipTests
java -jar target/shopfront-backend-0.1.0.jar
```

### 验证后端
```bash
curl -s localhost:8080/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"123456"}'
# 应返回 { code, message, data: { accessToken, refreshToken } }
```

---

## 三、部署前端（Next.js）

技术栈：Next.js 16 / React 19 / Tailwind v4，需要 **Node.js ≥ 24**。

> ⚠️ **关键**：`NEXT_PUBLIC_API_BASE_URL` 是在 **`next build` 构建时**被写死进客户端 JS 包的，**不是运行时读取**。所以后端地址必须在构建**之前**设好；以后改地址必须**重新 build**。

### 方式 A：Node 直接跑

```bash
cd shopfront-frontend
npm install

# 指向已部署的后端（构建前设好）
echo "NEXT_PUBLIC_API_BASE_URL=https://api.your-domain.com" > .env.local

npm run build
npm start            # 默认 :3000
```

### 方式 B：Docker

后端地址通过 **build-arg** 传入（因为是构建时变量）：

```bash
cd shopfront-frontend

# 用 docker compose（已在 docker-compose.yml 里接好 build-arg）
NEXT_PUBLIC_API_BASE_URL=https://api.your-domain.com \
  docker compose up app --build -d

# 或直接 docker build
docker build \
  --build-arg NEXT_PUBLIC_API_BASE_URL=https://api.your-domain.com \
  -t shopfront-frontend .
docker run -p 3000:3000 shopfront-frontend
```

### 方式 C：Vercel / 静态托管平台

- 在平台的 **Environment Variables** 里设 `NEXT_PUBLIC_API_BASE_URL=https://api.your-domain.com`
- 平台会自动 `next build`（变量在构建时注入），无需额外配置

---

## 四、把两端连起来（必做）

两者部署在不同域名后，必须双向对齐：

1. **前端 → 后端**：前端的 `NEXT_PUBLIC_API_BASE_URL` 设成后端的公网地址
   （如 `https://api.your-domain.com`），然后重新 build。
2. **后端 → 前端**：后端的 `CORS_ALLOWED_ORIGINS` 设成前端的公网域名
   （如 `https://app.your-domain.com`），否则浏览器会拦截跨域请求。
   支持通配：`https://*.your-domain.com`；多个用逗号分隔。

```
┌──────────────┐   HTTPS + JWT(Bearer)   ┌──────────────┐   ┌────────┐
│  前端 :3000   │ ──────────────────────▶ │  后端 :8080   │──▶│ MySQL  │
│  Next.js     │                          │  Spring Boot │   │ Redis  │
│ NEXT_PUBLIC_ │ ◀────────────────────── │ CORS_ALLOWED │   └────────┘
│ API_BASE_URL │      CORS 放行响应        │ _ORIGINS     │
└──────────────┘                          └──────────────┘
```

---

## 五、生产环境检查清单

- [ ] 后端 `JWT_SECRET` 改成了强随机值（≥ 32 字节），不要用示例默认值
- [ ] 后端 `CORS_ALLOWED_ORIGINS` = 前端正式域名（不要留 `*` / localhost）
- [ ] MySQL `DB_PASSWORD` 改成强密码
- [ ] 前端 build 前确认 `NEXT_PUBLIC_API_BASE_URL` 指向正确后端
- [ ] 后端在反向代理（Nginx/Traefik）后启用 HTTPS
- [ ] MySQL / Redis 不直接暴露公网端口（compose 里的 `ports` 生产可去掉）
- [ ] 首次启动后确认 admin 账号已生成，并修改默认密码 `123456`
- [ ] 两端各自纳入独立 git 仓库 / CI 流水线
