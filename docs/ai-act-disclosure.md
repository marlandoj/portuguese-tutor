# EU AI Act Article 50 — disclosure posture

**Status:** Article 50(1) implemented. Article 50(2) assessed, deferred with a dated review.
**Last reviewed:** 2026-08-05 · **Next review due:** 2026-11-01 (ahead of the 2026-12-02 deadline)
**Ticket:** ZOU-1137 · **Origin:** ZOU-797 Anam vendor preflight §5 (G2)

## Why this app is in scope

Article 50(1) took effect **2026-08-02**. It requires that people interacting
directly with an AI system be informed, from the start of the first interaction,
clearly and accessibly — unless it is already obvious to a reasonably
well-informed person.

The obligation reaches providers established outside the EU whenever the
system's output is used in the Union. Português Tutor teaches **European**
Portuguese and is reachable over the public internet, so assuming no EU users is
not defensible. We do not rely on the "already obvious" carve-out: a learner
arriving at a conversation with "Professora Ana" may reasonably read that as a
human tutor.

## Article 50(1) — implemented

Two disclosures ship, both in `src/components/AiDisclosure.tsx`:

| Variant | Rendered by | Reach |
| --- | --- | --- |
| `line` | `src/components/Layout.tsx` (footer) | Every page, including the ten that generate content through `src/lib/llm.ts` |
| `banner` | `src/pages/Chat.tsx`, above the controls | The live conversational agent |

Three properties are deliberate and are held by tests:

1. **The word "AI" appears in both variants.** A product name is not a
   disclosure. `src/components/AiDisclosure.render.test.tsx` strips
   "Professora Ana" and "Português Tutor" from the rendered text and asserts an
   explicit AI reference survives.
2. **Nothing depends on colour or the icon.** The icon is `aria-hidden`; the
   sentence carries the full meaning. The banner exposes an accessible name via
   `aria-label`, and both variants are `role="note"`.
3. **The banner precedes the controls.** `src/components/disclosure.test.ts`
   asserts the banner's source position is above the call button, because
   Art. 50(1) requires the notice from the start of the first interaction.

Contrast: the notice uses `--theme-ink` rather than the `--theme-muted` the rest
of the footer uses. At `text-xs`, muted lands near 4.2:1 on the light canvases —
under the 4.5:1 floor for small text. Ink measures roughly 11:1 across all three
themes.

## Article 50(2) — assessed, deferred

Article 50(2) requires that synthetic audio, image, video, or text output be
marked in a **machine-readable** format detectable as artificially generated.
A visible notice does not satisfy it. The grace period runs to **2026-12-02**.

**Decision (2026-08-05): defer implementation, revisit by 2026-11-01.**

Reasoning:

- The app generates **audio** (OpenAI Realtime speech, Deepgram-adjacent TTS via
  `src/lib/speech.ts`) and **text** (lesson content, corrections, session
  reports via `src/lib/llm.ts`). Both are in scope for 50(2).
- Nothing generated is **persisted or distributed** today. Audio is streamed to
  the learner and discarded; text renders in-session. The marking obligation
  bites hardest on content that leaves the system and circulates, which this
  app does not currently produce.
- The one artefact that does leave is the **session report** (`src/lib/report.ts`).
  That is the first thing to mark, and the most likely trigger for acting before
  the deadline.
- Watermarking a live WebRTC audio stream is not a settled practice, and the
  Commission's implementing guidance on 50(2) technical standards is still
  maturing. Committing to a scheme now risks building against a spec that moves.

**Triggers that pull this forward, regardless of date:**

- Session reports, transcripts, or generated audio become downloadable or
  shareable.
- The avatar ships to anything wider than internal evaluation — synthetic video
  of a human likeness is deepfake-adjacent and carries its own 50(4) framing.
- The Commission publishes implementing acts or harmonised standards for 50(2).

## Avatar interaction

If the Anam renderer ships, `showAIAvatarDisclosure: true` must be set at
session-token creation. It defaults to **false** and binds **only at creation** —
it cannot be turned on later in the session. This is already set in
`server/providers.ts`. Anam ToS §6(o) would independently require it; the
Art. 50(1) obligation exists with or without the avatar.

## What this document is not

This is an engineering record of what shipped and why, not legal advice. The
Art. 50(2) deferral is a judgement call made against a moving standard and
should be reviewed by someone qualified before the app is promoted beyond
private use.
