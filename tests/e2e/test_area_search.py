"""エリア検索：都道府県・市区町村、現在地周辺"""

from playwright.sync_api import BrowserContext, Page, expect

from helpers import FakeApi, api_request, choose_option, filter_panel
from testdata import CURRENT_LOCATION


def test_initial_search_is_whole_tokyo(page: Page, api: FakeApi, open_search):
    open_search()
    params = api.calls_to("/api/shops")[0]
    assert params == {"prefecture": ["東京都"]}


def test_prefecture_and_city(search_page: Page):
    page = search_page

    with page.expect_request(api_request("/api/shops", prefecture="大阪府", area=None)):
        choose_option(page, page.locator("#prefecture"), "大阪府")

    city = page.get_by_role("combobox", name="市区町村")
    expect(city).to_have_text("大阪府全域")
    with page.expect_request(api_request("/api/shops", prefecture="大阪府", area="大阪市")):
        choose_option(page, city, "大阪市")


def test_changing_prefecture_resets_city(search_page: Page):
    page = search_page
    with page.expect_request(api_request("/api/shops", area="新宿")):
        choose_option(page, page.get_by_role("combobox", name="市区町村"), "新宿")

    with page.expect_request(api_request("/api/shops", prefecture="北海道", area=None)):
        choose_option(page, page.locator("#prefecture"), "北海道")
    expect(page.get_by_role("combobox", name="市区町村")).to_have_text("北海道全域")


def test_tokyo_lists_neighborhoods(search_page: Page):
    page = search_page
    page.get_by_role("combobox", name="市区町村").click()
    for name in ["渋谷", "表参道", "銀座", "吉祥寺"]:
        expect(page.get_by_role("option", name=name, exact=True)).to_be_visible()


def test_current_location_with_radius(search_page: Page):
    page = search_page
    lat, lng = CURRENT_LOCATION["latitude"], CURRENT_LOCATION["longitude"]

    with page.expect_request(
        api_request("/api/shops", lat=lat, lng=lng, radius=5000, prefecture=None)
    ):
        page.get_by_role("button", name="現在地から探す").click()
    expect(filter_panel(page)).to_contain_text("現在地から5km以内")

    # 半径を 5km → 3km に
    thumb = page.get_by_role("slider", name="現在地からの距離（km）")
    with page.expect_request(api_request("/api/shops", radius=3000)):
        thumb.focus()
        thumb.press("ArrowLeft")
        thumb.press("ArrowLeft")
    expect(filter_panel(page)).to_contain_text("現在地から3km以内")

    # 解除すると都道府県の検索に戻る
    with page.expect_request(api_request("/api/shops", prefecture="東京都", lat=None)):
        page.get_by_role("button", name="現在地での検索を解除").click()
    expect(page.locator("#prefecture")).to_be_visible()


def test_current_location_denied(search_page: Page, context: BrowserContext, api: FakeApi):
    page = search_page
    context.clear_permissions()
    page.get_by_role("button", name="現在地から探す").click()
    expect(filter_panel(page).get_by_role("alert")).to_have_text("位置情報の利用が許可されていません")
    assert all("lat" not in p for p in api.calls_to("/api/shops"))
