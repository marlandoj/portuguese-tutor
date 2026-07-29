import { useEffect, useRef, useState } from "react";
import { Bot, Loader2, Mic, Phone, PhoneOff, Send, Settings2, Trash2, Volume2 } from "lucide-react";
import { lessons, levelLabel, lessonById } from "@/lib/data";
import { chatCompletion, speakPt, translateToEnglish, type ChatMsg } from "@/lib/llm";
import { listenPt } from "@/lib/speech";
import { LiveSession, type LiveState } from "@/lib/realtime";
import { getSettings, logActivity, saveSettings } from "@/lib/gamify";
import { cn } from "@/lib/utils";

const MODELS = [
  { id: "openai/gpt-4o-mini", label: "GPT-4o mini (fast, cheap)" },
  { id: "openai/gpt-4o", label: "GPT-4o (best quality)" },
  { id: "google/gemini-2.0-flash-001", label: "Gemini 2.0 Flash (fast)" },
  { id: "anthropic/claude-sonnet-4", label: "Claude Sonnet (strong Portuguese)" },
];

function buildSystemPrompt(scenarioId: string): string {
  const base = `You are "Professora Ana", a warm European Portuguese (Portugal) conversation coach (fluency = speaking confidently; mistakes are welcome; never switch fully to English).

Rules:
- Speak primarily in natural European Portuguese appropriate to an A1-A2 learner — Portugal vocabulary and register (tu with friends, o senhor/a senhora formally, 'estar a + infinitive', words like fixe, giro, se faz favor, casa de banho, autocarro).
- After each Portuguese reply, add ONE short English support line in parentheses — never more.
- If the learner writes in English, answer the Portuguese they were trying to say, then continue in Portuguese.
- Gently correct one mistake per turn maximum, by modeling the correct phrase, not lecturing.
- Ask follow-up questions to keep the learner speaking.
- Keep every reply under 40 Portuguese words.`;
  if (scenarioId === "free") {
    return `${base}

Scenario: free conversation. Start with a friendly greeting and a simple question about their day or weekend.`;
  }
  const lesson = lessonById.get(scenarioId);
  if (!lesson) return base;
  const script = lesson.entries
    .filter((e) => e.jp)
    .slice(0, 25)
    .map((e) => `${e.speaker === "K" ? "Customer" : "Staff"}: ${e.jp}${e.en ? ` (${e.en})` : ""}`)
    .join("\n");
  return `${base}

Scenario: "${lesson.title}" (${levelLabel(lesson.level)}). You play the STAFF/PARTNER role; the learner plays the customer.
Reference script lines from their course (stay close to this vocabulary, but improvise naturally):
${script}

Begin in character with the staff's opening line.`;
}

interface Msg {
  role: "user" | "assistant";
  content: string;
}

/** Voice-call version of Ana's persona: spoken register, no parenthetical
 *  translations (they'd be read aloud), slower pace, phone-style turns. */
function buildLiveInstructions(scenarioId: string): string {
  const base = `You are "Professora Ana", a warm European Portuguese (Portugal) conversation coach in a LIVE VOICE CALL with an A1-A2 learner.

Rules:
- Speak ONLY European Portuguese from Portugal (tu with friends, o senhor/a senhora formally, 'estar a + infinitive', fixe, giro, se faz favor, casa de banho, autocarro) — slow, clear, learner-friendly pace.
- Keep every turn under 30 spoken words. This is a phone-style conversation: no lists, no markdown, no parenthetical translations.
- If the learner is lost or switches to English, give them the exact Portuguese phrase they need, ask them to repeat it, then continue in Portuguese.
- Gently correct at most one mistake per turn by modeling the correct phrase naturally.
- Always end your turn with a short question to keep the learner speaking.`;
  if (scenarioId === "free") {
    return `${base}

Scenario: free conversation. Greet them warmly and ask a simple question about their day or weekend.`;
  }
  const lesson = lessonById.get(scenarioId);
  if (!lesson) return base;
  const script = lesson.entries
    .filter((e) => e.jp)
    .slice(0, 25)
    .map((e) => `${e.speaker === "K" ? "Customer" : "Staff"}: ${e.jp}`)
    .join("\n");
  return `${base}

Scenario: "${lesson.title}" (${levelLabel(lesson.level)}). You play the STAFF/PARTNER role; the learner plays the customer.
Reference script lines from their course (stay close to this vocabulary, but improvise naturally):
${script}

Begin in character with the staff's opening line.`;
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
  const bottomRef = useRef<HTMLDivElement>(null);
  const sessionRef = useRef<LiveSession | null>(null);
  const assistantAccRef = useRef("");

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const updateSettings = (patch: Partial<typeof settings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    saveSettings(next);
  };

  const send = async (text: string) => {
    const content = text.trim();
    if (!content || busy) return;
    setInput("");
    setError(null);
    const history: Msg[] = [...messages, { role: "user", content }];
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
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const mic = async () => {
    setListening(true);
    setError(null);
    try {
      const alts = await listenPt();
      if (alts[0]?.transcript) await send(alts[0].transcript);
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
    assistantAccRef.current = "";
  };

  useEffect(() => () => sessionRef.current?.disconnect(), []);

  const toggleLive = async () => {
    if (liveActive) {
      endLive();
      return;
    }
    setError(null);
    const session = new LiveSession();
    sessionRef.current = session;
    setLiveActive(true);
    assistantAccRef.current = "";
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
      });
      logActivity("live", 10);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      endLive();
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4">
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
          onClick={() => setShowSettings(!showSettings)}
          className="inline-flex items-center gap-1 rounded-full bg-stone-200 px-3 py-1.5 text-sm font-semibold hover:bg-stone-300"
        >
          <Settings2 className="h-4 w-4" /> Settings
        </button>
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

      <div className="flex min-h-[380px] flex-col rounded-2xl border border-stone-200 bg-white shadow-sm">
        <div className="flex-1 space-y-3 overflow-y-auto p-4" style={{ maxHeight: "55vh" }}>
          {messages.length === 0 && (
            <div className="pt-16 text-center text-stone-400">
              <Bot className="mx-auto mb-2 h-10 w-10" />
              Say something in Portuguese — "Oi, tudo bem?" is a great start. Professora Ana will meet you at your level.
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
              <div
                className={cn(
                  "max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-3",
                  m.role === "user"
                    ? "rounded-br-sm bg-red-600 text-white"
                    : "rounded-bl-sm border border-stone-200 bg-stone-50"
                )}
              >
                {m.content}
                {m.role === "assistant" && (
                  <button onClick={() => speakPt(m.content)} className="ml-2 inline-flex text-stone-400 hover:text-red-600" aria-label="Replay voice">
                    <Volume2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
          {busy && (
            <div className="flex items-center gap-2 text-stone-400">
              <Loader2 className="h-4 w-4 animate-spin" /> Professora Ana is thinking…
            </div>
          )}
          <div ref={bottomRef} />
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
            className="flex-1 rounded-full border border-stone-300 px-4 py-2.5 outline-none focus:border-red-400 disabled:opacity-50"
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
        Live calls run for up to 10 minutes per authorization.
      </p>
    </div>
  );
}
