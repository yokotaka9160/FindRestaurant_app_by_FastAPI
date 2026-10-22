"""pytest-playwright の設定とフィクスチャ。

テスト対象のフロントの URL は環境変数 FRONTEND_URL（既定 http://localhost:8080）。
位置情報のテストがあるため、https か localhost の URL で開くこと（安全なオリジンでないと位置情報 API が使えない）。
"""

from __future__ import annotations

import os

import pytest
from playwright.sync_api import Page, expect

from helpers import FakeApi, api_request, results
from testdata import CURRENT_LOCATION

FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:8080").rstrip("/")


@pytest.fixture(scope="session")
def base_url() -> str:
    return FRONTEND_URL


@pytest.fixture(scope="session")
def browser_context_args(browser_context_args):
    return {
        **browser_context_args,
        "locale": "ja-JP",
        # 検索条件パネルが常に表示される PC 幅（lg 以上）
        "viewport": {"width": 1280, "height": 900},
        "geolocation": CURRENT_LOCATION,
        "permissions": ["geolocation"],
    }


@pytest.fixture
def api(page: Page) -> FakeApi:
    """API を差し替える。ページを開く前に respond() で返す内容を変えられる"""
    fake = FakeApi()
    fake.install(page)
    return fake


@pytest.fixture
def open_search(page: Page, api: FakeApi, base_url: str):
    """検索画面を開き、最初の検索結果が表示されるまで待つ"""

    def open() -> Page:
        with page.expect_request(api_request("/api/shops")):
            page.goto(f"{base_url}/#main-menu")
        expect(results(page)).to_be_visible()
        return page

    return open


@pytest.fixture
def search_page(open_search) -> Page:
    return open_search()
