---
title: "Andarama vs 3DVista: one-time desktop license vs open source"
description: "3DVista costs $499 once and is the most complete desktop editor; Andarama is open source, free self-hosted and hosted from $2. Price, VR and SCORM."
lang: en
slug: andarama-vs-3dvista
cluster: competidores
translationOf: andarama-vs-3dvista
fecha: 2026-09-27
autor: jose-luis-saorin
plantilla: vs
competidor: 3dvista
faq:
  - q: "Does 3DVista have a monthly fee?"
    a: "Not for the software: Virtual Tour Pro is a $499 perpetual license. 3DVista's hosting is optional and starts at 99 euros a year; you can use any other server because the tour exports as HTML."
  - q: "Which is cheaper in the long run?"
    a: "Self-hosted Andarama costs nothing. Against hosted Andarama, 3DVista ($499 once) becomes cheaper than the Paseo plan ($200 a year) from the third year on, if you don't need hosting or classroom features."
  - q: "Which has better virtual reality?"
    a: "Both have a VR mode. Andarama uses WebXR with hands, controllers and panels inside the session, with nothing to install on the headset; we haven't tested how far 3DVista's mode goes, so the table simply says yes."
  - q: "Are both good for e-learning?"
    a: "Yes. Both have quizzes and export SCORM. Andarama adds PDF certificates, escape rooms, scavenger hunts and live guided tours, and students don't need an account to play a tour."
---

**3DVista Virtual Tour Pro** is a Spanish-made desktop program for Windows and macOS, sold as a one-time license ($499), and probably the most complete of the "classic" 360 tour editors: advanced hotspots, e-learning with quizzes and SCORM, floor plans, 360 video and enormous control over the look. **Andarama** is an open source web application, free if you install it yourself or hosted from $2 a month, with a collaborative editor, WebXR virtual reality and classroom tools. Both export the tour so you can host it wherever you want, which already sets them apart from most of the industry; the choice comes down to workflow (desktop or browser), whether you work as a team, budget, and how much open source matters to you.

A disclosure before we start: Andarama is ours. We've tried to be fair, and we say so where 3DVista wins.

## What each one is

**3DVista** installs on your computer. You import your photos, build the tour in its interface and export HTML5 that runs on any server. It offers its own optional hosting starting at 99 euros a year. The license is perpetual; major versions may come with an upgrade cost. Education discounts are available on request.

**Andarama** runs in the browser, against an instance that can be your own computer (a desktop app you open with a double click), your server (Docker), your Cloudflare account or andarama.com. The code is open source (EUPL-1.2), the `tour.json` format is documented, and tours export as a static ZIP, a single HTML file, a PWA or SCORM.

## Pricing, checked

3DVista's prices, [checked on its store page](https://www.3dvista.com/en/store/) on 27 September 2026:

- **Virtual Tour Pro**: $499, one-time payment, with no project limit. It includes the Stitcher and one free month of hosting.
- **Hosting** (optional): from 99 euros a year, with storage limits. You can use your own server instead.

Andarama's prices (full details on the [pricing page](/en/pricing/)):

- **Self-hosted**: $0, no tour limit.
- **Andar**: $2 a month, 1 tour, 5 GB.
- **Aula**: $42 a year, 5 tours, 10 GB.
- **Paseo**: $20 a month or $200 a year, 10 tours, 50 GB.
- **Excursión**: $500 a year, 500 tours, 100 GB, no badge, custom domain.
- **Formación**: $99 a month or $990 a year, 100 tours, 200 GB, SCORM, white label, custom domain.
- **Lifetime**: $1000 once, 1000 tours, 200 GB.

The honest comparison: for a professional who makes lots of tours and prefers paying once, **3DVista is cheaper than hosted Andarama** from the third year on ($499 versus $200 a year for Paseo), and it doesn't need anyone's hosting because it exports HTML. **Self-hosted Andarama costs nothing**, also with no third-party hosting, and it's the direct equivalent of the 3DVista workflow: the software on your machine, the tours exported to your server. So the difference lies in what each program does, not in price.

## Desktop vs browser

This is the fundamental difference, and there's no right answer.

**3DVista** works locally, with files on your drive and no dependence on the network. It's comfortable for a photographer processing large batches, and it's fast on a powerful machine. On the other hand, it's a veteran interface with a steep learning curve, a per-seat license, and collaboration means passing files around.

**Andarama** works in the browser, but photo tiling still happens on your machine (using the graphics card) before upload. It has presence and per-scene locking so several people can edit the same tour, pinned comments, version history with restore, and organization accounts with roles. And it works from any computer, including a tablet, with nothing to install.

## Editor and features

Both are full editors and it's a genuine tie here, with nuances:

| | 3DVista | Andarama |
|---|---|---|
| Hotspots | Very varied, with lots of style control | 17 types, including quiz, treasure, state, polygon, comparison slider and 3D model |
| Skins and look | Very powerful skin editor | A polished viewer with per-tour options; less customizable at a low level |
| Tour graph | Not as such | Yes: every arrow is a hotspot; arrival direction per path |
| Floor plans and map | Floor plans | Areas with plan and level, radar, and a real map on OpenStreetMap |
| Languages | Yes | Yes, per scene and per hotspot, with CSV |
| 360 video | Yes | Yes, with timed hotspots |
| Accessibility | Depends on the skin | Text version, visible focus, reduced motion, required alt text |
| Collaboration | Files | Presence, per-scene locking, comments, versions |

If you want absolute control over the look, 3DVista wins. If you want a fast workflow for many well-connected scenes with several people editing, Andarama does.

## Virtual reality

Both have a VR mode. In Andarama it's WebXR: open the tour in the browser on a Meta Quest, Pico or Vision Pro and you get tracked hands and controllers; text, gallery, video, quiz and comparison panels are drawn inside the session, and an exported tour keeps VR if it's served over HTTPS. We haven't tested how far 3DVista's mode goes (hands, panels), so in the table it's a plain "yes".

## Teaching and training

Both work for e-learning, and this is one of the few comparisons where we can say that: 3DVista has quizzes and exports SCORM, with an export designed for LMS use. Andarama has graded quizzes with a passing score, a final report and a PDF completion certificate; SCORM 1.2 and 2004; plus scavenger hunts, escape rooms built with variables and quiz gates, and live guided tours, with no student accounts needed to play. Andarama also has an LTI 1.3 integration, but it's in testing and grades don't flow back to Moodle or Canvas on their own yet. For a standalone SCORM course, either one will do.

## Street View and branding

3DVista publishes to Google Street View; Andarama doesn't, for now. Both offer white label and custom domains (in Andarama, on Excursión, Formación and Lifetime, and without restrictions when self-hosted). Andarama's analytics use no cookies and store no IP addresses; we haven't checked 3DVista's.

## So which one?

- **3DVista**, if you're a professional who makes lots of tours, work alone, want to pay once, need full control over the skin and publish to Street View.
- **Andarama**, if you work as a team, teach or run training with game-based activities (escape rooms, scavenger hunts), want VR with nothing to install on the headset, prefer open source you can audit, or want to start at $2 a month or at zero.

Both can be tried: 3DVista with its trial version, Andarama with a [14-day free trial](https://app.andarama.com/register?plan=paseo) and no credit card, or by installing it yourself. If you're also weighing Matterport, Kuula or Panoee, see [Matterport alternatives](/en/blog/matterport-alternatives/), [Andarama vs Kuula](/en/blog/andarama-vs-kuula/) and [Andarama vs Panoee](/en/blog/andarama-vs-panoee/).
