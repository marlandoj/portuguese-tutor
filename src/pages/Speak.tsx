import { Link, useNavigate, useParams } from "react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, CheckCircle2, Ear, Mic, MicOff, Square } from "lucide-react";
import { dayLessons, lessonById, levelLabel, scenarioLessons } from "@/lib/data";
import { getSpeechRecognition, listenPt, similarity } from "@/lib/speech";
import { speakPt } from "@/lib/llm";
import { logActivity, logAttempt } from "@/lib/gamify";
import { cn } from "@/lib/utils";

const PASS = 75;

function stopVoice() {
  try {
    window.speechSynthesis?.cancel();
  } catch {
    /* ignore */
  }
}

export default function Speak() {
  const { lessonId } = useParams();
  const navigate = useNavigate();
  const lesson = lessonId ? lessonById.get(lessonId) : undefined;

  const entries = useMemo(
    () => (lesson ? lesson.entries.map((e, i) => ({ e, i })).filter((x) => x.e.jp && x.e.jp.length >= 2) : []),
    [lesson]
  );

  const [idx, setIdx] = useState(0);
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState<string | null>(null);
  const [score, setScore] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [passed, setPassed] = useState<Set<number>>(new Set());
  const [showTarget, setShowTarget] = useState(true);
  const supported = getSpeechRecognition() !== null;

  useEffect(() => () => stopVoice(), []);
  useEffect(() => {
    setIdx(0); setHeard(null); setScore(null); setError(null); setPassed(new Set());
  }, [lessonId]);

  // ---------- lesson picker ----------
  if (!lesson) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Speaking practice</h1>
          <p className="text-sm text-stone-500">
            Shadow the spoken line, then say it yourself — the tutor listens and scores your match.
            Requires Chrome or Edge with a microphone.
          </p>
        </div>
        {!supported && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
            ⚠️ This browser doesn't support speech recognition. Open the app in Chrome or Edge to use speaking practice.
          </div>
        )}
        {[1, 2, 3].map((lv) => (
          <section key={lv}>
            <h2 className="mb-2 font-bold">{levelLabel(lv)}</h2>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {[...dayLessons(lv), ...scenarioLessons(lv)].map((l) => (
                <Link
                  key={l.id}
                  to={`/speak/${l.id}`}
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

  const cur = entries[idx];

  const playRef = () => {
    if (cur) speakPt(cur.e.jp);
  };

  const record = async () => {
    setError(null); setHeard(null); setScore(null);
    stopVoice();
    setListening(true);
    try {
      const alts = await listenPt();
      // score every alternative, keep the best
      let best = { text: "", score: 0 };
      for (const a of alts) {
        const s = similarity(cur.e.jp, a.transcript);
        if (s > best.score) best = { text: a.transcript, score: s };
      }
      setHeard(best.text || alts[0]?.transcript || "");
      setScore(best.score);
      logAttempt({ t: Date.now(), lessonId: lesson.id, line: cur.e.jp, score: best.score });
      if (best.score >= PASS) {
        setPassed((p) => new Set(p).add(cur.i));
        logActivity("speak", 5);
      } else {
        logActivity("speak", 1);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setListening(false);
    }
  };

  const go = (d: number) => {
    stopVoice();
    setIdx(Math.min(entries.length - 1, Math.max(0, idx + d)));
    setHeard(null); setScore(null); setError(null);
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => { stopVoice(); navigate("/speak"); }} className="inline-flex items-center gap-1 text-sm text-stone-500 hover:text-stone-900">
          <ArrowLeft className="h-4 w-4" /> Lessons
        </button>
        <h1 className="text-xl font-bold">{lesson.title}</h1>
        <span className="ml-auto text-sm text-stone-500">
          {passed.size} / {entries.length} passed
        </span>
      </div>

      <div className="h-2 overflow-hidden rounded-full bg-stone-200">
        <div className="h-full rounded-full bg-red-600 transition-all" style={{ width: `${(passed.size / Math.max(1, entries.length)) * 100}%` }} />
      </div>

      {!supported && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          ⚠️ Speech recognition unavailable in this browser — use Chrome or Edge.
        </div>
      )}

      {cur && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-stone-400">
              <span>Line {idx + 1} / {entries.length}</span>
              {passed.has(cur.i) && <span className="inline-flex items-center gap-1 text-green-600"><CheckCircle2 className="h-4 w-4" /> passed</span>}
            </div>

            {showTarget ? (
              <div className="mt-4 text-center">
                <div className="text-2xl font-bold leading-relaxed">{cur.e.jp}</div>
                {cur.e.romaji && <div className="mt-1 text-sm italic text-stone-500">{cur.e.romaji}</div>}
              </div>
            ) : (
              <div className="mt-4 text-center text-stone-400">
                <div className="text-lg">🎤 Recall mode — say the Portuguese for:</div>
                <div className="mt-2 text-xl font-semibold text-stone-700">{cur.e.en || "…"}</div>
              </div>
            )}
            {cur.e.en && showTarget && <div className="mt-2 text-center text-sm text-stone-600">{cur.e.en}</div>}

            <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
              <button
                onClick={playRef}
                className={cn(
                  "inline-flex items-center gap-2 rounded-full px-4 py-2.5 font-semibold",
                  "bg-stone-900 text-white hover:bg-stone-700"
                )}
              >
                <Ear className="h-4 w-4" /> Hear this line
              </button>
              <button
                onClick={listening ? () => setListening(false) : record}
                disabled={!supported}
                className={cn(
                  "inline-flex items-center gap-2 rounded-full px-5 py-2.5 font-semibold text-white disabled:opacity-40",
                  listening ? "bg-amber-600 hover:bg-amber-700" : "bg-red-600 hover:bg-red-700"
                )}
              >
                {listening ? <><Square className="h-4 w-4" /> Listening…</> : <><Mic className="h-4 w-4" /> Speak</>}
              </button>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-stone-600">
                <input type="checkbox" checked={!showTarget} onChange={(e) => setShowTarget(!e.target.checked)} className="accent-red-600" />
                Recall mode
              </label>
            </div>
          </div>

          {(heard !== null || error) && (
            <div className={cn(
              "rounded-2xl border p-5",
              score !== null && score >= PASS ? "border-green-300 bg-green-50" : score !== null ? "border-amber-300 bg-amber-50" : "border-red-300 bg-red-50"
            )}>
              {error ? (
                <div className="flex items-center gap-2 text-red-800"><MicOff className="h-4 w-4" /> {error}</div>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-stone-600">Tutor heard:</span>
                    <span className={cn("text-2xl font-bold", score! >= PASS ? "text-green-700" : "text-amber-700")}>{score}%</span>
                  </div>
                  <div className="mt-1 text-lg">{heard}</div>
                  <div className="mt-2 text-sm text-stone-600">
                    {score! >= PASS
                      ? "Muito bem! Clear match — move to the next line."
                      : score! >= 50
                        ? "Close — listen to the reference once more and repeat."
                        : "Play the reference, shadow it 2–3 times, then try again."}
                  </div>
                </>
              )}
            </div>
          )}

          <div className="flex justify-between">
            <button onClick={() => go(-1)} disabled={idx === 0} className="rounded-full bg-stone-200 px-4 py-2 text-sm font-semibold disabled:opacity-40">← Prev line</button>
            <button onClick={() => go(1)} disabled={idx >= entries.length - 1} className="rounded-full bg-stone-200 px-4 py-2 text-sm font-semibold disabled:opacity-40">
              {score !== null && score >= PASS ? "Next line →" : "Skip →"}
            </button>
          </div>

          {idx >= entries.length - 1 && (
            <div className="rounded-xl bg-stone-900 p-4 text-center text-white">
              End of lines — {passed.size}/{entries.length} passed.
              <Link to={`/learn/${lesson.id}`} className="ml-2 underline">Back to lesson</Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
