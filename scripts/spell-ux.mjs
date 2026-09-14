import { chromium, expect } from "@playwright/test";
import { starterDeck, botCommand } from "../shared/practice.ts";
import { cards, apply, summonCells } from "../shared/game.ts";
import { layout } from "../shared/arena-layout.ts";
const base = process.env.TEST_URL || "http://localhost:5175",
  browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
const cs = await Promise.all(
    [0, 1].map(() =>
      browser.newContext({ viewport: { width: 1440, height: 1000 } }),
    ),
  ),
  page = await cs[0].newPage(),
  errors = [];
page.on("pageerror", (e) => errors.push(e.message));
async function api(i, kind, name, ...args) {
  const r = await cs[i].request.post(`${base}/api/${kind}/${name}`, {
    data: { args },
  });
  if (!r.ok()) throw Error(await r.text());
  const v = (await r.json()).result;
  if (v?.error) throw Error(v.error);
  return v;
}
async function idle() {
  await page.waitForTimeout(220);
  await expect(page.locator(".field-event")).toHaveCount(0, { timeout: 20000 });
  await expect(page.locator(".draw-flight")).toHaveCount(0, { timeout: 10000 });
}
try {
  for (let i = 0; i < 2; i++)
    await cs[i].request.post(`${base}/api/auth/guest`, {
      data: { name: `QA Magia ${i + 1}` },
    });
  const decks = [];
  for (let i = 0; i < 2; i++)
    decks.push(
      (await api(i, "mutation", "saveDeck", starterDeck("agua"))).deck.id,
    );
  const code = (await api(0, "mutation", "createRoom", decks[0])).room.code;
  await api(1, "mutation", "joinRoom", code, decks[1], false);
  const uid = (await (await cs[1].request.get(`${base}/api/auth`)).json())
    .userId;
  await api(0, "mutation", "lobbyCommand", code, {
    type: "seat",
    seat: 1,
    userId: uid,
  });
  await api(0, "mutation", "lobbyCommand", code, { type: "start" });
  await page.goto(base);
  await page.getByRole("button", { name: new RegExp(code) }).click();
  await page.locator("canvas").waitFor();
  await page.locator(".choice-art").nth(0).click();
  await page.locator(".choice-art").nth(2).click();
  await page.getByRole("button", { name: "Trocar 2 carta(s)" }).click();
  await expect(page.locator(".opening-hand")).toHaveCount(0);
  await page.getByRole("button", { name: "Começar neste selo" }).click();
  let room = await api(1, "query", "room", code);
  await api(
    1,
    "mutation",
    "gameCommand",
    code,
    { type: "ready", y: 4 },
    room.state.revision,
  );
  await idle();
  await expect(page.locator(".fan-card.mulligan")).toHaveCount(0);
  let discarded = false,
    cast = false,
    spellName;
  for (let step = 0; step < 140; step++) {
    room = await api(0, "query", "room", code);
    let g = room.state,
      seat = g.priority;
    if (g.centerPending) seat = Object.hasOwn(g.centerChoices || {}, 0) ? 1 : 0;
    room = await api(seat, "query", "room", code);
    g = room.state;
    const me = g.players[seat];
    if (seat === 0 && !g.centerPending && !g.stack.length) {
      if (
        g.phase === 4 &&
        !discarded &&
        me.hand.some((id) => cards.get(id).kind === "spell")
      ) {
        await expect(page.locator(".discard-choice")).toBeVisible();
        const idx = me.hand.findIndex((id) => cards.get(id).kind === "spell");
        await page.locator(".choice-art").nth(idx).click();
        await page.screenshot({ path: ".sited/qa/discard-selection.png" });
        await page.setViewportSize({ width: 390, height: 844 });
        await page.screenshot({ path: ".sited/qa/discard-mobile.png" });
        await page.setViewportSize({ width: 1440, height: 1000 });
        await page.locator(".discard-choice .choice-confirm").click();
        await expect
          .poll(
            async () =>
              (await api(0, "query", "room", code)).state.players[0]
                .permanentPe,
          )
          .toBe(me.permanentPe + 1);
        await page.getByRole("button", { name: "Ver tabuleiro" }).click();
        discarded = true;
        continue;
      }
      if (!cast && g.phase !== 4) {
        let cmd;
        for (const [handIndex, id] of me.hand.entries()) {
          if (
            ![
              "gishikido-n-7-cura-da-agua",
              "mamoru-n-18-pele-de-ourico",
            ].includes(id)
          )
            continue;
          for (const u of g.units.filter((u) => u.kind === "unit")) {
            const c = { type: "cast", cardId: id, handIndex, targetId: u.id };
            if (!apply(structuredClone(g), 0, c)) {
              cmd = c;
              break;
            }
          }
          if (cmd) break;
        }
        if (cmd) {
          const card = page
            .locator(".fan-card")
            .nth(cmd.handIndex)
            .locator(".fan-art");
          await card.hover();
          await page.waitForTimeout(250);
          await card.click();
          await expect(page.locator(".arena-drawer")).toBeVisible();
          for (const [width, height] of [
            [1440, 1000],
            [390, 844],
          ]) {
            await page.setViewportSize({ width, height });
            await page.waitForTimeout(200);
            const hit = await page.locator(".arena-pass").evaluate((el) => {
              const r = el.getBoundingClientRect();
              return el.contains(
                document.elementFromPoint(
                  r.x + r.width / 2,
                  r.y + r.height / 2,
                ),
              );
            });
            if (!hit) throw Error(`Spell drawer blocks turn action ${width}`);
            await page.screenshot({
              path: `.sited/qa/spell-selection-${width}.png`,
            });
          }
          await page.setViewportSize({ width: 1440, height: 1000 });
          await page.waitForTimeout(350);
          const target = g.units.find((u) => u.id === cmd.targetId),
            point = layout(1440, 1000).point(target.x, target.y);
          await page.mouse.click(point.x, point.y);
          await expect(page.locator(".target-controls")).toContainText(
            "Alvo 1",
          );
          await page.getByRole("button", { name: /Conjurar ·/ }).click();
          await expect(page.locator(".arena-stack-panel")).toBeVisible();
          await idle();
          spellName = cards.get(cmd.cardId).name;
          await expect(page.locator(".stack-card")).toContainText(spellName);
          await page.screenshot({ path: ".sited/qa/spell-stack.png" });
          await page.setViewportSize({ width: 390, height: 844 });
          await page.screenshot({ path: ".sited/qa/spell-stack-mobile.png" });
          await page.setViewportSize({ width: 1440, height: 1000 });
          let response = await api(1, "query", "room", code);
          await api(
            1,
            "mutation",
            "gameCommand",
            code,
            { type: "pass" },
            response.state.revision,
          );
          await page.getByRole("button", { name: "Passar resposta" }).click();
          await expect(page.locator(".field-event")).toContainText("resolve");
          await page.waitForTimeout(250);
          await page.screenshot({ path: ".sited/qa/spell-resolve.png" });
          await idle();
          cast = true;
          continue;
        }
      }
    }
    if (cast && discarded) break;
    let cmd = { type: "pass" };
    if (g.centerPending) cmd = botCommand(g, seat);
    else if (
      g.phase === 1 &&
      !g.units.some((u) => u.kind === "unit" && u.owner === seat)
    ) {
      const idx = me.hand.findIndex(
        (id) =>
          cards.get(id).kind === "unit" &&
          cards.get(id).stats.cost <= me.pe + me.permanentPe,
      );
      const cell = summonCells(g, seat)[0];
      if (idx >= 0 && cell)
        cmd = { type: "summon", cardId: me.hand[idx], handIndex: idx, ...cell };
    }
    await api(seat, "mutation", "gameCommand", code, cmd, g.revision);
    await idle();
  }
  if (!cast || !discarded)
    throw Error(`Incomplete UX coverage cast=${cast} discard=${discarded}`);
  await page
    .getByRole("button", { name: "Abrir histórico", exact: true })
    .click();
  await expect(page.locator(".duel-journal")).toBeVisible();
  if ((await page.locator(".duel-journal>nav").boundingBox()).height > 70)
    throw Error("Journal navigation consumes empty vertical space");
  await page.screenshot({ path: ".sited/qa/journal.png" });
  await page
    .getByRole("button", { name: "Cartas descartadas", exact: true })
    .click();
  await page.screenshot({ path: ".sited/qa/journal-discard.png" });
  await page.getByRole("button", { name: "Fechar histórico" }).click();
  room = await api(0, "query", "room", code);
  await api(
    0,
    "mutation",
    "gameCommand",
    code,
    { type: "concede" },
    room.state.revision,
  );
  console.log({
    code,
    mulligan: true,
    discardMagic: true,
    spell: spellName,
    stack: true,
    drawerDoesNotBlock: true,
    errors,
  });
} finally {
  await browser.close();
}
if (errors.length) process.exitCode = 1;
