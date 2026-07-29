import { Link, useParams } from "react-router";
import { useMemo, useState } from "react";
import { ArrowLeft, Ear, Keyboard, ListChecks, RotateCcw } from "lucide-react";
import { lessonById, levelLabel, lessons } from "@/lib/data";
import { levenshtein, normalizePt } from "@/lib/speech";
import { speakPt } from "@/lib/llm";
import { logActivity } from "@/lib/gamify";
import { cn } from "@/lib/utils";

type Mode = "mc" | "dictation";

interface Item {
  lessonId: string;
  entryIdx: number;
  jp: string;
  en: string;
}

function allItems(): Item[] {
  const out: Item[] = [];
  for (const l of lessons) {
    l.entries.forEach((e, i) => {
      if (e.jp && e.en && e.jp.length >= 4) {
        out.push({ lessonId: l.id, entryIdx: i, jp: e.jp, en: e.en });
      }
    });
  }
  return out;
}

function sample<T>(arr: T[], n: number): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, n);
}

export default function Listen() {
  const { lessonId } = useParams();
  const lesson = lessonId && lessonId !== "all" ? lessonById.get(lessonId) : undefined;
  const [mode, setMode] = useState<Mode>("mc");
  const [round, setRound] = useState(0);
  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [typed, setTyped] = useState("");
  const [dictationResult, setDictationResult] = useState<number | null>(null);
  const [correctCount, setCorrectCount] = useState(0);
  const [finished, setFinished] = useState(false);

  const items = useMemo(() => {
    const all = allItems().filter((it) => !lesson || it.lessonId === lesson.id);
    return sample(all, Math.min(10, all.length));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lessonId, round]);

  if (!lessonId) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Listening comprehension</h1>
          <p className="text-sm text-stone-500">
            Hear a line spoken by the Portuguese voice — identify it (multiple choice) or type what you heard (dictation).
            Pick a lesson, or drill random lines from everywhere.
          </p>
        </div>
        <Link
          to="/listen/all"
          className="inline-flex items-center gap-2 rounded-full bg-red-600 px-5 py-2.5 font-semibold text-white hover:bg-red-700"
        >
          <Ear className="h-4 w-4" /> Mixed drill — all levels
        </Link>
        {[1, 2, 3].map((lv) => (
          <section key={lv}>
            <h2 className="mb-2 font-bold">{levelLabel(lv)}</h2>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {lessons.filter((l) => l.level === lv).map((l) => (
                <Link
                  key={l.id}
                  to={`/listen/${l.id}`}
                  className="rounded-lg border border-stone-200 bg-white px-4 py-3 text-sm font-medium transition hover:border-red-300 hover:shadow-sm"
                >
                  {l.title}
                  <span className="ml-2 text-xs text-stone-400">{l.entries.length} lines</span>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="space-y-4">
        <p>No lines available for this selection yet.</p>
        <Link to="/listen" className="text-red-700 underline">Back</Link>
      </div>
    );
  }

  if (finished) {
    const pct = Math.round((correctCount / items.length) * 100);
    return (
      <div className="mx-auto max-w-lg space-y-6 pt-8 text-center">
        <div className="text-5xl">{pct >= 80 ? "👂" : "🔁"}</div>
        <h1 className="text-3xl font-bold">{pct}%</h1>
        <p className="text-stone-600">{correctCount} of {items.length} correct.</p>
        <div className="flex justify-center gap-3">
          <button
            onClick={() => { setRound((r) => r + 1); setIdx(0); setCorrectCount(0); setFinished(false); setPicked(null); setTyped(""); setDictationResult(null); }}
            className="inline-flex items-center gap-2 rounded-full bg-red-600 px-4 py-2 font-semibold text-white hover:bg-red-700"
          >
            <RotateCcw className="h-4 w-4" /> New round
          </button>
          <Link to="/listen" className="rounded-full bg-stone-200 px-4 py-2 font-semibold hover:bg-stone-300">Back</Link>
        </div>
      </div>
    );
  }

  const it = items[idx];
  const play = () => speakPt(it.jp);

  // deterministic distractors from the same round (no hook, safe after early returns)
  const mcOptions = (() => {
    const others = items.filter((o, j) => j !== idx && o.jp !== it.jp);
    const picks = [others[(idx * 3 + 1) % others.length], others[(idx * 3 + 2) % others.length], others[(idx * 3 + 3) % others.length]]
      .filter(Boolean)
      .map((o) => o.jp);
    const opts = [...new Set([it.jp, ...picks])].slice(0, 4);
    // deterministic rotate so the answer isn't always first
    const rot = idx % opts.length;
    return [...opts.slice(rot), ...opts.slice(0, rot)];
  })();

  const answerMc = (i: number) => {
    if (picked !== null) return;
    setPicked(i);
    const ok = mcOptions[i] === it.jp;
    if (ok) { setCorrectCount((c) => c + 1); logActivity("listen", 5); }
  };

  const answerDictation = () => {
    if (dictationResult !== null) return;
    const t = normalizePt(it.jp);
    const h = normalizePt(typed);
    const score = t && h ? Math.max(0, Math.round((1 - levenshtein(t, h) / Math.max(t.length, h.length, 1)) * 100)) : 0;
    setDictationResult(score);
    if (score >= 75) { setCorrectCount((c) => c + 1); logActivity("dictation", 10); }
  };

  const next = () => {
    try { window.speechSynthesis?.cancel(); } catch { /* ignore */ }
    if (idx + 1 >= items.length) setFinished(true);
    else { setIdx(idx + 1); setPicked(null); setTyped(""); setDictationResult(null); }
  };

  const answered = mode === "mc" ? picked !== null : dictationResult !== null;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/listen" className="inline-flex items-center gap-1 text-sm text-stone-500 hover:text-stone-900">
          <ArrowLeft className="h-4 w-4" /> Exit
        </Link>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => setMode("mc")} className={cn("inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold", mode === "mc" ? "bg-red-600 text-white" : "bg-stone-200")}>
            <ListChecks className="h-3.5 w-3.5" /> Multiple choice
          </button>
          <button onClick={() => setMode("dictation")} className={cn("inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold", mode === "dictation" ? "bg-red-600 text-white" : "bg-stone-200")}>
            <Keyboard className="h-3.5 w-3.5" /> Dictation
          </button>
        </div>
      </div>
      <div className="text-sm text-stone-500">Line {idx + 1} / {items.length}</div>
      <div className="h-2 overflow-hidden rounded-full bg-stone-200">
        <div className="h-full rounded-full bg-red-600" style={{ width: `${((idx + 1) / items.length) * 100}%` }} />
      </div>

      <div className="rounded-2xl border border-stone-200 bg-white p-8 text-center shadow-sm">
        <div className="text-sm font-semibold uppercase tracking-wide text-stone-400">
          {mode === "mc" ? "What did you hear?" : "Type exactly what you hear"}
        </div>
        <button
          onClick={play}
          className="mx-auto mt-5 flex h-16 w-16 items-center justify-center rounded-full bg-red-600 text-white shadow transition hover:scale-105 hover:bg-red-700"
          aria-label="Play line"
        >
          <Ear className="h-7 w-7" />
        </button>
        <div className="mt-2 text-xs text-stone-400">replay as many times as you need</div>
      </div>

      {mode === "mc" ? (
        <div className="grid gap-2">
          {mcOptions.map((opt, i) => {
            const state = picked === null ? "idle" : opt === it.jp ? "correct" : i === picked ? "wrong" : "dim";
            return (
              <button
                key={i}
                onClick={() => answerMc(i)}
                disabled={picked !== null}
                className={cn(
                  "rounded-xl border px-4 py-3 text-left text-lg transition",
                  state === "idle" && "border-stone-200 bg-white hover:border-red-400 hover:bg-red-50",
                  state === "correct" && "border-green-500 bg-green-50",
                  state === "wrong" && "border-red-500 bg-red-50",
                  state === "dim" && "border-stone-200 bg-white opacity-50"
                )}
              >
                {opt}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="space-y-3">
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && answerDictation()}
            disabled={dictationResult !== null}
            placeholder="Digite o que você ouviu…"
            className="w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-lg outline-none focus:border-red-400"
            autoFocus
          />
          {dictationResult === null ? (
            <button onClick={answerDictation} disabled={!typed.trim()} className="rounded-full bg-stone-900 px-5 py-2.5 font-semibold text-white disabled:opacity-40">
              Check
            </button>
          ) : (
            <div className={cn("rounded-xl border p-4", dictationResult >= 75 ? "border-green-300 bg-green-50" : "border-amber-300 bg-amber-50")}>
              <div className="flex justify-between font-semibold">
                <span>Match: {dictationResult}%</span>
                <span>{dictationResult >= 75 ? "✓ correct" : "keep practicing"}</span>
              </div>
              <div className="mt-2 text-lg">{it.jp}</div>
              {it.en && <div className="text-sm text-stone-600">{it.en}</div>}
            </div>
          )}
        </div>
      )}

      {answered && (
        <div className="flex justify-center">
          <button onClick={next} className="rounded-full bg-stone-900 px-6 py-2.5 font-semibold text-white hover:bg-stone-700">
            {idx + 1 >= items.length ? "See results" : "Next line"}
          </button>
        </div>
      )}
    </div>
  );
}
