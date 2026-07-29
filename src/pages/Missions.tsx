import { useState } from "react";
import { Globe, CheckCircle2, Circle } from "lucide-react";
import { missions, levelLabel } from "@/lib/data";
import { getMissionsDone, toggleMission } from "@/lib/store";
import { logActivity } from "@/lib/gamify";
import { cn } from "@/lib/utils";

export default function Missions() {
  const [done, setDone] = useState<string[]>(getMissionsDone);
  const [level, setLevel] = useState(1);
  const list = missions.filter((m) => m.level === level);
  const doneInLevel = list.filter((m) => done.includes(m.id)).length;

  const toggle = (id: string, xp: number) => {
    const was = done.includes(id);
    const next = toggleMission(id);
    if (!was && next.includes(id)) logActivity("mission", xp);
    setDone(next);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Globe className="h-6 w-6 text-red-600" /> Real-world missions
        </h1>
        <p className="text-sm text-stone-500">
          Test your skills in real situations. App reps build the phrase — missions make it yours.
          Check them off honestly.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {[1, 2, 3].map((lv) => (
          <button
            key={lv}
            onClick={() => setLevel(lv)}
            className={cn(
              "rounded-full px-4 py-2 text-sm font-semibold",
              level === lv ? "bg-red-600 text-white" : "bg-white text-stone-600 ring-1 ring-stone-200 hover:bg-stone-100"
            )}
          >
            {levelLabel(lv)}
          </button>
        ))}
        <span className="ml-auto text-sm font-medium text-stone-500">
          {doneInLevel} / {list.length} done
        </span>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {list.map((m) => {
          const checked = done.includes(m.id);
          return (
            <button
              key={m.id}
              onClick={() => toggle(m.id, m.xp)}
              className={cn(
                "flex items-start gap-3 rounded-xl border p-4 text-left transition",
                checked
                  ? "border-green-300 bg-green-50"
                  : "border-stone-200 bg-white hover:border-red-300 hover:shadow-sm"
              )}
            >
              {checked ? (
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-600" />
              ) : (
                <Circle className="mt-0.5 h-5 w-5 shrink-0 text-stone-300" />
              )}
              <div className="min-w-0 flex-1">
                <div className={cn("font-semibold", checked && "text-green-800 line-through opacity-70")}>{m.title}</div>
                <div className="mt-1 text-sm text-stone-600">{m.detail}</div>
              </div>
              <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">
                +{m.xp} XP
              </span>
            </button>
          );
        })}
      </div>

      {doneInLevel === list.length && (
        <div className="rounded-2xl bg-gradient-to-r from-green-500 to-emerald-600 p-6 text-center text-white shadow-lg">
          <div className="text-3xl">🌏</div>
          <div className="mt-1 text-lg font-bold">All {levelLabel(level)} missions complete — you used Portuguese in the real world.</div>
        </div>
      )}
    </div>
  );
}
