import assert from "node:assert/strict";
import { test } from "node:test";
import {
  mergeVoiceTranscript,
  getStoredVoiceLang,
  recognizeWithWebSpeech,
  resolveVoiceInputMode,
  setStoredVoiceLang,
  toAsrLang,
  type SpeechRecognitionLike,
} from "./voice.ts";

test("voice language hints map Australian English and Simplified Chinese to ASR codes", () => {
  assert.equal(toAsrLang("en-AU"), "en");
  assert.equal(toAsrLang("zh-CN"), "zh");
});

test("cloud transcription is preferred and browser speech is a fallback", () => {
  assert.equal(resolveVoiceInputMode(true, true), "cloud");
  assert.equal(resolveVoiceInputMode(false, true), "browser");
  assert.equal(resolveVoiceInputMode(false, false), "unavailable");
});

test("voice language preference persists and unavailable browser storage falls back safely", () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const originalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, "window", { configurable: true, value: {} });
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    },
  });
  try {
    setStoredVoiceLang("zh-CN");
    assert.equal(getStoredVoiceLang(), "zh-CN");

    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: () => { throw new Error("storage disabled"); },
        setItem: () => { throw new Error("storage disabled"); },
      },
    });
    assert.equal(getStoredVoiceLang(), "en-AU");
    assert.doesNotThrow(() => setStoredVoiceLang("zh-CN"));
  } finally {
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
    else Reflect.deleteProperty(globalThis, "window");
    if (originalStorage) Object.defineProperty(globalThis, "localStorage", originalStorage);
    else Reflect.deleteProperty(globalThis, "localStorage");
  }
});

test("voice transcripts append to a draft without losing words or adding empty spacing", () => {
  assert.equal(mergeVoiceTranscript("  sales yesterday  ", "  and gross profit "), "sales yesterday and gross profit");
  assert.equal(mergeVoiceTranscript("  sales yesterday  ", "  "), "sales yesterday");
  assert.equal(mergeVoiceTranscript("  ", "  库存有多少？  "), "库存有多少？");
});

test("browser speech recognition receives the selected language and returns its transcript", async () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  class MockSpeechRecognition implements SpeechRecognitionLike {
    static lang = "";
    static interimResults = true;
    static maxAlternatives = 0;
    static onresult: SpeechRecognitionLike["onresult"] = null;
    static onerror: SpeechRecognitionLike["onerror"] = null;
    static onend: SpeechRecognitionLike["onend"] = null;
    get lang() { return MockSpeechRecognition.lang; }
    set lang(value: string) { MockSpeechRecognition.lang = value; }
    get interimResults() { return MockSpeechRecognition.interimResults; }
    set interimResults(value: boolean) { MockSpeechRecognition.interimResults = value; }
    get maxAlternatives() { return MockSpeechRecognition.maxAlternatives; }
    set maxAlternatives(value: number) { MockSpeechRecognition.maxAlternatives = value; }
    get onresult() { return MockSpeechRecognition.onresult; }
    set onresult(value: SpeechRecognitionLike["onresult"]) { MockSpeechRecognition.onresult = value; }
    get onerror() { return MockSpeechRecognition.onerror; }
    set onerror(value: SpeechRecognitionLike["onerror"]) { MockSpeechRecognition.onerror = value; }
    get onend() { return MockSpeechRecognition.onend; }
    set onend(value: SpeechRecognitionLike["onend"]) { MockSpeechRecognition.onend = value; }
    start() {}
    stop() {}
  }

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { SpeechRecognition: MockSpeechRecognition },
  });
  try {
    const result = recognizeWithWebSpeech("zh-CN");
    assert.equal(MockSpeechRecognition.lang, "zh-CN");
    assert.equal(MockSpeechRecognition.interimResults, false);
    assert.equal(MockSpeechRecognition.maxAlternatives, 1);
    MockSpeechRecognition.onresult?.({ results: { length: 2, 0: { 0: { transcript: "库存还有" } }, 1: { 0: { transcript: "多少？" } } } });
    MockSpeechRecognition.onend?.();
    assert.equal(await result.done, "库存还有多少？");
  } finally {
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
    else Reflect.deleteProperty(globalThis, "window");
  }
});

test("browser speech recognition keeps every final segment with language-appropriate spacing", async () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  class MockSpeechRecognition implements SpeechRecognitionLike {
    static lang = "";
    static interimResults = true;
    static maxAlternatives = 0;
    static onresult: SpeechRecognitionLike["onresult"] = null;
    static onerror: SpeechRecognitionLike["onerror"] = null;
    static onend: SpeechRecognitionLike["onend"] = null;
    get lang() { return MockSpeechRecognition.lang; }
    set lang(value: string) { MockSpeechRecognition.lang = value; }
    get interimResults() { return MockSpeechRecognition.interimResults; }
    set interimResults(value: boolean) { MockSpeechRecognition.interimResults = value; }
    get maxAlternatives() { return MockSpeechRecognition.maxAlternatives; }
    set maxAlternatives(value: number) { MockSpeechRecognition.maxAlternatives = value; }
    get onresult() { return MockSpeechRecognition.onresult; }
    set onresult(value: SpeechRecognitionLike["onresult"]) { MockSpeechRecognition.onresult = value; }
    get onerror() { return MockSpeechRecognition.onerror; }
    set onerror(value: SpeechRecognitionLike["onerror"]) { MockSpeechRecognition.onerror = value; }
    get onend() { return MockSpeechRecognition.onend; }
    set onend(value: SpeechRecognitionLike["onend"]) { MockSpeechRecognition.onend = value; }
    start() {}
    stop() {}
  }

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { SpeechRecognition: MockSpeechRecognition },
  });
  try {
    const english = recognizeWithWebSpeech("en-AU");
    MockSpeechRecognition.onresult?.({ results: { length: 2, 0: { 0: { transcript: "sales yesterday" } }, 1: { 0: { transcript: "and today" } } } });
    MockSpeechRecognition.onend?.();
    assert.equal(await english.done, "sales yesterday and today");

    const chinese = recognizeWithWebSpeech("zh-CN");
    MockSpeechRecognition.onresult?.({ results: { length: 2, 0: { 0: { transcript: "昨天销售" } }, 1: { 0: { transcript: "和今天" } } } });
    MockSpeechRecognition.onend?.();
    assert.equal(await chinese.done, "昨天销售和今天");
  } finally {
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
    else Reflect.deleteProperty(globalThis, "window");
  }
});

test("browser speech recognition stops and reports a timeout when the browser never ends the session", async () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  let stopCount = 0;
  class MockSpeechRecognition implements SpeechRecognitionLike {
    lang = "";
    interimResults = true;
    maxAlternatives = 0;
    onresult: SpeechRecognitionLike["onresult"] = null;
    onerror: SpeechRecognitionLike["onerror"] = null;
    onend: SpeechRecognitionLike["onend"] = null;
    start() {}
    stop() { stopCount++; }
  }

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { SpeechRecognition: MockSpeechRecognition },
  });
  try {
    const result = recognizeWithWebSpeech("en-AU", { maxMs: 5 });
    const outcome = await Promise.race([
      result.done.then(() => "resolved", (error: Error) => `rejected:${error.message}`),
      new Promise<string>((resolve) => setTimeout(() => resolve("still-listening"), 25)),
    ]);
    assert.equal(outcome, "rejected:Browser voice recognition timed out.");
    assert.equal(stopCount, 1);
  } finally {
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
    else Reflect.deleteProperty(globalThis, "window");
  }
});
