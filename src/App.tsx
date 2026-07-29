import { Routes, Route, Navigate } from "react-router";
import Layout from "@/components/Layout";
import Home from "@/pages/Home";
import Learn from "@/pages/Learn";
import Lesson from "@/pages/Lesson";
import RolePlay from "@/pages/RolePlay";
import QuizPage from "@/pages/Quiz";
import Speak from "@/pages/Speak";
import Listen from "@/pages/Listen";
import Chat from "@/pages/Chat";
import Review from "@/pages/Review";
import Sounds from "@/pages/Sounds";
import Verbs from "@/pages/Verbs";
import Grammar from "@/pages/Grammar";
import Journey from "@/pages/Journey";
import Missions from "@/pages/Missions";
import Anime from "@/pages/Anime";
import Certificate from "@/pages/Certificate";
import Coach from "@/pages/Coach";

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Home />} />
        <Route path="/learn" element={<Learn />} />
        <Route path="/learn/:lessonId" element={<Lesson />} />
        <Route path="/learn/:lessonId/roleplay" element={<RolePlay />} />
        <Route path="/learn/:lessonId/quiz" element={<QuizPage />} />
        <Route path="/speak" element={<Speak />} />
        <Route path="/speak/:lessonId" element={<Speak />} />
        <Route path="/listen" element={<Listen />} />
        <Route path="/listen/:lessonId" element={<Listen />} />
        <Route path="/chat" element={<Chat />} />
        <Route path="/review" element={<Review />} />
        <Route path="/sounds" element={<Sounds />} />
        <Route path="/verbs" element={<Verbs />} />
        <Route path="/grammar" element={<Grammar />} />
        <Route path="/journey" element={<Journey />} />
        <Route path="/missions" element={<Missions />} />
        <Route path="/anime" element={<Anime />} />
        <Route path="/certificate/:level" element={<Certificate />} />
        <Route path="/coach" element={<Coach />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
