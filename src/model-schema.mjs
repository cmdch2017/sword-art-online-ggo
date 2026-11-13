const SUPPORTED_VERSION = 1;
const MODEL_KINDS = new Set(["character", "weapon"]);

function requireString(value, field) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${field} must be a non-empty string`);
  }
  return value.trim();
}

function normalizeSource(value, field) {
  const source = requireString(value, field).replaceAll("\\", "/");
  if (!source.startsWith("models/") || source.split("/").includes("..")) {
    throw new Error(`${field} must stay inside models/`);
  }
  return source;
}

function normalizeAliases(value, field) {
  const aliases = Array.isArray(value) ? value : [value];
  const normalized = aliases.map((alias) => requireString(alias, field));
  if (normalized.length === 0) {
    throw new Error(`${field} must contain at least one alias`);
  }
  return normalized;
}

function normalizeAnimationMap(value, field) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${field} must be an object`);
  }
  return Object.fromEntries(
    Object.entries(value).map(([state, aliases]) => [
      state,
      normalizeAliases(aliases, `${field}.${state}`)
    ])
  );
}

function normalizeCharacterKit(value, field) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${field} must be an object`);
  }

  if (!Array.isArray(value.parts)) {
    throw new Error(`${field}.parts must be an array`);
  }
  if (!Array.isArray(value.animations)) {
    throw new Error(`${field}.animations must be an array`);
  }

  const colors = value.colors || {};
  if (!colors || typeof colors !== "object" || Array.isArray(colors)) {
    throw new Error(`${field}.colors must be an object`);
  }

  return {
    body: normalizeSource(value.body, `${field}.body`),
    parts: value.parts.map((part, index) => ({
      source: normalizeSource(part?.source, `${field}.parts[${index}].source`),
      slot: requireString(part?.slot, `${field}.parts[${index}].slot`),
      hides: Array.isArray(part.hides)
        ? part.hides.map((name, hideIndex) =>
            requireString(name, `${field}.parts[${index}].hides[${hideIndex}]`)
          )
        : []
    })),
    animations: value.animations.map((source, index) =>
      normalizeSource(source, `${field}.animations[${index}]`)
    ),
    colors: Object.fromEntries(
      Object.entries(colors).map(([name, color]) => [
        requireString(name, `${field}.colors key`),
        requireString(color, `${field}.colors.${name}`)
      ])
    )
  };
}

function normalizeMmdTextureMap(value, field) {
  if (value == null) return null;
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${field} must be an object`);
  }

  return Object.fromEntries(
    Object.entries(value).map(([source, target], index) => [
      requireString(source, `${field} key ${index}`),
      normalizeSource(target, `${field}.${source}`)
    ])
  );
}

function requireAttribution(entry, index) {
  requireString(entry.label, `models[${index}].label`);
  requireString(entry.author, `models[${index}].author`);
  requireString(entry.license, `models[${index}].license`);
  requireString(entry.licenseUrl, `models[${index}].licenseUrl`);
  requireString(entry.sourceUrl, `models[${index}].sourceUrl`);
}

export function validateModelManifest(raw) {
  if (raw?.version !== SUPPORTED_VERSION || !Array.isArray(raw.models)) {
    throw new Error(`Unsupported model manifest version: ${raw?.version ?? "missing"}`);
  }

  const seen = new Set();
  return raw.models.map((entry, index) => {
    if (!entry || typeof entry !== "object") {
      throw new Error(`models[${index}] must be an object`);
    }

    const id = requireString(entry.id, `models[${index}].id`);
    if (seen.has(id)) throw new Error(`Duplicate model id: ${id}`);
    seen.add(id);

    if (!MODEL_KINDS.has(entry.kind)) {
      throw new Error(`Invalid model kind: ${entry.kind}`);
    }

    const targetHeight = Number(entry.targetHeight);
    if (!Number.isFinite(targetHeight) || targetHeight <= 0) {
      throw new Error(`models[${index}].targetHeight must be positive`);
    }

    const enabled = Boolean(entry.enabled);
    if (enabled) requireAttribution(entry, index);

    return {
      ...entry,
      id,
      source: normalizeSource(entry.source, `models[${index}].source`),
      enabled,
      targetHeight,
      facingOffset: Number(entry.facingOffset) || 0,
      animations: normalizeAnimationMap(
        entry.animations || {},
        `models[${index}].animations`
      ),
      characterKit: entry.characterKit
        ? normalizeCharacterKit(
            entry.characterKit,
            `models[${index}].characterKit`
          )
        : null,
      mmdTextureMap: normalizeMmdTextureMap(
        entry.mmdTextureMap,
        `models[${index}].mmdTextureMap`
      ),
      weaponBones: entry.weaponBones || {},
      weaponTransforms: entry.weaponTransforms || {}
    };
  });
}

export function selectCharacterModel(raw, defaultCharacterId) {
  const models = validateModelManifest(raw);
  return models.find(
    (entry) =>
      entry.kind === "character" &&
      entry.enabled &&
      entry.id === defaultCharacterId
  ) || null;
}
