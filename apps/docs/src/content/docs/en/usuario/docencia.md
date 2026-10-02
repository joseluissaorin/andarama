---
title: "Teaching: quiz, SCORM and LTI"
description: Quizzes with a passing score, final report and certificate, treasure hunts, variables, and how to get grades into your LMS.
---

Andarama can turn a tour into a classroom activity: graded questions, objects
to find, doors that open once students solve something. Students do not need
an account. They play from the link, embedded in your LMS (Moodle, Canvas,
Google Classroom as a link) or from an exported package.

## Quizzes

- Each **quiz** hotspot holds **one or more questions**: prompt, type (single
  choice, multiple choice or true/false), options, feedback and points for
  each, plus the marker's attempts (0 = unlimited). The **Add question**
  button adds another one to the same marker; each question can be collapsed,
  duplicated, moved up or down, or deleted. Visitors answer them one at a time
  ("Question 2 of 5") and see how many they got right at the end. You can also
  spread markers across a scene or the whole tour: the final report adds up
  every question.
- The **gate** (**Gate (cannot advance without correct answer)**) keeps the
  visitor in the scene until they pass the marker's quiz: every question
  right or, if a **Pass mark (%)** is set, that share of its points. Exits
  look dimmed, and clicking one opens the quiz with the prompt "Answer
  correctly to move on". A wrong answer never opens the gate while attempts
  remain; with limited attempts, using them all up on every question of the
  marker does let the student leave, though those questions count as wrong in
  the grade. If a scene has several gated markers, students have to pass all
  of them.
- Under **Tour settings › Quizzes**:
  - **Passing score (%)**.
  - **Final report**: once every question in the tour is answered, a summary
    with the score and whether the student passed.
  - **Completion certificate**: from the report, students who pass type their
    name and download a PDF.
  - **Ask for the name when sending the result**: the viewer asks for the
    student's name before sending it.

When every question in the published tour has been answered, each visitor's
result (score, pass or fail and, if you ask for it, their name) is sent to the
server, and you can download it as a CSV from **Analytics › Quiz results**.
There is no class code or grouping by section: each submission is one row.
Exported packages send nothing. To get the grade into your LMS gradebook, use
the [SCORM package](#scorm-grades-in-your-lms).

A note on student data privacy: students play without an account, and the name
typed for the certificate is used to build the PDF in the browser; if you
turn on the name prompt, the name also travels with the quiz result. Tour
analytics are cookieless and anonymous. This is a description of how the
product works, not a FERPA or COPPA compliance statement; check with your
district's policies.

## Treasure hunt

Place **Treasure** hotspots in any scenes you like and the viewer keeps count
of how many have been found. Each treasure can show a message when found, and
under **Tour settings › Treasure hunt** you set the game's title and the
completion message. Treasures look like a gem; to really hide one, change its
icon or remove the round background under "Style".

Each treasure can carry a **Hint**. While a scene still has treasures to find,
the counter at the top offers a **Hint** button that shows the hint for the
next one, without giving away where it is. Once all of them are found, the
counter says so with the game's completion message and stays on screen.

A treasure can also have a **gate** (nobody leaves the scene until it is
found; trying to leave shows its hint). Forms have the same option.

## Variables and escape rooms

**Counter / state** hotspots change the tour's variables, and the
**conditions** on any hotspot read them: doors that open once you find a key,
paths that depend on what you did, switching from day to night. Combine that
with treasures and gated quizzes and you have a full escape room.

- [Variables, counter and polygon](/docs/en/usuario/variables/): how they
  work, with a locked-door example.
- [How to make an escape room](/docs/en/usuario/escape-room/): step by step,
  with a three-room example.

Narration in a scene can also **block navigation** until it ends (useful for
guided lab walkthroughs).

## SCORM: grades in your LMS

To send the grade to Moodle, Canvas, Blackboard or any SCORM-compatible LMS,
export the tour as a **SCORM 1.2 or 2004 (3rd edition) package**. The package
reports:

- `completion_status` once every scene has been visited or every question
  answered.
- `score.raw`, `score.min` and `score.max`, plus `success_status` based on the
  passing score you set.

On andarama.com, SCORM export is part of the Formación plan; on a self-hosted
install it is always available. It does not work combined with "Single HTML
file". Export options are covered in
[Export](/docs/en/usuario/exportar/), and the Moodle steps in
[Add to Moodle](/docs/en/usuario/moodle/).

## LTI 1.3

Andarama is an LTI 1.3 Advantage tool with **Deep Linking** (teachers pick the
tour from inside Moodle) and **Assignment and Grade Services** (the quiz grade
goes back to the gradebook on its own). The tour is not copied into Moodle:
when you republish, the course sees the new version. It has been tested end to
end with Moodle 4.5 LTS.

The organization admin sets it up under **Organisation settings → LTI: Moodle
and other LMSs** (on andarama.com this needs a plan that includes LTI, such as
Formación); the instance operator can also register platforms from
**Administration → LTI**. Each platform belongs to one organization: Deep
Linking only offers that organization's published tours, and launches with a
different `deployment_id` are rejected. The full steps are in
[Add to Moodle](/docs/en/usuario/moodle/#5-lti-13).

## No grade needed: link or iframe

For a virtual field trip with no assessment, just paste the link or the embed
code into a course page: see [Embed a tour](/docs/en/usuario/embeber/). For a
live class, you can lead the group through the tour with a
[guided tour over Meet or Teams](/docs/en/usuario/en-vivo/).
