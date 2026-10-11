---
title: "Andarama vs ThingLink: two ways to bring 360 into the classroom"
description: "ThingLink makes any image interactive for $108 a year per teacher. Andarama, open source and focused on 360 tours, is $42 a year on the Classroom plan."
lang: en
slug: andarama-vs-thinglink
cluster: competidores
translationOf: andarama-vs-thinglink
fecha: 2026-10-11
autor: jose-luis-saorin
plantilla: vs
competidor: thinglink
faq:
  - q: "How much does ThingLink cost for a teacher in 2026?"
    a: "The Teacher license is $9 a month billed annually ($108 a year), with 5,000 views and up to 25 shared 360 images. School plans are custom priced. Checked on ThingLink's pricing page on 11 October 2026."
  - q: "Do students need an account?"
    a: "On ThingLink, student accounts are created by the teacher or the school and are not free. On Andarama, students open the link without an account, including to answer quizzes and play escape rooms."
  - q: "Can both be viewed with a VR headset?"
    a: "Yes. ThingLink has apps for Meta Quest, PICO, HTC VIVE and ClassVR. Andarama runs in the headset's browser with WebXR, with nothing to install, and on phones it has a cardboard mode with gaze selection."
  - q: "Can I install ThingLink or Andarama on my school's server?"
    a: "Andarama, yes, for free: it is open source (EUPL-1.2) and installs with Docker, on a Cloudflare account or as a desktop app. ThingLink lists private cloud or on-premises options only on its Enterprise plan, with custom pricing."
---

ThingLink is probably the most widely used interactive image tool in schools: you upload a photo, a video or a 360 panorama, add tags with text, audio or links, and share it with the class. Many teachers come to Andarama from there, usually with a specific question: "can I use this for a virtual field trip with questions?". The short answer is that both work, but not for the same thing. Full disclosure: Andarama is ours, so we'll also say where ThingLink wins.

> **Andarama's [Classroom plan](/en/classroom/) is $42 a year per teacher, and students need no account.** [Start your free 14-day trial, no credit card](https://app.andarama.com/register?plan=aula).

## What each one is

**ThingLink** is a Finnish cloud platform for creating interactive materials: images, videos, 360 panoramas, 3D models and branching scenarios with its Scenario Builder. 360 is one of its features, not the only one. It has AI tools (which can be switched off), automatic translation on the higher plans, Immersive Reader, and apps for phones, tablets and headsets.

**Andarama** is open-source software (EUPL-1.2 license) specialised in 360 virtual tours: several linked scenes, a floor plan, content anchored in each room and graded activities. You can use it two ways: install it yourself for free, or let us host it at andarama.com. It's the same app either way.

## Prices, checked

ThingLink, checked on [its pricing pages](https://www.thinglink.com/plans/edu) on 11 October 2026:

- **Teacher**: $9 a month billed annually, so $108 a year. One teacher, 5,000 embedded content views and up to 25 shared 360 images. 30-day free trial; afterwards you can keep creating but not share.
- **Essential, Enhanced and Staff Training** (schools and districts): custom pricing. 360 video, automatic translation, single sign-on and LTI come with Enhanced.
- **Higher education**: Department from $4,250 a year (up to 20 creators) and College from $8,500 a year (up to 75, with LTI 1.3).
- **Business**: Create Starter or Create XR, €57 a month billed annually or €86 a month, with 250 views a month.

Andarama:

- **Self-hosted**: $0. The whole program, on your computer or your school's server, with no tour limit.
- **Aula** (classroom): $42 a year per teacher, with 5 tours and 10 GB. Students need no account.
- **Formación** (training): $99 a month or $990 a year, with SCORM, LTI 1.3, white label and invoices in euros for institutions.
- For other uses, **Andar** ($2 a month, one tour) and **Paseo** ($20 a month, ten tours). All on [the pricing page](/en/pricing/).

The honest reading: for a teacher working alone, Andarama Aula costs less than half of ThingLink Teacher and doesn't count views. But ThingLink Teacher covers much more than 360. If most of what you make is infographics or tagged photos, price is not the comparison that matters.

## What each one does best

ThingLink wins on breadth. Any image becomes interactive in a minute, the editor is very easy for students (who can create too), and its integrations with Google Classroom, Teams, Canvas or Moodle are mature. Immersive Reader, which reads tag text aloud and translates it into dozens of languages, is real support for struggling readers and newcomers.

Andarama wins on depth within 360. A tour has many linked scenes with a floor plan and an arrival view in each room that depends on the path you came by. Content is anchored where it belongs: text, image, gallery, video projected on a wall, spatial audio, PDF, 3D model, before-and-after slider. And for the classroom it ships graded quizzes with a passing score and attempts, a report and PDF certificate, treasure hunts, escape rooms with gates, and live guided tours in which the class follows the teacher from their own browser.

## Virtual reality

ThingLink publishes apps for Meta Quest, PICO, HTC VIVE and ClassVR, the headset platform many schools already own.

Andarama needs no app: the tour opens in the headset's browser and you press **VR mode** (WebXR). It works with controllers and with hands, and text, image, gallery, video, audio and quiz panels are drawn inside the headset, so an activity with questions can be finished without taking it off. What can't be composed in the immersive session (a PDF, a YouTube video, a form, a web page or a 3D model) is parked and opened when you leave. On phones there is a cardboard mode with split screen and gaze selection, for viewers that cost a few euros.

## Accessibility

ThingLink states WCAG 2.2 AA conformance, with screen reader support and Immersive Reader.

Andarama declares itself **partially conformant** with WCAG 2.1 AA, based on a self-assessment dated 27 September 2026 that we publish together with what's missing. It can be fully operated by keyboard, each scene has alt text (the editor warns when it's missing and can suggest one), there are WebVTT captions and an accessible version that turns the whole tour into linear text, useful with a screen reader. Here ThingLink is ahead on certification and reading support.

## Privacy and GDPR

ThingLink is a European company (Thinglink Oy, Finland), ISO 27001 certified, and acts as data processor when a school contracts it. Its top higher-education plan offers regional hosting options.

Andarama's visitor analytics use no cookies and store no IP addresses. And if the school installs it on its own server, the data never leaves it: no third parties in the way, beyond the services the institution chooses to enable. For many data protection officers, that is the difference that counts.

## Self-hosting, export and open source

ThingLink is proprietary cloud software. We found no download of your material as a package to host elsewhere on its pricing pages, and on-premises installation appears only on the business Enterprise plan.

Andarama can be installed for free with Docker, on a Cloudflare account or as a desktop app, and the code is on [GitHub](https://github.com/joseluissaorin/andarama). Any tour also exports as a static ZIP that works on any hosting, as a single HTML file for a USB stick, as an offline app or, on the Training plan or a self-hosted install, as a SCORM package for your LMS. If Andarama disappeared tomorrow, the tours would keep working.

## So, which one?

- **ThingLink**, if you want one tool to make almost any material interactive (photos, infographics, videos, some 360), if your students will create as well as view, if your school already has ClassVR, or if Immersive Reader matters for your group.
- **Andarama**, if your thing is tours of real places with several scenes, you want graded activities that reach your LMS, you'd rather students didn't need accounts, or your school needs the software and the data in-house. If you're weighing other options too, see our list of [Matterport alternatives](/en/blog/matterport-alternatives/).

They're not mutually exclusive: some teachers use ThingLink day to day and Andarama for the term's virtual field trip. Both can be tried for free, ThingLink for 30 days and Andarama for 14 or, installed, with no expiry.

> **Try the Classroom plan**: one full tour with quizzes, escape room and VR, free for 14 days with no card. [Create your account](https://app.andarama.com/register?plan=aula).
