/** Browser voice helpers: MediaRecorder + VAD end-of-speech (cloud STT). */

export type VoiceLang = "en-AU" | "zh-CN";

const VOICE_LANG_KEY = "orithos.voice.lang";

export function getStoredVoiceLang(): VoiceLang {
  if (typeof window === "undefined") return "en-AU";
  const v = localStorage.getItem(VOICE_LANG_KEY);
  return v === "zh-CN" ? "zh-CN" : "en-AU";
}

export function setStoredVoiceLang(lang: VoiceLang) {
  if (typeof window === "undefined") return;
  localStorage.setItem(VOICE_LANG_KEY, lang);
}

/** Map UI BCP-47 to the remote ASR language codes (omit auto on server). */
export function toAsrLang(lang: VoiceLang): string {
  return lang.startsWith("zh") ? "zh" : "en";
}

export function pickRecorderMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"];
  return candidates.find((t) => MediaRecorder.isTypeSupported(t));
}

export function canUseMediaRecorder(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== "undefined"
  );
}

export type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: { results: { [i: number]: { [j: number]: { transcript: string } } } }) => void) | null;
  onerror: ((event?: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

export function getSpeechRecognitionCtor(): (new () => SpeechRecognitionLike) | undefined {
  if (typeof window === "undefined") return undefined;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition;
}

export function canUseWebSpeech(): boolean {
  return !!getSpeechRecognitionCtor();
}

export type VoiceEndpointPhase = "listening" | "speech" | "ending";

type VadOptions = {
  /** Stop after this much continuous silence once speech was heard (ms). */
  silenceMs?: number;
  /** Ignore very short energy blips (ms). */
  minSpeechMs?: number;
  /** Give up if user never speaks (ms). */
  noSpeechTimeoutMs?: number;
  /** Absolute RMS floor (0–1). */
  minRms?: number;
  onPhaseChange?: (phase: VoiceEndpointPhase) => void;
};

/**
 * Record with end-of-speech VAD: after the user speaks, silence auto-stops the mic.
 * Manual `stop()` still works (cancel / force end).
 */
export async function startMediaRecording(opts: {
  maxMs?: number;
  onStarted?: () => void;
  vad?: VadOptions;
}): Promise<{
  stop: () => void;
  done: Promise<{ blob: Blob; mimeType: string; hadSpeech: boolean }>;
}> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });
  const mimeType = pickRecorderMimeType();
  const recorder = mimeType
    ? new MediaRecorder(stream, { mimeType })
    : new MediaRecorder(stream);
  const chunks: BlobPart[] = [];
  let maxTimer: ReturnType<typeof setTimeout> | null = null;
  let noSpeechTimer: ReturnType<typeof setTimeout> | null = null;
  let rafId = 0;
  let audioCtx: AudioContext | null = null;
  let stopped = false;
  let hadSpeech = false;

  const vad = opts.vad ?? {};
  const silenceMs = vad.silenceMs ?? 1200;
  const minSpeechMs = vad.minSpeechMs ?? 160;
  const noSpeechTimeoutMs = vad.noSpeechTimeoutMs ?? 12_000;
  const minRms = vad.minRms ?? 0.006;
  const onPhaseChange = vad.onPhaseChange;

  const done = new Promise<{ blob: Blob; mimeType: string; hadSpeech: boolean }>((resolve, reject) => {
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    recorder.onerror = () => {
      cleanup();
      reject(new Error("MediaRecorder error"));
    };
    recorder.onstop = () => {
      cleanup();
      const type = recorder.mimeType || mimeType || "audio/webm";
      resolve({ blob: new Blob(chunks, { type }), mimeType: type, hadSpeech });
    };
  });

  function cleanup() {
    if (maxTimer) clearTimeout(maxTimer);
    if (noSpeechTimer) clearTimeout(noSpeechTimer);
    if (rafId) cancelAnimationFrame(rafId);
    stream.getTracks().forEach((t) => t.stop());
    if (audioCtx) {
      void audioCtx.close().catch(() => {});
      audioCtx = null;
    }
  }

  function stopRecorder() {
    if (stopped) return;
    stopped = true;
    if (recorder.state === "recording" || recorder.state === "paused") {
      recorder.stop();
    }
  }

  function markSpeech() {
    if (hadSpeech) return;
    hadSpeech = true;
    if (noSpeechTimer) {
      clearTimeout(noSpeechTimer);
      noSpeechTimer = null;
    }
  }

  async function startVad() {
    try {
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audioCtx = new Ctx();
      // Browsers often start AudioContext suspended — resume or RMS stays ~0.
      if (audioCtx.state === "suspended") {
        await audioCtx.resume();
      }

      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.5;
      source.connect(analyser);

      const timeBuf = new Float32Array(analyser.fftSize);
      const freqBuf = new Uint8Array(analyser.frequencyBinCount);
      const sampleRate = audioCtx.sampleRate;
      const binHz = sampleRate / analyser.fftSize;
      const speechBinStart = Math.max(1, Math.floor(250 / binHz));
      const speechBinEnd = Math.min(analyser.frequencyBinCount - 1, Math.ceil(3500 / binHz));

      let noiseFloor = 0.004;
      let speechBandNoise = 12;
      let calibrated = false;
      const calibrateUntil = performance.now() + 280;
      let speechStartedAt: number | null = null;
      let lastSpeechAt: number | null = null;
      let heardSpeech = false;
      let phase: VoiceEndpointPhase = "listening";

      const setPhase = (next: VoiceEndpointPhase) => {
        if (phase === next) return;
        phase = next;
        onPhaseChange?.(next);
      };
      setPhase("listening");

      const tick = () => {
        if (stopped || !audioCtx) return;
        if (audioCtx.state === "suspended") {
          void audioCtx.resume();
        }

        analyser.getFloatTimeDomainData(timeBuf);
        analyser.getByteFrequencyData(freqBuf);

        let sum = 0;
        let peak = 0;
        for (let i = 0; i < timeBuf.length; i++) {
          const s = timeBuf[i]!;
          sum += s * s;
          const a = Math.abs(s);
          if (a > peak) peak = a;
        }
        const rms = Math.sqrt(sum / timeBuf.length);

        let band = 0;
        let bandN = 0;
        for (let i = speechBinStart; i <= speechBinEnd; i++) {
          band += freqBuf[i]!;
          bandN++;
        }
        const speechBand = bandN > 0 ? band / bandN : 0;

        const now = performance.now();

        if (!calibrated) {
          noiseFloor = Math.min(0.02, Math.max(noiseFloor * 0.85, rms));
          speechBandNoise = Math.min(40, Math.max(speechBandNoise * 0.85, speechBand));
          if (now >= calibrateUntil) {
            calibrated = true;
            noiseFloor = Math.min(Math.max(noiseFloor, 0.002), 0.015);
            speechBandNoise = Math.min(Math.max(speechBandNoise, 6), 35);
          }
        } else if (!heardSpeech) {
          noiseFloor = Math.min(0.015, noiseFloor * 0.98 + rms * 0.02);
          speechBandNoise = Math.min(35, speechBandNoise * 0.98 + speechBand * 0.02);
        }

        const rmsThreshold = Math.max(minRms, noiseFloor * 2.0);
        const bandThreshold = Math.max(18, speechBandNoise + 10);
        const speaking =
          rms >= rmsThreshold || peak >= Math.max(0.025, rmsThreshold * 2.2) || speechBand >= bandThreshold;

        if (speaking) {
          if (speechStartedAt == null) speechStartedAt = now;
          lastSpeechAt = now;
          if (!heardSpeech && now - speechStartedAt >= minSpeechMs) {
            heardSpeech = true;
            markSpeech();
            setPhase("speech");
          } else if (heardSpeech) {
            setPhase("speech");
          }
        } else if (heardSpeech && lastSpeechAt != null) {
          const silentFor = now - lastSpeechAt;
          if (silentFor >= silenceMs * 0.5) setPhase("ending");
          if (silentFor >= silenceMs) {
            stopRecorder();
            return;
          }
        } else {
          speechStartedAt = null;
        }

        rafId = requestAnimationFrame(tick);
      };

      rafId = requestAnimationFrame(tick);
    } catch {
      // VAD unavailable — fall back to max-duration / manual stop; still upload audio.
      markSpeech();
    }
  }

  // Timeslice keeps data flowing; final stop still assembles a complete blob.
  recorder.start(250);
  opts.onStarted?.();
  void startVad();

  const maxMs = opts.maxMs ?? 15_000;
  maxTimer = setTimeout(() => stopRecorder(), maxMs);
  noSpeechTimer = setTimeout(() => {
    if (!stopped) stopRecorder();
  }, noSpeechTimeoutMs);

  return {
    stop: () => stopRecorder(),
    done,
  };
}

/** One-shot Web Speech recognition. */
export function recognizeWithWebSpeech(lang: VoiceLang): {
  stop: () => void;
  done: Promise<string>;
} {
  const Ctor = getSpeechRecognitionCtor();
  if (!Ctor) {
    return {
      stop: () => {},
      done: Promise.reject(new Error("Web Speech API is not supported")),
    };
  }

  const recognition = new Ctor();
  recognition.lang = lang;
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  let transcript = "";
  let settled = false;

  const done = new Promise<string>((resolve, reject) => {
    const finish = (value: string) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const fail = (err: Error) => {
      if (settled) return;
      settled = true;
      reject(err);
    };

    recognition.onresult = (event) => {
      transcript = event.results[0]?.[0]?.transcript?.trim() ?? "";
    };
    recognition.onerror = (event) => {
      const err = event?.error ?? "speech-error";
      if (err === "aborted" || err === "no-speech") {
        finish("");
        return;
      }
      fail(new Error(err));
    };
    recognition.onend = () => {
      finish(transcript);
    };
  });

  recognition.start();

  return {
    stop: () => recognition.stop(),
    done,
  };
}
