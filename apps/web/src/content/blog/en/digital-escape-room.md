---
title: "Digital escape room for the classroom: how to build one in 360"
description: "How to build a digital escape room with 360 photos: hidden objects, locks driven by variables, clues and a final lock. No student accounts needed."
lang: en
slug: digital-escape-room
cluster: docencia
translationOf: escape-room-digital
fecha: 2026-09-27
autor: jose-luis-saorin
faq:
  - q: "How long does it take to build a 360 digital escape room?"
    a: "Once the photos are taken, about an afternoon: three or four scenes, half a dozen hidden objects, two locks and a final lock. Writing the story and the puzzles takes longer than using the tool."
  - q: "Do students need accounts?"
    a: "No. A published tour opens from a link or a QR code, with no email and no password, so there is no student account to create or protect. On a self-hosted install there are no plans or fees either."
  - q: "Does it work on an interactive whiteboard, Chromebooks and phones?"
    a: "Yes. It is a web page, so it runs on the classroom display, on Chromebooks, iPads and phones, and, if you want, in a VR headset or a cardboard viewer."
  - q: "Can I reuse another teacher's escape room?"
    a: "Inside an organization, any tour can be saved as a template so other teachers can start from it, and every tour can be exported as a package. There is no public gallery of ready-made escape rooms yet; if you build one you want to share, write to us."
---

A **digital escape room** in 360 is a tour through spherical photos (a classroom, a science lab, a museum, your own school library) where students have to find hidden objects, solve puzzles and open locks until they reach a final lock. It plays in the browser, on the classroom display, on Chromebooks, iPads or phones, and you can build one in an afternoon with a tour editor that has state variables. This guide walks through how to do it in Andarama, step by step, and covers the design choices that separate an escape room students love from one they abandon after five minutes.

You can follow along with a free account: [start the 14-day trial for teachers](https://app.andarama.com/register?plan=aula), no credit card required.

## What you need before you start

- **360 photos** of three to six spaces. Photos from a consumer 360 camera are fine (many schools buy one for the price of a document camera, or borrow one), but openly licensed panoramas from Wikimedia Commons also work if the game takes place in a historic site or a museum.
- **A story**: who the players are, what happened, what they need to achieve and how long they have. Without a story, the locks are just a quiz with a different name.
- **The puzzles**, one per lock, each with its answer and the clue that leads to it.
- **Andarama**: the 14-day trial, the Classroom plan for teachers or a self-hosted install. Every piece we use below (treasures, counters, visibility conditions, gated quizzes) is described in the [teaching documentation](https://docs.andarama.com/en/usuario/docencia/).

## The four building blocks

Technically, an escape room is a handful of variables that change value, plus things that appear or disappear depending on those variables. Andarama has four hotspot types that fit the job:

| Piece | Hotspot | What it does |
|---|---|---|
| Hidden object | **Treasure** | You place it in the scene and the viewer keeps count of how many have been found. It shows up as a gem; to truly hide it, change the icon or remove the round background |
| Lock | **Gated quiz** | A question that keeps the player in the scene until they get it right: links to other scenes look dimmed, and clicking them opens the question |
| Switch | **Counter/state** | Changes a tour variable (opens a door, turns on a light, adds a point) |
| Door that opens | **Visibility conditions** | Any hotspot can be set to appear only when a variable has a certain value |

That covers almost everything: "once you find all three pieces of the map, the passage to the crypt appears"; "the safe only opens if you answer the question correctly"; "flip the switch, the lamp turns on and the code written on the wall becomes visible".

## Step by step

### 1. Upload the photos and create the scenes

In the Studio, create a new tour, upload your panoramas and add one scene per space. If you have a lot of photos, the 360 camera importer uploads them in a batch, sorts them and creates all the scenes at once. Give each scene a title that belongs to the story ("Professor Reed's office"), not the file name.

### 2. Draw the route in the graph

In the Graph tab, drag from one scene to another to create the links. Decide which rooms are open from the start and which are locked: the locked ones won't show a visible link until their condition is met.

### 3. Hide the objects

Place **Treasure** hotspots in the scenes: inside a drawer, behind a plant, in the reflection of a window. Swap the icon for something subtle or remove its background, and size it small but still tappable (think of fingers on a tablet). The found counter is what gives players a sense of progress.

### 4. Set the locks

For every locked door, add a **Quiz** hotspot with the gate turned on. The question can be single answer, multiple answer or true/false. Write the prompt as part of the story, and use the feedback field to give a hint after a wrong answer, not just to say "incorrect". You can limit attempts; in an escape room it is usually better to allow unlimited tries and let the clock be the penalty.

### 5. Add switches and conditional doors

A **Counter/state** hotspot lets you create actions that change variables (`set`, `inc`, `dec`, `toggle`). Then, in the **Conditions** of any other hotspot, you make it appear only when the variable has the right value. The classic example: three map pieces hidden as state hotspots (each one adds one to a `pieces` variable and hides itself with its own condition); when `pieces` reaches 3, the link to the final room appears. The treasures from step 3 keep their own count and don't touch variables: they are for collecting, not for opening doors.

### 6. Scatter the clues

**Text** (with Markdown), **Image**, **Audio** and **Video** hotspots are how you leave clues around the scenes: a handwritten note, a voicemail, a video projected on a wall. The **PDF** hotspot works for longer documents, and the **Comparison** hotspot (two images with a slider) is perfect for a before-and-after that hides one difference.

### 7. The final lock and the report

The last scene holds the final quiz. In the tour Settings you set the passing score, turn on the final report and, if you like, the **completion certificate** as a PDF with each participant's name: the "you escaped" they get to keep.

### 8. Test and publish

The Preview tab plays the draft exactly as students will see it. Play it all the way through yourself, then hand it to a colleague who doesn't know the answers and time them. Publish, then share the link or put the QR code up on the board.

## How students join

With the [Classroom plan](/en/classroom/) ($42 a year, five tours) students open the link or scan the QR code, **no account**, no email, no password. That also keeps things simple on the student data privacy side: there is no student roster to store, which makes conversations about FERPA and COPPA much shorter. At the end, each group sees its final report and downloads the PDF certificate, and the result lands in the tour's analytics, where you can download it as a CSV (with the group's name if you turn on the name prompt). On a self-hosted install (the software is open source) nothing is limited by a plan.

If your school runs Moodle, the tour can go inside a course as a SCORM package, which does report the score (Training plan or self-hosted). LTI 1.3 integration exists but is still in testing: the score doesn't flow back to the gradebook on its own yet. We cover the options in [how to put a 360 tour in Moodle](/en/blog/360-tour-in-moodle/).

## Design: what makes it work

- **A hard time limit.** Forty minutes and a timer on the board. Without a limit, the tension disappears.
- **Groups of three or four** with one device per group. One reads, one navigates, one takes notes.
- **Chained puzzles, not parallel ones.** Each answer opens the next room. With everything open from the start, the group scatters.
- **Rescue hints.** Keep two hints per lock ready to give out loud to stuck groups, in exchange for a one-minute penalty. Inside the tour, a **Floating label** hotspot with a vague phrase near the lock works as a gentle hint for everyone.
- **Put the content in the puzzle, not the decoration.** The lock should require the knowledge you want to practice (the formula, the date, the translation), not a generic riddle.
- **Visible rewards.** The treasure counter, the door that appears, the final certificate. Progress has to be seen.

## With or without headsets

The same escape room works in VR headsets (Meta Quest, Pico) by opening the address in the headset's browser: treasures, quizzes and panels respond to your hands inside the session. On any phone, cardboard mode works too. You don't need to buy anything to get started: the whole game plays on the classroom display and on Chromebooks, and headsets are an optional extra layer. We go deeper in [VR in education without buying headsets](/en/blog/vr-in-education/).

Looking for concrete ideas by subject? We have [twelve escape room ideas for the classroom](/en/blog/escape-room-ideas-for-the-classroom/), from history to chemistry.

Ready to build yours? [Create your free teacher account](https://app.andarama.com/register?plan=aula) and have a first room with two locks working before the end of the week.
