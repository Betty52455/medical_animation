# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Project Overview

A materials (素材) distribution platform called "趣味科普网" where users can browse, preview, and download digital assets (images, videos, audio). Access to paid materials requires a point-based system where users redeem codes to gain points.

## Commands

## Development and deployment policy

- Repository: `https://github.com/dugenkui03/medical_animation`, production branch `main`.
- Develop and validate on the local machine, commit and push there; the server pulls code and runs the official deployment script. Do not edit business source directly on the server.
- Read `doc/项目使用说明.md` before deployment. Local check: `bash scripts/check.sh`; server update: `bash deploy/update.sh` from `/opt/website_test`.
- Commit source, scripts, service templates and documentation. Never commit `backend/config.json`, passwords, private keys, databases, uploads or deployment snapshots.
- Preserve `/opt/data/` and existing production configuration. Use systemd to manage the whole process group; never deploy with `pkill -f "go run"` or by deleting data directories.
- Report a discovered execution problem before correcting it. All new/changed functions require comments. Explain workflows with numbered Mermaid diagrams, grouped by responsibility with dashed borders and highlighted core nodes.
- Any change affecting database schema requires an explicit compatibility/recovery plan before deployment; runtime rollback does not restore the database.

### Backend (Go)
```bash
cd backend
go run ./cmd/server/main.go   # Run server (reads config.json from CWD)
go build ./cmd/server/        # Build binary
go test ./...                 # Run all tests
```

### Frontend (React/Vite)
```bash
cd frontend
npm run dev       # Dev server on port 5173 (proxies /api and /uploads to :8080)
npm run build     # Production build
npm run lint      # ESLint
npm run preview   # Preview production build
```

## Architecture

### Backend (`backend/`)
- **Entry**: `cmd/server/main.go` — loads config, inits DB, registers routes, starts Gin server
- **Config**: `config.json` in the working directory (port, DB path, JWT secret, default admin credentials)
- **Database**: SQLite via GORM at `/opt/data/kpsucai.db`; schema auto-migrated on startup
- **File storage**: `/opt/data/uploads/originals/` (raw files) and `/opt/data/uploads/previews/` (watermarked previews)
- **Watermarking**: `internal/services/watermark.go` uses `ffmpeg` to generate watermarked JPEG previews for images and video thumbnails. Only preview files are served statically; original files are streamed through authenticated endpoints.

Internal packages:
- `internal/config` — loads `AppConfig` from JSON into `GlobalConfig` singleton
- `internal/database` — opens SQLite, auto-migrates all models, seeds default admin
- `internal/models` — GORM models: `User`, `Category`, `Material`, `RedeemCode`, `DownloadRecord`, `LoginRecord`, `SystemSetting`
- `internal/api` — Gin handlers split by domain: `auth`, `material`, `category`, `points`, `settings`, `stats`
- `internal/utils/jwt.go` — JWT generation/parsing using `GlobalConfig.JWTSecret`

### Route structure
- **Public**: `GET /api/categories`, `GET /api/materials`, `GET /api/public/settings`, `/api/materials/:id/stream`, `/api/materials/:id/download`
- **Authenticated** (`/api/*`): redeem codes, points balance, history
- **Admin** (`/api/admin/*`): upload, manage users/materials/categories/redeem-codes, stats

### Frontend (`frontend/src/`)
- **Routing** (`App.jsx`): `/` → Home (inside `Layout`), `/login`, `/register`, `/admin-login`, `/admin` (admin-only)
- **API client** (`api.js`): axios instance with base `/api`, attaches JWT from `localStorage`, redirects to `/login` on 401
- **Auth state**: stored in `localStorage` (`token`, `username`, `role`)
- **Pages**: `Home` (material browsing/download), `Admin` (full management dashboard), `Login`/`Register`/`AdminLogin`
- **UI**: Ant Design 6 + `@ant-design/charts`

### Key business rules
- Material types: `1`=image, `2`=video, `3`=audio, `0`=other
- Download deduplication: paid materials are free to re-download within 7 days of the last download record
- Banned users (`status=1`) cannot download or redeem codes
- Previews for images/videos are watermarked; audio and "other" types have no preview generated
- Original file paths are never exposed in public API responses (`safeMaterial` struct strips `original_url`)

### Infrastructure
- DB backup: `backup_db.sh` — SQLite `.backup` command, keeps 14 days, intended for hourly cron (`0 * * * *`)
- `ffmpeg` must be installed on the host for watermark processing
