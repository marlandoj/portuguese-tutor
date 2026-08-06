import { describe, expect, test } from "bun:test";
import {
  PRONUNCIATION_PASS_SCORE,
  buildLiveInstructions,
  isPronunciationDrillTurn,
} from "./coachPrompts";

describe("Ana live pronunciation coaching contract", () => {
  const freeInstructions = buildLiveInstructions("free");

  test("uses English for coaching and European Portuguese only for the target", () => {
    expect(freeInstructions).toContain("Explain the mouth position, stress, or difficult sound in spoken ENGLISH");
    expect(freeInstructions).toContain("model ONLY the target word or phrase in natural European Portuguese");
    expect(freeInstructions).toContain("Do not mix English and Portuguese inside one sentence");
  });

  test("keeps the same target active below 80 percent", () => {
    expect(PRONUNCIATION_PASS_SCORE).toBe(80);
    expect(freeInstructions).toContain("If N is below 80");
    expect(freeInstructions).toContain("model the SAME Portuguese target again");
    expect(freeInstructions).toContain("Never advance after only one attempt unless the score is at least 80");
    expect(freeInstructions).not.toContain("ask the learner to repeat it once, praise the attempt, then move on");
  });

  test("advances only after a passing score and resumes the paused context", () => {
    expect(freeInstructions).toContain("If N is 80 or higher");
    expect(freeInstructions).toContain("In a lesson, continue with the next phrase");
    expect(freeInstructions).toContain("In free conversation, resume the topic and question that you paused");
  });

  test("suppresses duplicate translation only for drill turns", () => {
    expect(isPronunciationDrillTurn("Listen. Agora diga: obrigado.")).toBe(true);
    expect(isPronunciationDrillTurn("Pronunciation score: 79 percent. Try again.")).toBe(true);
    expect(isPronunciationDrillTurn("Please repeat the Portuguese phrase.")).toBe(true);
    expect(isPronunciationDrillTurn("Olá! Como foi o teu dia?")).toBe(false);
  });
});
