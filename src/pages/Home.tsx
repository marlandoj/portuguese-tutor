import { Link } from "react-router";
import { useMemo, useState } from "react";
import { BookOpen, Ear, Flame, Globe, GraduationCap, MessagesSquare, RefreshCw, Sparkle, Trophy } from "lucide-react";
import { dayLessons, lessons, levelDescription, levelLabel, vocab } from "@/lib/data";
import { dueCount, getMissionsDone, getProgress, learnedCount } from "@/lib/store";
import { getAttempts, getBelt, getStreak, getXp } from "@/lib/gamify";
import { speakPt } from "@/lib/llm";
import { missions } from "@/lib/data";

function phraseOfTheDay() {
  const days = Math.floor(Date.now() / 86400000);
  return vocab[days % vocab.length];
}

function SpeakChart() {
  const attempts = getAttempts().slice(-30);
  if (attempts.length < 3) return null;
  const w = 280;
  const h = 60;
  const pts = attempts
    .map((a, i) => `${(i / (attempts.length - 1)) * w},${h - (a.score / 100) * h}`)
    .join(" ");
  const avg = Math.round(attempts.reduce((s, a) => s + a.score, 0) / attempts.length);
  return (
    <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">Speaking scores (last {attempts.length})</span>
        <span className="text-sm font-bold text-red-600">avg {avg}%</span>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="mt-2 w-full">
        <polyline points={pts} fill="none" stroke="#dc2626" strokeWidth="2" strokeLinejoin="round" />
        <line x1="0" y1={h - 0.75 * h} x2={w} y2={h - 0.75 * h} stroke="#d6d3d1" strokeDasharray="4" />
      </svg>
      <div className="text-xs text-stone-400">dashed line = 75% pass threshold</div>
    </div>
  );
}

export default function Home() {
  const [progress] = useState(getProgress);
  const [xp] = useState(getXp);
  const [missionsDone] = useState(getMissionsDone);
  const vocabIds = useMemo(() => vocab.map((v) => v.id), []);
  const due = dueCount(vocabIds);
  const learned = learnedCount(vocabIds);
  const done = progress.completedLessons.length;
  const total = lessons.length;
  const quizTaken = Object.keys(progress.quizScores).length;
  const streak = getStreak(xp);
  const { belt, next, progress: beltProgress } = getBelt(xp.total);
  const [potd] = useState(phraseOfTheDay);

  const nextLesson = useMemo(() => {
    for (const level of [1, 2, 3]) {
      for (const l of dayLessons(level)) {
        if (!progress.completedLessons.includes(l.id)) return l;
      }
    }
    return null;
  }, [progress]);

  const levelMissions = missions.filter((m) => m.level === (nextLesson?.level ?? 3));
  const missionPreview = levelMissions.filter((m) => !missionsDone.includes(m.id)).slice(0, 3);

  const stats = [
    { icon: BookOpen, label: "Lessons done", value: `${done} / ${total}` },
    { icon: RefreshCw, label: "Cards due", value: String(due) },
    { icon: GraduationCap, label: "Phrases learned", value: `${learned} / ${vocab.length}` },
    { icon: Trophy, label: "Quizzes taken", value: String(quizTaken) },
  ];

  return (
    <div className="space-y-8">
      {/* hero with streak + belt */}
      <section className="rounded-2xl bg-gradient-to-br from-red-600 to-rose-700 p-8 text-white shadow-lg">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-sm font-medium uppercase tracking-widest text-red-100">Treine, não estude</div>
            <h1 className="mt-2 text-3xl font-bold sm:text-4xl">Bem-vindo de volta! Ready to train?</h1>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-sm font-semibold">
                <Flame className="h-4 w-4 text-amber-300" /> {streak}-day streak
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-sm font-semibold">
                <Sparkle className="h-4 w-4 text-amber-300" /> {xp.total} XP
              </span>
              <span className={`inline-flex items-center rounded-full px-3 py-1.5 text-sm font-bold ${belt.color}`}>
                {belt.jp} {belt.name}
              </span>
            </div>
            {next && (
              <div className="mt-3 max-w-xs">
                <div className="h-1.5 overflow-hidden rounded-full bg-white/20">
                  <div className="h-full rounded-full bg-amber-300" style={{ width: `${beltProgress * 100}%` }} />
                </div>
                <div className="mt-1 text-xs text-red-100">{xp.total} / {next.minXp} XP to {next.jp} {next.name}</div>
              </div>
            )}
          </div>
          {nextLesson ? (
            <Link
              to={`/learn/${nextLesson.id}`}
              className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 font-semibold text-red-700 shadow hover:bg-red-50"
            >
              Continue: {nextLesson.title} →
            </Link>
          ) : (
            <div className="rounded-full bg-white/20 px-5 py-2.5 font-semibold">🎉 All day lessons complete!</div>
          )}
        </div>
      </section>

      {/* phrase of the day */}
      <section className="flex flex-wrap items-center gap-4 rounded-2xl border border-amber-200 bg-amber-50 p-5">
        <div className="min-w-0 flex-1">
          <div className="text-xs font-bold uppercase tracking-widest text-amber-700">Phrase of the day</div>
          <div className="mt-1 text-2xl font-bold text-stone-900">{potd.jp}</div>
          {potd.romaji && <div className="text-sm italic text-stone-500">{potd.romaji}</div>}
          {potd.en && <div className="text-sm text-stone-700">{potd.en}</div>}
        </div>
        <div className="flex flex-col items-end gap-2">
          <button
            onClick={() => speakPt(potd.jp)}
            className="inline-flex items-center gap-1 rounded-full bg-amber-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-amber-700"
          >
            <Ear className="h-4 w-4" /> Hear it
          </button>
          <Link to={`/speak/${potd.lessonId}`} className="text-xs font-semibold text-amber-800 underline">
            Practice saying it →
          </Link>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
            <s.icon className="h-5 w-5 text-red-600" />
            <div className="mt-2 text-2xl font-bold">{s.value}</div>
            <div className="text-sm text-stone-500">{s.label}</div>
          </div>
        ))}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <SpeakChart />

        {/* missions preview */}
        <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-sm font-semibold">
              <Globe className="h-4 w-4 text-red-600" /> Next real-world missions
            </span>
            <Link to="/missions" className="text-xs font-semibold text-red-700 underline">All missions</Link>
          </div>
          <div className="mt-2 space-y-2">
            {missionPreview.map((m) => (
              <div key={m.id} className="flex items-center justify-between gap-2 rounded-lg bg-stone-50 px-3 py-2 text-sm">
                <span>{m.title}</span>
                <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">+{m.xp}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <section>
        <h2 className="mb-4 text-xl font-bold">Curriculum</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {[1, 2, 3].map((level) => {
            const days = dayLessons(level);
            const levelDone = days.filter((l) => progress.completedLessons.includes(l.id)).length;
            const pct = days.length ? Math.round((levelDone / days.length) * 100) : 0;
            const complete = pct === 100;
            return (
              <Link
                key={level}
                to={`/journey?level=${level}`}
                className="group rounded-xl border border-stone-200 bg-white p-5 shadow-sm transition hover:border-red-300 hover:shadow"
              >
                <div className="flex items-center justify-between">
                  <h3 className="font-bold group-hover:text-red-700">{levelLabel(level)}</h3>
                  <span className="text-sm font-medium text-stone-500">{pct}%</span>
                </div>
                <p className="mt-2 text-sm text-stone-600">{levelDescription(level)}</p>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-stone-100">
                  <div className="h-full rounded-full bg-red-600" style={{ width: `${pct}%` }} />
                </div>
                <div className="mt-2 flex items-center justify-between text-xs text-stone-500">
                  <span>{levelDone} of {days.length} days complete</span>
                  {complete && <span className="font-semibold text-amber-600">🏆 Certificate earned</span>}
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { to: "/chat", icon: MessagesSquare, label: "AI conversation", desc: "Free talk with Professora Ana" },
          { to: "/listen", icon: Ear, label: "Listening drill", desc: "Comprehension + dictation" },
          { to: "/journey", icon: Sparkle, label: "Journey map", desc: "Your trip, stop by stop" },
          { to: "/anime", icon: Trophy, label: "Música & Séries", desc: "Comprehension progress" },
        ].map((c) => (
          <Link key={c.to} to={c.to} className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm transition hover:border-red-300 hover:shadow">
            <c.icon className="h-5 w-5 text-red-600" />
            <div className="mt-1 font-semibold">{c.label}</div>
            <div className="text-xs text-stone-500">{c.desc}</div>
          </Link>
        ))}
      </section>
    </div>
  );
}
