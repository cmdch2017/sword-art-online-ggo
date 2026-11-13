import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";

import {
  computeCharacterFit,
  loadModelAsset,
  resolveMmdTextureUrl
} from "../src/model-loader.js";

function skinGeometry(geometry) {
  const vertexCount = geometry.getAttribute("position").count;
  geometry.setAttribute(
    "skinIndex",
    new THREE.Uint16BufferAttribute(new Uint16Array(vertexCount * 4), 4)
  );
  geometry.setAttribute(
    "skinWeight",
    new THREE.Float32BufferAttribute(
      new Float32Array(vertexCount * 4).fill(0).map((_, index) =>
        index % 4 === 0 ? 1 : 0
      ),
      4
    )
  );
  return geometry;
}

test("character normalization scales height and places feet at origin", () => {
  const fit = computeCharacterFit(
    {
      minX: -2,
      maxX: 2,
      minY: 10,
      maxY: 20,
      minZ: -1,
      maxZ: 1
    },
    2
  );

  assert.equal(fit.scale, 0.2);
  assert.equal(fit.offsetX, 0);
  assert.equal(fit.offsetY, -2);
  assert.equal(fit.offsetZ, 0);
});

test("model loader returns a normalized, shadow-ready scene", async () => {
  const sourceScene = new THREE.Group();
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(2, 10, 2),
    new THREE.MeshStandardMaterial()
  );
  mesh.position.y = 15;
  sourceScene.add(mesh);

  const animation = new THREE.AnimationClip("Idle", 1, []);
  const loader = {
    async loadAsync(url) {
      assert.equal(url, "models/kirito.glb");
      return { scene: sourceScene, animations: [animation] };
    }
  };

  const bundle = await loadModelAsset(
    {
      id: "player-kirito",
      source: "models/kirito.glb",
      targetHeight: 1.85,
      facingOffset: Math.PI / 3
    },
    { loader }
  );

  bundle.scene.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(bundle.scene);
  assert.ok(Math.abs(bounds.max.y - bounds.min.y - 1.85) < 1e-6);
  assert.ok(Math.abs(bounds.min.y) < 1e-6);
  assert.ok(Math.abs(bundle.scene.rotation.y - Math.PI / 3) < 1e-6);
  assert.equal(bundle.animations[0], animation);
  assert.equal(mesh.castShadow, true);
  assert.equal(mesh.receiveShadow, true);
});

test("PMX models use the injected MMD loader and normalize its mesh", async () => {
  const sourceScene = new THREE.Group();
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(1.4, 15, 1.1),
    new THREE.MeshToonMaterial()
  );
  mesh.position.y = 7.5;
  sourceScene.add(mesh);

  const requested = [];
  const pmxLoader = {
    async loadAsync(url, onProgress) {
      requested.push(url);
      onProgress?.({ loaded: 1, total: 2 });
      return sourceScene;
    }
  };
  const progress = [];

  const bundle = await loadModelAsset(
    {
      id: "player-kirito-sugaki",
      source: "models/player/kirito-sugaki/model.pmx",
      targetHeight: 1.8,
      facingOffset: 0
    },
    {
      loader: null,
      pmxLoader,
      onProgress(event) {
        progress.push(event.loaded);
      }
    }
  );

  bundle.scene.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(bundle.scene);
  assert.deepEqual(requested, ["models/player/kirito-sugaki/model.pmx"]);
  assert.deepEqual(progress, [1]);
  assert.equal(bundle.sourceScene, sourceScene);
  assert.deepEqual(bundle.animations, []);
  assert.ok(Math.abs(bounds.max.y - bounds.min.y - 1.8) < 1e-6);
  assert.ok(Math.abs(bounds.min.y) < 1e-6);
});

test("MMD texture resolution maps Japanese PMX paths to packaged ASCII assets", () => {
  const textureMap = {
    "Textures\\黒目.jpg":
      "models/player/kirito-sugaki/textures/eye.jpg",
    "sph1.bmp": "models/player/kirito-sugaki/textures/spherical1.bmp"
  };

  assert.equal(
    resolveMmdTextureUrl(
      "models/player/kirito-sugaki/Textures/黒目.jpg",
      textureMap
    ),
    "models/player/kirito-sugaki/textures/eye.jpg"
  );
  assert.equal(
    resolveMmdTextureUrl(
      "models/player/kirito-sugaki/sph1.bmp",
      textureMap
    ),
    "models/player/kirito-sugaki/textures/spherical1.bmp"
  );
  assert.equal(
    resolveMmdTextureUrl(
      "models/player/kirito-sugaki/Textures/unknown.png",
      textureMap
    ),
    "models/player/kirito-sugaki/Textures/unknown.png"
  );
});

test("character kits combine body parts, hidden regions, colors, and clips", async () => {
  const bodyRoot = new THREE.Group();
  const rootBone = new THREE.Bone();
  rootBone.name = "root";
  const handSlot = new THREE.Bone();
  handSlot.name = "handslotr";
  rootBone.add(handSlot);
  bodyRoot.add(rootBone);

  const bodyMesh = new THREE.SkinnedMesh(
    skinGeometry(new THREE.BoxGeometry(0.5, 2.32, 0.5)),
    new THREE.MeshStandardMaterial({ name: "skin" })
  );
  bodyMesh.name = "skin_torso";
  bodyMesh.bind(new THREE.Skeleton([rootBone]), new THREE.Matrix4());
  bodyMesh.position.y = 1.16;
  bodyRoot.add(bodyMesh);

  const partBone = new THREE.Bone();
  partBone.name = "root";
  const partMesh = new THREE.SkinnedMesh(
    skinGeometry(new THREE.BoxGeometry(0.55, 0.2, 0.55)),
    new THREE.MeshStandardMaterial({ name: "hair", color: 0x777777 })
  );
  partMesh.name = "hair_model";
  partMesh.bind(new THREE.Skeleton([partBone]), new THREE.Matrix4());
  partMesh.position.y = 2.1;
  const partRoot = new THREE.Group();
  partRoot.add(partBone);
  partRoot.add(partMesh);

  const animation = new THREE.AnimationClip("Idle_A", 1, [
    new THREE.VectorKeyframeTrack("root.position", [0, 1], [0, 0, 0, 0, 0, 0])
  ]);
  const files = {
    "models/player/kit/Body.glb": { scene: bodyRoot, animations: [] },
    "models/player/kit/Hair.glb": { scene: partRoot, animations: [] },
    "models/player/kit/General.glb": { scene: new THREE.Group(), animations: [animation] }
  };
  const requested = [];
  const loader = {
    async loadAsync(url) {
      requested.push(url);
      return files[url];
    }
  };

  const bundle = await loadModelAsset(
    {
      id: "player-zero-edge",
      source: "models/player/kit/Body.glb",
      targetHeight: 1.8,
      facingOffset: 0,
      characterKit: {
        body: "models/player/kit/Body.glb",
        parts: [
          {
            source: "models/player/kit/Hair.glb",
            slot: "hair",
            hides: ["skin_torso"]
          }
        ],
        animations: ["models/player/kit/General.glb"],
        colors: {
          hair: "#0b0f12"
        }
      }
    },
    { loader }
  );

  assert.deepEqual(requested.sort(), Object.keys(files).sort());
  assert.equal(bundle.animations[0].name, "Idle_A");
  assert.equal(bundle.sourceScene.getObjectByName("skin_torso").visible, false);
  assert.ok(bundle.sourceScene.getObjectByName("hair_model"));
  assert.ok(bundle.sourceScene.getObjectByName("handslotr"));
  assert.equal(
    bundle.sourceScene.getObjectByName("hair_model").material.color.getHexString(),
    "0b0f12"
  );
});

test("character kits preserve animation tracks for dotted bone names", async () => {
  const bodyRoot = new THREE.Group();
  const upperArm = new THREE.Bone();
  upperArm.name = "upperarm.l";
  bodyRoot.add(upperArm);

  const bodyMesh = new THREE.SkinnedMesh(
    skinGeometry(new THREE.BoxGeometry(0.5, 2, 0.5)),
    new THREE.MeshStandardMaterial()
  );
  bodyMesh.bind(new THREE.Skeleton([upperArm]), new THREE.Matrix4());
  bodyRoot.add(bodyMesh);

  const animation = new THREE.AnimationClip("Walking_A", 1, [
    new THREE.QuaternionKeyframeTrack(
      "upperarm.l.quaternion",
      [0, 1],
      [0, 0, 0, 1, 0, 0.2, 0, 0.98]
    )
  ]);
  const files = {
    "models/player/kit/Body.glb": { scene: bodyRoot, animations: [] },
    "models/player/kit/Movement.glb": {
      scene: new THREE.Group(),
      animations: [animation]
    }
  };
  const loader = {
    async loadAsync(url) {
      return files[url];
    }
  };

  const bundle = await loadModelAsset(
    {
      id: "player-zero-edge",
      source: "models/player/kit/Body.glb",
      targetHeight: 1.8,
      characterKit: {
        body: "models/player/kit/Body.glb",
        parts: [],
        animations: ["models/player/kit/Movement.glb"],
        colors: {}
      }
    },
    { loader }
  );

  assert.equal(bundle.animations[0].tracks.length, 1);
  assert.equal(bundle.animations[0].tracks[0].name, "upperarm.l.quaternion");
});
