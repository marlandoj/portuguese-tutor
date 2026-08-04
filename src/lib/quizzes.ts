import quizzesJson from "@/data/quizzes.json";
import type { Quiz } from "@/types";

export const quizzes = quizzesJson as Quiz[];
export const quizByLessonId = new Map(quizzes.map((q) => [q.lessonId, q]));
