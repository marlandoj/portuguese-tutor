import { useState } from "react";
import { Clapperboard, Trash2 } from "lucide-react";
import { addAnimeEntry, deleteAnimeEntry, getAnimeLog } from "@/lib/store";
import { logActivity } from "@/lib/gamify";
import { cn } from "@/lib/utils";

export default function Anime() {
  const [log, setLog] = useState(getAnimeLog);
  const [title, setTitle] = useState("");
  const [episode, setEpisode] = useState("");
  const [comprehension, setComprehension] = useState(50);
  const [phrases, setPhrases] = useState("");

  const avg = log.length ? Math.round(log.reduce((s, e) => s + e.comprehension, 0) / log.length) : 0;

  const submit = () => {
    if (!title.trim()) return;
    const entry = {
      id: `a-${Date.now()}`,
      title: title.trim(),
      episode: episode.trim(),
      date: new Date().toISOString().slice(0, 10),
      comprehension,
      phrases: phrases.trim(),
    };
    setLog(addAnimeEntry(entry));
    logActivity("anime", 20);
    setTitle(""); setEpisode(""); setPhrases(""); setComprehension(50);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Clapperboard className="h-6 w-6 text-red-600" /> Music & Series without subtitles
        </h1>
        <p className="text-sm text-stone-500">
          Your side-goal, made measurable. Log each song or episode, rate your comprehension honestly, note phrases you caught.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-stone-200 bg-white p-4 text-center shadow-sm">
          <div className="text-2xl font-bold">{log.length}</div>
          <div className="text-sm text-stone-500">songs & episodes logged</div>
        </div>
        <div className="rounded-xl border border-stone-200 bg-white p-4 text-center shadow-sm">
          <div className="text-2xl font-bold">{avg}%</div>
          <div className="text-sm text-stone-500">average comprehension</div>
        </div>
        <div className="rounded-xl border border-stone-200 bg-white p-4 text-center shadow-sm">
          <div className="text-2xl font-bold">{log.filter((e) => e.comprehension >= 80).length}</div>
          <div className="text-sm text-stone-500">items at 80%+</div>
        </div>
      </div>

      <div className="space-y-3 rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
        <div className="font-semibold">Log a song or episode (+20 XP)</div>
        <div className="grid gap-3 sm:grid-cols-2">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Song or series title"
            className="rounded-lg border border-stone-300 px-3 py-2 outline-none focus:border-red-400" />
          <input value={episode} onChange={(e) => setEpisode(e.target.value)} placeholder="Episode / artist (e.g. S1E5, Amália)"
            className="rounded-lg border border-stone-300 px-3 py-2 outline-none focus:border-red-400" />
        </div>
        <label className="block text-sm">
          <span className="font-medium">Comprehension: {comprehension}%</span>
          <input type="range" min={0} max={100} step={5} value={comprehension}
            onChange={(e) => setComprehension(Number(e.target.value))} className="mt-1 w-full accent-red-600" />
        </label>
        <input value={phrases} onChange={(e) => setPhrases(e.target.value)}
          placeholder="Phrases you caught (e.g. fixe, pá, pois)"
          className="w-full rounded-lg border border-stone-300 px-3 py-2 outline-none focus:border-red-400" />
        <button onClick={submit} disabled={!title.trim()}
          className="rounded-full bg-red-600 px-5 py-2 font-semibold text-white hover:bg-red-700 disabled:opacity-40">
          Log entry
        </button>
      </div>

      <div className="space-y-2">
        {log.map((e) => (
          <div key={e.id} className="flex items-center gap-4 rounded-xl border border-stone-200 bg-white px-4 py-3 shadow-sm">
            <div className={cn(
              "flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white",
              e.comprehension >= 80 ? "bg-green-600" : e.comprehension >= 50 ? "bg-amber-500" : "bg-stone-400"
            )}>
              {e.comprehension}%
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-semibold">{e.title} {e.episode && <span className="text-stone-400">· {e.episode}</span>}</div>
              <div className="text-xs text-stone-500">{e.date}{e.phrases && ` · caught: ${e.phrases}`}</div>
            </div>
            <button onClick={() => setLog(deleteAnimeEntry(e.id))} className="text-stone-300 hover:text-red-600" aria-label="Delete entry">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
        {log.length === 0 && <p className="text-center text-stone-400">Nothing logged yet — put on a fado song tonight and log it.</p>}
      </div>
    </div>
  );
}
