---
title: "Virtual campus tour: a guide for colleges and universities"
description: "How to build a virtual campus tour for admissions, orientation and teaching: buildings, floors and maps, languages, SCORM, privacy and who maintains it."
lang: en
slug: virtual-campus-tour
cluster: verticales
translationOf: tour-virtual-campus
fecha: 2026-09-27
autor: jose-luis-saorin
faq:
  - q: "Who should own the virtual campus tour: marketing, IT or each department?"
    a: "What works is one organization with several editors: marketing or admissions coordinates, each school or department edits its own buildings, and IT decides where it's hosted. Andarama has organizations with roles and per-scene locking so people can edit at the same time."
  - q: "Can we host it on the university's own infrastructure?"
    a: "Yes. The software is open source and deploys with Docker or on the university's own Cloudflare account; on a self-hosted instance, faculty can sign in with their university account through SSO (OIDC)."
  - q: "How does it connect to Canvas or Moodle?"
    a: "For graded activities, as a SCORM package (Formación plan or self-hosted). Without grades, embedded with an iframe or a web component. In Moodle, also through LTI 1.3: the grade reaches the gradebook automatically and the tour stays up to date."
  - q: "How long does it take?"
    a: "A campus with five buildings and sixty viewpoints takes two or three days to shoot and about two weeks to assemble. After that, maintenance means swapping photos when something changes."
---

A well-planned **virtual campus tour** does three jobs at once: it recruits students who haven't set foot on campus yet, it orients the ones who've just arrived (where's the registrar, the library, room 203), and it lets faculty teach inside labs and facilities from the learning management system. This guide covers what the tour should include, how to split the work between offices, where to host it and how to connect it to Canvas or Moodle, with a phased plan so it doesn't end up as a pretty photo buried on the marketing site.

## Three audiences, one tour

The usual mistake is a "marketing" tour: the main building, the quad, an empty library. It gets published, linked from the homepage, and nobody comes back. The alternative is to design the tour for three uses and give each one its own entry point:

| Audience | What they want | What the tour needs |
|---|---|---|
| **Prospective students** | What the place is like: classrooms, residence halls, the town | A guided itinerary (Autopilot) through the campus highlights, in the languages of the markets you recruit from |
| **New students** | Where everything is | Plans by building and floor, a campus map, a scene menu grouped by building and navigation hotspots at every door |
| **Faculty** | Teaching in the lab, the studio or the archive without moving the whole class | Scenes of teaching spaces with content and quiz questions |

In Andarama all three entry points live in the same `tour.json`: Autopilot itineraries, areas with floor plans and levels, map mode on OpenStreetMap and quizzes are all in the same editor. The [getting started guide](https://docs.andarama.com/en/usuario/primeros-pasos/) shows the basics.

## Structure: buildings, floors and map

A campus is big, so structure matters:

- **Areas**: each building is an area; each floor is a zone inside it with its own plan and level (basement, ground, 1, 2...). Visitors see a floor switcher on the minimap.
- **Map**: outdoor scenes are placed on OpenStreetMap and the viewer shows a real map with the visitor's position.
- **Paths between buildings**: drawn in amber on the tour graph; they should leave through real doors and arrive facing forward, as if you were walking the path.
- **A starting scene per use**: the admissions tour can open on the main quad, while the orientation link can drop visitors straight into the registrar's office with a deep link (`#s=registrar`).

## Content worth adding

- **Clean navigation** with short labels: "Library", "Room 203", "Dining Hall".
- **Short text** for each space: hours, who to ask, a link to the office's web page.
- **A one-minute video** projected onto a wall in key spaces (the dean in the lobby, a student in the residence hall).
- **Floating labels** for signage without opening panels.
- **A contact form** pinned in the admissions scene, with spam protection.
- **Quizzes** in teaching spaces: the lab procedure, the archive visit, shop safety.
- **Languages**: the switcher appears as soon as there are translations; scenes and hotspots are translated, and you can send a CSV to your translation vendor.
- **An accessible text version**, which Andarama generates for every tour, so screen reader users can follow it too.

## Photography: how to organize it

A mid-sized campus (five buildings, sixty viewpoints) takes two or three days to shoot with a mid-range 360 camera on a monopod, ideally with empty classrooms and good light. A few tips that save reshoots:

- Name photos by building and floor in the camera, or rename them by pattern in the importer (`Science Hall, floor 1 ({n})`).
- Place each photo on the floor plan in the importer itself, one click per photo, before the scenes are created.
- Also shoot the walks between buildings (two or three points per path): they're what orients newcomers.
- Keep the originals: you'll reuse them when a room changes.

## Who does the work: organization and roles

What works is **marketing or admissions coordinates, each school edits its own spaces, and IT decides on hosting**. Andarama supports this with organizations and roles (admin, editor, contributor, viewer), presence and per-scene locking so two people can edit the same tour without stepping on each other, comments pinned to scenes, and version history with restore. On a self-hosted instance, faculty can sign in with their university account through SSO (OIDC); on the hosted version, each person uses an Andarama account. Our [page for universities](/en/universities/) summarizes the options.

## Where to host it

Two paths, and both are the same application:

- **Your own instance.** IT deploys Andarama with Docker or on a university Cloudflare account (which fits in the free tier for moderate use). No plans, no fees; data stays on the institution's infrastructure. It's the natural choice for a campus whose privacy office will ask where the data lives. Support, updates and onboarding can be contracted.
- **Hosted on andarama.com.** Nothing to maintain; the Formación plan ($99 a month or $990 a year) includes 100 tours, 200 GB, SCORM, white label and a custom domain (`tour.youruniversity.edu`).

Either way, the tour exports as a static package and the format is documented: if everything changes ten years from now, the tour still opens.

## Connecting to the LMS

For quiz grades to reach Canvas, Moodle or Blackboard, one path is a **SCORM** package (1.2 or 2004), uploaded like any other activity. To show a space without a grade, just embed it with an iframe or a web component. In Moodle there's also **LTI 1.3** (Formación plan or self-hosted): instructors pick the tour from the course, the grade lands in the gradebook on its own, and republishing the tour updates the course without re-uploading anything. We explain all of this step by step in [how to put a 360 tour in Moodle](/en/blog/360-tour-in-moodle/).

## Data and privacy

Andarama's analytics count visits, scenes and hotspots in aggregate, with no cookies and no IP addresses, so the tour doesn't need a consent banner. For recruiting, knowing which scenes visitors look at and how long they stay is enough. Students don't need an account to view a tour or take its quiz, which keeps student data out of the picture unless you choose to collect it (worth knowing when your FERPA office asks). For teaching, the quiz report comes from the tour itself.

## A phased plan

| Phase | What | When |
|---|---|---|
| 1 | A pilot building (the most motivated school): photos, floor plan, navigation, text, one language | One month |
| 2 | The full campus for orientation: every building, floor and the map; deep links from each office's website | Before fall move-in |
| 3 | An admissions itinerary with Autopilot, video and your recruiting languages; embedded on the admissions site | Before the recruiting season |
| 4 | Teaching spaces with quizzes, uploaded to the LMS as SCORM | With interested faculty, one course at a time |

Museums and libraries on campus can follow the same playbook; see our guides to the [virtual museum tour](/en/blog/virtual-museum-tour/) and the [library virtual tour](/en/blog/library-virtual-tour/). The pilot can run on a [14-day free trial](https://app.andarama.com/register?plan=formacion) with no credit card, or on the desktop app on a laptop; the institutional rollout comes later, with what you've learned.
