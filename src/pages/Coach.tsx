import { Brain, Footprints, Heart } from "lucide-react";
import { method } from "@/lib/data";

export default function Coach() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">The coaching method</h1>
        <p className="text-sm text-stone-500">
          The speaking-first philosophy that powers this tutor — fluency through daily reps, not grammar drills.
        </p>
      </div>

      <section>
        <h2 className="mb-3 flex items-center gap-2 text-lg font-bold">
          <Brain className="h-5 w-5 text-red-600" /> Philosophy
        </h2>
        <div className="grid gap-3 md:grid-cols-2">
          {method.philosophy.map((p) => (
            <div key={p.title} className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
              <div className="font-semibold text-red-700">{p.title}</div>
              <p className="mt-2 text-sm text-stone-600">{p.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 flex items-center gap-2 text-lg font-bold">
          <Footprints className="h-5 w-5 text-red-600" /> The 5-step training loop
        </h2>
        <div className="space-y-2">
          {method.trainingSteps.map((s) => (
            <div key={s.step} className="flex gap-4 rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-600 font-bold text-white">
                {s.step}
              </div>
              <div>
                <div className="font-semibold">{s.title}</div>
                <p className="mt-1 text-sm text-stone-600">{s.body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 flex items-center gap-2 text-lg font-bold">
          <Heart className="h-5 w-5 text-red-600" /> Mindset training
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {method.mindset.map((m) => (
            <div key={m.title} className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
              <div className="text-sm font-semibold">{m.title}</div>
              <p className="mt-1 text-xs text-stone-600">{m.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl bg-stone-900 p-6 text-white">
        <h2 className="text-lg font-bold">Remember why you started</h2>
        <p className="mt-2 text-stone-300">
          Travel Portugal and order, ask, and joke with locals. Chat with Portuguese friends and family.
          Understand fado and the telenovelas. Small talk with confidence.
        </p>
        <p className="mt-3 text-stone-400">
          Um bocadinho por dia. Daily reps, not weekend cramming. Vamos treinar!
        </p>
      </section>
    </div>
  );
}
