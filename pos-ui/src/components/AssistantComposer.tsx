"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { Mic, Paperclip, Send, Square, X } from "lucide-react";
import { transcribeAudio } from "@/lib/api";
import {
  canUseMediaRecorder,
  canUseWebSpeech,
  getBrowserVoiceLang,
  mergeVoiceTranscript,
  recognizeWithWebSpeech,
  resolveVoiceInputMode,
  startMediaRecording,
} from "@/lib/voice";

/** Shared, editable composer. Attachments are included as text in the chat request. */
export function AssistantComposer({ value, onChange, onSend, onCancel, cancelable = false, disabled = false, voiceAvailable, inputRef, placeholder = "Ask Orithos AI…" }: {
  value: string;
  onChange: (value: string) => void;
  onSend: (question: string) => void | Promise<void>;
  onCancel?: () => void;
  cancelable?: boolean;
  disabled?: boolean;
  voiceAvailable: boolean | null;
  inputRef?: RefObject<HTMLInputElement | null>;
  placeholder?: string;
}) {
  const fallbackRef = useRef<HTMLInputElement>(null);
  const field = inputRef ?? fallbackRef;
  const picker = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [voiceBusyState, setVoiceBusyState] = useState(false);
  const [sending, setSending] = useState(false);
  const stop = useRef<(() => void) | null>(null);
  const session = useRef(0);
  const voiceBusy = useRef(false);
  const sendBusy = useRef(false);
  const latestValue = useRef(value);
  const [browserSpeechAvailable, setBrowserSpeechAvailable] = useState(false);

  useEffect(() => { latestValue.current = value; }, [value]);
  useEffect(() => {
    setBrowserSpeechAvailable(canUseWebSpeech());
  }, []);

  useEffect(() => () => { session.current++; stop.current?.(); }, []);
  useEffect(() => {
    if (!disabled) return;
    session.current++;
    stop.current?.();
    stop.current = null;
    voiceBusy.current = false;
    setVoiceBusyState(false);
    setRecording(false);
    setStatus(null);
  }, [disabled]);

  async function voice() {
    if (recording) { stop.current?.(); return; }
    const mode = resolveVoiceInputMode(voiceAvailable === true, browserSpeechAvailable);
    if (disabled || voiceBusy.current || mode === "unavailable") return;
    setError(null);
    if (mode === "browser" || !canUseMediaRecorder()) {
      if (browserSpeechAvailable) {
        await runBrowserSpeech();
        return;
      }
      setError("Microphone recording requires HTTPS or localhost and a supported browser.");
      return;
    }
    voiceBusy.current = true;
    setVoiceBusyState(true);
    const id = ++session.current;
    try {
      setStatus("Allow microphone access to speak…");
      const capture = await startMediaRecording({ maxMs: 15000, vad: { silenceMs: 1200, minSpeechMs: 160, noSpeechTimeoutMs: 12000, minRms: 0.006 } });
      if (id !== session.current) { capture.stop(); return; }
      stop.current = capture.stop;
      setRecording(true);
      setStatus("Listening… click again to finish");
      const { blob, mimeType, hadSpeech } = await capture.done;
      if (id !== session.current) return;
      stop.current = null;
      setRecording(false);
      if (!hadSpeech && blob.size < 1500) throw new Error("No speech captured. Please try again.");
      setStatus("Transcribing…");
      const ext = mimeType.includes("mp4") ? "mp4" : mimeType.includes("ogg") ? "ogg" : "webm";
      const result = await transcribeAudio(blob, null, `voice.${ext}`);
      if (id !== session.current) return;
      onChange(mergeVoiceTranscript(latestValue.current, result.text));
      field.current?.focus();
    } catch (e) {
      if (id === session.current) setError(e instanceof Error ? e.message : "Voice input failed. Please try again.");
    } finally {
      if (id === session.current) { voiceBusy.current = false; setVoiceBusyState(false); setRecording(false); setStatus(null); }
    }
  }

  async function runBrowserSpeech() {
    if (disabled || voiceBusy.current || !browserSpeechAvailable) return;
    voiceBusy.current = true;
    setVoiceBusyState(true);
    setError(null);
    const id = ++session.current;
    try {
      setStatus("Listening… click again to finish");
      setRecording(true);
      const recognition = recognizeWithWebSpeech(getBrowserVoiceLang());
      stop.current = recognition.stop;
      const transcript = await recognition.done;
      if (id !== session.current) return;
      stop.current = null;
      if (!transcript.trim()) throw new Error("No speech was recognised. Please try again.");
      onChange(mergeVoiceTranscript(latestValue.current, transcript));
      field.current?.focus();
    } catch (e) {
      if (id === session.current) setError(e instanceof Error ? e.message : "Browser voice input failed. Please try again.");
    } finally {
      if (id === session.current) {
        stop.current = null;
        voiceBusy.current = false;
        setVoiceBusyState(false);
        setRecording(false);
        setStatus(null);
      }
    }
  }

  async function send() {
    if (disabled || sendBusy.current || voiceBusy.current || (!value.trim() && !files.length)) return;
    sendBusy.current = true;
    setSending(true);
    setError(null);
    try {
      const attachments = await Promise.all(files.map(async file => {
        const text = await file.text();
        if (text.includes("\u0000")) throw new Error(`${file.name} is not a text file.`);
        return `Attachment: ${file.name}\n${text}`;
      }));
      const question = [value.trim() || "Please analyse the attached files.", ...attachments].join("\n\n");
      if (question.length > 4000) throw new Error("Message and attachments must be under 4,000 characters.");
      await onSend(question);
      setFiles([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send. Please try again.");
    } finally { sendBusy.current = false; setSending(false); }
  }

  const locked = disabled || sending;
  const voiceEnabled = resolveVoiceInputMode(voiceAvailable === true, browserSpeechAvailable) !== "unavailable";
  const button = "flex h-11 w-11 shrink-0 items-center justify-center rounded-full cursor-pointer transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] disabled:cursor-not-allowed disabled:opacity-40";
  return (
    <div className="w-full min-w-0" data-assistant-composer>
      {files.length > 0 && <div className="mb-2 flex flex-wrap gap-2 px-3">{files.map((file, index) => <span key={index} className="flex max-w-full items-center gap-1 rounded-full border border-[var(--oh-border)] bg-white px-3 text-xs text-[var(--oh-text)]"><span className="truncate">{file.name}</span><button type="button" disabled={locked} aria-label={`Remove ${file.name}`} onClick={() => setFiles(files.filter((_, i) => i !== index))} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"><X size={14} /></button></span>)}</div>}
      <form className="flex min-w-0 items-center gap-1 rounded-full border border-[var(--oh-border)] bg-white p-1.5 shadow-sm focus-within:border-[var(--oh-primary)] focus-within:ring-2 focus-within:ring-[var(--oh-orange-muted)] sm:gap-2" onSubmit={event => { event.preventDefault(); void send(); }}>
        <input ref={picker} type="file" multiple accept=".txt,.csv,.md,.json,.tsv,.log" className="hidden" aria-label="Choose attachments" onChange={event => {
          const selected = [...files, ...Array.from(event.target.files ?? [])];
          event.target.value = "";
          if (selected.length > 3 || selected.some(file => !/\.(txt|csv|md|json|tsv|log)$/i.test(file.name) || file.size > 20000) || selected.reduce((sum, file) => sum + file.size, 0) > 20000) {
            setError("Attach up to 3 text, CSV, Markdown or JSON files (20 KB total; message limit 4,000 characters)."); return;
          }
          setFiles(selected); setError(null);
        }} />
        <button type="button" aria-label="Attach files" title="Attach text, CSV, Markdown or JSON (20 KB total; message limit 4,000 characters)" disabled={locked || voiceBusyState} onClick={() => picker.current?.click()} className={`${button} text-[var(--oh-muted)] hover:bg-[var(--oh-orange-light)]`}><Paperclip size={18} /></button>
        <input ref={field} aria-label="Ask Orithos AI" value={value} disabled={locked || !!status} onChange={event => onChange(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && event.nativeEvent.isComposing) event.preventDefault(); }} placeholder={placeholder} className="h-11 min-w-0 flex-1 bg-transparent text-[14px] text-[var(--oh-text)] outline-none placeholder:text-[var(--oh-placeholder)]" />
        <button type="button" aria-label={recording ? "Stop voice input" : "Voice input"} aria-pressed={recording} title={voiceEnabled ? "Click to speak; click again to finish" : voiceAvailable == null ? "Checking voice availability…" : "Voice transcription is unavailable for this store"} disabled={locked || !voiceEnabled || (!!status && !recording)} onClick={() => void voice()} className={`${button} ${recording ? "bg-[var(--oh-orange-light)] text-[var(--oh-primary)]" : "text-[var(--oh-muted)] hover:bg-[var(--oh-orange-light)]"}`}>{recording ? <Square size={17} /> : <Mic size={18} />}</button>
        {cancelable ? (
          <button type="button" aria-label="Cancel request" title="Cancel request" onClick={onCancel} className={`${button} bg-[var(--oh-danger)] text-white hover:opacity-90`}><Square size={16} fill="currentColor" /></button>
        ) : (
          <button type="submit" aria-label="Send message" title="Send message" disabled={locked || !!status || (!value.trim() && !files.length)} className={`${button} bg-[var(--oh-primary)] text-white hover:bg-[var(--oh-primary-hover)]`}><Send size={18} /></button>
        )}
      </form>
      {status && <p role="status" className="px-4 pt-2 text-xs text-[var(--oh-primary)]">{status}</p>}
      {error && <div className="flex flex-wrap items-center gap-2 px-4 pt-2">
        <p role="alert" className="text-xs text-[var(--oh-danger)]">{error}</p>
        {browserSpeechAvailable && voiceAvailable === true && <button type="button" title="Uses your browser's speech recognition service." disabled={locked || voiceBusyState} onClick={() => void runBrowserSpeech()} className="min-h-9 text-xs font-medium text-[var(--oh-primary)] underline">Use browser voice recognition</button>}
      </div>}
    </div>
  );
}
