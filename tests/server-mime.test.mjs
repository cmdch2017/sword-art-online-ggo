import assert from "node:assert/strict";
import test from "node:test";

import { contentTypeFor } from "../src/server-mime.mjs";

test("development server returns model and texture MIME types", () => {
  assert.equal(contentTypeFor("model.glb"), "model/gltf-binary");
  assert.equal(contentTypeFor("scene.gltf"), "model/gltf+json");
  assert.equal(contentTypeFor("buffer.bin"), "application/octet-stream");
  assert.equal(contentTypeFor("character.pmx"), "application/octet-stream");
  assert.equal(contentTypeFor("albedo.png"), "image/png");
  assert.equal(contentTypeFor("albedo.webp"), "image/webp");
  assert.equal(contentTypeFor("hair.tga"), "image/x-tga");
  assert.equal(contentTypeFor("toon.bmp"), "image/bmp");
});

test("development server returns playable audio MIME types", () => {
  assert.equal(contentTypeFor("crossing-field-lisa.mp3"), "audio/mpeg");
  assert.equal(contentTypeFor("ambient.ogg"), "audio/ogg");
  assert.equal(contentTypeFor("track.m4a"), "audio/mp4");
  assert.equal(contentTypeFor("track.aac"), "audio/aac");
  assert.equal(contentTypeFor("track.wav"), "audio/wav");
  assert.equal(contentTypeFor("track.flac"), "audio/flac");
});
