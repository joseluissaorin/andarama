---
title: "How to make a virtual tour: a step-by-step guide (2026)"
description: "How to make a 360 virtual tour from scratch: the camera, shooting each room, stitching, linking scenes, adding hotspots, and publishing on your website."
lang: en
slug: how-to-make-a-virtual-tour
cluster: tutoriales
fecha: 2026-09-27
autor: jose-luis-saorin
faq:
  - q: "Can I make a virtual tour with my phone?"
    a: "You can make a rough one with a phone app that stitches a sphere from many photos, but the seams and moving objects show. A consumer 360 camera costs a few hundred dollars, shoots the whole sphere in one click, and saves hours per tour."
  - q: "How long does it take to make a virtual tour?"
    a: "For a home or a classroom building, about 20 minutes of shooting and 30 to 45 minutes of building the tour once you know the tools. The first one takes longer, mostly because of reshoots."
  - q: "How much does virtual tour software cost?"
    a: "From free (open-source tools you host yourself) to a few hundred dollars a month. Andarama is free to self-host, or $2 a month for one hosted tour and $20 a month for ten, with a 14-day free trial."
  - q: "Can people view my tour in a VR headset?"
    a: "Yes, if the viewer supports WebXR. With Andarama the same link opens in the browser of a Meta Quest or in a cardboard viewer on a phone, with nothing to install."
---

Making a **virtual tour** is simpler than it looks. You need a 360 camera (or a way to get 360 photos), a tripod, and software that links the photos into a walkthrough you can publish on a website. This guide goes through the whole process in the order you'll actually do it, with the mistakes that cost us time along the way. We make Andarama, open-source virtual tour software, so the screenshots in our head are from it, but the steps apply to any tool.

> **Want to follow along?** Andarama is free for 14 days with no credit card, then from $20 a month for 10 tours. [Start your free trial](https://app.andarama.com/register?plan=paseo).

## What you need

- **A 360 camera.** An Insta360 X-series or a Ricoh Theta covers almost every use. They shoot the whole sphere in one click and export a single JPG in the equirectangular format (a 2:1 image that looks stretched but wraps into a sphere). We compare models in [the best 360 camera for real estate](/en/blog/best-360-camera-for-real-estate/), and the format itself is explained in [what is an equirectangular image](/en/blog/equirectangular-image/).
- **A thin monopod or light stand.** Thin legs disappear in the stitching; a chunky tripod leaves a blob at your feet.
- **Your phone** to trigger the camera remotely, so you're not in the shot.
- **Virtual tour software.** Cloud platforms, desktop programs or open-source tools; the choice matters mostly for price and for whether you can take your tours with you later. We lay out the options in [Matterport alternatives](/en/blog/matterport-alternatives/).

No 360 camera? A phone app can stitch a sphere from dozens of photos, with visible seams. We cover what works and what doesn't in [360 photos with an iPhone](/en/blog/360-photo-iphone/).

## Step 1: Plan the route

Walk the space first and decide where each photo goes. One photo per room, two in large or L-shaped rooms, one at every doorway where the path branches. A three-bedroom home is 8 to 10 photos; a school building, 20 to 30; a museum gallery, one every few paintings. Sketch the route on paper: the order you shoot in becomes the order the tour follows, and it saves you from missing a room.

## Step 2: Shoot each spot

- **Height**: camera at eye level, about 5 feet. Lower looks like a child's view, higher like a security camera.
- **Position**: in the middle of the room, not in a corner, so viewers see all the walls at a similar distance.
- **Light**: all lights on, blinds open. Use the camera's HDR mode for bright windows.
- **Hide**: trigger from your phone and step behind a door or around a corner.
- **Consistency**: point the same side of the camera in the same direction every time. It makes linking easier later.
- **Check before you leave**: open a couple of shots in the camera app. A reshoot the same day costs minutes; coming back costs a trip.

## Step 3: Export the panoramas

Most 360 cameras save a raw dual-fisheye file that needs stitching. In the camera's desktop or phone app (Insta360 Studio, Ricoh Theta app), export each shot as a **360 JPG at full resolution**, with horizon leveling on. Name them in order (01-entry, 02-living-room) if the app lets you. You can check any of them in our free [360 photo viewer](/en/tools/360-photo-viewer/), which runs in your browser and never uploads the file.

## Step 4: Import and create the scenes

In your tour software, create a project and upload the batch. In Andarama, the importer sorts files by name, lets you rename them by pattern and creates one scene per photo in one go, optionally linked in sequence so you have a working walkthrough from the start. The [getting started guide](https://docs.andarama.com/en/usuario/primeros-pasos/) shows each screen.

## Step 5: Link the scenes

This is what turns a set of photos into a tour. Add a navigation hotspot on each doorway pointing to the next room. In Andarama the tour is drawn as a graph: every scene is a card, every arrow a doorway, and you can drag from one scene to another to connect them. Two details make a big difference:

- **The arrival direction.** When you walk into the kitchen from the hallway, you should be facing into the kitchen, not back at the door. Good tools set this from the path you came in by.
- **The starting view** of each scene: the angle that shows the room at its best.

## Step 6: Add information where it helps

Hotspots are the points viewers can tap. Keep them few and useful:

- **Text** with the facts people look for (square footage, dates, a caption on a painting).
- **Images, video and audio**: a close-up of a detail, a narrated welcome, a video playing on a wall.
- **A floor plan** with the viewer's position, which matters more than any effect in homes and large buildings.
- **Links and a contact form** if the tour should bring you leads.
- **Questions**, if it's for teaching: Andarama has graded quizzes with a passing score and a certificate, scavenger hunts and escape rooms built with gates and variables. More on the [classroom page](/en/classroom/) and, for companies, the [training page](/en/training/).

## Step 7: Publish and embed

Publishing gives you a link, a QR code and an embed code. Paste the link into a listing or an email; print the QR code for a window, a poster or a museum label; paste the embed code into your website, WordPress, Google Sites or your LMS. The details for each platform are in the [embedding docs](https://docs.andarama.com/en/usuario/embeber/). For real estate specifically, including MLS links, see our guide to [real estate virtual tours](/en/blog/real-estate-virtual-tours/) and the [real estate page](/en/real-estate/).

Before you share it, set the link preview (title, description, image): it's what people see first when the link lands in a text message.

## Step 8: Test it in VR and on a phone

Open the tour on a phone and tap through every hotspot. Then, if you have a headset, open the same link in the Meta Quest browser and choose VR mode. With WebXR there's nothing to install, and quizzes and text panels show up inside the headset. The [VR docs](https://docs.andarama.com/en/usuario/realidad-virtual/) cover the controls.

## Step 9: Keep a copy you own

Most people skip this and regret it. Many platforms only show your tour while you pay. Look for software that lets you **export the whole tour** as a website you can host anywhere. Andarama exports a ZIP, a single HTML file or an offline app on every plan, and because it's open source (EUPL-1.2), you can even run the whole thing yourself for free.

## Common mistakes

- Shooting with the camera on a table or the floor.
- Forgetting a room and noticing only when linking.
- Linking scenes so the viewer arrives facing the wall.
- Paragraphs of text in hotspots nobody reads.
- Publishing without testing on a phone.

## How much it costs

A 360 camera costs a few hundred dollars once. Software goes from free (self-hosted) to $2 a month for one hosted tour, $20 a month or $200 a year for ten, and $500 a year for 500 tours with your own brand. All plans and what's included in the trial are on the [pricing page](/en/pricing/).

> **Make your first tour today.** 14 days free, no credit card: import your photos, link them and publish. [Create your account](https://app.andarama.com/register?plan=paseo).
