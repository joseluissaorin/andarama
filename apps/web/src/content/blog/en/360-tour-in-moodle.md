---
title: "How to put a 360 tour in Moodle (SCORM, iframe and LTI)"
description: "How to add a 360 tour to Moodle or Canvas: embedded in a page with no grade, or graded through a SCORM package or LTI 1.3, straight to the gradebook."
lang: en
slug: 360-tour-in-moodle
cluster: docencia
translationOf: recorrido-360-moodle
fecha: 2026-09-27
autor: jose-luis-saorin
faq:
  - q: "What's the difference between SCORM and LTI for a 360 tour?"
    a: "SCORM is a package you upload to Moodle and it lives there: if you change the tour, you upload it again. LTI is a connection: Moodle opens the tour where it lives, always up to date. Both send the quiz grade to the gradebook."
  - q: "Can I add a tour to Moodle just for viewing, with no grade?"
    a: "Yes. Paste the tour's embed code into a Moodle page or text and media area and it shows up embedded, with full screen and VR. There's no grade, but there's nothing to configure either."
  - q: "Does the quiz grade reach the gradebook?"
    a: "With SCORM, yes: the package reports the score and completion status to the SCORM activity and, with the usual settings, to the gradebook. With LTI 1.3, yes too: the grade is written to the Moodle gradebook automatically as soon as the student finishes the quiz."
  - q: "Which Andarama plan do I need?"
    a: "On andarama.com, SCORM export and the LTI 1.3 integration are in the Formación plan. On a school's or university's own installation there are no plans: everything is available. Embedding a published tour works on any plan."
---

There are three ways to put a **360 tour in Moodle**: embed the tour on a page with an iframe or a web component (no grade, zero setup), upload it as a **SCORM package** (grade and completion, but frozen at the moment you export), or connect it through **LTI 1.3** (grade and always up to date, after registering the tool once). This guide covers all three, how to set them up and when each one makes sense. Embedding and SCORM work the same way, with small differences, in Canvas, Blackboard and D2L Brightspace; LTI 1.3 is a standard those platforms support too, but the steps here are Moodle's, which is where we've verified it.

If you want to follow along with a real tour, [start a free 14-day Formación trial](https://app.andarama.com/register?plan=formacion), no credit card required.

## The options at a glance

| | Embed | SCORM | LTI 1.3 |
|---|---|---|---|
| Grade in Moodle | No | Yes (SCORM activity) | Yes (gradebook) |
| Updates itself | Yes | No (upload again) | Yes |
| Setup | None | None | Once, in Moodle and in Andarama |
| Who can do it | Any instructor | Any instructor | Instructors, once the tool is registered |
| Virtual reality | Yes | Yes, served over HTTPS | Yes |
| Plan on andarama.com | Any | Formación | Formación |

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

This is the way to get a grade into any LMS with no setup, and the right choice if you want the package in your own hands. In the Andarama editor, **Export** offers SCORM 1.2 and SCORM 2004 (3rd edition). The package bundles the viewer, the `tour.json`, the tiles and the media, and reports back to the LMS:

- `completion_status` when the student has visited every scene (or finished the quiz).
- `score.raw`, `score.min` and `score.max`, plus `success_status` based on the passing score set in the tour.

In Moodle:

1. Add a **SCORM package** activity to the course.
2. Upload the exported ZIP.
3. Under Grade, pick the grading method (for example, highest attempt) and which attempt counts.
4. Save. Students open the activity and the tour plays inside Moodle's SCORM player; the quiz grade shows up in the activity report and, with the usual settings, in the gradebook.

In Canvas, the equivalent is importing the package through the SCORM integration your institution has enabled.

A few things to know. First, the package is a **snapshot** of the tour: if you fix a question, you export and upload again. Second, VR inside the package requires Moodle to be served over HTTPS (standard nowadays); otherwise the headset button falls back to cardboard mode. Third, SCORM can't be combined with the single-file HTML export. It's all described in [publishing and exporting](https://docs.andarama.com/en/usuario/publicar/).

## Option 3: LTI 1.3

It's the most convenient integration once your Moodle has the tool registered. Andarama works as an **LTI 1.3 Advantage tool** with two services:

- **Deep Linking**: the instructor clicks "Select content" in Moodle and picks the tour from a selector, without copying URLs.
- **Assignment and Grade Services (AGS)**: the quiz score lands in the Moodle gradebook automatically.

The tour isn't copied anywhere: Moodle opens it from Andarama, so when you republish it the course shows the new version right away, with nothing to upload. Students open it inside Moodle and don't need an Andarama account. We've tested it end to end with Moodle 4.5 LTS.

### In Moodle (once, by the site admin)

Go to **Site administration › Plugins › Activity modules › External tool › Manage tools**, "configure a tool manually", with version **LTI 1.3**:

- **Initiate login URL**: `https://your-instance/api/v1/lti/login`
- **Tool URL**, **Redirection URI(s)** and **Content Selection URL**: `https://your-instance/api/v1/lti/launch`
- **Public key type**: "Keyset URL", set to `https://your-instance/api/v1/lti/jwks`
- Tick **Supports Deep Linking (Content-Item Message)**.
- Under Services, **IMS LTI Assignment and Grade Services**: "Use this service for grade sync and column management".
- Under Privacy, **Accept grades from the tool**: "Always".

Once saved, the tool's details in Moodle show the **Platform ID**, **Client ID**, **Deployment ID** and Moodle's three URLs (authentication, access token and public keyset).

### In Andarama (once, by the organisation admin)

In Studio, under **Ajustes de la organización › LTI: Moodle y otros LMS** (organisation settings), register the platform with those details: Platform ID, Client ID, Deployment ID and Moodle's three URLs (`/mod/lti/auth.php`, `/mod/lti/token.php` and `/mod/lti/certs.php`). Your organisation's admin does this without waiting on the instance admin; on a self-hosted install, whoever runs it can do it too.

### Each instructor

1. In the course, choose "Add an activity or resource", **External tool**, then Andarama.
2. Click **Select content** and pick a published tour in the selector. The activity name is filled in with the tour's title.
3. Save. Students open the activity inside Moodle, answer the quiz, and the grade shows up in the gradebook.

Every field is described in the user guide, [Moodle: LTI 1.3](https://docs.andarama.com/usuario/moodle/#5-lti-13).

## Which one to choose

- **Virtual field trip, museum visit, campus tour, no grade**: embed. Five minutes. We collect ideas in [virtual field trips](/en/blog/virtual-field-trips/).
- **Graded, on the Formación plan or a self-hosted install, without re-uploading every time the tour changes**: LTI 1.3.
- **Graded, in any other case** (your LMS doesn't register external tools, or the material has to live inside Moodle, as in audits and corporate compliance): SCORM.

Many schools mix them: the same tour embedded on the welcome page and as SCORM in the course. The same goes for game-based activities like a [digital escape room](/en/blog/digital-escape-room/), where the quiz gates hold students in a scene until they get it right, and for headset sessions from our guide to [VR in education](/en/blog/vr-in-education/).

## What you need in Andarama

- On **andarama.com**, SCORM export and the LTI 1.3 integration are in the Formación plan ($99 a month or $990 a year, with 100 tours, 200 GB, white label and a custom domain). Embedding a published tour works on any plan.
- On a **self-hosted install** (Docker, your school's Cloudflare account or the desktop app) there are no plans: SCORM and LTI 1.3 are simply there. It's the natural choice for a university with a technical team, and the software is open source (EUPL-1.2).

## Common errors

- **The iframe disappears when you save the page.** Moodle's HTML filter removed it. Fix: role permissions or the web component.
- **The SCORM package opens but doesn't send a grade.** Check that the tour has at least one quiz and a passing score set; without it there's no `success_status` to report.
- **LTI: "invalid issuer" or an error on launch.** The Platform ID, Deployment ID or Moodle URLs (auth, token, certs) don't match what's registered in Andarama; usually a stray trailing slash or `http` where it should be `https`.
- **LTI: the tour opens but the grade doesn't arrive.** The Moodle tool is missing Assignment and Grade Services, or "Accept grades from the tool" isn't set to "Always".
- **In the headset, VR won't start from Moodle.** The iframe is missing `allow="xr-spatial-tracking"`, or the site is served over `http`.

Ready to try it with your own course? [Open a free trial](https://app.andarama.com/register?plan=formacion) and export your first SCORM package today.
