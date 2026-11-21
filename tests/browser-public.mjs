import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright-core";

const publicUrl =
  process.env.PUBLIC_URL || "http://127.0.0.1:4173/docs/index.html";
const localBgmPath = "C:\\Windows\\Media\\Alarm01.wav";
const failures = [];

await mkdir("artifacts", { recursive: true });

function check(condition, message, details = "") {
  if (!condition) failures.push(details ? `${message}: ${details}` : message);
}

function attachDiagnostics(page, label) {
  page.on("console", (message) => {
    if (message.type() === "error") {
      failures.push(`[${label}] console: ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => {
    failures.push(`[${label}] pageerror: ${error.stack || error.message}`);
  });
  page.on("request", (request) => {
    const url = request.url();
    if (!/^https?:/i.test(url)) return;
    if (/(?:ggo-bgm|kirito-sugaki|models\/manifest|model\.pmx|PMX|Soldier\.glb)/i.test(url)) {
      failures.push(`[${label}] forbidden public request: ${url}`);
    }
  });
  page.on("requestfailed", (request) => {
    failures.push(
      `[${label}] request failed: ${request.url()} (${request.failure()?.errorText || "unknown"})`
    );
  });
  page.on("response", (response) => {
    if (response.status() >= 400) {
      failures.push(`[${label}] response ${response.status()}: ${response.url()}`);
    }
  });
}

const browser = await chromium.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
  args: [
    "--use-angle=swiftshader",
    "--enable-webgl",
    "--ignore-gpu-blocklist",
    "--autoplay-policy=no-user-gesture-required",
    "--disable-background-timer-throttling",
    "--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding",
    "--disable-features=CalculateNativeWinOcclusion"
  ]
});

try {
  const desktop = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  attachDiagnostics(desktop, "public-desktop");
  await desktop.goto(publicUrl, { waitUntil: "networkidle" });
  await desktop.waitForFunction(
    () => document.querySelector("#boot")?.classList.contains("done"),
    null,
    { timeout: 60000 }
  );
  await desktop.locator("#quality-select").evaluate((element) => {
    element.value = "low";
    element.dispatchEvent(new Event("change", { bubbles: true }));
  });

  const sourceSnapshot = await desktop.evaluate(() => ({
    title: document.title,
    titleText: document.querySelector("#title-screen h1")?.textContent || "",
    buildLabel: document.querySelector("#build-label")?.textContent || "",
    legalNotice: document.querySelector("#legal-notice")?.textContent || "",
    attribution: document.querySelector("#model-attribution")?.textContent || "",
    modelState: window.__danrenModelStatus || null,
    bgmSrc: document.querySelector("#bgm")?.getAttribute("src") || "",
    bgmState: window.__danrenBgmDebug?.() || null,
    localBgmButton: Boolean(document.querySelector("#bgm-pick-title")),
    localBgmInput: Boolean(document.querySelector("#bgm-file")),
    containsEmbeddedAudio: /data:audio|ggo-bgm/i.test(document.documentElement.innerHTML)
  }));

  check(sourceSnapshot.title === "刀剑神域GGO", "public title is wrong", sourceSnapshot.title);
  check(
    sourceSnapshot.titleText.replace(/\s/g, "") === "刀剑神域GGO",
    "public title screen is wrong",
    sourceSnapshot.titleText
  );
  check(
    sourceSnapshot.buildLabel.includes("PUBLIC EDUCATIONAL BUILD"),
    "public build label is missing",
    sourceSnapshot.buildLabel
  );
  check(
    sourceSnapshot.legalNotice.includes("非官方") &&
      sourceSnapshot.legalNotice.includes("不包含"),
    "public educational notice is missing",
    sourceSnapshot.legalNotice
  );
  check(
    sourceSnapshot.attribution.includes("程序化原创角色"),
    "procedural attribution is missing",
    sourceSnapshot.attribution
  );
  check(
    sourceSnapshot.modelState?.state === "procedural" &&
      sourceSnapshot.modelState?.modelId === "procedural-operator",
    "public build did not select the procedural character",
    JSON.stringify(sourceSnapshot.modelState)
  );
  check(!sourceSnapshot.bgmSrc, "public build embedded a default BGM", sourceSnapshot.bgmSrc);
  check(
    sourceSnapshot.bgmState?.status === "empty" &&
      sourceSnapshot.bgmState?.backgroundMusicMode === "none",
    "public build has a non-empty BGM state",
    JSON.stringify(sourceSnapshot.bgmState)
  );
  check(!sourceSnapshot.containsEmbeddedAudio, "public DOM contains embedded audio");
  check(sourceSnapshot.localBgmButton, "local BGM button is missing");
  check(sourceSnapshot.localBgmInput, "local BGM file input is missing");

  await desktop.locator("#start-button").click();
  await desktop.waitForFunction(
    () => !document.querySelector("#hud")?.classList.contains("hidden"),
    null,
    { timeout: 30000 }
  );
  const desktopZoneHud = await desktop.evaluate(() => ({
    zoneLabel: document.querySelector("#zone-label")?.textContent || "",
    objective: document.querySelector("#objective-text")?.textContent || "",
    pips: document.querySelectorAll("#uplink-pips i").length
  }));
  check(
    desktopZoneHud.zoneLabel.includes("01") &&
      desktopZoneHud.zoneLabel.includes("GGO"),
    "desktop zone label is missing",
    JSON.stringify(desktopZoneHud)
  );
  check(
    desktopZoneHud.pips === 3,
    "desktop objective pips do not match harbor",
    JSON.stringify(desktopZoneHud)
  );
  await desktop.keyboard.press("Digit3");
  await desktop.waitForFunction(
    () => window.__danrenInputDebug?.().weaponMode === "magic",
    null,
    { timeout: 30000 }
  );

  const elementBefore = await desktop.evaluate(
    () => document.querySelector("#magic-element")?.textContent || ""
  );
  await desktop.keyboard.press("KeyR");
  await desktop.waitForFunction(
    (previous) => {
      const current = document.querySelector("#magic-element")?.textContent || "";
      return current !== previous;
    },
    elementBefore,
    { timeout: 30000 }
  );

  await desktop.evaluate(() => {
    document.querySelector("#game").dispatchEvent(
      new MouseEvent("mousedown", {
        bubbles: true,
        button: 0,
        clientX: 720,
        clientY: 450
      })
    );
  });
  await desktop.waitForFunction(
    () =>
      window.__danrenMagicDebug?.().charging === true &&
      Number(window.__danrenMagicDebug?.().charge ?? 0) >= 0.25,
    null,
    { timeout: 30000 }
  );
  await desktop.evaluate(() => {
    document.querySelector("#game").dispatchEvent(
      new MouseEvent("mouseup", {
        bubbles: true,
        button: 0,
        clientX: 720,
        clientY: 450
      })
    );
  });
  await desktop.waitForFunction(
    () =>
      Number(window.__danrenMagicDebug?.().casts ?? 0) >= 1 &&
      Number(window.__danrenMagicDebug?.().mana ?? 100) < 100 &&
      Number(document.querySelector("#ammo-value")?.textContent || 100) < 100,
    null,
    { timeout: 30000 }
  );

  const magicState = await desktop.evaluate(() => ({
    weapon: document.querySelector("#weapon-name")?.textContent || "",
    element: document.querySelector("#magic-element")?.textContent || "",
    mana: Number(document.querySelector("#ammo-value")?.textContent || 100),
    debug: window.__danrenMagicDebug?.() || null
  }));
  check(magicState.weapon.includes("精灵"), "magic weapon did not activate", magicState.weapon);
  check(magicState.debug?.casts >= 1, "magic cast did not complete");
  check(magicState.mana < 100, "magic cast did not consume MP", String(magicState.mana));
  check(Boolean(magicState.element), "magic element label is empty");

  if (!existsSync(localBgmPath)) {
    failures.push(`local BGM fixture does not exist: ${localBgmPath}`);
  } else {
    await desktop.locator("#bgm-file").setInputFiles(localBgmPath);
    await desktop.waitForFunction(
      () =>
        window.__danrenBgmDebug?.().backgroundMusicMode === "local-file" &&
        window.__danrenBgmDebug?.().status === "playing",
      null,
      { timeout: 30000 }
    );
  }

  await desktop.screenshot({ path: "artifacts/public-desktop.png" });
  await desktop.close();

  const mobile = await browser.newPage({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 1
  });
  attachDiagnostics(mobile, "public-mobile");
  await mobile.goto(publicUrl, { waitUntil: "networkidle" });
  try {
    await mobile.waitForFunction(
      () => document.querySelector("#boot")?.classList.contains("done"),
      null,
      { timeout: 90000 }
    );
  } catch (error) {
    const bootState = await mobile.evaluate(() => ({
      bootClass: document.querySelector("#boot")?.className || "",
      bootDetail: document.querySelector("#boot-detail")?.textContent || "",
      fatal: document.querySelector("#fatal")?.textContent || "",
      fatalVisible: !document.querySelector("#fatal")?.classList.contains("hidden")
    }));
    failures.push(`[public-mobile] boot timed out: ${JSON.stringify(bootState)}`);
    throw error;
  }
  await mobile.locator("#quality-select").evaluate((element) => {
    element.value = "low";
    element.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await mobile.screenshot({ path: "artifacts/public-mobile-title.png" });
  await mobile.locator("#start-button").tap();
  await mobile.waitForFunction(
    () => !document.querySelector("#hud")?.classList.contains("hidden"),
    null,
    { timeout: 30000 }
  );

  const mobileInitial = await mobile.evaluate(() => {
    const zone = document.querySelector("#zone-label")?.getBoundingClientRect();
    const objective = document
      .querySelector("#objective-text")
      ?.getBoundingClientRect();
    const touchControls = [
      document.querySelector(".touch-actions")?.getBoundingClientRect(),
      document.querySelector(".move-stick")?.getBoundingClientRect()
    ].filter(Boolean);
    const touchTop = Math.min(...touchControls.map((control) => control.top));
    return {
      touchVisible: !document.querySelector("#touch-controls")?.classList.contains("hidden"),
      magicButton: Boolean(document.querySelector("#touch-magic")),
      elementButton: Boolean(document.querySelector("#touch-element")),
      crouchButton: Boolean(document.querySelector("#touch-crouch")),
      zoneText: document.querySelector("#zone-label")?.textContent || "",
      objectiveText: document.querySelector("#objective-text")?.textContent || "",
      zoneObjectiveOverlap:
        Boolean(zone && objective) &&
        !(
          zone.right <= objective.left ||
          zone.left >= objective.right ||
          zone.bottom <= objective.top ||
          zone.top >= objective.bottom
        ),
      objectiveAboveTouch:
        Boolean(objective) && touchControls.length > 0 && objective.bottom < touchTop,
      modelState: window.__danrenModelStatus || null
    };
  });
  check(mobileInitial.touchVisible, "mobile touch controls are hidden");
  check(mobileInitial.magicButton, "mobile magic button is missing");
  check(mobileInitial.elementButton, "mobile element button is missing");
  check(mobileInitial.crouchButton, "mobile crouch button is missing");
  check(mobileInitial.zoneText.includes("GGO"), "mobile zone label is missing");
  check(
    !mobileInitial.zoneObjectiveOverlap,
    "mobile zone label overlaps objective",
    JSON.stringify(mobileInitial)
  );
  check(
    mobileInitial.objectiveAboveTouch,
    "mobile objective overlaps touch controls",
    JSON.stringify(mobileInitial)
  );
  check(
    mobileInitial.modelState?.state === "procedural",
    "mobile build did not select the procedural character",
    JSON.stringify(mobileInitial.modelState)
  );

  await mobile.locator("#touch-magic").tap();
  await mobile.waitForFunction(
    () => window.__danrenInputDebug?.().weaponMode === "magic",
    null,
    { timeout: 30000 }
  );
  const mobileElementBefore = await mobile.evaluate(
    () => document.querySelector("#magic-element")?.textContent || ""
  );
  await mobile.locator("#touch-element").tap();
  await mobile.waitForFunction(
    (previous) => (document.querySelector("#magic-element")?.textContent || "") !== previous,
    mobileElementBefore,
    { timeout: 30000 }
  );
  await mobile.locator("#touch-crouch").tap();
  await mobile.waitForFunction(
    () => document.querySelector("#touch-crouch")?.classList.contains("active"),
    null,
    { timeout: 30000 }
  );
  await mobile.screenshot({ path: "artifacts/public-mobile-gameplay.png" });
} finally {
  await browser.close();
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log("public browser smoke passed");
}
