"""ルート検索：出発地・目的地の地名検索、現在地、ルート沿いの店舗表示"""

from playwright.sync_api import Page, expect

from helpers import FakeApi, api_request, card_names, choose_option, filter_panel, results
from testdata import CURRENT_LOCATION, SHINJUKU, SHINJUKU_WEST, TOKYO


def open_route_tab(page: Page) -> None:
    page.get_by_role("tab", name="ルートで探す").click()
    expect(page.get_by_role("tab", name="ルートで探す")).to_have_attribute("aria-selected", "true")


def search_point(page: Page, field: str, query: str) -> None:
    """出発地 / 目的地の入力欄で地名を検索する"""
    page.get_by_label(field, exact=True).fill(query)
    with page.expect_request(api_request("/api/geocode", q=query)):
        page.get_by_role("button", name=f"{field}を検索").click()


def pick_candidate(page: Page, text: str) -> None:
    filter_panel(page).get_by_role("listitem").filter(has_text=text).get_by_role("button").click()


def set_point(page: Page, field: str, query: str, candidate: str) -> None:
    search_point(page, field, query)
    pick_candidate(page, candidate)
    expect(page.get_by_role("button", name=f"{field}を解除")).to_be_visible()


def test_waits_for_both_points(search_page: Page, api: FakeApi):
    page = search_page
    open_route_tab(page)
    expect(results(page)).to_contain_text("出発地と目的地を指定してください")

    set_point(page, "出発地", "新宿駅", "新宿三丁目")
    page.wait_for_timeout(600)  # デバウンス（250ms）より長く待っても呼ばれない
    assert api.calls_to("/api/shops/route") == []


def test_geocode_candidates(search_page: Page):
    page = search_page
    open_route_tab(page)
    search_point(page, "出発地", "新宿駅")

    candidates = filter_panel(page).get_by_role("listitem")
    expect(candidates).to_have_count(2)
    expect(candidates.nth(0)).to_contain_text("新宿駅")
    expect(candidates.nth(0)).to_contain_text("新宿三丁目, 新宿区, 東京都")

    # 選んだ候補の名前（カンマ区切りの先頭）が表示される
    pick_candidate(page, "西新宿一丁目")
    expect(filter_panel(page)).to_contain_text("新宿駅西口")


def test_geocode_not_found(search_page: Page):
    page = search_page
    open_route_tab(page)
    search_point(page, "目的地", "存在しない地名")
    expect(filter_panel(page).get_by_role("alert")).to_have_text(
        "見つかりませんでした。別の地名で試してください"
    )


def test_route_search(search_page: Page):
    page = search_page
    open_route_tab(page)
    set_point(page, "出発地", "新宿駅", "新宿三丁目")

    with page.expect_request(
        api_request(
            "/api/shops/route",
            olat=SHINJUKU["lat"],
            olng=SHINJUKU["lng"],
            dlat=TOKYO["lat"],
            dlng=TOKYO["lng"],
            buffer=500,
        )
    ):
        set_point(page, "目的地", "東京駅", "丸の内一丁目")

    # ルートの概要
    expect(results(page)).to_contain_text("新宿駅→東京駅")
    expect(results(page)).to_contain_text("7.2km・車で約15分")
    expect(results(page)).to_contain_text("ルートから500m以内")

    # 地図表示に切り替わり、ルート・出発地・目的地・店舗が描かれる
    expect(page.get_by_role("region", name="店舗の地図")).to_be_visible()
    expect(page.locator("path.map-route")).to_have_count(1)
    expect(page.locator("path.map-origin-marker")).to_have_count(1)
    expect(page.locator("path.map-destination-marker")).to_have_count(1)
    expect(page.locator("path.map-shop-marker")).to_have_count(3)


def test_route_results_in_route_order(search_page: Page):
    page = search_page
    open_route_tab(page)
    set_point(page, "出発地", "新宿駅", "新宿三丁目")
    with page.expect_request(api_request("/api/shops/route")):
        set_point(page, "目的地", "東京駅", "丸の内一丁目")

    page.get_by_role("button", name="リスト").click()
    expect(page.locator("#sort")).to_have_text("ルート順")
    assert card_names(page) == ["カフェ テスト", "鮨 テスト", "麺屋 テスト"]  # 出発地に近い順
    card = results(page).get_by_role("listitem").filter(has_text="カフェ テスト")
    expect(card).to_contain_text("ルートから100m")

    # エリア検索に戻すと「ルート順」は解除される
    open_area = page.get_by_role("tab", name="エリアで探す")
    with page.expect_request(api_request("/api/shops")):
        open_area.click()
    expect(page.locator("#sort")).to_have_text("おすすめ順")


def test_current_location_as_origin(search_page: Page):
    page = search_page
    open_route_tab(page)
    page.get_by_role("button", name="現在地を出発地にする").click()
    expect(filter_panel(page)).to_contain_text("現在地")

    with page.expect_request(
        api_request(
            "/api/shops/route",
            olat=CURRENT_LOCATION["latitude"],
            olng=CURRENT_LOCATION["longitude"],
            dlat=TOKYO["lat"],
        )
    ):
        set_point(page, "目的地", "東京駅", "丸の内一丁目")
    expect(results(page)).to_contain_text("現在地→東京駅")


def test_swap_points(search_page: Page):
    page = search_page
    open_route_tab(page)
    set_point(page, "出発地", "新宿駅", "西新宿一丁目")
    with page.expect_request(api_request("/api/shops/route", olat=SHINJUKU_WEST["lat"])):
        set_point(page, "目的地", "東京駅", "丸の内一丁目")

    with page.expect_request(
        api_request("/api/shops/route", olat=TOKYO["lat"], dlat=SHINJUKU_WEST["lat"])
    ):
        page.get_by_role("button", name="入れ替え").click()
    expect(results(page)).to_contain_text("東京駅→新宿駅西口")


def test_buffer_and_filters_are_sent(search_page: Page):
    page = search_page
    open_route_tab(page)
    set_point(page, "出発地", "新宿駅", "新宿三丁目")
    with page.expect_request(api_request("/api/shops/route", buffer=500)):
        set_point(page, "目的地", "東京駅", "丸の内一丁目")

    with page.expect_request(api_request("/api/shops/route", buffer=1000)):
        choose_option(page, page.locator("#route-buffer"), "1.0km 以内")
    expect(results(page)).to_contain_text("ルートから1.0km以内")

    # ジャンルなど共通の条件もルート検索に送られる
    with page.expect_request(api_request("/api/shops/route", buffer=1000, genre="sushi")):
        page.locator("#genre-sushi").click()


def test_clearing_a_point_stops_search(search_page: Page):
    page = search_page
    open_route_tab(page)
    set_point(page, "出発地", "新宿駅", "新宿三丁目")
    with page.expect_request(api_request("/api/shops/route")):
        set_point(page, "目的地", "東京駅", "丸の内一丁目")

    page.get_by_role("button", name="目的地を解除").click()
    expect(results(page)).to_contain_text("出発地と目的地を指定してください")
    expect(page.get_by_label("目的地", exact=True)).to_be_visible()


def test_route_not_found(search_page: Page, api: FakeApi):
    page = search_page
    api.respond("/api/shops/route", {"detail": "ルートが見つかりませんでした"}, status=404)
    open_route_tab(page)
    set_point(page, "出発地", "新宿駅", "新宿三丁目")
    with page.expect_request(api_request("/api/shops/route")):
        set_point(page, "目的地", "東京駅", "丸の内一丁目")
    expect(results(page).get_by_role("alert")).to_contain_text("ルートが見つかりませんでした")
