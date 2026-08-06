import { Link, useSearchParams } from "react-router";
import { useState } from "react";
import { Check, FileText, Lock, MapPin, Trash2, UtensilsCrossed, BedDouble, Car, TrainFront, ShoppingBag, Mountain, Hospital, Sparkles, Heart, MessageCircle } from "lucide-react";
import { dayLessons, levelLabel } from "@/lib/data";
import { getProgress } from "@/lib/store";
import { deleteReport, getReports } from "@/lib/report";
import SessionReportPanel from "@/components/SessionReportPanel";
import { cn } from "@/lib/utils";

const LANDMARKS: Record<number, { icon: typeof MapPin; name: string }> = {
  3: { icon: UtensilsCrossed, name: "Restaurant" },
  6: { icon: BedDouble, name: "Hotel" },
  7: { icon: Car, name: "Taxi" },
  10: { icon: ShoppingBag, name: "Market" },
  11: { icon: Sparkles, name: "Beach" },
  15: { icon: Mountain, name: "Lisbon" },
};

const LEVEL_THEME: Record<number, { icon: typeof MapPin; label: string }> = {
  1: { icon: TrainFront, label: "Journey through Portugal" },
  2: { icon: Hospital, label: "Life in Portugal" },
  3: { icon: Heart, label: "Friendships & Connections" },
};

export default function Journey() {
  const [params, setParams] = useSearchParams();
  const level = Number(params.get("level") ?? 1);
  const [progress] = useState(getProgress);
  const [reports, setReports] = useState(getReports);
  const [openReportId, setOpenReportId] = useState<string | null>(null);
  const days = dayLessons(level);

  const firstIncomplete = days.findIndex((l) => !progress.completedLessons.includes(l.id));
  const currentIdx = firstIncomplete === -1 ? days.length : firstIncomplete;
  const doneCount = days.filter((l) => progress.completedLessons.includes(l.id)).length;
  const Theme = LEVEL_THEME[level]?.icon ?? MapPin;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Theme className="h-6 w-6 text-red-600" /> {LEVEL_THEME[level]?.label ?? "Journey"}
          </h1>
          <p className="text-sm text-stone-500">
            {doneCount} of {days.length} stops complete. Every lesson moves you down the line.
          </p>
        </div>
        <div className="flex gap-2">
          {[1, 2, 3].map((lv) => (
            <button
              key={lv}
              onClick={() => setParams({ level: String(lv) })}
              className={cn(
                "rounded-full px-3 py-1.5 text-sm font-semibold",
                lv === level ? "bg-red-600 text-white" : "bg-white text-stone-600 ring-1 ring-stone-200"
              )}
            >
              L{lv}
            </button>
          ))}
        </div>
      </div>

      <div className="relative mx-auto max-w-xl">
        <div className="absolute left-6 top-0 h-full w-1 rounded bg-stone-200" />
        <div
          className="absolute left-6 top-0 w-1 rounded bg-red-500 transition-all"
          style={{ height: `${days.length > 1 ? (doneCount / days.length) * 100 : 0}%` }}
        />
        <div className="space-y-4">
          {days.map((l, i) => {
            const done = progress.completedLessons.includes(l.id);
            const current = i === currentIdx;
            const landmark = LANDMARKS[l.day ?? -1];
            const NodeIcon = landmark?.icon ?? (done ? Check : current ? MapPin : Lock);
            return (
              <div key={l.id} className="relative flex items-center gap-4 pl-0">
                <div
                  className={cn(
                    "z-10 flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-4 border-stone-50 shadow",
                    done ? "bg-green-500 text-white" : current ? "bg-red-600 text-white" : "bg-stone-300 text-stone-500"
                  )}
                >
                  <NodeIcon className="h-5 w-5" />
                </div>
                <Link
                  to={`/learn/${l.id}`}
                  className={cn(
                    "flex-1 rounded-xl border px-4 py-3 transition",
                    done
                      ? "border-green-200 bg-green-50 hover:border-green-400"
                      : current
                        ? "border-red-300 bg-white shadow hover:border-red-500"
                        : "border-stone-200 bg-white opacity-70 hover:opacity-100"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{l.title}</span>
                    {landmark && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                        {landmark.name}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-stone-500">
                    {done ? "✓ complete" : current ? "← your next stop" : `${l.entries.length} phrases`}
                  </div>
                </Link>
              </div>
            );
          })}
        </div>
      </div>

      {doneCount === days.length && days.length > 0 && (
        <div className="mx-auto max-w-xl rounded-2xl bg-gradient-to-r from-amber-400 to-red-500 p-6 text-center text-white shadow-lg">
          <div className="text-4xl">🏁</div>
          <div className="mt-1 text-xl font-bold">{levelLabel(level)} complete!</div>
          <Link to={`/certificate/${level}`} className="mt-3 inline-block rounded-full bg-white px-5 py-2 font-semibold text-red-700 hover:bg-red-50">
            View your certificate
          </Link>
        </div>
      )}
      {level === 3 && (
        <div className="mx-auto max-w-xl text-center text-sm text-stone-500">
          <MessageCircle className="mx-auto mb-1 h-4 w-4" /> Level 3's destination: confident casual conversation with friends, partners, and family.
        </div>
      )}

      {reports.length > 0 && (
        <div className="mx-auto max-w-xl space-y-3">
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <FileText className="h-5 w-5 text-red-600" /> Session summaries
          </h2>
          {reports.map((r) => (
            <div key={r.id} className="rounded-xl border border-stone-200 bg-white shadow-sm">
              <div className="flex w-full items-center gap-3 px-4 py-3">
                <button
                  onClick={() => setOpenReportId(openReportId === r.id ? null : r.id)}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">{r.scenario}</div>
                    <div className="text-xs text-stone-500">
                      {new Date(r.createdAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
                      {" · "}{r.corrections.length} corrections · {r.vocab.length} vocab
                    </div>
                  </div>
                  <span className="text-xs font-semibold text-stone-400">
                    {openReportId === r.id ? "Hide" : "View"}
                  </span>
                </button>
                <button
                  onClick={() => setReports(deleteReport(r.id))}
                  className="rounded-full p-1.5 text-stone-300 hover:bg-red-50 hover:text-red-600"
                  aria-label="Delete report"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              {openReportId === r.id && (
                <div className="border-t border-stone-100 p-3">
                  <SessionReportPanel report={r} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
