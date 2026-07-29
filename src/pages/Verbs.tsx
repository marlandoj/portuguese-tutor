import { useMemo, useState } from "react";
import { Link } from "react-router";
import { Volume2 } from "lucide-react";
import { verbs } from "@/lib/data";
import { speakPt } from "@/lib/llm";

export default function Verbs() {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return verbs;
    return verbs.filter(
      (v) =>
        v.infinitive.toLowerCase().includes(q) ||
        v.meaning.toLowerCase().includes(q)
    );
  }, [query]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Essential verbs</h1>
          <p className="text-sm text-stone-500">
            {verbs.length} verbs from your course — present and past tenses in the eu / você / nós forms.
            Drill them in <Link to="/review" className="text-red-700 underline">Review</Link>.
          </p>
        </div>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search verb or meaning…"
          className="w-64 rounded-full border border-stone-200 bg-white px-4 py-2 text-sm outline-none focus:border-red-400"
        />
      </div>

      <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white shadow-sm">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead>
            <tr className="border-b border-stone-200 bg-stone-50 text-xs font-semibold uppercase tracking-wide text-stone-500">
              <th className="px-4 py-3">Verb</th>
              <th className="px-4 py-3">Meaning</th>
              <th className="px-4 py-3">Present (eu/você/nós)</th>
              <th className="px-4 py-3">Past (eu/você/nós)</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((v) => (
              <tr key={v.infinitive} className="border-b border-stone-100 last:border-0 hover:bg-stone-50">
                <td className="px-4 py-2.5 font-bold text-red-700">{v.infinitive}</td>
                <td className="px-4 py-2.5">{v.meaning}</td>
                <td className="px-4 py-2.5 text-stone-600">{v.present}</td>
                <td className="px-4 py-2.5 text-stone-600">{v.preterite}</td>
                <td className="px-4 py-2.5">
                  <button
                    onClick={() => speakPt(v.infinitive)}
                    className="flex h-7 w-7 items-center justify-center rounded-full bg-stone-100 text-stone-500 transition hover:bg-red-600 hover:text-white"
                    aria-label={`Hear ${v.infinitive}`}
                  >
                    <Volume2 className="h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {filtered.length === 0 && <p className="text-stone-500">No matches for “{query}”.</p>}
    </div>
  );
}
