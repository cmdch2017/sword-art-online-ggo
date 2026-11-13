import assert from "node:assert/strict";
import test from "node:test";

import { BGM_STATUS, createBgmController } from "../src/bgm-controller.mjs";

class FakeAudio {
  constructor() {
    this.loop = false;
    this.volume = 1;
    this.paused = true;
    this.src = "";
    this.loadCalls = 0;
    this.playCalls = 0;
    this.pauseCalls = 0;
    this.listeners = new Map();
  }

  load() {
    this.loadCalls += 1;
  }

  async play() {
    this.playCalls += 1;
    this.paused = false;
  }

  pause() {
    this.pauseCalls += 1;
    this.paused = true;
  }

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }

  dispatch(type) {
    this.listeners.get(type)?.();
  }
}

test("local BGM source is loaded with looping and clamped volume", () => {
  const audio = new FakeAudio();
  const controller = createBgmController(audio);

  controller.setSource("blob:original-sao-track", "刀剑神域 GGO BGM");
  controller.setVolume(1.7);

  assert.equal(audio.src, "blob:original-sao-track");
  assert.equal(audio.loop, true);
  assert.equal(audio.volume, 1);
  assert.equal(audio.loadCalls, 1);
  assert.equal(controller.getState().status, BGM_STATUS.READY);
  assert.equal(controller.getState().label, "刀剑神域 GGO BGM");
});

test("BGM play reports playing only after the browser accepts playback", async () => {
  const audio = new FakeAudio();
  const statuses = [];
  const controller = createBgmController(audio, {
    onStatus: (state) => statuses.push(state.status)
  });
  controller.setSource("blob:original-sao-track", "刀剑神域 GGO BGM");

  const played = await controller.play();

  assert.equal(played, true);
  assert.equal(audio.playCalls, 1);
  assert.equal(controller.getState().status, BGM_STATUS.PLAYING);
  assert.deepEqual(statuses, [BGM_STATUS.READY, BGM_STATUS.PLAYING]);
});

test("pause and resume keep a loaded original track ready for gameplay", async () => {
  const audio = new FakeAudio();
  const controller = createBgmController(audio);
  controller.setSource("blob:original-sao-track", "刀剑神域 GGO BGM");
  await controller.play();

  controller.pause();
  assert.equal(controller.getState().status, BGM_STATUS.PAUSED);

  await controller.play();
  assert.equal(audio.playCalls, 2);
  assert.equal(controller.getState().status, BGM_STATUS.PLAYING);
});

test("an empty BGM slot stays silent instead of starting generated music", async () => {
  const audio = new FakeAudio();
  const controller = createBgmController(audio);

  const played = await controller.play();

  assert.equal(played, false);
  assert.equal(audio.playCalls, 0);
  assert.equal(controller.getState().status, BGM_STATUS.EMPTY);
});

test("a media decode error is surfaced instead of leaving a track as ready", () => {
  const audio = new FakeAudio();
  const controller = createBgmController(audio);
  controller.setSource("blob:unsupported-audio", "unsupported.wav");

  audio.dispatch("error");

  assert.equal(controller.getState().status, BGM_STATUS.ERROR);
  assert.match(controller.getState().error, /MP3/);
});
