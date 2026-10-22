# フロントエンドの E2E テスト（pytest + Playwright）。ブラウザと OS ライブラリ入りの公式イメージを使う
FROM mcr.microsoft.com/playwright/python:v1.49.0-noble

# 使い捨てのテスト用コンテナなので、システムの Python に直接入れる
ENV PIP_BREAK_SYSTEM_PACKAGES=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /tests
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .
CMD ["pytest"]
