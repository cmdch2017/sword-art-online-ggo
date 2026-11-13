import * as THREE from "three";

const ONE_SHOT_STATES = new Set(["hit", "fire", "bladeAttack", "death"]);
const STATE_FALLBACKS = {
  sprint: ["run", "walk", "idle"],
  run: ["walk", "idle"],
  walk: ["run", "idle"],
  aim: ["idle"],
  fire: ["aim", "idle"],
  bladeAttack: ["idle"],
  block: ["aim", "idle"],
  hit: ["idle"],
  death: ["idle"]
};

export function chooseAnimationState({
  dead = false,
  hit = false,
  attacking = false,
  firing = false,
  blocking = false,
  aiming = false,
  sprinting = false,
  moving = false
} = {}) {
  if (dead) return "death";
  if (hit) return "hit";
  if (attacking) return "bladeAttack";
  if (firing) return "fire";
  if (blocking) return "block";
  if (aiming) return "aim";
  if (sprinting && moving) return "sprint";
  if (moving) return "run";
  return "idle";
}

export function normalizeClipName(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function resolveAnimationClip(clips, aliases = []) {
  if (!Array.isArray(clips) || clips.length === 0) return null;

  for (const alias of aliases) {
    const exact = clips.find(
      (clip) => clip.name?.toLowerCase() === String(alias).toLowerCase()
    );
    if (exact) return exact;
  }

  const normalizedAliases = aliases.map(normalizeClipName).filter(Boolean);
  for (const alias of normalizedAliases) {
    const normalized = clips.find(
      (clip) => normalizeClipName(clip.name) === alias
    );
    if (normalized) return normalized;
  }

  for (const alias of normalizedAliases) {
    const partial = clips.find((clip) =>
      normalizeClipName(clip.name).includes(alias)
    );
    if (partial) return partial;
  }

  return null;
}

export class AnimationController {
  constructor(root, clips, stateAliases = {}, fadeDuration = 0.14) {
    this.root = root;
    this.clips = clips;
    this.stateAliases = stateAliases;
    this.fadeDuration = fadeDuration;
    this.mixer = new THREE.AnimationMixer(root);
    this.actions = new Map();
    this.stateClips = new Map();
    this.currentState = null;
    this.currentAction = null;

    for (const [state, aliases] of Object.entries(stateAliases)) {
      const clip = resolveAnimationClip(clips, aliases);
      if (clip) this.stateClips.set(state, clip);
    }
  }

  resolveState(state) {
    const candidates = [state, ...(STATE_FALLBACKS[state] || [])];
    return candidates.find((candidate) => this.stateClips.has(candidate)) || null;
  }

  getAction(state) {
    let action = this.actions.get(state);
    if (action) return action;

    const clip = this.stateClips.get(state);
    if (!clip) return null;
    action = this.mixer.clipAction(clip);
    action.enabled = true;
    action.setEffectiveTimeScale(1);
    action.setEffectiveWeight(1);

    if (ONE_SHOT_STATES.has(state)) {
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
    } else {
      action.setLoop(THREE.LoopRepeat, Infinity);
      action.clampWhenFinished = false;
    }

    this.actions.set(state, action);
    return action;
  }

  setState(state) {
    const resolvedState = this.resolveState(state);
    if (!resolvedState || resolvedState === this.currentState) {
      return Boolean(resolvedState);
    }

    const previousAction = this.currentAction;
    const action = this.getAction(resolvedState);
    if (!action) return false;

    if (ONE_SHOT_STATES.has(resolvedState)) action.reset();
    action.play();
    if (previousAction && previousAction !== action) {
      action.fadeIn(this.fadeDuration);
      previousAction.fadeOut(this.fadeDuration);
    } else {
      action.fadeIn(this.fadeDuration);
    }

    this.currentState = resolvedState;
    this.currentAction = action;
    return true;
  }

  update(dt) {
    this.mixer.update(dt);
  }

  dispose() {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.root);
    this.actions.clear();
    this.stateClips.clear();
    this.currentAction = null;
    this.currentState = null;
  }
}
