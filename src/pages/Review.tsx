import { useMemo, useState } from "react";
import { Link } from "react-router";
import { Keyboard, Layers, RotateCcw } from "lucide-react";
import { lessons, sounds, verbs, vocab } from "@/lib/data";
import { dueCount, getSrs, rateCard } from "@/lib/store";
import { levenshtein } from "@/lib/speech";
import { speakPt } from "@/lib/llm";
import { logActivity } from "@/lib/gamify";
import { cn } from "@/lib/utils";

type DeckKind = "phrases" | "verbs" | "sounds";

interface Card {
  id: string;
  front: string;
  frontSub?: string;
  back: string;
  backSub?: string;
  meta?: string;
  speak?: string;
}

function buildDeck(kind: DeckKind, level: number | 0, lessonId: string | ""): Card[] {
  if (kind === "phrases") {
    return vocab
      .filter((v) => (level === 0 || v.level === level) && (!lessonId || v.lessonId === lessonId))
      .map((v) => ({
        id: `p-${v.id}`,
        front: v.jp,
        back: v.en,
        meta: `L${v.level} · ${v.lessonTitle}`,
        speak: v.jp,
      }));
  }
  if (kind === "verbs") {
    return verbs.map((v, i) => ({
      id: `verb-${i}`,
      front: v.infinitive,
      back: `${v.meaning} — present: ${v.present} · past: ${v.preterite}`,
      meta: "Verbs",
      speak: v.infinitive,
    }));
  }
  return sounds.sections.flatMap((sec) =>
    sec.items.map((it, i) => ({
      id: `sound-${sec.title}-${i}`,
      front: it.example,
      frontSub: it.sound,
      back: it.note,
      meta: sec.title,
      speak: it.example.split(",")[0].trim(),
    }))
  );
}

function checkTyped(kind: DeckKind, card: Card, input: string): boolean {
  const t = input.trim().toLowerCase();
  if (!t) return false;
  if (kind === "verbs") {
    const meaning = card.back.split("—")[0].toLowerCase();
    return meaning.split(/[/,]/).some((w) => {
      const w2 = w.trim();
      return !!w2 && (w2 === t || (w2.length > 3 && w2.includes(t)) || (t.length > 3 && t.includes(w2)));
    });
  }
  const norm = (s: string) =>
    s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  const a = norm(card.back);
  const b = norm(input);
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.includes(b) || b.includes(a)) {
    if (Math.min(a.length, b.length) / Math.max(a.length, b.length) > 0.6) return true;
  }
  return 1 - levenshtein(a, b) / Math.max(a.length, b.length) >= 0.75;
}

export default function Review() {
  const [kind, setKind] = useState<DeckKind>("phrases");
  const [level, setLevel] = useState<number | 0>(0);
  const [lessonId, setLessonId] = useState<string | "">("");
  const [srs, setSrs] = useState(getSrs);
  const [flipped, setFlipped] = useState(false);
  const [sessionDone, setSessionDone] = useState(0);
  const [typing, setTyping] = useState(false);
  const [answer, setAnswer] = useState("");
  const [typedOk, setTypedOk] = useState<boolean | null>(null);

  const deck = useMemo(() => buildDeck(kind, level, lessonId), [kind, level, lessonId]);
  const [now] = useState(Date.now);
  const dueCards = deck.filter((c) => !srs[c.id] || srs[c.id].due <= now);
  const current = dueCards[0];
  const due = dueCount(deck.map((c) => c.id));

  const rate = (r: "again" | "hard" | "good" | "easy") => {
    if (!current) return;
    setSrs(rateCard(current.id, r));
    logActivity("review", r === "again" ? 1 : 2);
    setFlipped(false);
    setAnswer("");
    setTypedOk(null);
    setSessionDone((d) => d + 1);
  };

  const submitTyped = () => {
    if (!current || flipped) return;
    setTypedOk(checkTyped(kind, current, answer));
    setFlipped(true);
  };

  const soundCount = sounds.sections.reduce((s, sec) => s + sec.items.length, 0);
  const decks: { key: DeckKind; label: string; count: number }[] = [
    { key: "phrases", label: "Phrases", count: vocab.length },
    { key: "verbs", label: "Verbs", count: verbs.length },
    { key: "sounds", label: "Sounds", count: soundCount },
  ];

  const levelLessons = lessons.filter((l) => level === 0 || l.level === level);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        {decks.map((d) => (
          <button
            key={d.key}
            onClick={() => { setKind(d.key); setLessonId(""); setFlipped(false); }}
            className={cn(
              "rounded-full px-4 py-2 text-sm font-semibold transition",
              kind === d.key ? "bg-red-600 text-white" : "bg-white text-stone-600 ring-1 ring-stone-200 hover:bg-stone-100"
            )}
          >
            {d.label} <span className="opacity-70">({d.count})</span>
          </button>
        ))}
        {kind === "phrases" && (
          <>
            <select
              value={level}
              onChange={(e) => { setLevel(Number(e.target.value) as number | 0); setLessonId(""); }}
              className="rounded-full border border-stone-200 bg-white px-3 py-2 text-sm"
            >
              <option value={0}>All levels</option>
              <option value={1}>Level 1</option>
              <option value={2}>Level 2</option>
              <option value={3}>Level 3</option>
            </select>
            <select
              value={lessonId}
              onChange={(e) => setLessonId(e.target.value)}
              className="max-w-[220px] rounded-full border border-stone-200 bg-white px-3 py-2 text-sm"
            >
              <option value="">All lessons</option>
              {levelLessons.map((l) => (
                <option key={l.id} value={l.id}>{l.title}</option>
              ))}
            </select>
          </>
        )}
        <span className="ml-auto inline-flex items-center gap-1 text-sm font-medium text-stone-500">
          <Layers className="h-4 w-4" /> {due} due
        </span>
        <button
          onClick={() => { setTyping(!typing); setFlipped(false); setAnswer(""); setTypedOk(null); }}
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold",
            typing ? "bg-stone-900 text-white" : "bg-white text-stone-600 ring-1 ring-stone-200"
          )}
        >
          <Keyboard className="h-3.5 w-3.5" /> Type answers
        </button>
      </div>

      {current ? (
        <div className="mx-auto max-w-xl space-y-6">
          <div className="relative">
            <button
              onClick={() => !typing && setFlipped(!flipped)}
              className="w-full rounded-2xl border border-stone-200 bg-white p-10 text-center shadow-sm transition hover:shadow"
            >
              <div className="text-xs font-semibold uppercase tracking-wide text-stone-400">
                {current.meta} {flipped ? "· answer" : typing ? "· type the answer below" : "· tap to reveal"}
              </div>
              <div className="mt-4 text-3xl font-bold leading-relaxed">{current.front}</div>
              {current.frontSub && <div className="mt-1 text-stone-500">{current.frontSub}</div>}
              {flipped && (
                <div className="mt-6 border-t border-stone-100 pt-4">
                  <div className="text-xl text-red-700">{current.back}</div>
                  {current.backSub && <div className="mt-1 text-sm italic text-stone-500">{current.backSub}</div>}
                </div>
              )}
            </button>
            {current.speak && (
              <button
                onClick={() => speakPt(current.speak!)}
                className="absolute right-3 top-3 rounded-full bg-stone-100 px-3 py-1 text-xs font-semibold text-stone-500 hover:bg-red-600 hover:text-white"
              >
                🔊 hear
              </button>
            )}
          </div>

          {typing && !flipped && (
            <div className="flex gap-2">
              <input
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submitTyped()}
                placeholder={kind === "phrases" ? "Type the English meaning…" : kind === "verbs" ? "Type the meaning…" : "Type what the note says…"}
                className="flex-1 rounded-xl border border-stone-300 bg-white px-4 py-3 text-lg outline-none focus:border-red-400"
                autoFocus
              />
              <button
                onClick={submitTyped}
                disabled={!answer.trim()}
                className="rounded-xl bg-stone-900 px-5 font-semibold text-white disabled:opacity-40"
              >
                Check
              </button>
            </div>
          )}

          {typing && flipped && typedOk !== null && (
            <div className="space-y-3 text-center">
              <div className={cn(
                "rounded-xl px-4 py-3 font-semibold",
                typedOk ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"
              )}>
                {typedOk ? "✓ Correct — scheduled as Good" : "✗ Not quite — scheduled as Again"}
              </div>
              <button
                onClick={() => rate(typedOk ? "good" : "again")}
                className="rounded-full bg-red-600 px-6 py-2.5 font-semibold text-white hover:bg-red-700"
              >
                Next card
              </button>
            </div>
          )}

          {!typing && flipped && (
            <div className="grid grid-cols-4 gap-2">
              {(["again", "hard", "good", "easy"] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => rate(r)}
                  className={cn(
                    "rounded-xl px-2 py-3 text-sm font-semibold capitalize text-white",
                    r === "again" && "bg-red-500 hover:bg-red-600",
                    r === "hard" && "bg-amber-500 hover:bg-amber-600",
                    r === "good" && "bg-green-600 hover:bg-green-700",
                    r === "easy" && "bg-sky-600 hover:bg-sky-700"
                  )}
                >
                  {r}
                  <div className="text-[10px] font-normal opacity-80">
                    {r === "again" ? "<10 min" : r === "hard" ? "12 h" : r === "good" ? "next step" : "skip ahead"}
                  </div>
                </button>
              ))}
            </div>
          )}
          <div className="text-center text-sm text-stone-500">
            {dueCards.length} remaining in this session · {sessionDone} reviewed
          </div>
        </div>
      ) : (
        <div className="mx-auto max-w-md space-y-4 pt-10 text-center">
          <div className="text-5xl">✨</div>
          <h2 className="text-xl font-bold">All caught up!</h2>
          <p className="text-stone-600">
            No cards due in this deck right now. Come back later, learn a new lesson, or switch decks.
          </p>
          <div className="flex justify-center gap-3">
            <button
              onClick={() => setSrs({ ...getSrs() })}
              className="inline-flex items-center gap-2 rounded-full bg-stone-200 px-4 py-2 text-sm font-semibold hover:bg-stone-300"
            >
              <RotateCcw className="h-4 w-4" /> Check again
            </button>
            <Link to="/learn" className="rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700">
              Learn a lesson
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
