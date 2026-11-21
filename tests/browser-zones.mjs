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

  const alo = await page.evaluate(() => window.__danrenZoneDebug());
  check(alo.zoneIndex === 1, "zone index did not advance to ALO");
  check(alo.phase === "objectives", "ALO did not reset to objectives");
  check(alo.objectCounts.objectives === 3, "ALO objective count is wrong");
  check(alo.objectCounts.projectiles === 0, "old projectiles survived zone transition");
  check(alo.completedZoneIds[0] === "ggo-harbor", "harbor was not recorded complete");
} finally {
  await browser.close();
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log("zone lifecycle passed");
}
