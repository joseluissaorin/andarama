---
title: "How to take a 360 photo with an iPhone (and share it)"
description: "The iPhone's Pano mode doesn't take a full 360 photo. The three real ways to get one, how to view it on your iPhone and how to share it with a link."
lang: en
slug: 360-photo-iphone
cluster: herramientas
translationOf: foto-360-iphone
fecha: 2026-09-27
autor: jose-luis-saorin
faq:
  - q: "Can the built-in iPhone camera take 360 photos?"
    a: "Not really. Pano mode captures a very wide horizontal sweep, but it doesn't cover the sky or the ground and doesn't produce a full sphere. For a true 360 photo you need a spherical panorama app or a 360 camera controlled from your iPhone."
  - q: "Why does my 360 photo look flat and stretched in the Photos app?"
    a: "Because Photos shows it as a regular image. The photo is in equirectangular projection and needs a 360 viewer to wrap it; in Safari on your iPhone you can use Andarama's free viewer."
  - q: "What's the best 360 camera to use with an iPhone?"
    a: "Any of the ones controlled from a companion app (Insta360 X4 and X5, Ricoh Theta). You trigger them from the iPhone, they stitch the sphere on their own and save the equirectangular photo to your camera roll."
  - q: "How do I share a 360 photo from my iPhone with a link?"
    a: "By uploading it to a service that publishes it in 360. With Andarama you upload it from Safari on your iPhone and get an address, a QR code and the code to embed it on a website."
---

The iPhone can't take a full **360 photo** with its built-in camera: Pano mode produces a very wide horizontal sweep that covers neither the sky nor the ground, and that no 360 viewer can fully wrap. To get a true sphere there are three routes, from lowest to highest quality: a spherical panorama app that stitches many photos taken while turning in place, a 360 camera you trigger from your iPhone, or stitching photos shot with a wide-angle lens. Then, to view and share it, the photo has to go through a viewer or a service that publishes it in 360.

## What Pano mode does (and doesn't) do

Pano mode in the Camera app sweeps horizontally up to about 240 degrees and gives you a very wide image: a **cylindrical** panorama. It's great for a landscape, but it isn't a 360 photo:

- The sky and the ground are missing (it doesn't cover the full 180 degrees vertically).
- It almost never closes the full 360-degree circle.
- The ratio isn't 2:1, so 360 viewers open it with a black band at the top and bottom, or distort it.

A full 360 photo is **equirectangular**: 360 degrees across, 180 degrees top to bottom, an exact 2:1 ratio. We explain it in [what an equirectangular image is](/en/blog/equirectangular-image/).

## Option 1: a spherical panorama app

There are iPhone apps that guide you to turn in place while aiming at a grid of dots, take dozens of photos and stitch them into a sphere. For years the best known was Google's Street View app, which Google retired in 2023; today there are third-party apps built on the same idea (search the App Store for "360 panorama").

Tips for good results:

- Turn **around the camera, not around yourself**: keep the iPhone at the same point in space and move your body around it. It's the opposite of what feels natural, and it prevents most stitching errors.
- Shoot **still scenes with even light**: people walking by, cars or fast clouds come out sliced.
- Look for places with **distant objects**: parallax errors (doubled seams) get worse when things are close.

It's free or nearly free, but the result has visible seams, a nadir (the spot straight down) that usually looks messy, and limited resolution. It's fine for trying things out and for social media; it isn't good enough for a professional tour.

## Option 2: a 360 camera controlled from your iPhone (our pick)

This is the route that gives you clean equirectangular photos with a single tap:

1. Pair the camera (Insta360 X4 or X5, Ricoh Theta, GoPro Max) with its app on your iPhone over Wi-Fi or Bluetooth.
2. Put the camera on a monopod or tripod, step away (otherwise you'll be in the shot too) and trigger it from your iPhone.
3. The app stitches the two lenses and saves an equirectangular photo to your camera roll, with the metadata that marks it as a panorama.

Current mid-range cameras deliver 8K photos (8192 × 4096), enough for headsets and for tours with zoom. High-end Theta models add RAW and larger sensors, with better results in dark interiors. We have a guide to [the best 360 camera for real estate](/en/blog/best-360-camera-for-real-estate/) that works for any use.

## Option 3: manual stitching

For maximum quality: photos taken with the iPhone (or a DSLR or mirrorless camera) on a panoramic head, stitched afterwards in desktop software such as PTGui or Hugin. It gives you panoramas of tens of megapixels, but it requires a head that rotates the camera around its entrance pupil and a fair amount of patience. It isn't a phone workflow.

## How to view a 360 photo on your iPhone

The Photos app shows the equirectangular image **flat**: sky and ground stretched, lines curved. It isn't broken; it just needs a viewer. Your options:

- **Andarama's 360 viewer in Safari**: open the [free online 360 photo viewer](/en/tools/360-photo-viewer/), choose the photo from your camera roll and look around by dragging or by moving your iPhone. Nothing is uploaded; it's drawn on the phone itself. Safari asks for motion permission the first time.
- **The camera's app** (Insta360, Theta): it has its own viewer, with the photo already in 360.
- **A cardboard viewer**: the same Andarama viewer offers cardboard mode on any phone, with a split screen and the gyroscope.

If you also want to look at your photos on a bigger screen, see [how to view 360 photos on a PC or Mac](/en/blog/view-360-photos-on-pc/).

## How to share a 360 photo from your iPhone

This is where viewing and sharing part ways. For someone else to see it in 360 from a link, the photo has to be **published** somewhere that knows how to wrap it:

| Where | What you get | Limits |
|---|---|---|
| Facebook | A post you can look around in 360, if the photo has the metadata | Only inside Facebook |
| The camera's app (Insta360, Theta) | A link on the manufacturer's own platform | Depends on their service and their branding |
| Andarama | Your own address, a QR code, embedding on any website and, if you want, several connected photos | 14-day free trial; then from $2 a month, or free if you self-host |

With Andarama, the process from an iPhone is: open the Studio in Safari (you can add it to your Home Screen like an app), create a tour, upload the photo (your browser slices it into tiles) and tap Publish. You get the `/t/your-slug` address, the QR code and the embed code, and the preview card that shows up when you paste the link into iMessage, Slack or any chat displays the actual view from the photo. It's all described step by step in [publishing and sharing](https://docs.andarama.com/en/usuario/publicar/).

If instead of one photo you have ten (a house, a store, a classroom), the next step is to connect them with arrows so visitors can move from one to the next: the 360 camera importer uploads the whole batch, sorts it and creates all the scenes at once. You can [try it free for 14 days](https://app.andarama.com/register?plan=paseo), no credit card required.

## Common mistakes

- **The photo has a black band at the top and bottom.** It's a cylindrical panorama from Pano mode, not a sphere. Retake it with a spherical app or a 360 camera.
- **Doubled seams.** Parallax: the camera moved while you turned. Turn around the phone, not around your body.
- **There's a hole or a smudge on the ground.** That's the nadir, the spot no method captures well. A logo patch (Andarama applies one in the media library) or a quick retouch fixes it.
- **Facebook posts it as a regular photo.** It's missing the XMP GPano metadata, which usually happens after editing it in an app that strips it. 360 cameras always write it.
