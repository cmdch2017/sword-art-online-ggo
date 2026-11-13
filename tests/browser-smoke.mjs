import { mkdir } from "node:fs/promises";
import { chromium } from "playwright-core";

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

const errors = [];
await mkdir("artifacts", { recursive: true });

async function attachDiagnostics(page, label) {
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(`[${label}] console: ${message.text()} (${message.location().url || "unknown"})`);
    }
  });
  page.on("pageerror", (error) => {
    const entry = `[${label}] pageerror: ${error.stack || error.message}`;
    errors.push(entry);
    console.error(entry);
  });
  page.on("response", (response) => {
    if (response.status() >= 400) {
      errors.push(`[${label}] response ${response.status()}: ${response.url()}`);
    }
  });
}

const desktop = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await attachDiagnostics(desktop, "desktop");
await desktop.goto("http://127.0.0.1:4173", { waitUntil: "networkidle" });
await desktop.waitForFunction(() => document.querySelector("#boot")?.classList.contains("done"), null, {
  timeout: 60000
});
await desktop.waitForTimeout(900);
await desktop.locator("#quality-select").evaluate((element) => {
  element.value = "low";
  element.dispatchEvent(new Event("change", { bubbles: true }));
});
await desktop.waitForFunction(
  () =>
    window.__danrenBgmDebug?.().status === "ready" &&
    window.__danrenBgmDebug?.().backgroundMusicMode === "embedded-default",
  null,
  { timeout: 15000 }
);
const bootState = await desktop.evaluate(() => ({
  documentTitle: document.title,
  fatal: document.querySelector("#fatal")?.textContent || "",
  fatalVisible: !document.querySelector("#fatal")?.classList.contains("hidden"),
  canvasWidth: document.querySelector("#game")?.width || 0,
  canvasHeight: document.querySelector("#game")?.height || 0,
  titleVisible: !document.querySelector("#title-screen")?.classList.contains("hidden"),
  titleText: document.querySelector("#title-screen h1")?.textContent || "",
  modelState: window.__danrenModelStatus || null,
  weaponState: window.__danrenWeaponDebug?.snapshot() || null,
  bgmState: window.__danrenBgmDebug?.() || null,
  missionBrief: document.querySelector(".mission-brief")?.textContent || "",
  modelAttribution: document.querySelector("#model-attribution")?.textContent || "",
  modelAttributionTitle: document.querySelector("#model-attribution")?.title || ""
}));

if (
  bootState.modelState?.state !== "active" ||
  bootState.modelState?.modelId !== "player-kirito-sugaki"
) {
  errors.push(
    `[desktop] expected Kirito PMX model, got ${JSON.stringify(bootState.modelState)}`
  );
}

if (
  !bootState.modelAttribution.includes("すがき") ||
  !bootState.modelAttribution.includes("私人学习") ||
  !bootState.modelAttribution.includes("PRIVATE STUDY BUILD") ||
  !bootState.modelAttributionTitle.includes("bowlroll.net/file/96677")
) {
  errors.push(
    `[desktop] missing Kirito PMX attribution: ${JSON.stringify(bootState)}`
  );
}

if (
  bootState.weaponState?.gun?.parent !== "右手首" ||
  bootState.weaponState?.blade?.parent !== "左手首" ||
  !bootState.weaponState?.gun?.visible ||
  !bootState.weaponState?.blade?.visible
) {
  errors.push(
    `[desktop] expected visible gun/blade in right/left hands, got ${JSON.stringify(bootState.weaponState)}`
  );
}

if (
  bootState.documentTitle !== "刀剑神域GGO" ||
  bootState.titleText.replace(/\s/g, "") !== "刀剑神域GGO" ||
  bootState.bgmState?.backgroundMusicMode !== "embedded-default" ||
  bootState.bgmState?.status !== "ready" ||
  !bootState.bgmState?.label.includes("刀剑神域 GGO") ||
  bootState.bgmState?.ambienceMode !== "rain-only" ||
  !bootState.missionBrief.includes("切断 3 条战术链路") ||
  !bootState.missionBrief.includes("击破 NOCTIS") ||
  !bootState.missionBrief.includes("返回起点撤离")
) {
  errors.push(
    `[desktop] expected the embedded GGO BGM, rain-only ambience, and a three-stage mission brief: ${JSON.stringify(bootState)}`
  );
}

await desktop.locator("#start-button").click();
await desktop.waitForTimeout(1200);
await desktop.waitForFunction(
  () => window.__danrenBgmDebug?.().status === "playing",
  null,
  { timeout: 30000 }
);
await desktop.keyboard.down("KeyW");
try {
  await desktop.waitForFunction(
    () => Number(window.__danrenFeedbackDebug?.().movement.steps ?? 0) >= 1,
    null,
    { timeout: 30000 }
  );
} finally {
  await desktop.keyboard.up("KeyW");
}
await desktop.mouse.down();
try {
  await desktop.waitForFunction(
    () => Number(document.querySelector("#ammo-value")?.textContent) < 30,
    null,
    { timeout: 30000 }
  );
} finally {
  await desktop.mouse.up();
}
const feedbackState = await desktop.evaluate(
  () => window.__danrenFeedbackDebug?.() || null
);
await desktop.waitForFunction(
  (baselinePitch) =>
    Number(window.__danrenFeedbackDebug?.().combat.pitch ?? baselinePitch) <=
    Number(baselinePitch) * 0.35,
  Number(feedbackState?.combat?.pitch ?? 0),
  { timeout: 30000 }
);
const settledFeedbackState = await desktop.evaluate(
  () => window.__danrenFeedbackDebug?.() || null
);
const gameplayState = await desktop.evaluate(() => ({
  hudVisible: !document.querySelector("#hud")?.classList.contains("hidden"),
  ammo: document.querySelector("#ammo-value")?.textContent,
  time: document.querySelector("#run-time")?.textContent,
  objective: document.querySelector("#objective-text")?.textContent,
  bgmState: window.__danrenBgmDebug?.() || null,
  fatalVisible: !document.querySelector("#fatal")?.classList.contains("hidden"),
  inputDebug: window.__danrenInputDebug?.() || null,
  feedbackDebug: window.__danrenFeedbackDebug?.() || null,
  crosshairGap: Number.parseFloat(
    getComputedStyle(document.querySelector("#crosshair"))?.getPropertyValue("--gap") || "0"
  )
}));

await desktop.keyboard.press("KeyQ");
await desktop.waitForFunction(
  () => document.querySelector("#weapon-name")?.textContent?.includes("光刃"),
  null,
  { timeout: 30000 }
);
const bladeState = await desktop.evaluate(() => ({
  weapon: document.querySelector("#weapon-name")?.textContent || "",
  ammo: document.querySelector("#ammo-value")?.textContent || "",
  paused: !document.querySelector("#pause-screen")?.classList.contains("hidden"),
  fatalVisible: !document.querySelector("#fatal")?.classList.contains("hidden")
}));
await desktop.evaluate(() => {
  const canvas = document.querySelector("#game");
  canvas.dispatchEvent(
    new MouseEvent("mousedown", { bubbles: true, button: 0, clientX: 720, clientY: 450 })
  );
  window.setTimeout(() => {
    canvas.dispatchEvent(
      new MouseEvent("mouseup", { bubbles: true, button: 0, clientX: 720, clientY: 450 })
    );
  }, 80);
});
await desktop.waitForTimeout(700);
await desktop.waitForFunction(
  () => window.__danrenInputDebug?.().attack === null,
  null,
  { timeout: 30000 }
);
await desktop.keyboard.press("Digit3");
await desktop.waitForFunction(
  () => window.__danrenInputDebug?.().weaponMode === "magic",
  null,
  { timeout: 30000 }
);
await desktop.evaluate(() => {
  const canvas = document.querySelector("#game");
  canvas.dispatchEvent(
    new MouseEvent("mousedown", { bubbles: true, button: 0, clientX: 720, clientY: 450 })
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
    new MouseEvent("mouseup", { bubbles: true, button: 0, clientX: 720, clientY: 450 })
  );
});
await desktop.waitForFunction(
  () => Number(window.__danrenMagicDebug?.().casts ?? 0) >= 1,
  null,
  { timeout: 30000 }
);
const magicState = await desktop.evaluate(() => ({
  debug: window.__danrenMagicDebug?.() || null,
  weapon: document.querySelector("#weapon-name")?.textContent || "",
  mana: document.querySelector("#ammo-value")?.textContent || "",
  element: document.querySelector("#magic-element")?.textContent || "",
  magicHudVisible: !document.querySelector("#magic-hud")?.classList.contains("hidden")
}));
await desktop.evaluate(() => {
  window.dispatchEvent(new KeyboardEvent("keydown", { code: "Escape", bubbles: true }));
});
await desktop.waitForFunction(
  () =>
    !document.querySelector("#pause-screen")?.classList.contains("hidden") &&
    window.__danrenBgmDebug?.().status === "paused",
  null,
  { timeout: 30000 }
);
const pauseState = await desktop.evaluate(() => ({
  paused: !document.querySelector("#pause-screen")?.classList.contains("hidden"),
  bgmState: window.__danrenBgmDebug?.() || null
}));
await desktop.locator("#resume-button").click();
await desktop.waitForFunction(
  () => window.__danrenBgmDebug?.().status === "playing",
  null,
  { timeout: 30000 }
);
await desktop.locator("#bgm-file").setInputFiles("C:\\Windows\\Media\\Alarm01.wav");
await desktop.waitForFunction(
  () =>
    window.__danrenBgmDebug?.().status === "playing" &&
    window.__danrenBgmDebug?.().backgroundMusicMode === "local-file",
  null,
  { timeout: 30000 }
);
const localOverrideState = await desktop.evaluate(() => ({
  bgmState: window.__danrenBgmDebug?.() || null
}));
await desktop.locator("#quality-select").evaluate((element) => {
  element.value = "high";
  element.dispatchEvent(new Event("change", { bubbles: true }));
});
await desktop.screenshot({ path: "artifacts/desktop-final.png" });
await desktop.close();

const mobile = await browser.newPage({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 1
});
await attachDiagnostics(mobile, "mobile");
await mobile.goto("http://127.0.0.1:4173", { waitUntil: "networkidle" });
try {
  await mobile.waitForFunction(() => document.querySelector("#boot")?.classList.contains("done"), null, {
    timeout: 60000
  });
} catch (error) {
  const mobileBootState = await mobile.evaluate(() => ({
    bootClass: document.querySelector("#boot")?.className,
    bootDetail: document.querySelector("#boot-detail")?.textContent,
    fatal: document.querySelector("#fatal")?.textContent || "",
    fatalVisible: !document.querySelector("#fatal")?.classList.contains("hidden")
  }));
  console.error(JSON.stringify({ mobileBootState, errors }, null, 2));
  throw error;
}
await mobile.waitForTimeout(950);
await mobile.locator("#quality-select").evaluate((element) => {
  element.value = "low";
  element.dispatchEvent(new Event("change", { bubbles: true }));
});
await mobile.waitForFunction(
  () =>
    window.__danrenBgmDebug?.().status === "ready" &&
    window.__danrenBgmDebug?.().backgroundMusicMode === "embedded-default",
  null,
  { timeout: 15000 }
);
await mobile.screenshot({ path: "artifacts/mobile-title.png" });
await mobile.locator("#start-button").tap();
await mobile.waitForTimeout(1200);
await mobile.waitForFunction(
  () => window.__danrenBgmDebug?.().status === "playing",
  null,
  { timeout: 30000 }
);
await mobile.screenshot({ path: "artifacts/mobile-gameplay.png" });

const mobileState = await mobile.evaluate(() => ({
  documentTitle: document.title,
  titleText: document.querySelector("#title-screen h1")?.textContent || "",
  touchVisible: !document.querySelector("#touch-controls")?.classList.contains("hidden"),
  hudVisible: !document.querySelector("#hud")?.classList.contains("hidden"),
  modelState: window.__danrenModelStatus || null,
  bgmState: window.__danrenBgmDebug?.() || null,
  canvasRect: (() => {
    const rect = document.querySelector("#game")?.getBoundingClientRect();
    return rect ? { width: rect.width, height: rect.height } : null;
  })(),
  bodyOverflow: getComputedStyle(document.body).overflow,
  touchMagicVisible: Boolean(document.querySelector("#touch-magic")),
  touchCrouchVisible: Boolean(document.querySelector("#touch-crouch")),
  fatalVisible: !document.querySelector("#fatal")?.classList.contains("hidden")
}));

console.log(
  JSON.stringify(
    {
      bootState,
      feedbackState,
      gameplayState,
      bladeState,
      magicState,
      settledFeedbackState,
      pauseState,
      localOverrideState,
      mobileState,
      errors
    },
    null,
    2
  )
);
await browser.close();

if (
  bootState.fatalVisible ||
  gameplayState.fatalVisible ||
  bladeState.fatalVisible ||
  mobileState.fatalVisible ||
  mobileState.modelState?.state !== "active" ||
  mobileState.documentTitle !== "刀剑神域GGO" ||
  mobileState.titleText.replace(/\s/g, "") !== "刀剑神域GGO" ||
  mobileState.bgmState?.status !== "playing" ||
  mobileState.bgmState?.backgroundMusicMode !== "embedded-default" ||
  gameplayState.ammo === "30" ||
  gameplayState.bgmState?.status !== "playing" ||
  gameplayState.bgmState?.backgroundMusicMode !== "embedded-default" ||
  Number(feedbackState?.movement?.steps ?? 0) < 1 ||
  Number(feedbackState?.combat?.shots ?? 0) < 1 ||
  Number(feedbackState?.combat?.bloom ?? 0) <= 0 ||
  Number(feedbackState?.combat?.crosshair ?? 0) <= 0 ||
  Number(settledFeedbackState?.combat?.pitch ?? 1) >=
    Number(feedbackState?.combat?.pitch ?? 0) * 0.35 ||
  Math.abs(feedbackState?.movement?.bobY ?? 0) + Math.abs(feedbackState?.movement?.roll ?? 0) <= 0 ||
  gameplayState.crosshairGap <= 0 ||
  !pauseState.paused ||
  pauseState.bgmState?.status !== "paused" ||
  localOverrideState.bgmState?.status !== "playing" ||
  localOverrideState.bgmState?.backgroundMusicMode !== "local-file" ||
  Math.abs(gameplayState.inputDebug?.cameraPitch ?? 0) > 0.35 ||
  !bladeState.weapon.includes("光刃") ||
  bladeState.paused ||
  Number(magicState.debug?.casts ?? 0) < 1 ||
  Number(magicState.debug?.mana ?? 100) >= 100 ||
  !magicState.weapon.includes("精灵") ||
  !magicState.element.includes("火精灵") ||
  !magicState.magicHudVisible ||
  !mobileState.touchMagicVisible ||
  !mobileState.touchCrouchVisible ||
  errors.length > 0
) {
  process.exitCode = 1;
}
