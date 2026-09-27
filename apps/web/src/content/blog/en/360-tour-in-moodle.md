---
title: "How to put a 360 tour in Moodle (SCORM, iframe and LTI)"
description: "How to add a 360 virtual tour to Moodle or Canvas: embedded on a page with no grade, or as a SCORM package with a grade. Plus where LTI 1.3 stands."
lang: en
slug: 360-tour-in-moodle
cluster: docencia
translationOf: recorrido-360-moodle
fecha: 2026-09-27
autor: jose-luis-saorin
faq:
  - q: "What's the difference between SCORM and LTI for a 360 tour?"
    a: "SCORM is a package you upload to Moodle and it lives there: if you change the tour, you upload it again. LTI is a connection: Moodle opens the tour where it lives, always up to date. In Andarama, LTI 1.3 is in testing and grades don't flow back on their own yet; for grades, use SCORM today."
  - q: "Can I add a tour to Moodle just for viewing, with no grade?"
    a: "Yes. Paste the tour's embed code into a Moodle page or text and media area and it shows up embedded, with full screen and VR. There's no grade, but there's nothing to configure either."
  - q: "Does the quiz grade reach the gradebook?"
    a: "With SCORM, yes: the package reports the score and completion status to the SCORM activity and, with the usual settings, to the gradebook. Through LTI, not yet: it's in testing."
  - q: "Which Andarama plan do I need?"
    a: "On andarama.com, SCORM export is in the Formación plan. On a school's or university's own installation there are no plans: everything is available. Embedding a published tour works on any plan."
---

There are two ready-to-use ways to put a **360 tour in Moodle**, and the choice depends on whether you need a grade: embed the tour on a page with an iframe or a web component (no grade, zero setup), or upload it as a **SCORM package** (grade and completion, but frozen at the moment you export). There's a third, connecting through **LTI 1.3**, which in Andarama is still in testing: an instructor can pick the tour from inside Moodle, but the grade doesn't flow back to the gradebook on its own yet. This guide covers all three, how to set them up and when each one makes sense. The same applies, with small differences, to Canvas, Blackboard and D2L Brightspace.

If you want to follow along with a real tour, [start a free 14-day Formación trial](https://app.andarama.com/register?plan=formacion), no credit card required.

## The options at a glance

| | Embed | SCORM | LTI 1.3 (in testing) |
|---|---|---|---|
| Grade in Moodle | No | Yes (SCORM activity) | Not yet |
| Updates itself | Yes | No (upload again) | Yes |
| Setup | None | None | Once, by the site admin |
| Who can do it | Any instructor | Any instructor | Instructors, once the tool is registered |
| Virtual reality | Yes | Yes, served over HTTPS | Yes |
| Plan on andarama.com | Any | Formación | Pilot, on request |

## Option 1: embed the tour on a page

It's the quickest route and plenty for a virtual field trip without assessment. When you publish a tour, Andarama gives you embed code; paste it into a **Page**, a **Text and media area** or any Moodle HTML editor:

```html
<iframe
  src="https://andarama.com/t/my-tour"
  style="width:100%;aspect-ratio:16/9;border:0"
  allow="fullscreen; gyroscope; accelerometer; xr-spatial-tracking"
  allowfullscreen
  title="My tour"></iframe>
```

The `allow` attribute is what enables full screen, the phone's gyroscope and VR inside the frame. If Moodle cleans the HTML and strips the iframe, ask your admin to allow that tag for the teacher role, or use the web component Andarama also generates (two lines: a `<script>` and `<anda-tour slug="my-tour">`). The details are in [embedding a tour](https://docs.andarama.com/en/usuario/embeber/).

If you publish the tour as **unlisted**, only people with the link can see it; if you **restrict it to domains**, it can only be embedded from your school's Moodle. Either way, students don't need an Andarama account to view it.

## Option 2: SCORM

Today this is the way to get a grade into any LMS, and the right choice if you want the package in your own hands. In the Andarama editor, **Export** offers SCORM 1.2 and SCORM 2004 (3rd edition). The package bundles the viewer, the `tour.json`, the tiles and the media, and reports back to the LMS:

- `completion_status` when the student has visited every scene (or finished the quiz).
- `score.raw`, `score.min` and `score.max`, plus `success_status` based on the passing score set in the tour.

In Moodle:

1. Add a **SCORM package** activity to the course.
2. Upload the exported ZIP.
3. Under Grade, pick the grading method (for example, highest attempt) and which attempt counts.
4. Save. Students open the activity and the tour plays inside Moodle's SCORM player; the quiz grade shows up in the activity report and, with the usual settings, in the gradebook.

In Canvas, the equivalent is importing the package through the SCORM integration your institution has enabled.

A few things to know. First, the package is a **snapshot** of the tour: if you fix a question, you export and upload again. Second, VR inside the package requires Moodle to be served over HTTPS (standard nowadays); otherwise the headset button falls back to cardboard mode. Third, SCORM can't be combined with the single-file HTML export. It's all described in [publishing and exporting](https://docs.andarama.com/en/usuario/publicar/).

## Option 3: LTI 1.3 Advantage (in testing)

It's the integration people ask us about most, so let's be clear: in Andarama it's **in testing**. It's designed as an **LTI 1.3 tool** with two services:

- **Deep Linking**: the instructor clicks "add external tool" in Moodle and picks the tour from a selector, without copying URLs.
- **Assignment and Grade Services (AGS)**: sending the quiz score to the gradebook. This is the part that doesn't work on its own yet: today, grades don't come back to Moodle through LTI.

The underlying advantage is that the tour isn't copied anywhere: Moodle opens it from Andarama, so every change shows up right away. If you need grades now, use SCORM.

### Setup (once, by the admin)

In Moodle, go to Site administration, Plugins, External tool, and "configure a tool manually":

- Tool URL and **Initiate login URL**: `https://your-instance/api/v1/lti/login`
- **Redirection URI**: `https://your-instance/api/v1/lti/launch`
- **JWKS URL**: `https://your-instance/api/v1/lti/jwks`
- Services: enable IMS LTI Assignment and Grade Services and Deep Linking.

In Andarama, the instance admin registers the platform (Admin panel, LTI tab) with Moodle's Issuer, the Client ID, the Auth URL (`/mod/lti/auth.php`), the Token URL (`/mod/lti/token.php`) and the JWKS (`/mod/lti/certs.php`). On a self-hosted install, whoever runs Andarama does this; on andarama.com, if you'd like to join the pilot, get in touch through the [training page](/en/training/) with your LMS details. The exact steps are in the [teaching documentation](https://docs.andarama.com/en/usuario/docencia/).

### Use (each instructor)

1. In the course, choose "Add an activity", **External tool**, then Andarama.
2. Click "Select content" and pick the tour in the selector (Deep Linking), or set it by hand with the `custom.tour = slug` parameter.
3. Save. The activity appears in the course and opens the tour.

While the integration is in testing, don't count on the quiz grade reaching Moodle this way.

## Which one to choose

- **Virtual field trip, museum visit, campus tour, no grade**: embed. Five minutes. We collect ideas in [virtual field trips](/en/blog/virtual-field-trips/).
- **Graded training on any LMS, or when the material has to live inside Moodle** (audits, corporate compliance): SCORM.
- **A university or district with its own Moodle and many instructors**: SCORM for anything graded, embedding for everything else; and, if you're interested, an LTI pilot without depending on it for grades.

Many schools use both: the same tour embedded on the welcome page and as SCORM in the course. The same goes for game-based activities like a [digital escape room](/en/blog/digital-escape-room/), where the quiz gates hold students in a scene until they get it right, and for headset sessions from our guide to [VR in education](/en/blog/vr-in-education/).

## What you need in Andarama

- On **andarama.com**, SCORM export is in the Formación plan ($99 a month or $990 a year, with 100 tours, 200 GB, white label and a custom domain). Embedding a published tour works on any plan.
- On a **self-hosted install** (Docker, your school's Cloudflare account or the desktop app) there are no plans: SCORM is simply there, and so is the LTI integration in testing. It's the natural choice for a university with a technical team, and the software is open source (EUPL-1.2).

## Common errors

- **The iframe disappears when you save the page.** Moodle's HTML filter removed it. Fix: role permissions or the web component.
- **The SCORM package opens but doesn't send a grade.** Check that the tour has at least one quiz and a passing score set; without it there's no `success_status` to report.
- **In the headset, VR won't start from Moodle.** The iframe is missing `allow="xr-spatial-tracking"`, or the site is served over `http`.

Ready to try it with your own course? [Open a free trial](https://app.andarama.com/register?plan=formacion) and export your first SCORM package today.
