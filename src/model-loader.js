import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js";
import { MMDLoader } from "./vendor/mmd/MMDLoader.js";

const COLOR_TEXTURE_KEYS = new Set([
  "map",
  "emissiveMap",
  "sheenColorMap",
  "specularColorMap"
]);
const CLOTH_MATERIALS = new Set([
  "shirt",
  "trousers",
  "boots",
  "belt",
  "linen"
]);

function normalizeAssetPath(value) {
  let decoded = String(value || "");
  try {
    decoded = decodeURIComponent(decoded);
  } catch {
    // Keep the original path when it contains malformed URL escapes.
  }
  return decoded.replaceAll("\\", "/").split(/[?#]/, 1)[0];
}

export function resolveMmdTextureUrl(url, textureMap = {}) {
  const normalizedUrl = normalizeAssetPath(url);
  const lowerUrl = normalizedUrl.toLowerCase();
  const fileName = lowerUrl.split("/").pop();

  for (const [source, target] of Object.entries(textureMap)) {
    const normalizedSource = normalizeAssetPath(source);
    const lowerSource = normalizedSource.toLowerCase();
    const sourceName = lowerSource.split("/").pop();
    if (
      lowerUrl.endsWith(lowerSource) ||
      (sourceName && fileName === sourceName)
    ) {
      return target;
    }
  }

  return url;
}

function createMmdLoader(entry) {
  const manager = new THREE.LoadingManager();
  manager.setURLModifier((url) =>
    resolveMmdTextureUrl(url, entry.mmdTextureMap)
  );
  return new MMDLoader(manager);
}

export function computeCharacterFit(bounds, targetHeight) {
  const height = bounds.maxY - bounds.minY;
  if (!Number.isFinite(height) || height <= 0) {
    throw new Error("Character model has an invalid vertical bounds");
  }
  if (!Number.isFinite(targetHeight) || targetHeight <= 0) {
    throw new Error("Character target height must be positive");
  }

  const scale = targetHeight / height;
  const centerX = (bounds.minX + bounds.maxX) * 0.5;
  const centerZ = (bounds.minZ + bounds.maxZ) * 0.5;
  const cleanZero = (value) => (value === 0 ? 0 : value);

  return {
    scale,
    offsetX: cleanZero(-centerX * scale),
    offsetY: cleanZero(-bounds.minY * scale),
    offsetZ: cleanZero(-centerZ * scale)
  };
}

function configureModelObject(sourceScene) {
  sourceScene.traverse((child) => {
    if (!child.isMesh) return;
    child.castShadow = true;
    child.receiveShadow = true;

    const materials = Array.isArray(child.material)
      ? child.material
      : [child.material];
    for (const material of materials) {
      if (!material) continue;
      for (const [key, value] of Object.entries(material)) {
        if (COLOR_TEXTURE_KEYS.has(key) && value?.isTexture) {
          value.colorSpace = THREE.SRGBColorSpace;
        }
      }
    }
  });
}

function sanitizeNodeName(value) {
  return String(value || "").replace(/[[\].:/]/g, "");
}

function ownMaterial(material, colors) {
  if (!material) return material;
  const copy = material.clone();
  copy.name = material.name;
  if (copy.color && colors?.[copy.name]) {
    copy.color.set(colors[copy.name]);
  }
  if ("roughness" in copy) {
    copy.roughness = CLOTH_MATERIALS.has(copy.name)
      ? 0.88
      : copy.name === "skin"
        ? 0.76
        : copy.roughness;
  }
  if ("metalness" in copy && CLOTH_MATERIALS.has(copy.name)) {
    copy.metalness = 0.04;
  }
  copy.needsUpdate = true;
  return copy;
}

async function assembleCharacterKit(entry, loader, onProgress) {
  const kit = entry.characterKit;
  const requests = [
    kit.body,
    ...kit.parts.map((part) => part.source),
    ...kit.animations
  ];
  const loaded = await Promise.all(
    requests.map((source) =>
      loader.loadAsync(source, (event) => onProgress?.(event))
    )
  );

  const body = loaded[0];
  if (!body?.scene) {
    throw new Error(`Character kit body ${kit.body} has no scene`);
  }

  const root = SkeletonUtils.clone(body.scene);
  root.name = `CharacterKit:${entry.id}`;
  const bones = new Map();
  const bodyMeshes = [];
  let fallbackBone = null;

  root.traverse((node) => {
    if (node.isBone) {
      bones.set(node.name, node);
      bones.set(sanitizeNodeName(node.name), node);
      fallbackBone ||= node;
    }
    if (node.isSkinnedMesh) {
      node.frustumCulled = false;
      node.material = ownMaterial(node.material, kit.colors);
    }
    if (node.isMesh && node.name.startsWith("skin_")) bodyMeshes.push(node);
  });

  if (!fallbackBone) {
    throw new Error(`Character kit ${entry.id} has no skeleton bones`);
  }

  const partAnimations = loaded.slice(1, 1 + kit.parts.length);
  kit.parts.forEach((part, index) => {
    const partAsset = partAnimations[index];
    partAsset.scene?.traverse((sourceMesh) => {
      if (!sourceMesh.isSkinnedMesh) return;
      const mappedBones = sourceMesh.skeleton.bones.map(
        (bone) =>
          bones.get(bone.name) ||
          bones.get(sanitizeNodeName(bone.name)) ||
          fallbackBone
      );
      const mesh = new THREE.SkinnedMesh(
        sourceMesh.geometry,
        ownMaterial(sourceMesh.material, kit.colors)
      );
      mesh.name = sourceMesh.name;
      mesh.frustumCulled = false;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.bind(
        new THREE.Skeleton(mappedBones, sourceMesh.skeleton.boneInverses),
        sourceMesh.bindMatrix
      );
      root.add(mesh);
    });
  });

  const hiddenRegions = new Set(
    kit.parts.flatMap((part) => part.hides || [])
  );
  for (const mesh of bodyMeshes) {
    mesh.visible = !hiddenRegions.has(mesh.name);
  }

  const boneNames = new Set([...bones.keys()].filter(Boolean));
  const animationAssets = loaded.slice(1 + kit.parts.length);
  const clips = [];
  const clipNames = new Set();
  for (const asset of animationAssets) {
    for (const clip of asset.animations || []) {
      if (!clip?.name || clipNames.has(clip.name) || clip.name === "T-Pose") {
        continue;
      }
      const tracks = clip.tracks.filter((track) => {
        const nodeName = track.name.replace(
          /\.(position|quaternion|scale|morphTargetInfluences)$/,
          ""
        );
        return boneNames.has(nodeName);
      });
      if (tracks.length === 0) continue;
      clips.push(new THREE.AnimationClip(clip.name, clip.duration, tracks));
      clipNames.add(clip.name);
    }
  }

  return {
    scene: root,
    animations: clips
  };
}

function disposeModelObject(root) {
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();

  root.traverse((child) => {
    if (child.geometry) geometries.add(child.geometry);
    const childMaterials = Array.isArray(child.material)
      ? child.material
      : [child.material];
    for (const material of childMaterials) {
      if (!material) continue;
      materials.add(material);
      for (const value of Object.values(material)) {
        if (value?.isTexture) textures.add(value);
      }
    }
  });

  textures.forEach((texture) => texture.dispose());
  materials.forEach((material) => material.dispose());
  geometries.forEach((geometry) => geometry.dispose());
}

export async function loadModelAsset(
  entry,
  { loader = null, pmxLoader = null, onProgress = null } = {}
) {
  if (!entry?.source) throw new Error("Model entry is missing a source");

  const isPmx = /\.pmx$/i.test(entry.source);
  let loaded;
  if (isPmx) {
    const activePmxLoader = pmxLoader || createMmdLoader(entry);
    const result = await activePmxLoader.loadAsync(entry.source, (event) => {
      onProgress?.(event);
    });
    loaded = result?.scene
      ? result
      : result?.isObject3D
        ? { scene: result, animations: result.animations || [] }
        : null;
  } else {
    const activeGltfLoader = loader || new GLTFLoader();
    loaded = entry.characterKit
      ? await assembleCharacterKit(entry, activeGltfLoader, onProgress)
      : await activeGltfLoader.loadAsync(entry.source, (event) => {
          onProgress?.(event);
        });
  }
  if (!loaded?.scene) {
    throw new Error(`Model ${entry.id || entry.source} has no scene`);
  }

  configureModelObject(loaded.scene);
  loaded.scene.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(loaded.scene);
  if (bounds.isEmpty()) {
    throw new Error(`Model ${entry.id || entry.source} has empty bounds`);
  }

  const fit = computeCharacterFit(
    {
      minX: bounds.min.x,
      maxX: bounds.max.x,
      minY: bounds.min.y,
      maxY: bounds.max.y,
      minZ: bounds.min.z,
      maxZ: bounds.max.z
    },
    entry.targetHeight
  );
  const normalizedScene = new THREE.Group();
  normalizedScene.name = `ImportedModel:${entry.id || entry.source}`;
  normalizedScene.scale.setScalar(fit.scale);
  normalizedScene.position.set(fit.offsetX, fit.offsetY, fit.offsetZ);
  normalizedScene.rotation.y = entry.facingOffset || 0;
  normalizedScene.add(loaded.scene);
  normalizedScene.updateMatrixWorld(true);

  return {
    entry,
    scene: normalizedScene,
    sourceScene: loaded.scene,
    animations: loaded.animations || [],
    dispose() {
      normalizedScene.removeFromParent();
      disposeModelObject(normalizedScene);
    }
  };
}
