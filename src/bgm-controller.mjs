import { clamp } from "./core.mjs";

export const BGM_STATUS = Object.freeze({
  EMPTY: "empty",
  READY: "ready",
  PLAYING: "playing",
  PAUSED: "paused",
  ERROR: "error"
});

export function createBgmController(audio, { onStatus = () => {} } = {}) {
  let label = "";
  let status = BGM_STATUS.EMPTY;
  let lastError = "";

  audio.loop = true;

  if (typeof audio.addEventListener === "function") {
    audio.addEventListener("error", () => {
      setStatus(
        BGM_STATUS.ERROR,
        "浏览器无法读取或解码该音频文件，请换用 MP3、M4A、OGG 或 WAV"
      );
    });
  }

  function notify() {
    onStatus(getState());
  }

  function getState() {
    return {
      status,
      label,
      error: lastError,
      hasSource: Boolean(audio.src)
    };
  }

  function setStatus(nextStatus, error = "") {
    status = nextStatus;
    lastError = error;
    notify();
  }

  function setSource(source, nextLabel = "") {
    audio.src = source;
    audio.loop = true;
    label = nextLabel;
    audio.load();
    setStatus(BGM_STATUS.READY);
  }

  function setVolume(value) {
    audio.volume = clamp(Number(value) || 0, 0, 1);
  }

  async function play() {
    if (!audio.src) {
      setStatus(BGM_STATUS.EMPTY);
      return false;
    }

    try {
      await audio.play();
      setStatus(BGM_STATUS.PLAYING);
      return true;
    } catch (error) {
      setStatus(
        BGM_STATUS.ERROR,
        error instanceof Error ? error.message : String(error)
      );
      return false;
    }
  }

  function pause() {
    if (!audio.src) return;
    audio.pause();
    setStatus(BGM_STATUS.PAUSED);
  }

  function markError(message) {
    setStatus(BGM_STATUS.ERROR, message);
  }

  return {
    getState,
    markError,
    pause,
    play,
    setSource,
    setVolume
  };
}
