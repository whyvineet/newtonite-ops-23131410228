from httpx import AsyncClient

from tests.conftest import World


async def view(client: AsyncClient, world: World, user, name: str, **params) -> dict:
    query = "&".join([f"view={name}", *[f"{k}={v}" for k, v in params.items()]])
    response = await client.get(
        f"/api/v1/dashboard?{query}", headers=world.headers(user)
    )
    assert response.status_code == 200, response.text
    return response.json()


async def test_assigned_to_me(async_client: AsyncClient, world: World) -> None:
    mine = await world.make_item(
        title="mine", status="in_progress", assignee_id=world.member.id
    )
    await world.make_item(
        title="closed mine", status="closed", assignee_id=world.member.id
    )
    await world.make_item(
        title="someone else", status="in_progress", assignee_id=world.member2.id
    )
    body = await view(async_client, world, world.member, "assigned_to_me")
    assert body["view"] == "assigned_to_me" and body["total"] == 1
    assert [i["id"] for i in body["items"]] == [str(mine.id)]


async def test_unassigned_urgent_is_team_scoped(
    async_client: AsyncClient, world: World
) -> None:
    hit = await world.make_item(title="urgent a", priority="urgent")
    await world.make_item(title="normal", priority="normal")
    await world.make_item(
        title="urgent but assigned",
        priority="urgent",
        status="in_progress",
        assignee_id=world.member.id,
    )
    await world.make_item(
        title="urgent beta",
        priority="urgent",
        team_id=world.team_b.id,
        created_by_id=world.member_b.id,
    )
    alpha = await view(async_client, world, world.viewer, "unassigned_urgent")
    assert [i["id"] for i in alpha["items"]] == [str(hit.id)] and alpha["total"] == 1
    beta = await view(async_client, world, world.member_b, "unassigned_urgent")
    assert [i["title"] for i in beta["items"]] == ["urgent beta"]
    nobody = await view(async_client, world, world.outsider, "unassigned_urgent")
    assert nobody["total"] == 0 and nobody["items"] == []


async def test_awaiting_my_approval_uses_lead_policy(
    async_client: AsyncClient, world: World
) -> None:
    waiting = await world.make_item(
        title="waiting", status="awaiting_approval", assignee_id=world.member.id
    )
    await world.make_item(
        title="in progress", status="in_progress", assignee_id=world.member.id
    )
    await world.make_item(
        title="beta waiting",
        status="awaiting_approval",
        assignee_id=world.member_b.id,
        team_id=world.team_b.id,
        created_by_id=world.member_b.id,
    )
    lead = await view(async_client, world, world.lead, "awaiting_my_approval")
    assert [i["id"] for i in lead["items"]] == [str(waiting.id)]
    # Admins and members cannot approve, so nothing is "awaiting their approval".
    for user in (world.admin, world.member, world.viewer):
        assert (await view(async_client, world, user, "awaiting_my_approval"))[
            "total"
        ] == 0
    assert [
        i["title"]
        for i in (
            await view(async_client, world, world.lead_b, "awaiting_my_approval")
        )["items"]
    ] == ["beta waiting"]


async def test_dashboard_pagination_and_validation(
    async_client: AsyncClient, world: World
) -> None:
    for n in range(5):
        await world.make_item(title=f"u{n}", priority="urgent")
    first = await view(async_client, world, world.member, "unassigned_urgent", limit=2)
    assert first["total"] == 5 and len(first["items"]) == 2 and first["next_cursor"]
    second = await view(
        async_client,
        world,
        world.member,
        "unassigned_urgent",
        limit=2,
        cursor=first["next_cursor"],
    )
    assert not {i["id"] for i in first["items"]} & {i["id"] for i in second["items"]}
    bad = await async_client.get(
        "/api/v1/dashboard?view=everything", headers=world.headers(world.member)
    )
    assert bad.status_code == 422
    missing = await async_client.get(
        "/api/v1/dashboard", headers=world.headers(world.member)
    )
    assert missing.status_code == 422


async def test_dashboard_summary_and_team_scoping(
    async_client: AsyncClient, world: World
) -> None:
    # Create items in team A
    await world.make_item(title="open item", status="open")
    await world.make_item(
        title="in progress item", status="in_progress", assignee_id=world.member.id
    )
    await world.make_item(title="urgent unassigned", priority="urgent", status="open")
    await world.make_item(
        title="waiting approval",
        status="awaiting_approval",
        assignee_id=world.member.id,
    )

    # Lead can see awaiting approval
    lead_h = world.headers(world.lead)
    res = await async_client.get(
        f"/api/v1/dashboard/summary?team_id={world.team_a.id}", headers=lead_h
    )
    assert res.status_code == 200
    summary = res.json()
    assert summary["open"] == 2  # open item + urgent unassigned
    assert summary["in_progress"] == 1
    assert summary["urgent"] == 1
    assert summary["awaiting_approval"] == 1
    assert summary["total"] == 4

    # Member cannot approve, so awaiting_approval is 0
    member_h = world.headers(world.member)
    res_m = await async_client.get(
        f"/api/v1/dashboard/summary?team_id={world.team_a.id}", headers=member_h
    )
    assert res_m.status_code == 200
    assert res_m.json()["awaiting_approval"] == 0
    assert res_m.json()["assigned_to_me"] == 2  # in progress + waiting approval

    # Outsider cannot view team A
    outsider_h = world.headers(world.outsider)
    bad_res = await async_client.get(
        f"/api/v1/dashboard/summary?team_id={world.team_a.id}", headers=outsider_h
    )
    assert bad_res.status_code == 404

    # Team filtering on dashboard view
    dash_team = await async_client.get(
        f"/api/v1/dashboard?view=assigned_to_me&team_id={world.team_a.id}",
        headers=member_h,
    )
    assert dash_team.status_code == 200
    assert dash_team.json()["total"] == 2


async def test_more_than_100_work_items_pagination_and_accuracy(
    async_client: AsyncClient, world: World
) -> None:
    # Create 115 work items in team A
    # 45 open, 35 in_progress (assigned to member), 15 awaiting_approval (assigned to member), 20 closed
    for n in range(45):
        await world.make_item(title=f"batch open {n}", status="open")
    for n in range(35):
        title = "special needle target" if n == 30 else f"batch in_progress {n}"
        await world.make_item(
            title=title, status="in_progress", assignee_id=world.member.id
        )
    for n in range(15):
        await world.make_item(
            title=f"batch awaiting approval {n}",
            status="awaiting_approval",
            assignee_id=world.member.id,
        )
    for n in range(20):
        await world.make_item(
            title=f"batch closed {n}", status="closed", assignee_id=world.member.id
        )

    lead_h = world.headers(world.lead)
    member_h = world.headers(world.member)

    # 1. Summary counts across COMPLETE dataset (115 items, not merely first 25 or 100)
    summary_res = await async_client.get(
        f"/api/v1/dashboard/summary?team_id={world.team_a.id}", headers=lead_h
    )
    assert summary_res.status_code == 200
    summary = summary_res.json()
    assert summary["total"] == 115
    assert summary["open"] == 45
    assert summary["in_progress"] == 35
    assert summary["awaiting_approval"] == 15

    # 2. Cursor pagination on /items follows next_cursor across all 115 items
    seen_ids = set()
    cursor = None
    page_count = 0
    while True:
        url = f"/api/v1/items?team_id={world.team_a.id}&limit=25" + (
            f"&cursor={cursor}" if cursor else ""
        )
        res = await async_client.get(url, headers=member_h)
        assert res.status_code == 200
        page = res.json()
        assert len(page["items"]) <= 25
        for item in page["items"]:
            seen_ids.add(item["id"])
        page_count += 1
        cursor = page["next_cursor"]
        if cursor is None:
            break

    assert len(seen_ids) == 115
    assert page_count == 5  # 25, 25, 25, 25, 15

    # 3. Server-side filter: status=in_progress returns all 35 items across pages
    in_prog_seen = set()
    cursor = None
    while True:
        url = f"/api/v1/items?team_id={world.team_a.id}&status=in_progress&limit=25" + (
            f"&cursor={cursor}" if cursor else ""
        )
        res = await async_client.get(url, headers=member_h)
        assert res.status_code == 200
        page = res.json()
        for item in page["items"]:
            assert item["status"] == "in_progress"
            in_prog_seen.add(item["id"])
        cursor = page["next_cursor"]
        if cursor is None:
            break
    assert len(in_prog_seen) == 35

    # 4. Server-side search: find target created beyond the first page
    search_res = await async_client.get(
        f"/api/v1/items?team_id={world.team_a.id}&q=needle", headers=member_h
    )
    assert search_res.status_code == 200
    results = search_res.json()["items"]
    assert len(results) == 1
    assert results[0]["title"] == "special needle target"

    # 5. My Work (assigned_to_me) does not omit items beyond first page
    my_work_res = await async_client.get(
        f"/api/v1/dashboard?view=assigned_to_me&team_id={world.team_a.id}&limit=25",
        headers=member_h,
    )
    assert my_work_res.status_code == 200
    my_work = my_work_res.json()
    # 35 in_progress + 15 awaiting_approval = 50 assigned non-closed items
    assert my_work["total"] == 50
    assert len(my_work["items"]) == 25
    assert my_work["next_cursor"] is not None

    # Fetch second page of My Work
    my_work_p2 = await async_client.get(
        f"/api/v1/dashboard?view=assigned_to_me&team_id={world.team_a.id}&limit=25&cursor={my_work['next_cursor']}",
        headers=member_h,
    )
    assert my_work_p2.status_code == 200
    p2_items = my_work_p2.json()["items"]
    assert len(p2_items) == 25
    assert my_work_p2.json()["next_cursor"] is None
    all_assigned_ids = {i["id"] for i in my_work["items"]} | {i["id"] for i in p2_items}
    assert len(all_assigned_ids) == 50

    # 6. Approvals (awaiting_my_approval) for Lead does not omit items
    approvals_res = await async_client.get(
        f"/api/v1/dashboard?view=awaiting_my_approval&team_id={world.team_a.id}&limit=10",
        headers=lead_h,
    )
    assert approvals_res.status_code == 200
    approvals = approvals_res.json()
    assert approvals["total"] == 15
    assert len(approvals["items"]) == 10
    assert approvals["next_cursor"] is not None
