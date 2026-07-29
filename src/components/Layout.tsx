import { NavLink, Outlet } from "react-router";
import ThemeSelector from "@/components/ThemeSelector";
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
    <div className="tutor-shell min-h-screen">
      <div className="theme-atmosphere" aria-hidden="true" />
      <a href="#main-content" className="skip-link">Skip to content</a>
      <header className="tutor-header sticky top-0 z-20">
        <div className="tutor-header-primary mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3">
          <NavLink to="/" className="tutor-brand flex min-w-0 items-center gap-2.5">
            <span className="tutor-brand-mark" aria-hidden="true">P</span>
            <span className="min-w-0 leading-tight">
              <span className="block truncate font-bold">Português Tutor</span>
              <span className="tutor-brand-subtitle block truncate text-xs">European Portuguese · Levels 1–3</span>
            </span>
          </NavLink>
          <nav aria-label="Primary navigation" className="tutor-primary-nav order-3 flex w-full items-center gap-1 overflow-x-auto md:order-none md:ml-auto md:w-auto">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) => cn("tutor-nav-link", isActive && "is-active")}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
          <ThemeSelector />
        </div>
        <div className="tutor-header-secondary">
          <nav aria-label="Practice tools" className="mx-auto flex max-w-6xl items-center gap-1 overflow-x-auto px-4 py-1.5">
            {NAV_MORE.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) => cn("tutor-subnav-link", isActive && "is-active")}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>
      <main id="main-content" className="tutor-main relative mx-auto min-h-[calc(100vh-10rem)] max-w-6xl px-4 py-6">
        <Outlet />
      </main>
      <footer className="tutor-footer relative py-6 text-center text-xs">
        Train, don't study. Treine todos os dias.
      </footer>
    </div>
  );
}
