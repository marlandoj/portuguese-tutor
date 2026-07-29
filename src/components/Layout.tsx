import { NavLink, Outlet } from "react-router";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", label: "Home", end: true },
  { to: "/learn", label: "Learn" },
  { to: "/speak", label: "Speak" },
  { to: "/listen", label: "Listen" },
  { to: "/chat", label: "Chat" },
  { to: "/review", label: "Review" },
];

const NAV_MORE = [
  { to: "/journey", label: "Journey" },
  { to: "/missions", label: "Missions" },
  { to: "/sounds", label: "Sounds" },
  { to: "/verbs", label: "Verbs" },
  { to: "/grammar", label: "Grammar" },
  { to: "/anime", label: "Música & Séries" },
  { to: "/coach", label: "Coach" },
];

export default function Layout() {
  return (
    <div className="min-h-screen bg-stone-50 text-stone-900">
      <header className="sticky top-0 z-20 border-b border-stone-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-1 px-4 py-3">
          <NavLink to="/" className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-green-600 text-sm font-bold text-white">
              P
            </span>
            <div className="leading-tight">
              <div className="font-bold">Português Tutor</div>
              <div className="text-xs text-stone-500">European Portuguese · Levels 1–3</div>
            </div>
          </NavLink>
          <nav className="ml-auto flex flex-wrap items-center gap-1">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                className={({ isActive }) =>
                  cn(
                    "rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-red-600 text-white"
                      : "text-stone-600 hover:bg-stone-100 hover:text-stone-900"
                  )
                }
              >
                {n.label}
              </NavLink>
            ))}
          </nav>
        </div>
        <div className="border-t border-stone-100">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-1 px-4 py-1.5">
            {NAV_MORE.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                className={({ isActive }) =>
                  cn(
                    "rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
                    isActive
                      ? "bg-stone-900 text-white"
                      : "text-stone-500 hover:bg-stone-100 hover:text-stone-900"
                  )
                }
              >
                {n.label}
              </NavLink>
            ))}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>
      <footer className="border-t border-stone-200 py-6 text-center text-xs text-stone-500">
        Train, don't study. Treine todos os dias.
      </footer>
    </div>
  );
}
