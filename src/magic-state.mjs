export const MAGIC_ELEMENT = Object.freeze({
  FIRE: "fire",
  ICE: "ice",
  WIND: "wind",
  LIGHTNING: "lightning"
});

export const MAGIC_ELEMENT_ORDER = Object.freeze([
  MAGIC_ELEMENT.FIRE,
  MAGIC_ELEMENT.ICE,
  MAGIC_ELEMENT.WIND,
  MAGIC_ELEMENT.LIGHTNING
]);

const PROFILES = Object.freeze({
  [MAGIC_ELEMENT.FIRE]: Object.freeze({
    label: "火精灵",
    spellName: "烈火球",
    school: "火属性直射魔法",
    color: 0xff5a2e,
    hotColor: 0xffd178,
    manaCost: 24,
    cooldown: 1.05,
    damage: 44,
    radius: 3.4,
    projectileSpeed: 25
  }),
  [MAGIC_ELEMENT.ICE]: Object.freeze({
    label: "冰精灵",
    spellName: "冰晶枪",
    school: "冰属性贯穿魔法",
    color: 0x76d8ff,
    hotColor: 0xe8fbff,
    manaCost: 20,
    cooldown: 0.82,
    damage: 34,
    radius: 1.5,
    projectileSpeed: 40
  }),
  [MAGIC_ELEMENT.WIND]: Object.freeze({
    label: "风精灵",
    spellName: "风刃环",
    school: "风属性范围魔法",
    color: 0x70f0b5,
    hotColor: 0xd6fff0,
    manaCost: 28,
    cooldown: 1.18,
    damage: 30,
    radius: 4.8,
    projectileSpeed: 22
  }),
  [MAGIC_ELEMENT.LIGHTNING]: Object.freeze({
    label: "雷精灵",
    spellName: "雷闪链",
    school: "雷属性连锁魔法",
    color: 0xb98cff,
    hotColor: 0xf0e8ff,
    manaCost: 32,
    cooldown: 1.35,
    damage: 52,
    radius: 7.2,
    projectileSpeed: 58
  })
});

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function isMagicElement(element) {
  return Object.hasOwn(PROFILES, element);
}

export function magicElementProfile(element) {
  return PROFILES[isMagicElement(element) ? element : MAGIC_ELEMENT.FIRE];
}

export function createMagicState() {
  return {
    selectedElement: MAGIC_ELEMENT.FIRE,
    mana: 100,
    maxMana: 100,
    manaRegen: 15,
    charging: false,
    charge: 0,
    minCharge: 0.2,
    maxCharge: 1.15,
    cooldown: 0
  };
}

export function selectMagicElement(state, element) {
  if (state.charging || !isMagicElement(element)) return state;
  state.selectedElement = element;
  return state;
}

export function cycleMagicElement(state, direction = 1) {
  if (state.charging) return state;
  const current = MAGIC_ELEMENT_ORDER.indexOf(state.selectedElement);
  const step = direction < 0 ? -1 : 1;
  const next =
    (current + step + MAGIC_ELEMENT_ORDER.length) % MAGIC_ELEMENT_ORDER.length;
  state.selectedElement = MAGIC_ELEMENT_ORDER[next];
  return state;
}

export function beginMagicCast(state) {
  if (state.charging) return { started: false, reason: "charging" };
  if (state.cooldown > 0) return { started: false, reason: "cooldown" };
  const profile = magicElementProfile(state.selectedElement);
  if (state.mana < profile.manaCost) {
    return { started: false, reason: "mana", required: profile.manaCost };
  }
  state.charging = true;
  state.charge = 0;
  return {
    started: true,
    element: state.selectedElement,
    profile
  };
}

export function tickMagicState(state, dt) {
  const safeDt = Math.max(0, Number.isFinite(dt) ? dt : 0);
  state.cooldown = Math.max(0, state.cooldown - safeDt);
  if (state.charging) {
    state.charge = Math.min(state.maxCharge, state.charge + safeDt);
  } else if (state.cooldown <= 0) {
    state.mana = Math.min(state.maxMana, state.mana + state.manaRegen * safeDt);
  }
  return state;
}

export function releaseMagicCast(state) {
  if (!state.charging) return { cast: false, reason: "not-charging" };
  const profile = magicElementProfile(state.selectedElement);
  const charge = state.charge;
  state.charging = false;
  state.charge = 0;

  if (charge < state.minCharge) {
    return { cast: false, reason: "undercharged" };
  }
  if (state.mana < profile.manaCost) {
    return { cast: false, reason: "mana", required: profile.manaCost };
  }

  state.mana -= profile.manaCost;
  state.cooldown = profile.cooldown;
  return {
    cast: true,
    element: state.selectedElement,
    profile,
    power: clamp(charge / state.maxCharge, 0, 1),
    manaCost: profile.manaCost
  };
}

export function cancelMagicCast(state, interrupted = false) {
  state.charging = false;
  state.charge = 0;
  if (interrupted) state.cooldown = Math.max(state.cooldown, 0.32);
  return {
    interrupted: Boolean(interrupted),
    cooldown: state.cooldown
  };
}
