---
title: "Andarama vs Panoee: a generous free plan vs open source"
description: "Panoee: unlimited free projects with 3 GB, Pro at $22 a month. Andarama: open source, free to self-host, hosted from $2. Prices checked September 2026."
lang: en
slug: andarama-vs-panoee
cluster: competidores
translationOf: andarama-vs-panoee
fecha: 2026-09-27
autor: jose-luis-saorin
plantilla: vs
competidor: panoee
faq:
  - q: "Is Panoee really free?"
    a: "Yes: the free plan gives you unlimited projects with 3 GB of storage, one of the most generous free tiers around. Pro costs $22 a month or $200 a year and adds custom domains, branding and more hotspot types; storage stays at 3 GB unless you buy more."
  - q: "Which is cheaper for a single tour?"
    a: "Panoee Free, if your tour fits in 3 GB and you don't mind the Panoee subdomain. If you want your tour without someone else's branding, Andarama Andar costs $2 a month; and Andarama self-hosted on your own computer costs nothing, with no limit on tours."
  - q: "Which one works for teaching?"
    a: "Andarama: graded quizzes with a PDF certificate, escape rooms built with gates and variables, scavenger hunts, and SCORM 1.2 and 2004 packages for your LMS. Students don't need an account to play. Panoee has no teaching features and no education plan that we know of."
  - q: "Can I export my tours?"
    a: "In Panoee, full export is a one-time fee of $19 per project, according to its documentation. In Andarama, export is included in every plan and in the self-hosted version: static ZIP, single HTML file, PWA, and SCORM on the Formación plan."
---

**Panoee** is a cloud platform for 360 tours with one of the most generous free plans in the industry (unlimited projects with 3 GB) and a modern editor; Pro costs $22 a month or $200 a year. **Andarama** is an open-source program you can self-host for free or use hosted from $2 a month, with export on every plan, WebXR virtual reality and teaching tools. If you're looking for Panoee alternatives or torn between the two, the decision comes down to three questions: how much you care about your tour living in someone else's cloud, whether you need quizzes or an LMS, and how much you want to pay for your second tour.

Andarama is ours, so read this with that in mind. You can [try Andarama free for 14 days](https://app.andarama.com/register?plan=paseo), no credit card required, and compare for yourself.

## What each one is

**Panoee** (based in Vietnam) is a SaaS service: you upload your panoramas, build the tour in its editor, and publish it hosted on Panoee or embedded in your site. Its strengths are the free plan and an editor that's quick to learn, with good hotspots and a viewer that performs well.

**Andarama** is an open-source application (EUPL-1.2) you can use in two ways: self-hosted (desktop app, Docker or your own Cloudflare account), free and with no subscription, or hosted at andarama.com with plans from $2 a month. It's the same application either way.

## Pricing, checked

Panoee's prices, checked on 27 September 2026 on its [pricing page](https://panoee.com/pricing):

- **Free**: $0, unlimited projects, 3 GB of storage, 7 hotspot types, a Panoee subdomain and basic analytics.
- **Pay As You Go**: $7 to $12 a month for 1 to 3 premium projects.
- **Pro**: $22 a month, or **Pro+** at $200 a year. Unlimited premium projects, two custom domains, your own logo and credits, 10+ hotspot types, password protection, floor plans and maps, Google Street View publishing and detailed analytics. Storage is still 3 GB.
- **Enterprise**: $99 a month, or **Enterprise+** at $950 a year, with 20 GB, a white-label domain and user management.
- **Extra storage**: $0.15 per GB per month.
- **Export**: a one-time $19 per project, according to its [export documentation](https://panoee.com/document/export-a-virtual-tour/).

We found no education plan.

Andarama's prices:

- **Self-hosted**: $0, no limit on tours.
- **Andar**: $2 a month, 1 tour, 5 GB.
- **Aula** (classroom): $42 a year, 5 tours, 10 GB, with graded quizzes and escape rooms.
- **Paseo**: $20 a month or $200 a year, 10 tours, 50 GB.
- **Excursión**: $500 a year, 500 tours, 100 GB, no badge and your own domain.
- **Formación** (training): $99 a month or $990 a year, 100 tours, 200 GB, SCORM, white label and your own domain.
- **De por vida** (lifetime): $1,000 once, 1,000 tours, 200 GB.

The full table is on our [pricing page](/en/pricing/).

How to read it: **Panoee wins at the free tier** if you're fine with its subdomain and 3 GB (roughly twenty or thirty 8K photos with their tiles). On the paid side, Panoee Pro+ and Andarama Paseo cost the same per year ($200), but Paseo comes with 50 GB against 3 GB, and Andarama includes export at no extra cost while Panoee charges $19 per project. At the top, Panoee Enterprise+ ($950 a year, 20 GB) and Andarama Formación ($990 a year, 200 GB, SCORM) are close in price and far apart in storage. And for a single tour without anyone else's branding, Andarama Andar ($2 a month) has no equivalent at Panoee.

## Export and lock-in

This is the real difference. In Panoee, your tour lives in its cloud. There is a way out: a full export that downloads the tour with its images so it runs on your own hosting, for a one-time $19 per project. Without paying for it, your tour exists as long as Panoee exists and your account stays active.

In Andarama, export is part of the product on every plan and in the self-hosted version: a static ZIP with the HTML, the viewer and the tiles that runs on any host with nothing behind it; a single HTML file you can open from a USB stick; a PWA for offline viewing; and, on the Formación plan, the SCORM package. The `tour.json` format is documented and versioned. If Andarama disappeared tomorrow, your tours would keep working.

## Editor and viewer

Both editors are good. Panoee's is more linear and probably faster to learn for a first tour. Andarama's has a graph where every arrow is a navigation hotspot, arrival direction per path (walking into a room from the hallway and from the kitchen gives two different views), floor plans per level with a radar, a map mode on OpenStreetMap, version history, comments and live presence when several people edit. Seventeen hotspot types: Markdown text, zoomable images, galleries, video projected onto a wall, spatial audio, PDFs, 3D models, embedded web pages, forms, before-and-after sliders, quizzes, polygons, treasures and state counters. It takes a little longer to learn; it goes a good deal further.

In the viewer, Panoee performs well and looks sharp. Andarama adds projections (little planet, fisheye, Panini), a compass, a floor plan with radar, 360 video with timed hotspots, audio that turns with your head, a text-only accessible version, and a 116 KB compressed bundle with the VR engine included.

## Virtual reality

Both have a VR mode. In Andarama it's full WebXR: open the link in the browser on a Meta Quest, Pico or Vision Pro and your hands appear, joints and all, along with the controllers; text, gallery, video, quiz and slider panels are drawn inside the session. On phones without WebXR, there's a cardboard mode with gaze selection. We weren't able to check how far Panoee's VR mode goes (hands, panels), so the table just says "yes."

## Teaching and training

Panoee isn't built for the classroom and has no education plan. Andarama includes graded quizzes (passing score, final report, PDF certificate of completion), gates that hold students in a scene until they answer correctly, scavenger hunts, escape rooms with variables and conditions, live guided tours (the guide moves, attendees follow in their own browser, voice goes over Meet, Teams or Zoom), and SCORM 1.2 and 2004 packages. Students don't need an account to view or play a tour. LTI 1.3 exists but is still in testing. If you teach or run training, there's no contest; if you don't, skip this section.

## Branding, domain and data

Panoee Pro lets you use your own logo and credits and two custom domains; the white-label domain is on Enterprise. Andarama removes its badge and gives you your own domain on Excursión, Formación and De por vida, and when you self-host there's no badge to remove. Andarama's analytics use no cookies and don't store IP addresses; we couldn't verify Panoee's approach, so that cell stays empty.

## So which one?

- **Panoee**, if you want to start free with several tours, the subdomain doesn't bother you, you won't be teaching, and you don't mind where the tour lives.
- **Andarama**, if you want the program and the tours in your own hands, you're paying for a single tour, you teach or run training, you need SCORM, or you prefer open source you can audit and install.

Both are free to try: Panoee with its free plan, Andarama with a [14-day trial with no card](https://app.andarama.com/register?plan=paseo) or self-hosted, which never expires. If Matterport is on your list too, we've compared [seven Matterport alternatives](/en/blog/matterport-alternatives/), and we've also put Andarama side by side with [Kuula](/en/blog/andarama-vs-kuula/) and with the library it's built on, [Marzipano](/en/blog/marzipano/).
