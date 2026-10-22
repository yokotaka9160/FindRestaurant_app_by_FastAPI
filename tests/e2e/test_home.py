"""ホーム画面と検索画面の行き来"""

import re

from playwright.sync_api import Page, expect

from helpers import FakeApi, api_request, results


def test_start_opens_search_and_back_returns_home(page: Page, api: FakeApi, base_url: str):
    page.goto(base_url)
    expect(page.get_by_role("heading", name="FindRestr")).to_be_visible()

    with page.expect_request(api_request("/api/shops")):
        page.get_by_role("button", name="Start").click()
    expect(page).to_have_url(re.compile(r"#main-menu$"))
    expect(results(page)).to_be_visible()

    page.get_by_role("button", name="ホームへ戻る").click()
    expect(page.get_by_role("button", name="Start")).to_be_visible()


def test_search_page_opens_directly_by_hash(search_page: Page):
    expect(search_page.get_by_role("tab", name="エリアで探す")).to_have_attribute(
        "aria-selected", "true"
    )
