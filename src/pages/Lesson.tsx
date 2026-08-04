import { Link, Navigate, useParams } from "react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, CheckCircle2, FileText, MessagesSquare, Mic, Play } from "lucide-react";
import { lessonById, levelLabel, speakerName } from "@/lib/data";
import { quizByLessonId } from "@/lib/quizzes";
import { speakPt } from "@/lib/llm";
import { markLessonComplete, recordLessonVisit } from "@/lib/store";
import { logActivity } from "@/lib/gamify";
import { cn } from "@/lib/utils";

export default function Lesson() {
  const { lessonId } = useParams();
  const lesson = lessonId ? lessonById.get(lessonId) : undefined;
  const [showEnglish, setShowEnglish] = useState(true);
  const [completed, setCompleted] = useState(false);

  useEffect(() => {
    if (lesson) recordLessonVisit(lesson.id);
  }, [lesson]);

  const hasQuiz = lesson ? quizByLessonId.has(lesson.id) : false;

  const entries = useMemo(
    () => (lesson ? lesson.entries.map((e, i) => ({ e, i })).filter((x) => x.e.jp) : []),
    [lesson]
  );

  if (!lesson) return <Navigate to="/learn" replace />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link to={`/learn?level=${lesson.level}`} className="inline-flex items-center gap-1 text-sm text-stone-500 hover:text-stone-900">
          <ArrowLeft className="h-4 w-4" /> {levelLabel(lesson.level).split(" — ")[0]}
        </Link>
        <span className="text-stone-300">/</span>
        <h1 className="text-2xl font-bold">{lesson.title}</h1>
        {completed && <CheckCircle2 className="h-6 w-6 text-green-600" />}
      </div>

      <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm text-sm text-stone-600">
        🎧 Every line has a play button — listen, then imitate out loud (shadowing). Copy the rhythm and the nasal sounds, not just the words.
      </div>

      <div className="flex flex-wrap gap-2">
        <Link
          to={`/learn/${lesson.id}/roleplay`}
          className="inline-flex items-center gap-2 rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
        >
          <MessagesSquare className="h-4 w-4" /> Start role-play
        </Link>
        {hasQuiz && (
          <Link
            to={`/learn/${lesson.id}/quiz`}
            className="inline-flex items-center gap-2 rounded-full bg-stone-900 px-4 py-2 text-sm font-semibold text-white hover:bg-stone-700"
          >
            <FileText className="h-4 w-4" /> Take quiz
          </Link>
        )}
        <Link
          to={`/speak/${lesson.id}`}
          className="inline-flex items-center gap-2 rounded-full bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700"
        >
          <Mic className="h-4 w-4" /> Speaking practice
        </Link>
        <button
          onClick={() => {
            markLessonComplete(lesson.id);
            logActivity("lesson", 15);
            setCompleted(true);
          }}
          className="inline-flex items-center gap-2 rounded-full bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700"
        >
          <CheckCircle2 className="h-4 w-4" /> Mark complete
        </button>
      </div>

      <div className="flex gap-4 text-sm">
        <label className="flex cursor-pointer items-center gap-2">
          <input type="checkbox" checked={showEnglish} onChange={(e) => setShowEnglish(e.target.checked)} className="accent-red-600" />
          English
        </label>
      </div>

      <div className="space-y-3">
        {entries.map(({ e, i }) => {
          const role = speakerName(e.speaker);
          return (
            <div key={i} className={cn("flex items-start gap-2", role === "you" ? "flex-row-reverse" : "flex-row")}>
              <button
                onClick={() => speakPt(e.jp)}
                className="mt-3 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-stone-200 text-stone-600 transition hover:bg-red-600 hover:text-white"
                aria-label="Play this line"
              >
                <Play className="h-4 w-4" />
              </button>
              <div
                className={cn(
                  "max-w-[85%] rounded-2xl px-4 py-3 shadow-sm",
                  role === "you"
                    ? "rounded-br-sm bg-red-600 text-white"
                    : "rounded-bl-sm border border-stone-200 bg-white"
                )}
              >
                <div className={cn("mb-1 text-xs font-semibold uppercase tracking-wide", role === "you" ? "text-red-100" : "text-stone-400")}>
                  {role === "you" ? "You" : role === "partner" ? "Partner" : "Phrase"}
                  {e.flags.includes("mastered") && " · ✅ key phrase"}
                  {e.flags.includes("practice") && " · 🔴 practice"}
                </div>
                <div className="text-lg leading-relaxed">{e.jp}</div>
                {showEnglish && e.en && (
                  <div className={cn("mt-1 text-sm", role === "you" ? "text-red-50" : "text-stone-600")}>
                    {e.en}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {lesson.notes.length > 0 && (
        <div className="rounded-xl border border-stone-200 bg-white p-4 text-sm text-stone-600">
          <div className="mb-1 font-semibold text-stone-800">Session notes</div>
          {lesson.notes.slice(0, 8).map((n, i) => (
            <div key={i}>· {n}</div>
          ))}
        </div>
      )}
    </div>
  );
}
