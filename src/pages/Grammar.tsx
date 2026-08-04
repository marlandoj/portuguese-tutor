import { useState } from "react";
import { Lightbulb } from "lucide-react";
import { grammar } from "@/lib/grammar-data";
import { levelLabel } from "@/lib/data";
import { cn } from "@/lib/utils";

export default function Grammar() {
  const [level, setLevel] = useState(1);
  const points = grammar.filter((g) => g.level === level);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Grammar guide</h1>
        <p className="text-sm text-stone-500">
          Speaking comes first — but every pattern in your lessons is explained here when you want the "why".
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
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
      </div>

      <div className="space-y-4">
        {points.map((g) => (
          <details key={g.id} className="group rounded-xl border border-stone-200 bg-white shadow-sm" >
            <summary className="flex cursor-pointer items-center justify-between gap-3 px-5 py-4 font-semibold hover:text-red-700">
              <span>{g.title}</span>
              <span className="rounded-full bg-stone-100 px-3 py-1 font-mono text-xs font-normal text-stone-600">
                {g.pattern}
              </span>
            </summary>
            <div className="space-y-4 border-t border-stone-100 px-5 py-4">
              <p className="text-stone-700">{g.explanation}</p>
              <div className="space-y-2">
                {g.examples.map((e, i) => (
                  <div key={i} className="rounded-lg bg-stone-50 px-4 py-3">
                    <div className="text-lg">{e.jp}</div>
                    <div className="text-sm italic text-stone-500">{e.romaji}</div>
                    <div className="text-sm text-stone-700">{e.en}</div>
                  </div>
                ))}
              </div>
              {g.tip && (
                <div className="flex gap-2 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  <Lightbulb className="h-4 w-4 shrink-0" /> {g.tip}
                </div>
              )}
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}
