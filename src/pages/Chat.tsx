import { useEffect, useRef, useState } from "react";
import { Bot, FileText, Loader2, Mic, Phone, PhoneOff, Send, Settings2, Trash2, User, Volume2 } from "lucide-react";
import { requestAvatarSessionToken, requestHealth } from "@/lib/api";
import { FallbackAudioSink, createAnamProvider } from "@/lib/avatar";
import { lessons, lessonById } from "@/lib/data";
import { chatCompletion, speakPt, translateToEnglish, type ChatMsg } from "@/lib/llm";
import { listenPt, type SpeechAlt } from "@/lib/speech";
import { assessPronunciation, retryScore, type PronFeedback } from "@/lib/pronunciation";
import { getTroubleWords, recordPractice, saveTroubleWord, type TroubleWord } from "@/lib/troubleWords";
import { generateSessionReport, saveReport, type SessionReport } from "@/lib/report";
import AiDisclosure from "@/components/AiDisclosure";
import SessionReportPanel from "@/components/SessionReportPanel";
import PronunciationCard from "@/components/PronunciationCard";
import { LiveSession, type LiveState } from "@/lib/realtime";
import { getSettings, logActivity, saveSettings } from "@/lib/gamify";
import {
  buildLiveInstructions,
  buildSystemPrompt,
  isPronunciationDrillTurn,
} from "@/lib/coachPrompts";
import { cn } from "@/lib/utils";

const MODELS = [
  { id: "openai/gpt-4o-mini", label: "GPT-4o mini (fast, cheap)" },
  { id: "openai/gpt-4o", label: "GPT-4o (best quality)" },
  { id: "google/gemini-2.0-flash-001", label: "Gemini 2.0 Flash (fast)" },
  { id: "anthropic/claude-sonnet-4", label: "Claude Sonnet (strong Portuguese)" },
];

interface Msg {
  role: "user" | "assistant";
  content: string;
  /** Spoken (not typed) message, with the recognizer alternatives that produced it. */
  viaMic?: boolean;
  alts?: SpeechAlt[];
  /** Pronunciation assessment result; undefined = not assessed, null = assessor failed. */
  pron?: PronFeedback | null;
  pronPending?: boolean;
}

export default function Chat() {
  const [settings, setSettings] = useState(getSettings);
  const [showSettings, setShowSettings] = useState(false);
  const [scenario, setScenario] = useState("free");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [liveActive, setLiveActive] = useState(false);
  const [liveState, setLiveState] = useState<LiveState>("idle");
  const [report, setReport] = useState<SessionReport | null>(null);
  const [reportBusy, setReportBusy] = useState(false);
  const [reportPron, setReportPron] = useState<TroubleWord[]>([]);
  // Avatar rendering is opt-in per session and off by default. `avatarOffered`
  // only becomes true when the server reports the route is enabled AND keyed.
  const [avatarOffered, setAvatarOffered] = useState(false);
  const [avatarRequested, setAvatarRequested] = useState(false);
  const [avatarSessionMs, setAvatarSessionMs] = useState(0);
  const [avatarActive, setAvatarActive] = useState(false);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const sessionRef = useRef<LiveSession | null>(null);
  const assistantAccRef = useRef("");
  const sessionStartRef = useRef(0);
  const avatarVideoRef = useRef<HTMLVideoElement>(null);

  const userTurns = messages.filter((m) => m.role === "user").length;
  const avatarLayoutActive = liveActive && avatarRequested;

  useEffect(() => {
    transcriptRef.current?.scrollTo({
      top: transcriptRef.current.scrollHeight,
      behavior: avatarLayoutActive || messages.length <= 1 ? "auto" : "smooth",
    });
    if (messages.length > 0 && sessionStartRef.current === 0) {
      sessionStartRef.current = Date.now();
    }
    if (messages.length === 0) sessionStartRef.current = 0;
  }, [messages, busy, avatarLayoutActive]);

  /** End-of-session debrief: one LLM call over the transcript + pronunciation recap. */
  const endSession = async () => {
    if (reportBusy || userTurns < 4) return;
    setReportBusy(true);
    setError(null);
    try {
      const scenarioTitle =
        scenario === "free" ? "Free conversation" : lessonById.get(scenario)?.title ?? scenario;
      const result = await generateSessionReport(settings.model, messages, scenarioTitle);
      if (!result) {
        setError("The report could not be generated this time — the conversation is unaffected.");
        return;
      }
      saveReport(result);
      setReportPron(getTroubleWords().filter((w) => w.addedAt >= sessionStartRef.current));
      setReport(result);
      logActivity("report", 5);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setReportBusy(false);
    }
  };

  const updateSettings = (patch: Partial<typeof settings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    saveSettings(next);
  };

  const send = async (text: string, speech?: SpeechAlt[]) => {
    const content = text.trim();
    if (!content || busy) return;
    setInput("");
    setError(null);
    const userMsg: Msg = speech?.length
      ? { role: "user", content, viaMic: true, alts: speech }
      : { role: "user", content };
    const history: Msg[] = [...messages, userMsg];
    setMessages(history);
    setBusy(true);
    try {
      const apiMsgs: ChatMsg[] = [
        { role: "system", content: buildSystemPrompt(scenario) },
        ...history.slice(-20).map((m) => ({ role: m.role, content: m.content }) as ChatMsg),
      ];
      const reply = await chatCompletion(settings.model, apiMsgs);
      setMessages([...history, { role: "assistant", content: reply }]);
      logActivity("chat", 3);
      if (settings.voiceReplies) speakPt(reply);
      if (speech?.length) void assessSpoken(history.length - 1, content, speech);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  /** Background pronunciation assessment for a spoken user message. */
  const assessSpoken = async (msgIndex: number, said: string, alts: SpeechAlt[]) => {
    setMessages((msgs) =>
      msgs.map((m, i) => (i === msgIndex ? { ...m, pronPending: true } : m))
    );
    let pron: PronFeedback | null = null;
    try {
      pron = await assessPronunciation(settings.model, said, alts);
      if (pron && (pron.verdict === "close" || pron.verdict === "off")) {
        saveTroubleWord(pron); // feeds the "Palavras difíceis" deck in Review
      }
    } catch {
      pron = null; // coaching is best-effort; never block the conversation
    }
    setMessages((msgs) =>
      msgs.map((m, i) => (i === msgIndex ? { ...m, pronPending: false, pron } : m))
    );
  };

  /** Retry loop for a pronunciation card: re-listen and score against the focus word. */
  const retryPronunciation = (focusWord: string) => async (): Promise<number | null> => {
    try {
      const alts = await listenPt();
      const heard = alts[0]?.transcript ?? "";
      if (!heard) return null;
      const score = retryScore(focusWord, heard);
      recordPractice(focusWord, score);
      return score;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return null;
    }
  };

  const mic = async () => {
    setListening(true);
    setError(null);
    try {
      const alts = await listenPt();
      if (alts[0]?.transcript) await send(alts[0].transcript, alts);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setListening(false);
    }
  };

  const startScenario = (id: string) => {
    setScenario(id);
    setMessages([]);
    setError(null);
  };

  // ---- live speech-to-speech call (GPT-Realtime-2) ----

  const endLive = () => {
    sessionRef.current?.disconnect();
    sessionRef.current = null;
    setLiveActive(false);
    setLiveState("idle");
    setAvatarActive(false);
    assistantAccRef.current = "";
  };

  useEffect(() => () => sessionRef.current?.disconnect(), []);

  useEffect(() => {
    let cancelled = false;
    void requestHealth()
      .then((health) => {
        if (cancelled) return;
        setAvatarOffered(health.avatar);
        setAvatarSessionMs(health.avatarSessionMs);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const buildAudioSink = () => {
    const useAvatar = avatarOffered && avatarRequested;
    return new FallbackAudioSink(
      useAvatar ? createAnamProvider() : null,
      {
        mintSessionToken: (signal) => requestAvatarSessionToken(signal),
        videoElement: avatarVideoRef.current,
        maxAvatarMs: avatarSessionMs,
      },
      {
        onAvatarActive: () => setAvatarActive(true),
        onFallback: (failure) => {
          setAvatarActive(false);
          setError(
            failure.reason === "budget"
              ? "Avatar time for this session is used up; the conversation continues with voice."
              : failure.reason === "quota"
                ? `${failure.message} The conversation continues with voice.`
              : `Avatar unavailable (${failure.reason}); continuing with voice only.`
          );
        },
      }
    );
  };

  const toggleLive = async () => {
    if (liveActive) {
      endLive();
      return;
    }
    setError(null);
    const session = new LiveSession();
    sessionRef.current = session;
    setLiveActive(true);
    setAvatarActive(false);
    assistantAccRef.current = "";
    const audioSink = buildAudioSink();
    try {
      await session.connect(buildLiveInstructions(scenario), {
        onState: (s) => setLiveState(s),
        onUserTranscript: (text) => {
          assistantAccRef.current = "";
          setMessages((msgs) => [...msgs, { role: "user", content: `🎙️ ${text}` }]);
        },
        onAssistantDelta: (delta) => {
          assistantAccRef.current += delta;
          const acc = assistantAccRef.current;
          setMessages((msgs) => {
            const last = msgs[msgs.length - 1];
            if (last?.role === "assistant") {
              return [...msgs.slice(0, -1), { role: "assistant", content: acc }];
            }
            return [...msgs, { role: "assistant", content: acc }];
          });
        },
        onAssistantDone: (text) => {
          setMessages((msgs) => {
            const last = msgs[msgs.length - 1];
            if (last?.role === "assistant") {
              return [...msgs.slice(0, -1), { role: "assistant", content: text }];
            }
            return [...msgs, { role: "assistant", content: text }];
          });
          assistantAccRef.current = "";
          // Silent English support line: translated in the background via
          // the server-backed chat provider and appended as text only.
          if (isPronunciationDrillTurn(text)) return;
          void translateToEnglish(settings.model, text)
            .then((en) => {
              setMessages((msgs) => {
                let idx = -1;
                for (let i = msgs.length - 1; i >= 0; i--) {
                  if (msgs[i].role === "assistant" && msgs[i].content === text) {
                    idx = i;
                    break;
                  }
                }
                if (idx < 0) return msgs;
                const next = [...msgs];
                next[idx] = { ...next[idx], content: `${text}\n(${en})` };
                return next;
              });
            })
            .catch(() => {
              /* translation is best-effort */
            });
        },
        onError: (msg) => setError(msg),
        onEnded: endLive,
      }, { audioSink });
      logActivity("live", 10);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      endLive();
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      {/*
        Rendered above the controls and outside any conditional, so the notice
        precedes the first interaction on every path into this page — text
        chat, live call, or avatar. See ZOU-1137.
      */}
      <AiDisclosure />
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Bot className="h-6 w-6 text-red-600" /> AI conversation coach
        </h1>
        <button
          onClick={toggleLive}
          className={cn(
            "ml-auto inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold text-white",
            liveActive ? "bg-red-600 hover:bg-red-700" : "bg-emerald-600 hover:bg-emerald-700"
          )}
        >
          {liveActive ? <PhoneOff className="h-4 w-4" /> : <Phone className="h-4 w-4" />}
          {liveActive ? "End live call" : "Conversa ao vivo"}
        </button>
        <button
          onClick={endSession}
          disabled={reportBusy || userTurns < 4 || busy || liveActive}
          title={userTurns < 4 ? "Have a few exchanges first (4+ of your turns)" : "Generate a session debrief"}
          className="inline-flex items-center gap-1.5 rounded-full bg-amber-500 px-3 py-1.5 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-40"
        >
          {reportBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
          {reportBusy ? "A escrever…" : "Terminar sessão"}
        </button>
        {avatarOffered && (
          <button
            onClick={() => setAvatarRequested((on) => !on)}
            disabled={liveActive}
            title={
              liveActive
                ? "Change this before starting a live call"
                : "Show an animated face during the live call. Voice and coaching are identical either way."
            }
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold disabled:opacity-40",
              avatarRequested
                ? "bg-sky-600 text-white hover:bg-sky-700"
                : "bg-stone-200 hover:bg-stone-300"
            )}
          >
            <User className="h-4 w-4" />
            {avatarRequested ? "Avatar on" : "Avatar off"}
          </button>
        )}
        <button
          onClick={() => setShowSettings(!showSettings)}
          className="inline-flex items-center gap-1 rounded-full bg-stone-200 px-3 py-1.5 text-sm font-semibold hover:bg-stone-300"
        >
          <Settings2 className="h-4 w-4" /> Settings
        </button>
      </div>

      {/*
        The surface is mounted whenever a live call runs so the provider has a
        stable element to stream into, and is only revealed once frames arrive.
        Learners are told plainly that the face is synthetic and that it is not
        a pronunciation reference — its lip-sync is tuned for conversational
        realism, not phonetic articulation.
      */}
      <div className={cn(avatarLayoutActive ? "block" : "hidden")}>
        <div
          className={cn(
            "overflow-hidden rounded-xl border border-sky-200 bg-stone-900",
            avatarActive ? "block" : "hidden"
          )}
        >
          <video
            ref={avatarVideoRef}
            autoPlay
            playsInline
            muted={false}
            className="aspect-video w-full object-cover"
          />
          <p className="bg-sky-50 px-3 py-1.5 text-xs font-medium text-sky-900">
            AI-generated avatar. Watch it for company, not for pronunciation — use
            Pronúncia for mouth and sound practice.
          </p>
        </div>
      </div>

      {liveActive && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-800">
          <span className={cn("h-2.5 w-2.5 rounded-full", liveState === "speaking" ? "bg-red-500" : "bg-emerald-500", liveState !== "idle" && "animate-pulse")} />
          {liveState === "connecting" && "A ligar à Professora Ana…"}
          {liveState === "listening" && "Live — Ana is listening. Just speak; interrupt her anytime."}
          {liveState === "speaking" && "Ana is speaking… (you can talk over her to interrupt)"}
          {liveState === "idle" && "Call ended."}
        </div>
      )}

      {showSettings && (
        <div className="space-y-3 rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 font-semibold">
            <Settings2 className="h-4 w-4 text-red-600" /> Conversation settings
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={settings.model}
              onChange={(e) => updateSettings({ model: e.target.value })}
              className="rounded-lg border border-stone-300 px-3 py-2 text-sm"
            >
              {MODELS.map((model) => (
                <option key={model.id} value={model.id}>{model.label}</option>
              ))}
            </select>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={settings.voiceReplies}
                onChange={(e) => updateSettings({ voiceReplies: e.target.checked })}
                className="accent-red-600"
              />
              <Volume2 className="h-4 w-4" /> Speak replies (Portuguese voice)
            </label>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={scenario}
          onChange={(e) => startScenario(e.target.value)}
          className="max-w-full rounded-full border border-stone-300 bg-white px-3 py-2 text-sm"
        >
          <option value="free">Free conversation</option>
          {lessons.map((l) => (
            <option key={l.id} value={l.id}>
              L{l.level} · {l.title}
            </option>
          ))}
        </select>
        <button
          onClick={() => setMessages([])}
          className="inline-flex items-center gap-1 rounded-full bg-stone-200 px-3 py-1.5 text-xs font-semibold hover:bg-stone-300"
        >
          <Trash2 className="h-3.5 w-3.5" /> Clear chat
        </button>
      </div>

      {report && (
        <SessionReportPanel
          report={report}
          pronWords={reportPron}
          onClose={() => setReport(null)}
        />
      )}

      <div
        data-avatar-layout={avatarLayoutActive ? "true" : "false"}
        className={cn(
          "flex flex-col rounded-2xl border border-stone-200 bg-white shadow-sm",
          avatarLayoutActive ? "h-[clamp(18rem,40svh,24rem)] min-h-0" : "min-h-[380px]"
        )}
      >
        <div
          ref={transcriptRef}
          data-chat-transcript
          className={cn(
            "min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-4 [scrollbar-gutter:stable]",
            !avatarLayoutActive && "max-h-[55vh]"
          )}
        >
          {messages.length === 0 && (
            <div className="pt-16 text-center text-stone-400">
              <Bot className="mx-auto mb-2 h-10 w-10" />
              Say something in Portuguese — "Oi, tudo bem?" is a great start. Professora Ana will meet you at your level.
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
              {m.role === "user" ? (
                <div className="flex max-w-[85%] flex-col items-end">
                  <div className="whitespace-pre-wrap rounded-2xl rounded-br-sm bg-red-600 px-4 py-3 text-white">
                    {m.viaMic && <Mic className="mr-1.5 inline h-3.5 w-3.5 opacity-70" aria-label="Spoken message" />}
                    {m.content}
                  </div>
                  {m.pronPending && (
                    <div className="mt-1.5 flex items-center gap-1.5 text-xs text-stone-400">
                      <Loader2 className="h-3 w-3 animate-spin" /> A avaliar a pronúncia…
                    </div>
                  )}
                  {m.pron && (m.pron.verdict === "close" || m.pron.verdict === "off") && (
                    <PronunciationCard feedback={m.pron} onRetry={retryPronunciation(m.pron.focusWord)} />
                  )}
                </div>
              ) : (
                <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-bl-sm border border-stone-200 bg-stone-50 px-4 py-3">
                  {m.content}
                  <button onClick={() => speakPt(m.content)} className="ml-2 inline-flex text-stone-400 hover:text-red-600" aria-label="Replay voice">
                    <Volume2 className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
          ))}
          {busy && (
            <div className="flex items-center gap-2 text-stone-400">
              <Loader2 className="h-4 w-4 animate-spin" /> Professora Ana is thinking…
            </div>
          )}
        </div>

        {error && <div className="border-t border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>}

        <div className="flex items-center gap-2 border-t border-stone-200 p-3">
          <button
            onClick={mic}
            disabled={busy || listening || liveActive}
            className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white disabled:opacity-40",
              listening ? "bg-amber-600" : "bg-stone-900 hover:bg-stone-700"
            )}
            aria-label="Speak Portuguese"
          >
            <Mic className="h-5 w-5" />
          </button>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send(input)}
            disabled={busy || liveActive}
            placeholder={liveActive ? "Live call in progress — just speak" : "Fale comigo em português…"}
            className="min-w-0 flex-1 rounded-full border border-stone-300 px-4 py-2.5 outline-none focus:border-red-400 disabled:opacity-50"
          />
          <button
            onClick={() => send(input)}
            disabled={busy || !input.trim() || liveActive}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-600 text-white hover:bg-red-700 disabled:opacity-40"
            aria-label="Send"
          >
            <Send className="h-5 w-5" />
          </button>
        </div>
      </div>
      <p className="text-center text-xs text-stone-400">
        Mic uses Portuguese speech recognition with a browser fallback. Replies use a Portuguese voice with a browser fallback.
        Spoken messages get pronunciation coaching when the recognizer hears something worth fixing.
        Live calls run for up to 10 minutes per authorization.
      </p>
    </div>
  );
}
