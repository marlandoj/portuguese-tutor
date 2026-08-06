import { Link, useParams } from "react-router";
import { Printer } from "lucide-react";
import { dayLessons, levelLabel } from "@/lib/data";
import { getProgress } from "@/lib/store";
import { getBelt } from "@/lib/gamify";

export default function Certificate() {
  const { level: levelParam } = useParams();
  const level = Number(levelParam ?? 1);
  const days = dayLessons(level);
  const progress = getProgress();
  const done = days.filter((l) => progress.completedLessons.includes(l.id)).length;
  const complete = days.length > 0 && done === days.length;
  const { belt } = getBelt();
  const today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  if (!complete) {
    return (
      <div className="mx-auto max-w-lg space-y-4 pt-8 text-center">
        <div className="text-4xl">📜</div>
        <p className="text-stone-600">
          Finish all {days.length} day lessons in {levelLabel(level)} to earn this certificate
          ({done}/{days.length} done).
        </p>
        <Link to={`/journey?level=${level}`} className="text-red-700 underline">Back to the journey</Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-center print:hidden">
        <button
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 rounded-full bg-red-600 px-5 py-2.5 font-semibold text-white hover:bg-red-700"
        >
          <Printer className="h-4 w-4" /> Print / save as PDF
        </button>
      </div>

      <div className="mx-auto max-w-3xl rounded-lg border-8 border-double border-amber-600 bg-[#fdfbf5] p-12 text-center shadow-xl print:shadow-none">
        <div className="text-sm font-semibold uppercase tracking-[0.3em] text-amber-700">
          Português Tutor · European Portuguese
        </div>
        <div className="mt-6 text-4xl font-bold text-stone-900">Certificate of Completion</div>

        <div className="mt-8 text-lg text-stone-600">This certifies that</div>
        <div className="mt-2 text-3xl font-bold text-stone-900">Kevin Jackson</div>

        <div className="mt-6 text-lg text-stone-600">has completed all {days.length} speaking lessons of</div>
        <div className="mt-2 text-2xl font-bold text-red-700">{levelLabel(level)}</div>

        <div className="mx-auto mt-8 flex max-w-md items-end justify-between text-sm text-stone-500">
          <div className="text-left">
            <div className="border-t border-stone-400 pt-1">{today}</div>
            <div>Date</div>
          </div>
          <div className="text-5xl text-red-700" style={{ fontFamily: "serif" }}>★</div>
          <div className="text-right">
            <div className="border-t border-stone-400 pt-1">{belt.jp} {belt.name}</div>
            <div>Rank at completion</div>
          </div>
        </div>

        <div className="mt-8 text-xs italic text-stone-400">
          "Fluency is speaking confidently in front of people." — Português Tutor
        </div>
      </div>
    </div>
  );
}
