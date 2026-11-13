import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

import {
  selectCharacterModel,
  validateModelManifest
} from "../src/model-schema.mjs";

const validManifest = {
  version: 1,
  defaultCharacter: "player",
  models: [
    {
      id: "player",
      kind: "character",
      slot: "player",
      enabled: true,
      source: "models/kirito.glb",
      label: "Kirito fan model",
      author: "Artist",
      license: "CC BY 4.0",
      licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
      sourceUrl: "https://example.com/model",
      targetHeight: 1.85,
      facingOffset: 0,
      animations: { idle: ["Idle"] },
      weaponBones: { gun: ["RightHand"] },
      weaponTransforms: {
        gun: {
          position: [0, 0, 0],
          rotation: [0, 0, 0],
          scale: [1, 1, 1]
        }
      }
    }
  ]
};

test("manifest validation normalizes an enabled character", () => {
  const models = validateModelManifest(validManifest);

  assert.equal(models.length, 1);
  assert.equal(models[0].targetHeight, 1.85);
  assert.deepEqual(models[0].animations.idle, ["Idle"]);
});

test("active model selection returns null when the character is disabled", () => {
  const manifest = structuredClone(validManifest);
  manifest.models[0].enabled = false;

  assert.equal(selectCharacterModel(manifest, "player"), null);
});

test("manifest validation rejects unsafe source paths", () => {
  const manifest = structuredClone(validManifest);
  manifest.models[0].source = "../secret.glb";

  assert.throws(() => validateModelManifest(manifest), /models\//);
});

test("enabled models must include complete attribution metadata", () => {
  const manifest = structuredClone(validManifest);
  delete manifest.models[0].author;

  assert.throws(() => validateModelManifest(manifest), /author/);
});

test("animation aliases normalize to arrays of non-empty names", () => {
  const manifest = structuredClone(validManifest);
  manifest.models[0].animations = { idle: "Idle", run: [" Run ", "Walk"] };

  const [model] = validateModelManifest(manifest);
  assert.deepEqual(model.animations, { idle: ["Idle"], run: ["Run", "Walk"] });
});

test("character kit paths and part slots are normalized", () => {
  const manifest = structuredClone(validManifest);
  manifest.models[0].source = "models/player/zero-edge/Body.glb";
  manifest.models[0].characterKit = {
    body: "models\\player\\zero-edge\\Body.glb",
    parts: [
      {
        source: "models/player/zero-edge/hair.glb",
        slot: "hair",
        hides: ["skin_head"]
      }
    ],
    animations: ["models/player/zero-edge/General.glb"],
    colors: {
      hair: "#0b0f12",
      shirt: "#11181b"
    }
  };

  const [model] = validateModelManifest(manifest);
  assert.equal(model.characterKit.body, "models/player/zero-edge/Body.glb");
  assert.deepEqual(model.characterKit.parts[0], {
    source: "models/player/zero-edge/hair.glb",
    slot: "hair",
    hides: ["skin_head"]
  });
  assert.deepEqual(model.characterKit.animations, [
    "models/player/zero-edge/General.glb"
  ]);
  assert.deepEqual(model.characterKit.colors, {
    hair: "#0b0f12",
    shirt: "#11181b"
  });
});

test("character kit part paths cannot escape models/", () => {
  const manifest = structuredClone(validManifest);
  manifest.models[0].characterKit = {
    body: "models/player/zero-edge/Body.glb",
    parts: [
      {
        source: "../../secret.glb",
        slot: "hair"
      }
    ],
    animations: []
  };

  assert.throws(() => validateModelManifest(manifest), /models\//);
});

test("MMD texture map targets normalize to safe model asset paths", () => {
  const manifest = structuredClone(validManifest);
  manifest.models[0].mmdTextureMap = {
    "Textures\\黒目.jpg":
      "models\\player\\kirito-sugaki\\textures\\eye.jpg"
  };

  const [model] = validateModelManifest(manifest);
  assert.equal(
    model.mmdTextureMap["Textures\\黒目.jpg"],
    "models/player/kirito-sugaki/textures/eye.jpg"
  );
});

test("MMD texture map targets cannot escape models/", () => {
  const manifest = structuredClone(validManifest);
  manifest.models[0].mmdTextureMap = {
    "Textures\\黒目.jpg": "../../private/eye.jpg"
  };

  assert.throws(() => validateModelManifest(manifest), /models\//);
});

test("the shipped manifest selects the attributed PMX Kirito study model", async () => {
  const raw = JSON.parse(
    await readFile(new URL("../models/manifest.json", import.meta.url), "utf8")
  );
  const selected = selectCharacterModel(raw, raw.defaultCharacter);

  assert.equal(selected?.id, "player-kirito-sugaki");
  assert.equal(selected.source, "models/player/kirito-sugaki/model.pmx");
  assert.match(selected.author, /すがき/);
  assert.match(selected.author, /@kadu311/);
  assert.match(selected.license, /私人学习/);
  assert.match(selected.license, /再配布禁止/);
  assert.equal(
    selected.mmdTextureMap["Textures\\黒目.jpg"],
    "models/player/kirito-sugaki/textures/eye.jpg"
  );

  await access(new URL(`../${selected.source}`, import.meta.url));
  for (const texture of Object.values(selected.mmdTextureMap)) {
    await access(new URL(`../${texture}`, import.meta.url));
  }
});
