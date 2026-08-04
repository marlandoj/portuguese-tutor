import { lazy, Suspense, type ReactNode } from "react";
import { Routes, Route, Navigate } from "react-router";
import Layout from "@/components/Layout";
import Home from "@/pages/Home";

const Learn = lazy(() => import("@/pages/Learn"));
const Lesson = lazy(() => import("@/pages/Lesson"));
const RolePlay = lazy(() => import("@/pages/RolePlay"));
const QuizPage = lazy(() => import("@/pages/Quiz"));
const Speak = lazy(() => import("@/pages/Speak"));
const Listen = lazy(() => import("@/pages/Listen"));
const Chat = lazy(() => import("@/pages/Chat"));
const Review = lazy(() => import("@/pages/Review"));
const Sounds = lazy(() => import("@/pages/Sounds"));
const Verbs = lazy(() => import("@/pages/Verbs"));
const Grammar = lazy(() => import("@/pages/Grammar"));
const Journey = lazy(() => import("@/pages/Journey"));
const Missions = lazy(() => import("@/pages/Missions"));
const Anime = lazy(() => import("@/pages/Anime"));
const Certificate = lazy(() => import("@/pages/Certificate"));
const Coach = lazy(() => import("@/pages/Coach"));

function RouteFallback() {
  return (
    <div
      className="flex min-h-[40vh] items-center justify-center"
      role="status"
      aria-live="polite"
    >
      <span className="tutor-brand-subtitle animate-pulse text-sm">
        A carregar…
      </span>
    </div>
  );
}

function lazyRoute(node: ReactNode) {
  return <Suspense fallback={<RouteFallback />}>{node}</Suspense>;
}

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Home />} />
        <Route path="/learn" element={lazyRoute(<Learn />)} />
        <Route path="/learn/:lessonId" element={lazyRoute(<Lesson />)} />
        <Route path="/learn/:lessonId/roleplay" element={lazyRoute(<RolePlay />)} />
        <Route path="/learn/:lessonId/quiz" element={lazyRoute(<QuizPage />)} />
        <Route path="/speak" element={lazyRoute(<Speak />)} />
        <Route path="/speak/:lessonId" element={lazyRoute(<Speak />)} />
        <Route path="/listen" element={lazyRoute(<Listen />)} />
        <Route path="/listen/:lessonId" element={lazyRoute(<Listen />)} />
        <Route path="/chat" element={lazyRoute(<Chat />)} />
        <Route path="/review" element={lazyRoute(<Review />)} />
        <Route path="/sounds" element={lazyRoute(<Sounds />)} />
        <Route path="/verbs" element={lazyRoute(<Verbs />)} />
        <Route path="/grammar" element={lazyRoute(<Grammar />)} />
        <Route path="/journey" element={lazyRoute(<Journey />)} />
        <Route path="/missions" element={lazyRoute(<Missions />)} />
        <Route path="/anime" element={lazyRoute(<Anime />)} />
        <Route path="/certificate/:level" element={lazyRoute(<Certificate />)} />
        <Route path="/coach" element={lazyRoute(<Coach />)} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
