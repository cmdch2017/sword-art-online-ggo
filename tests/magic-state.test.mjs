import assert from "node:assert/strict";
import test from "node:test";

import {
  MAGIC_ELEMENT,
  beginMagicCast,
  cancelMagicCast,
  createMagicState,
  cycleMagicElement,
  magicElementProfile,
  releaseMagicCast,
  selectMagicElement,
  tickMagicState
} from "../src/magic-state.mjs";

test("ALO magic exposes fire, ice, wind, and lightning profiles", () => {
  assert.equal(magicElementProfile(MAGIC_ELEMENT.FIRE).label, "火精灵");
  assert.equal(magicElementProfile(MAGIC_ELEMENT.ICE).label, "冰精灵");
  assert.equal(magicElementProfile(MAGIC_ELEMENT.WIND).label, "风精灵");
  assert.equal(magicElementProfile(MAGIC_ELEMENT.LIGHTNING).label, "雷精灵");
});

test("element selection cycles without altering charged mana", () => {
  const state = createMagicState();
  state.mana = 64;

  selectMagicElement(state, MAGIC_ELEMENT.ICE);
  assert.equal(state.selectedElement, MAGIC_ELEMENT.ICE);
  cycleMagicElement(state, 1);
  assert.equal(state.selectedElement, MAGIC_ELEMENT.WIND);
  cycleMagicElement(state, -1);
  assert.equal(state.selectedElement, MAGIC_ELEMENT.ICE);
  assert.equal(state.mana, 64);
});

test("holding a spell charges it before release spends mana and starts cooldown", () => {
  const state = createMagicState();
  selectMagicElement(state, MAGIC_ELEMENT.LIGHTNING);
  const started = beginMagicCast(state);
  tickMagicState(state, 0.8);
  const released = releaseMagicCast(state);

  assert.equal(started.started, true);
  assert.equal(released.cast, true);
  assert.equal(released.element, MAGIC_ELEMENT.LIGHTNING);
  assert.ok(released.power > 0.5);
  assert.ok(state.mana < state.maxMana);
  assert.ok(state.cooldown > 0);
  assert.equal(state.charging, false);
});

test("an undercharged spell cancels without spending mana or cooldown", () => {
  const state = createMagicState();
  beginMagicCast(state);
  tickMagicState(state, 0.03);
  const released = releaseMagicCast(state);

  assert.equal(released.cast, false);
  assert.equal(released.reason, "undercharged");
  assert.equal(state.mana, state.maxMana);
  assert.equal(state.cooldown, 0);
});

test("interrupting a spell clears the charge and applies a short recovery lock", () => {
  const state = createMagicState();
  beginMagicCast(state);
  tickMagicState(state, 0.6);
  const cancelled = cancelMagicCast(state, true);

  assert.equal(cancelled.interrupted, true);
  assert.equal(state.charging, false);
  assert.equal(state.charge, 0);
  assert.ok(state.cooldown >= 0.3);
});

test("mana regenerates only while not charging and blocks an unaffordable cast", () => {
  const state = createMagicState();
  state.mana = 30;
  assert.equal(beginMagicCast(state).started, true);
  state.mana = 5;
  tickMagicState(state, 0.4);

  assert.equal(state.mana, 5);
  const released = releaseMagicCast(state);
  assert.equal(released.cast, false);
  assert.equal(released.reason, "mana");
  const denied = beginMagicCast(state);
  assert.equal(denied.started, false);
  assert.equal(denied.reason, "mana");

  tickMagicState(state, 1);
  assert.ok(state.mana > 5);
});
