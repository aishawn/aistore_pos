import { expect, test } from "@playwright/test";
import { useLocalPreviewSession } from "./fixtures/local-preview";

test("voice input stays editable and only queries after manual confirmation", async ({ page }) => {
  await useLocalPreviewSession(page);
  await page.addInitScript(() => {
    localStorage.setItem("sf_user", JSON.stringify({
      id: "voice-e2e-user",
      name: "Voice E2E User",
      username: "voice-e2e",
      isAdmin: true,
      roleCode: "ADMIN",
      permissions: ["ai.assistant"],
    }));
    localStorage.setItem("orithos.voice.lang", "auto");

    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: async () => ({ getTracks: () => [{ stop() {} }] }),
      },
    });

    class MockMediaRecorder {
      state = "inactive";
      mimeType = "audio/webm";
      ondataavailable: ((event: { data: Blob }) => void) | null = null;
      onerror: (() => void) | null = null;
      onstop: (() => void) | null = null;
      static isTypeSupported() { return true; }
      constructor() {}
      start() { this.state = "recording"; }
      stop() {
        this.state = "inactive";
        setTimeout(() => {
          this.ondataavailable?.({ data: new Blob([new Uint8Array(2048)]) });
          this.onstop?.();
        }, 0);
      }
    }
    Object.defineProperty(window, "MediaRecorder", { configurable: true, value: MockMediaRecorder });

    class MockSpeechRecognition {
      lang = "";
      interimResults = true;
      maxAlternatives = 0;
      onresult: ((event: { results: { length: number; 0: { 0: { transcript: string } } } }) => void) | null = null;
      onerror: ((event: { error: string }) => void) | null = null;
      onend: (() => void) | null = null;
      start() { (window as Window & { __voiceRecognitionLang?: string }).__voiceRecognitionLang = this.lang; }
      stop() {
        this.onresult?.({ results: { length: 1, 0: { 0: { transcript: "库存还有多少？" } } } });
        this.onend?.();
      }
    }
    Object.defineProperty(window, "SpeechRecognition", { configurable: true, value: MockSpeechRecognition });
  });

  let assistantRequests = 0;
  let transcriptionRequest = "";
  let transcriptionAttempts = 0;
  await page.route("**/api/ai/config/client", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ code: 0, message: "ok", data: {
      enabled: true,
      assistantAvailable: true,
      transcriptionAvailable: true,
      aiTriggerKeywords: [],
    } }),
  }));
  await page.route("**/api/ai/transcribe", async (route) => {
    transcriptionAttempts++;
    transcriptionRequest = route.request().postData() ?? "";
    if (transcriptionAttempts === 3) {
      await route.fulfill({ status: 200, json: { code: 0, message: "ok", data: { text: "Today's sales", lang: "en" } } });
      return;
    }
    await route.fulfill({ status: 502, json: { code: 50211, message: "Transcription unavailable" } });
  });
  await page.route("**/api/ai/assistant", async (route) => {
    assistantRequests++;
    await route.fulfill({ status: 200, json: { code: 0, message: "ok", data: { answer: "查询已接收", intent: "qa" } } });
  });

  await page.goto("/assistant");
  const composer = page.locator("[data-assistant-composer]").last();
  const language = composer.getByRole("group", { name: "Voice input language" });
  await expect(language).toBeVisible();
  await expect(language.getByRole("button", { name: "Auto", exact: true })).toHaveAttribute("aria-pressed", "true");
  await composer.getByRole("button", { name: "中文", exact: true }).click();
  await expect(composer.getByRole("button", { name: "中文", exact: true })).toHaveAttribute("aria-pressed", "true");
  await composer.getByLabel("Ask Orithos AI").fill("库存");
  await composer.getByRole("button", { name: "Voice input" }).click();
  await expect(composer.getByRole("button", { name: "Stop voice input" })).toBeEnabled();
  await composer.getByRole("button", { name: "Stop voice input" }).click();

  await expect(composer.getByRole("alert")).toBeVisible();
  expect(transcriptionRequest).toMatch(/name="lang"\s+zh/);
  expect(assistantRequests).toBe(0);

  await composer.getByRole("button", { name: "Use browser voice recognition" }).click();
  await expect(composer.getByRole("button", { name: "Stop voice input" })).toBeEnabled();
  await composer.getByRole("button", { name: "Stop voice input" }).click();
  const input = composer.getByLabel("Ask Orithos AI");
  await expect(input).toHaveValue("库存 库存还有多少？");
  expect(await page.evaluate(() => (window as Window & { __voiceRecognitionLang?: string }).__voiceRecognitionLang)).toBe("zh-CN");
  expect(assistantRequests).toBe(0);

  await composer.getByRole("button", { name: "EN", exact: true }).click();
  await expect(composer.getByRole("button", { name: "EN", exact: true })).toHaveAttribute("aria-pressed", "true");
  await composer.getByRole("button", { name: "Voice input" }).click();
  await composer.getByRole("button", { name: "Stop voice input" }).click();
  await expect(composer.getByRole("alert")).toBeVisible();
  expect(transcriptionRequest).toMatch(/name="lang"\s+en/);
  await composer.getByRole("button", { name: "Use browser voice recognition" }).click();
  await composer.getByRole("button", { name: "Stop voice input" }).click();
  await expect(input).toHaveValue("库存 库存还有多少？ 库存还有多少？");
  expect(await page.evaluate(() => (window as Window & { __voiceRecognitionLang?: string }).__voiceRecognitionLang)).toBe("en-AU");
  expect(assistantRequests).toBe(0);

  await composer.getByRole("button", { name: "Auto", exact: true }).click();
  await composer.getByRole("button", { name: "Voice input" }).click();
  await composer.getByRole("button", { name: "Stop voice input" }).click();
  await expect(input).toHaveValue("库存 库存还有多少？ 库存还有多少？ Today's sales");
  expect(transcriptionRequest).not.toContain('name="lang"');
  expect(assistantRequests).toBe(0);

  await input.fill("修正后的库存问题");
  await expect(composer.getByRole("button", { name: "Send message" })).toBeEnabled();
  await composer.getByRole("button", { name: "Send message" }).click();
  await expect.poll(() => assistantRequests).toBe(1);
});

test("microphone permission refusal keeps the draft and does not send a query", async ({ page }) => {
  await useLocalPreviewSession(page);
  await page.addInitScript(() => {
    localStorage.setItem("sf_user", JSON.stringify({
      id: "voice-denied-user",
      name: "Voice Denied User",
      username: "voice-denied",
      isAdmin: true,
      roleCode: "ADMIN",
      permissions: ["ai.assistant"],
    }));
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: async () => { throw new DOMException("Permission denied", "NotAllowedError"); },
      },
    });
    class MockMediaRecorder {
      static isTypeSupported() { return true; }
      constructor() {}
    }
    Object.defineProperty(window, "MediaRecorder", { configurable: true, value: MockMediaRecorder });
  });

  let assistantRequests = 0;
  await page.route("**/api/ai/config/client", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ code: 0, message: "ok", data: {
      enabled: true,
      assistantAvailable: true,
      transcriptionAvailable: true,
      aiTriggerKeywords: [],
    } }),
  }));
  await page.route("**/api/ai/assistant", async (route) => {
    assistantRequests++;
    await route.fulfill({ status: 200, json: { code: 0, message: "ok", data: { answer: "查询已接收", intent: "qa" } } });
  });

  await page.goto("/assistant");
  const composer = page.locator("[data-assistant-composer]").last();
  const input = composer.getByLabel("Ask Orithos AI");
  await input.fill("保留这条查询草稿");
  await composer.getByRole("button", { name: "Voice input" }).click();

  await expect(composer.getByRole("alert")).toContainText(/permission denied/i);
  await expect(input).toHaveValue("保留这条查询草稿");
  expect(assistantRequests).toBe(0);
});

test("mobile voice input keeps its draft through a network outage and recovers on retry", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await useLocalPreviewSession(page);
  await page.addInitScript(() => {
    localStorage.setItem("sf_user", JSON.stringify({
      id: "voice-mobile-user",
      name: "Voice Mobile User",
      username: "voice-mobile",
      isAdmin: true,
      roleCode: "ADMIN",
      permissions: ["ai.assistant"],
    }));
    localStorage.setItem("orithos.voice.lang", "zh-CN");
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: async () => ({ getTracks: () => [{ stop() {} }] }) },
    });
    class MockMediaRecorder {
      state = "inactive";
      mimeType = "audio/webm";
      ondataavailable: ((event: { data: Blob }) => void) | null = null;
      onerror: (() => void) | null = null;
      onstop: (() => void) | null = null;
      static isTypeSupported() { return true; }
      start() { this.state = "recording"; }
      stop() {
        this.state = "inactive";
        setTimeout(() => {
          this.ondataavailable?.({ data: new Blob([new Uint8Array(2048)]) });
          this.onstop?.();
        }, 0);
      }
    }
    Object.defineProperty(window, "MediaRecorder", { configurable: true, value: MockMediaRecorder });
  });

  let assistantRequests = 0;
  let transcriptionAttempts = 0;
  await page.route("**/api/ai/config/client", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ code: 0, message: "ok", data: {
      enabled: true,
      assistantAvailable: true,
      transcriptionAvailable: true,
      aiTriggerKeywords: [],
    } }),
  }));
  await page.route("**/api/ai/transcribe", async (route) => {
    transcriptionAttempts++;
    if (transcriptionAttempts === 1) {
      await route.abort("internetdisconnected");
      return;
    }
    await route.fulfill({ status: 200, json: { code: 0, message: "ok", data: { text: "库存查询已恢复", lang: "zh" } } });
  });
  await page.route("**/api/ai/assistant", async (route) => {
    assistantRequests++;
    await route.fulfill({ status: 200, json: { code: 0, message: "ok", data: { answer: "查询已接收", intent: "qa" } } });
  });

  await page.goto("/assistant");
  const composer = page.locator("[data-assistant-composer]").last();
  const input = composer.getByLabel("Ask Orithos AI");
  await input.fill("保留原来的库存草稿");
  await composer.getByRole("button", { name: "Voice input" }).click();
  await composer.getByRole("button", { name: "Stop voice input" }).click();
  await expect(composer.getByRole("alert")).toBeVisible();
  await expect(input).toHaveValue("保留原来的库存草稿");
  expect(assistantRequests).toBe(0);

  await composer.getByRole("button", { name: "Voice input" }).click();
  await composer.getByRole("button", { name: "Stop voice input" }).click();
  await expect(input).toHaveValue("保留原来的库存草稿 库存查询已恢复");
  expect(assistantRequests).toBe(0);
  expect(transcriptionAttempts).toBe(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
