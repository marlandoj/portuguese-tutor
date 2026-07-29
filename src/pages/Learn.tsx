import { Link, useSearchParams } from "react-router";
import { useState } from "react";
import { CheckCircle2, Circle, Headphones, FileText } from "lucide-react";
import { audioMap, dayLessons, levelLabel, quizByLessonId, scenarioLessons } from "@/lib/data";
import { getProgress } from "@/lib/store";
import { cn } from "@/lib/utils";

export default function Learn() {
  const [params, setParams] = useSearchParams();
  const level = Number(params.get("level") ?? 1);
  const [progress] = useState(getProgress);

  const days = dayLessons(level);
  const scenarios = scenarioLessons(level);

  const lessonRow = (l: (typeof days)[number]) => {
    const done = progress.completedLessons.includes(l.id);
    const score = progress.quizScores[l.id];
    return (
      <Link
        key={l.id}
        to={`/learn/${l.id}`}
        className="flex items-center gap-3 rounded-lg border border-stone-200 bg-white px-4 py-3 transition hover:border-red-300 hover:shadow-sm"
      >
        {done ? (
          <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600" />
        ) : (
          <Circle className="h-5 w-5 shrink-0 text-stone-300" />
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium">{l.title}</div>
          <div className="text-xs text-stone-500">
            {l.entries.length} phrases
            {l.kind === "scenario" && " · scenario"}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2 text-stone-400">
          {audioMap[l.id] && <Headphones className="h-4 w-4" />}
          {quizByLessonId.has(l.id) && <FileText className="h-4 w-4" />}
          {score != null && (
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-xs font-semibold",
                score >= 80 ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
              )}
            >
              {score}%
            </span>
          )}
        </div>
      </Link>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        {[1, 2, 3].map((lv) => (
          <button
            key={lv}
            onClick={() => setParams({ level: String(lv) })}
            className={cn(
              "rounded-full px-4 py-2 text-sm font-semibold transition",
              lv === level
                ? "bg-red-600 text-white"
                : "bg-white text-stone-600 ring-1 ring-stone-200 hover:bg-stone-100"
            )}
          >
            {levelLabel(lv)}
          </button>
        ))}
      </div>

      <section>
        <h2 className="mb-3 text-lg font-bold">Daily lessons</h2>
        {days.length ? (
          <div className="grid gap-2 sm:grid-cols-2">{days.map(lessonRow)}</div>
        ) : (
          <p className="text-stone-500">No day lessons in this level.</p>
        )}
      </section>

      {scenarios.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-bold">Scenario practice</h2>
          <div className="grid gap-2 sm:grid-cols-2">{scenarios.map(lessonRow)}</div>
        </section>
      )}
    </div>
  );
}
