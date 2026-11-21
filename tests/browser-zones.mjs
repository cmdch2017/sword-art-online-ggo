import { chromium } from "playwright-core";

const url =
  process.env.PUBLIC_URL ||
  "http://127.0.0.1:4173/docs/index.html?zone-test=1";
const failures = [];

function check(condition, message, details = "") {
  if (!condition) failures.push(details ? `${message}: ${details}` : message);
}

const browser = await chromium.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
  args: [
    "--use-angle=swiftshader",
    "--enable-webgl",
    "--ignore-gpu-blocklist",
    "--disable-background-timer-throttling",
    "--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding"
  ]
});

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on("pageerror", (error) => failures.push(`pageerror: ${error.stack || error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") failures.push(`console: ${message.text()}`);
  });
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForFunction(
    () => document.querySelector("#boot")?.classList.contains("done"),
    null,
    { timeout: 60000 }
  );
  await page.locator("#quality-select").evaluate((element) => {
    element.value = "low";
    element.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await page.locator("#start-button").click();
  await page.waitForFunction(
    () => window.__danrenZoneDebug?.().zoneId === "ggo-harbor",
    null,
    { timeout: 30000 }
  );

  const initial = await page.evaluate(() => window.__danrenZoneDebug());
  check(initial.phase === "objectives", "harbor did not start in objectives");
  check(initial.objectiveCount === 3, "harbor objective count is wrong");
  check(initial.objectCounts.objectives === 3, "harbor objective objects are missing");
  check(initial.objectCounts.enemies > 0, "harbor enemy objects are missing");

  await page.evaluate(async () => {
    const test = window.__danrenZoneTest;
    test.activateNextObjective();
    test.activateNextObjective();
    test.activateNextObjective();
    test.defeatBoss();
    test.completeExtraction();
  });
  await page.waitForFunction(
    () => window.__danrenZoneDebug?.().zoneId === "alo-sky",
    null,
    { timeout: 15000 }
  );

  const alo = await page.evaluate(() => ({
    ...window.__danrenZoneDebug(),
    hudText: document.querySelector("#hud")?.innerText || ""
  }));
  check(alo.zoneIndex === 1, "zone index did not advance to ALO");
  check(alo.phase === "objectives", "ALO did not reset to objectives");
  check(alo.objectCounts.objectives === 3, "ALO objective count is wrong");
  check(alo.objectCounts.projectiles === 0, "old projectiles survived zone transition");
  check(alo.completedZoneIds[0] === "ggo-harbor", "harbor was not recorded complete");
  check(
    alo.mechanics.some((mechanic) => mechanic.type === "updraft"),
    "ALO updraft mechanic is missing"
  );
  check(
    alo.mechanics.some((mechanic) => mechanic.element === "wind"),
    "ALO wind objective mechanic is missing"
  );
  check(alo.hudText.includes("ALO 风之浮岛"), "ALO zone HUD title is missing");
  check(alo.objectCounts.enemies >= 4, "ALO guardians are missing");
  check(
    alo.enemyTypes?.some(
      (type) => type === "sylph" || type === "floating-eye"
    ),
    "ALO enemy roster is missing wind factions"
  );

  await page.evaluate(() => {
    window.__danrenZoneTest.placeAtUpdraft("updraft-north");
    window.__danrenZoneTest.alertAllEnemies?.();
  });
  let rangedTimeout = "";
  try {
    await page.waitForFunction(
      () =>
        window.__danrenZoneDebug
          ?.()
          .enemyProjectileTypes?.some(
            (type) => type === "sylph" || type === "floating-eye"
          ),
      null,
      { timeout: 20000 }
    );
  } catch {
    const state = await page.evaluate(() => ({
      zone: window.__danrenZoneDebug(),
      runtime: window.__danrenStateDebug()
    }));
    rangedTimeout = JSON.stringify(state);
  }
  const ranged = await page.evaluate(() => window.__danrenZoneDebug());
  check(
    ranged.enemyProjectileTypes?.some(
      (type) => type === "sylph" || type === "floating-eye"
    ),
    "ALO wind enemies did not fire projectiles",
    rangedTimeout
  );

  let liftTimeout = "";
  try {
    await page.waitForFunction(
      () => window.__danrenZoneDebug?.().playerY > 1.5,
      null,
      { timeout: 15000 }
    );
  } catch {
    const state = await page.evaluate(() => ({
      zone: window.__danrenZoneDebug(),
      runtime: window.__danrenStateDebug()
    }));
    liftTimeout = JSON.stringify(state);
  }
  const lifted = await page.evaluate(() => window.__danrenZoneDebug());
  check(
    lifted.playerY > 1.5,
    "ALO updraft did not lift the player",
    liftTimeout
  );
} finally {
  await browser.close();
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log("zone lifecycle passed");
}
