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
