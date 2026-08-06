import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { levelLabel } from "@/lib/data";

const root = join(import.meta.dir, "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");

const forbiddenChrome: Record<string, string[]> = {
  "components/Layout.tsx": ["Música & Séries"],
  "components/PronunciationCard.tsx": [
    "Quase lá",
    "Vamos afinar",
    "Não percebi bem",
    "Boa pronúncia!",
    "Tentar outra vez",
  ],
  "components/SessionReportPanel.tsx": ["Resumo da sessão", "Pronúncia"],
  "pages/Anime.tsx": ["Música & Séries"],
  "pages/Chat.tsx": ["Conversa ao vivo", "Terminar sessão", "A avaliar a pronúncia"],
  "pages/Home.tsx": ["Treine, não estude", "Bem-vindo de volta", "Música & Séries"],
  "pages/Journey.tsx": ["Viagem a Portugal", "Vida em Portugal", "Amizades & Conexões", "Resumos de sessão"],
  "pages/Listen.tsx": ["Digite o que você ouviu"],
  "pages/Review.tsx": ["Resumo da sessão", "Palavras difíceis", "Pronúncia", "Praticar"],
};

describe("English interface chrome", () => {
  test("level labels use English descriptors", () => {
    expect([1, 2, 3].map(levelLabel)).toEqual([
      "Level 1: Survival",
      "Level 2: Daily Life",
      "Level 3: Connections",
    ]);
  });

  test("known Portuguese UI labels do not return", () => {
    for (const [path, labels] of Object.entries(forbiddenChrome)) {
      const source = read(path);
      for (const label of labels) expect(source).not.toContain(label);
    }
  });
});
