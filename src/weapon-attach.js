import * as THREE from "three";

function normalizeBoneName(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function collectNodes(root) {
  const nodes = [];
  root.traverse((node) => nodes.push(node));
  return nodes;
}

export function findBone(root, aliases = []) {
  if (!root || !Array.isArray(aliases) || aliases.length === 0) return null;
  const nodes = collectNodes(root);

  for (const alias of aliases) {
    const lowerAlias = String(alias).toLowerCase();
    const exact = nodes.find((node) => node.name?.toLowerCase() === lowerAlias);
    if (exact) return exact;
  }

  const normalizedAliases = aliases.map(normalizeBoneName).filter(Boolean);
  for (const alias of normalizedAliases) {
    const normalized = nodes.find(
      (node) => normalizeBoneName(node.name) === alias
    );
    if (normalized) return normalized;
  }

  for (const alias of normalizedAliases) {
    const suffixed = nodes.find((node) =>
      normalizeBoneName(node.name).endsWith(alias)
    );
    if (suffixed) return suffixed;
  }

  return null;
}

function applyTransform(
  object,
  transform = {},
  parentWorldScale = null,
  parentWorldQuaternion = null
) {
  const position = transform.position || [0, 0, 0];
  const worldOffset = transform.worldOffset || null;
  const rotation = transform.rotation || [0, 0, 0];
  const scale = transform.scale || [1, 1, 1];

  object.position.fromArray(position);
  if (worldOffset) {
    const localOffset = new THREE.Vector3().fromArray(worldOffset);
    if (parentWorldQuaternion) {
      localOffset.applyQuaternion(parentWorldQuaternion.clone().invert());
    }
    if (parentWorldScale) {
      localOffset.set(
        localOffset.x / parentWorldScale.x,
        localOffset.y / parentWorldScale.y,
        localOffset.z / parentWorldScale.z
      );
    }
    object.position.add(localOffset);
  }
  const desiredWorldQuaternion = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(
      rotation[0] || 0,
      rotation[1] || 0,
      rotation[2] || 0,
      "XYZ"
    )
  );
  object.quaternion
    .copy(parentWorldQuaternion || new THREE.Quaternion())
    .invert()
    .multiply(desiredWorldQuaternion);
  if (parentWorldScale) {
    object.scale.set(
      scale[0] / parentWorldScale.x,
      scale[1] / parentWorldScale.y,
      scale[2] / parentWorldScale.z
    );
  } else {
    object.scale.fromArray(scale);
  }
  object.updateMatrix();
}

export function applyWeaponOffset(
  object,
  restQuaternion,
  x = 0,
  y = 0,
  z = 0
) {
  if (!object?.isObject3D || !restQuaternion?.isQuaternion) return false;
  const offset = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(x, y, z, "XYZ")
  );
  object.quaternion.copy(restQuaternion).multiply(offset);
  object.updateMatrix();
  return true;
}

export function attachWeapon(object, bone, transform = {}) {
  if (!object?.isObject3D) throw new Error("Weapon must be an Object3D");
  if (!bone?.isObject3D) throw new Error("Attachment target must be an Object3D");

  const record = {
    object,
    originalParent: object.parent,
    position: object.position.clone(),
    quaternion: object.quaternion.clone(),
    scale: object.scale.clone(),
    restored: false
  };

  bone.add(object);
  bone.updateWorldMatrix(true, false);
  const parentWorldScale = bone.getWorldScale(object.scale.clone());
  const parentWorldQuaternion = bone.getWorldQuaternion(object.quaternion.clone());
  applyTransform(object, transform, parentWorldScale, parentWorldQuaternion);
  return record;
}

export function restoreWeapon(record) {
  if (!record?.object || record.restored) return false;
  const { object } = record;

  object.removeFromParent();
  if (record.originalParent) record.originalParent.add(object);
  object.position.copy(record.position);
  object.quaternion.copy(record.quaternion);
  object.scale.copy(record.scale);
  object.updateMatrix();
  record.restored = true;
  return true;
}
