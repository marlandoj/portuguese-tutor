import { useState } from "react";
import { BookOpenCheck, Check, Ear, Lightbulb, Sparkles, X } from "lucide-react";
import { addCustomCards } from "@/lib/customCards";
import type { SessionReport } from "@/lib/report";
import { speakPt } from "@/lib/llm";
import { cn } from "@/lib/utils";

interface Props {
  report: SessionReport;
  /** Trouble words flagged during this session, for the pronunciation recap. */
  pronWords?: { word: string; slowForm: string; tip: string }[];
  onClose?: () => void;
}

export default function SessionReportPanel({ report, pronWords, onClose }: Props) {
  const [addedVocab, setAddedVocab] = useState<number | null>(null);
  const date = new Date(report.createdAt).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="space-y-4 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <BookOpenCheck className="h-5 w-5 text-red-600" />
        <div className="min-w-0">
          <div className="font-bold">Session summary</div>
          <div className="text-xs text-stone-500">
            {date} · {report.scenario} · {report.messageCount} messages
          </div>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="ml-auto rounded-full p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-700"
            aria-label="Close report"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {report.highlights.length > 0 && (
        <section>
          <h3 className="mb-1.5 flex items-center gap-1.5 text-sm font-bold text-emerald-700">
            <Sparkles className="h-4 w-4" /> What went well
          </h3>
          <ul className="space-y-1">
            {report.highlights.map((h, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-stone-700">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> {h}
              </li>
            ))}
          </ul>
        </section>
      )}

      {report.corrections.length > 0 && (
        <section>
          <h3 className="mb-1.5 text-sm font-bold text-red-700">Corrections</h3>
          <div className="space-y-2">
            {report.corrections.map((c, i) => (
              <div key={i} className="rounded-xl bg-stone-50 px-3 py-2 text-sm">
                <div className="flex flex-wrap items-center gap-x-2">
                  <span className="text-stone-500 line-through">{c.said}</span>
                  <span className="text-stone-400">→</span>
                  <button
                    onClick={() => speakPt(c.better)}
                    className="font-semibold text-red-700 hover:underline"
                    title="Hear it"
                  >
                    {c.better}
                  </button>
                </div>
                {c.why && <div className="mt-0.5 text-xs text-stone-500">{c.why}</div>}
              </div>
            ))}
          </div>
        </section>
      )}

      {report.vocab.length > 0 && (
        <section>
          <h3 className="mb-1.5 text-sm font-bold text-stone-800">Vocabulary to keep</h3>
          <div className="flex flex-wrap gap-1.5">
            {report.vocab.map((v, i) => (
              <button
                key={i}
                onClick={() => speakPt(v.pt)}
                className="rounded-full bg-stone-100 px-2.5 py-1 text-xs text-stone-700 hover:bg-red-100 hover:text-red-700"
                title={v.en}
              >
                {v.pt} <span className="opacity-60">· {v.en}</span>
              </button>
            ))}
          </div>
          <button
            onClick={() => setAddedVocab(addCustomCards(report.vocab, report.id))}
            disabled={addedVocab !== null}
            className={cn(
              "mt-2 rounded-full px-3 py-1.5 text-xs font-semibold",
              addedVocab !== null
                ? "bg-emerald-100 text-emerald-700"
                : "bg-stone-900 text-white hover:bg-stone-700"
            )}
          >
            {addedVocab === null
              ? "Add all to Review deck"
              : addedVocab > 0
                ? `✓ ${addedVocab} added to your Phrases deck`
                : "Already in your deck"}
          </button>
        </section>
      )}

      {pronWords && pronWords.length > 0 && (
        <section>
          <h3 className="mb-1.5 flex items-center gap-1.5 text-sm font-bold text-amber-700">
            <Ear className="h-4 w-4" /> Pronunciation flagged this session
          </h3>
          <ul className="space-y-1 text-sm text-stone-700">
            {pronWords.map((w, i) => (
              <li key={i}>
                <button onClick={() => speakPt(w.word)} className="font-semibold text-red-700 hover:underline">
                  {w.word}
                </button>{" "}
                <span className="font-mono text-xs text-stone-500">{w.slowForm}</span>
                {w.tip && <span className="text-stone-500"> — {w.tip}</span>}
              </li>
            ))}
          </ul>
          <div className="mt-1 text-xs text-stone-400">Practice these in Review &gt; Pronunciation.</div>
        </section>
      )}

      {report.focus && (
        <section className="rounded-xl bg-amber-50 px-3.5 py-3">
          <h3 className="mb-1 flex items-center gap-1.5 text-sm font-bold text-amber-800">
            <Lightbulb className="h-4 w-4" /> Next session
          </h3>
          <p className="text-sm text-stone-700">{report.focus}</p>
        </section>
      )}
    </div>
  );
}
