import { useState } from "react";
import { Ear, Loader2, Mic, PartyPopper, Turtle, Volume2 } from "lucide-react";
import { speakPt } from "@/lib/llm";
import { retryPassed, speakSlowly, type PronFeedback } from "@/lib/pronunciation";
import { cn } from "@/lib/utils";

interface Props {
  feedback: PronFeedback;
  /** Mic retry attempt; resolves with a 0-100 score, or null if nothing heard. */
  onRetry: () => Promise<number | null>;
}

const VERDICT_STYLE: Record<string, { chip: string; label: string }> = {
  close: { chip: "bg-amber-100 text-amber-800", label: "Nearly there" },
  off: { chip: "bg-red-100 text-red-700", label: "Let's refine it" },
  unclear: { chip: "bg-stone-200 text-stone-600", label: "I didn't catch that" },
  great: { chip: "bg-emerald-100 text-emerald-700", label: "Great pronunciation!" },
};

export default function PronunciationCard({ feedback, onRetry }: Props) {
  const [retrying, setRetrying] = useState(false);
  const [score, setScore] = useState<number | null>(null);
  const style = VERDICT_STYLE[feedback.verdict] ?? VERDICT_STYLE.unclear;
  const passed = score !== null && retryPassed(score);

  const retry = async () => {
    setRetrying(true);
    try {
      setScore(await onRetry());
    } finally {
      setRetrying(false);
    }
  };

  return (
    <div className="mt-1.5 w-full max-w-[85%] rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-left shadow-sm">
      <div className="flex items-center gap-2">
        <Ear className="h-4 w-4 shrink-0 text-amber-700" />
        <span className={cn("rounded-full px-2 py-0.5 text-xs font-bold", style.chip)}>
          {style.label}
        </span>
        {score !== null && (
          <span
            className={cn(
              "ml-auto rounded-full px-2 py-0.5 text-xs font-bold",
              passed ? "bg-emerald-100 text-emerald-700" : "bg-stone-200 text-stone-600"
            )}
          >
            {score}%
          </span>
        )}
      </div>

      {feedback.focusWord && (
        <div className="mt-2">
          <span className="text-lg font-bold text-stone-900">{feedback.focusWord}</span>
          {feedback.slowForm && (
            <span className="ml-2 font-mono text-sm text-stone-500">{feedback.slowForm}</span>
          )}
          {feedback.heardAs && feedback.heardAs !== feedback.focusWord && (
            <div className="text-xs text-stone-500">
              I heard: <span className="italic">“{feedback.heardAs}”</span>
            </div>
          )}
        </div>
      )}

      {feedback.tip && <p className="mt-1.5 text-sm text-stone-700">{feedback.tip}</p>}

      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        {feedback.focusWord && (
          <>
            <button
              onClick={() => speakPt(feedback.focusWord)}
              className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-stone-700 ring-1 ring-stone-300 hover:bg-stone-100"
            >
              <Volume2 className="h-3.5 w-3.5" /> Listen
            </button>
            <button
              onClick={() => speakSlowly(feedback.focusWord)}
              className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-stone-700 ring-1 ring-stone-300 hover:bg-stone-100"
            >
              <Turtle className="h-3.5 w-3.5" /> Slowly
            </button>
          </>
        )}
        <button
          onClick={retry}
          disabled={retrying}
          className="inline-flex items-center gap-1 rounded-full bg-red-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
        >
          {retrying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mic className="h-3.5 w-3.5" />}
          {retrying ? "Listening..." : "Try again"}
        </button>
        {passed && (
          <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700">
            <PartyPopper className="h-3.5 w-3.5" /> Good!
          </span>
        )}
      </div>
    </div>
  );
}
