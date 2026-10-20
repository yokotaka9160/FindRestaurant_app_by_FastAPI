# FindRestr

## Docker で起動

```bash
# 本番相当（フロント http://localhost:8080 / API http://localhost:8000/docs）
docker compose up --build

# 開発用・ホットリロード（フロント http://localhost:5173）
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
```

## ローカルで起動（Docker なし）

```bash
# バックエンド (FastAPI) — http://localhost:8000
cd backend && pip install -r requirements.txt && uvicorn main:app --reload --port 8000

# フロントエンド (Vite)
pnpm install && pnpm dev
```

APIの接続先を変えるには `.env` に `VITE_API_BASE=http://localhost:8000` を設定します。
動作確認: `curl "http://localhost:8000/api/shops?area=新宿&min_rating=4"`
