# Português Tutor Design System

## Overview

A stable learning workspace with three culturally specific presentation modes. Structure and control placement never move between themes. Each mode changes the environmental image, material treatment, semantic color tokens, and restrained state motion.

## Physical Scene

A learner practices at a desk in clear Atlantic light. Depending on the selected mode, the room opens onto Lisbon, a ceramic artisan's table, or a rail-and-coast journey north. The content remains calm and readable under all three conditions.

## Visual Thesis

European Portuguese place and craft, expressed through Lisbon light, Atlantic contrast, credible tile and cork materials, disciplined geometry, and warm human color rather than flag shorthand.

## Interaction Thesis

- Theme changes crossfade the environmental layer and recolor semantic surfaces in 180-240 ms without reflow.
- Active navigation uses a crisp tile-like marker and position shift, not ornamental animation.
- Hero atmosphere has one slow depth movement on capable devices and becomes static under reduced motion.

## Theme Tokens

### Living Places

- Canvas: `oklch(0.962 0.020 92)` sun-warmed limestone
- Surface: `oklch(0.985 0.012 90 / 0.93)`
- Ink: `oklch(0.245 0.035 238)` Atlantic ink
- Muted ink: `oklch(0.475 0.040 235)`
- Primary: `oklch(0.475 0.125 243)` Lisbon blue
- Secondary: `oklch(0.735 0.150 88)` tram yellow
- Highlight: `oklch(0.610 0.145 38)` terracotta
- Border: `oklch(0.775 0.035 230 / 0.68)`
- Background asset: Lisbon study room with open daylight, tiled wall detail, and an uncluttered foreground

### Artisan Study

- Canvas: `oklch(0.948 0.018 92)` ceramic ivory
- Surface: `oklch(0.982 0.012 92 / 0.95)`
- Ink: `oklch(0.230 0.030 250)` kiln-dark blue
- Muted ink: `oklch(0.470 0.038 245)`
- Primary: `oklch(0.430 0.145 255)` cobalt pigment
- Secondary: `oklch(0.590 0.090 63)` cork amber
- Highlight: `oklch(0.500 0.120 30)` oxblood glaze
- Border: `oklch(0.735 0.050 240 / 0.68)`
- Background asset: Portuguese tile painter's workbench with ceramic, cork, pigment, and negative space

### Immersive Travel Diary

- Canvas: `oklch(0.915 0.030 205)` Atlantic mist
- Surface: `oklch(0.958 0.020 205 / 0.90)`
- Ink: `oklch(0.220 0.055 225)` deep petrol
- Muted ink: `oklch(0.450 0.060 215)`
- Primary: `oklch(0.470 0.120 210)` ocean teal
- Secondary: `oklch(0.665 0.155 42)` postcard coral
- Highlight: `oklch(0.790 0.145 88)` station yellow
- Border: `oklch(0.700 0.060 210 / 0.66)`
- Background asset: Portuguese rail and Atlantic coast journey with restrained map and ticket ephemera

## Typography

Use the existing system sans stack for all UI and Portuguese text. Headings use 700 weight and compact line height; body uses 400-500. Diacritics must remain clear at small sizes. Fixed product scale: 12, 14, 16, 20, 24, 32, and 40 px.

## Layout

- Sticky two-tier header, max content width 72rem
- Theme selector remains in the header and is reachable on every route
- Desktop content breathes against a full-viewport environmental layer
- Mobile header becomes a compact brand row, selector row, and horizontally scrollable navigation
- Panels stay at 8 px radius or less outside the existing home hero
- Main content uses 16 px mobile and 24 px desktop gutters

## Surfaces And Components

- Shell: full-viewport background image plus a theme-colored veil
- Header: opaque enough for legibility, with subtle material texture and no decorative glass blur
- Panels: theme surface, 1 px border, short shadow, consistent selected and focus states
- Primary action: solid primary token, high-contrast text, 8 px radius
- Secondary action: surface token with border and ink text
- Theme selector: Radix Select with icon, visible label, three text options, and checkmark state
- Hero: image-led atmospheric panel with a calm text zone, progress pills, and one clear continue action

## Motion

Theme transitions use opacity and color only, 180-240 ms with ease-out-quart. No layout-property animation. The travel theme may use a maximum 6 px slow background drift; Living Places uses a subtle light shift; Artisan Study remains nearly still. All decorative animation is disabled under `prefers-reduced-motion: reduce`.

## Accessibility

Maintain WCAG 2.2 AA contrast, 44 px minimum touch targets for selector and primary actions, visible 2 px focus rings, semantic labels, and keyboard navigation. Background images are decorative and never carry required information.
