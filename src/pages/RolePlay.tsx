import { Link, Navigate, useParams } from "react-router";
import { useMemo, useState } from "react";
import { ArrowLeft, Eye, RotateCcw, SkipForward } from "lucide-react";
import { lessonById, speakerName } from "@/lib/data";
import { logActivity } from "@/lib/gamify";
import { cn } from "@/lib/utils";

type Role = "you" | "partner";

export default function RolePlay() {
  const { lessonId } = useParams();
  const lesson = lessonId ? lessonById.get(lessonId) : undefined;
  const entries = useMemo(
    () =>
      lesson
        ? lesson.entries.filter((e) => e.jp && speakerName(e.speaker) !== "none")
        : [],
    [lesson]
  );
  const [role, setRole] = useState<Role | null>(null);
  const [idx, setIdx] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [recalled, setRecalled] = useState(0);
  const [finished, setFinished] = useState(false);

  if (!lesson) return <Navigate to="/learn" replace />;

  if (entries.length < 2) {
    return (
      <div className="space-y-4">
        <p>This lesson doesn't have a two-person dialogue. Try the quiz or flashcards instead.</p>
        <Link to={`/learn/${lesson.id}`} className="text-red-700 underline">Back to lesson</Link>
      </div>
    );
  }

  if (role === null) {
    const youCount = entries.filter((e) => speakerName(e.speaker) === "you").length;
    return (
      <div className="mx-auto max-w-lg space-y-6 pt-8 text-center">
        <h1 className="text-2xl font-bold">{lesson.title} — Role-play</h1>
        <p className="text-stone-600">
          Choose your part. The tutor plays the other side. When it's your turn, say the
          line out loud <em>before</em> revealing it. That's the rep that builds fluency.
        </p>
        <div className="flex justify-center gap-4">
          <button
            onClick={() => setRole("you")}
            className="rounded-xl bg-red-600 px-6 py-4 font-semibold text-white hover:bg-red-700"
          >
            Play Yourself
            <div className="text-xs font-normal text-red-100">{youCount} lines</div>
          </button>
          <button
            onClick={() => setRole("partner")}
            className="rounded-xl bg-stone-900 px-6 py-4 font-semibold text-white hover:bg-stone-700"
          >
            Play the Partner
            <div className="text-xs font-normal text-stone-300">{entries.length - youCount} lines</div>
          </button>
        </div>
      </div>
    );
  }

  if (finished) {
    const total = entries.filter((e) => speakerName(e.speaker) === role).length;
    return (
      <div className="mx-auto max-w-lg space-y-6 pt-8 text-center">
        <div className="text-5xl">🎉</div>
        <h1 className="text-2xl font-bold">Role-play complete!</h1>
        <p className="text-stone-600">
          You recalled {recalled} of {total} lines on the first try.
          {recalled / Math.max(1, total) >= 0.8
            ? " Excellent — you're ready to test this in the real world."
            : " Run it once more, then drill the flashcards for the lines you missed."}
        </p>
        <div className="flex justify-center gap-3">
          <button
            onClick={() => { setIdx(0); setRevealed(false); setRecalled(0); setFinished(false); setRole(null); }}
            className="inline-flex items-center gap-2 rounded-full bg-red-600 px-4 py-2 font-semibold text-white hover:bg-red-700"
          >
            <RotateCcw className="h-4 w-4" /> Run it again
          </button>
          <Link to={`/learn/${lesson.id}`} className="rounded-full bg-stone-200 px-4 py-2 font-semibold text-stone-800 hover:bg-stone-300">
            Back to lesson
          </Link>
        </div>
      </div>
    );
  }

  const e = entries[idx];
  const eRole = speakerName(e.speaker);
  const isMine = eRole === role;

  const next = (wasRecalled?: boolean) => {
    if (wasRecalled) setRecalled((r) => r + 1);
    if (idx + 1 >= entries.length) {
      logActivity("roleplay", 10);
      setFinished(true);
    } else {
      setIdx(idx + 1);
      setRevealed(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <Link to={`/learn/${lesson.id}`} className="inline-flex items-center gap-1 text-sm text-stone-500 hover:text-stone-900">
          <ArrowLeft className="h-4 w-4" /> Exit
        </Link>
        <div className="ml-auto text-sm font-medium text-stone-500">
          Line {idx + 1} / {entries.length}
        </div>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-stone-200">
        <div className="h-full rounded-full bg-red-600 transition-all" style={{ width: `${((idx + 1) / entries.length) * 100}%` }} />
      </div>

      {/* conversation history */}
      <div className="space-y-2 opacity-60">
        {entries.slice(Math.max(0, idx - 2), idx).map((p, i) => (
          <div key={i} className={cn("text-sm", speakerName(p.speaker) === role ? "text-right" : "text-left")}>
            <span className="inline-block rounded-xl bg-stone-100 px-3 py-1.5">{p.jp}</span>
          </div>
        ))}
      </div>

      {isMine && !revealed ? (
        <div className="rounded-2xl border-2 border-dashed border-red-300 bg-red-50 p-8 text-center">
          <div className="text-sm font-semibold uppercase tracking-wide text-red-600">Your turn — say it out loud</div>
          {e.en && <p className="mt-3 text-stone-600">Hint (English): {e.en}</p>}
          <button
            onClick={() => setRevealed(true)}
            className="mt-5 inline-flex items-center gap-2 rounded-full bg-red-600 px-5 py-2.5 font-semibold text-white hover:bg-red-700"
          >
            <Eye className="h-4 w-4" /> Reveal line
          </button>
        </div>
      ) : (
        <div className={cn("flex", isMine ? "justify-end" : "justify-start")}>
          <div className={cn(
            "max-w-[85%] rounded-2xl px-5 py-4 shadow",
            isMine ? "rounded-br-sm bg-red-600 text-white" : "rounded-bl-sm border border-stone-200 bg-white"
          )}>
            <div className={cn("mb-1 text-xs font-semibold uppercase", isMine ? "text-red-100" : "text-stone-400")}>
              {isMine ? "You" : "Partner"}
            </div>
            <div className="text-xl leading-relaxed">{e.jp}</div>
            {e.romaji && <div className={cn("mt-1 text-sm italic", isMine ? "text-red-100" : "text-stone-500")}>{e.romaji}</div>}
            {e.en && <div className={cn("mt-1 text-sm", isMine ? "text-red-50" : "text-stone-600")}>{e.en}</div>}
          </div>
        </div>
      )}

      {revealed || !isMine ? (
        <div className="flex justify-center gap-3">
          {isMine && (
            <button
              onClick={() => next(true)}
              className="rounded-full bg-green-600 px-5 py-2.5 font-semibold text-white hover:bg-green-700"
            >
              I recalled it ✓
            </button>
          )}
          <button
            onClick={() => next(false)}
            className={cn(
              "inline-flex items-center gap-2 rounded-full px-5 py-2.5 font-semibold",
              isMine ? "bg-stone-200 text-stone-700 hover:bg-stone-300" : "bg-red-600 text-white hover:bg-red-700"
            )}
          >
            <SkipForward className="h-4 w-4" /> {isMine ? "Needed the reveal" : "Next line"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
