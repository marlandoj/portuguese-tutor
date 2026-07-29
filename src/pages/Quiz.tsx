import { Link, Navigate, useParams } from "react-router";
import { useState } from "react";
import { ArrowLeft, Check, RotateCcw, X } from "lucide-react";
import { lessonById, quizByLessonId } from "@/lib/data";
import { recordQuizScore } from "@/lib/store";
import { logActivity } from "@/lib/gamify";
import { cn } from "@/lib/utils";

const TYPE_LABEL: Record<string, string> = {
  jp2en: "What does this mean?",
  en2jp: "How do you say this in Portuguese?",
  roma2jp: "Which Portuguese matches this?",
};

export default function QuizPage() {
  const { lessonId } = useParams();
  const quiz = lessonId ? quizByLessonId.get(lessonId) : undefined;
  const lesson = lessonId ? lessonById.get(lessonId) : undefined;
  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [correct, setCorrect] = useState(0);
  const [finished, setFinished] = useState(false);

  if (!quiz || !lesson) return <Navigate to="/learn" replace />;

  const q = quiz.questions[idx];

  const pick = (i: number) => {
    if (picked !== null) return;
    setPicked(i);
    if (i === q.answer) setCorrect((c) => c + 1);
  };

  const next = () => {
    if (idx + 1 >= quiz.questions.length) {
      const pct = Math.round((correct / quiz.questions.length) * 100);
      recordQuizScore(quiz.lessonId, pct);
      logActivity("quiz", Math.max(5, Math.round(pct / 10)) + (pct >= 80 ? 10 : 0));
      setFinished(true);
    } else {
      setIdx(idx + 1);
      setPicked(null);
    }
  };

  if (finished) {
    const pct = Math.round((correct / quiz.questions.length) * 100);
    return (
      <div className="mx-auto max-w-lg space-y-6 pt-8 text-center">
        <div className="text-5xl">{pct >= 80 ? "🏆" : pct >= 60 ? "💪" : "📚"}</div>
        <h1 className="text-3xl font-bold">{pct}%</h1>
        <p className="text-stone-600">
          {correct} of {quiz.questions.length} correct.
          {pct >= 80
            ? " Muito bem! Mark the lesson complete and move on."
            : " Review the flashcards for this lesson and retake the quiz."}
        </p>
        <div className="flex justify-center gap-3">
          <button
            onClick={() => { setIdx(0); setPicked(null); setCorrect(0); setFinished(false); }}
            className="inline-flex items-center gap-2 rounded-full bg-red-600 px-4 py-2 font-semibold text-white hover:bg-red-700"
          >
            <RotateCcw className="h-4 w-4" /> Retake
          </button>
          <Link to={`/learn/${lesson.id}`} className="rounded-full bg-stone-200 px-4 py-2 font-semibold text-stone-800 hover:bg-stone-300">
            Back to lesson
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <Link to={`/learn/${lesson.id}`} className="inline-flex items-center gap-1 text-sm text-stone-500 hover:text-stone-900">
          <ArrowLeft className="h-4 w-4" /> Exit quiz
        </Link>
        <div className="ml-auto text-sm font-medium text-stone-500">
          {lesson.title} · {idx + 1} / {quiz.questions.length}
        </div>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-stone-200">
        <div className="h-full rounded-full bg-red-600 transition-all" style={{ width: `${((idx + 1) / quiz.questions.length) * 100}%` }} />
      </div>

      <div className="rounded-2xl border border-stone-200 bg-white p-8 text-center shadow-sm">
        <div className="text-sm font-semibold uppercase tracking-wide text-stone-400">{TYPE_LABEL[q.type]}</div>
        <div className="mt-4 text-2xl font-bold leading-relaxed">{q.prompt}</div>
        {q.promptSub && <div className="mt-2 text-stone-500 italic">{q.promptSub}</div>}
      </div>

      <div className="grid gap-2">
        {q.options.map((opt, i) => {
          const state =
            picked === null ? "idle" : i === q.answer ? "correct" : i === picked ? "wrong" : "dim";
          return (
            <button
              key={i}
              onClick={() => pick(i)}
              disabled={picked !== null}
              className={cn(
                "flex items-center justify-between rounded-xl border px-4 py-3 text-left text-lg transition",
                state === "idle" && "border-stone-200 bg-white hover:border-red-400 hover:bg-red-50",
                state === "correct" && "border-green-500 bg-green-50 text-green-900",
                state === "wrong" && "border-red-500 bg-red-50 text-red-900",
                state === "dim" && "border-stone-200 bg-white opacity-50"
              )}
            >
              <span>{opt}</span>
              {state === "correct" && <Check className="h-5 w-5 text-green-600" />}
              {state === "wrong" && <X className="h-5 w-5 text-red-600" />}
            </button>
          );
        })}
      </div>

      {picked !== null && (
        <div className="flex justify-center">
          <button
            onClick={next}
            className="rounded-full bg-stone-900 px-6 py-2.5 font-semibold text-white hover:bg-stone-700"
          >
            {idx + 1 >= quiz.questions.length ? "See results" : "Next question"}
          </button>
        </div>
      )}
    </div>
  );
}
