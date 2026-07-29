import { useMemo } from "react";
import { Link } from "react-router";
import { Volume2 } from "lucide-react";
import { sounds } from "@/lib/data";
import { speakPt } from "@/lib/llm";

export default function Sounds() {
  const tips = useMemo(
    () => [
      "European Portuguese swallows unstressed vowels — 'obrigado' really sounds like 'oo-bri-GA-doo'. Lean into it.",
      "Final and pre-consonant S becomes 'sh': os dois ≈ 'oosh doish', pastéis ≈ 'pash-TAYSH'.",
      "Unlike Brazil, 'd' and 't' stay crisp before 'i': dia ≈ 'DEE-uh', noite ≈ 'NOYT' — no 'jee' or 'chee'.",
      "The R is guttural, made in the back of the throat like the French r — rua, carro, Rio.",
      "Use the play buttons — then imitate out loud until it sounds the same. That's shadowing.",
    ],
    []
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Sounds of European Portuguese</h1>
        <p className="text-sm text-stone-500">
          The pronunciation system of Portugal — swallowed vowels, the 'sh' sounds, crisp consonants and stress.
          Drill them in <Link to="/review" className="text-red-700 underline">Review</Link>.
        </p>
      </div>

      {sounds.sections.map((sec) => (
        <section key={sec.title}>
          <h3 className="mb-2 font-semibold text-stone-700">{sec.title}</h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {sec.items.map((it) => (
              <div key={it.sound} className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="rounded-full bg-red-50 px-3 py-1 text-lg font-bold text-red-700">{it.sound}</span>
                  <button
                    onClick={() => speakPt(it.example.split(",")[0].trim())}
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-stone-100 text-stone-500 transition hover:bg-red-600 hover:text-white"
                    aria-label={`Hear ${it.example}`}
                  >
                    <Volume2 className="h-4 w-4" />
                  </button>
                </div>
                <div className="mt-2 font-medium">{it.example}</div>
                <div className="mt-1 text-sm text-stone-500">{it.note}</div>
              </div>
            ))}
          </div>
        </section>
      ))}

      <section className="rounded-xl border border-stone-200 bg-white p-5">
        <h3 className="mb-2 font-semibold">How to train your pronunciation</h3>
        <ul className="list-disc space-y-1 pl-5 text-sm text-stone-600">
          {tips.map((t, i) => <li key={i}>{t}</li>)}
        </ul>
      </section>
    </div>
  );
}
