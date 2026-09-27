=== Andarama 360 Virtual Tours ===
Contributors: andarama, joseluissaorin
Tags: virtual tour, 360, panorama, vr, real estate
Requires at least: 6.0
Tested up to: 6.8
Requires PHP: 7.4
Stable tag: 1.0.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Embed 360 virtual tours in WordPress with a block, a shortcode or by pasting a URL. Open-source panorama viewer with VR, hotspots and quizzes.

== Description ==

**Andarama 360 Virtual Tours** is the easiest way to embed a 360 virtual tour in WordPress. Paste the URL of a tour published on [andarama.com](https://andarama.com/) (or on your own self-hosted Andarama instance) and the plugin renders a responsive, accessible panorama viewer inside your post, page, widget or page-builder layout.

[Andarama](https://andarama.com/) is an **open-source 360 virtual tour** platform (EUPL-1.2). You create the tour in a visual editor from 360 photos: scenes, hotspots, info panels, quizzes, multilingual text, VR mode and more. This plugin takes care of the **virtual tour embed** on the WordPress side.

= Three ways to embed a tour =

* **Block**: add the "Andarama 360 Tour" block, paste the tour URL, choose the aspect ratio and height. You get a live preview in the editor.
* **Paste the URL**: drop the tour URL in an empty paragraph, in the block editor or in the Classic Editor. WordPress turns it into the viewer automatically (oEmbed-style handler).
* **Shortcode**: `[andarama url="https://andarama.com/t/my-tour" height="480" ratio="16/9"]` works anywhere shortcodes do: Classic Editor, widgets, Elementor, Divi, WPBakery, Beaver Builder, Bricks, custom templates.

= What the viewer supports =

* **360 panorama viewer** built on WebGL, with gyroscope control on phones.
* **VR mode** (WebXR) with headsets such as Meta Quest. The plugin sets the `allow` permissions the iframe needs (`fullscreen; gyroscope; accelerometer; xr-spatial-tracking`).
* Fullscreen, lazy loading, responsive aspect ratio (16:9, 4:3, 21:9, 1:1 or a fixed height).
* Accessible: descriptive iframe title, keyboard navigation in the viewer.
* Works with hotspots, info panels, audio, video, quizzes and multilingual tours created in Andarama.

= Self-hosted instances =

Andarama is open source. If you run your own instance, add its domain under **Settings → Andarama** and tours from that host will be embedded just like those on andarama.com. Only tours hosted on the domains you allow are ever embedded.

= Typical uses =

Real estate listings, hotels and holiday rentals, museums and heritage sites, schools and universities (campus tours, LTI and SCORM are supported by Andarama), restaurants, showrooms, construction progress, event venues.

= Privacy =

The plugin embeds an iframe that loads the tour from the instance you indicate (andarama.com by default). Your visitors' browsers therefore request content from that server. Andarama does not use cookies in published tours and its visitor analytics do not store IP addresses. See the Privacy section below and the [Andarama privacy policy](https://andarama.com/privacidad).

== Installation ==

1. Upload the `andarama-360` folder to `/wp-content/plugins/`, or install it from **Plugins → Add New** by searching "Andarama".
2. Activate the plugin.
3. Optional: go to **Settings → Andarama** to add the domain of your own Andarama instance, set the default height and aspect ratio, or hide the "Create yours with Andarama" link.
4. Add the "Andarama 360 Tour" block, paste a tour URL, or use the shortcode.

== Frequently Asked Questions ==

= Do I need an Andarama account? =

You need a published tour to embed. Tours can be published on andarama.com (free plan available) or on your own Andarama instance, which needs no account with us at all: Andarama is open source and you can host it yourself.

= Is it free? =

The plugin is free and open source (GPL). Hosting on andarama.com has a free plan and paid plans starting at 2 $ per month. Self-hosting is free.

= Does it work with Elementor, Divi or other page builders? =

Yes. Use the shortcode in any text, HTML or shortcode widget: `[andarama url="https://andarama.com/t/my-tour"]`. Most builders also render the Gutenberg block when you use it inside a WordPress block area.

= Which shortcode attributes are available? =

* `url` (required): public URL of the tour, `https://instance/t/slug`.
* `height`: height in pixels, used when there is no aspect ratio (default from settings, 480).
* `ratio`: `16/9`, `4/3`, `21/9`, `1/1` or `none` for a fixed height (default from settings).
* `title`: accessible title of the iframe (default "360 virtual tour").
* `badge`: `yes` or `no` to show or hide the "Create yours with Andarama" link for this tour only.

= Does VR mode work inside WordPress? =

Yes, as long as your site is served over HTTPS. The plugin adds the `xr-spatial-tracking` permission that WebXR needs inside an iframe.

= The tour does not show up. =

Check that the URL has the form `https://andarama.com/t/your-slug` and that the tour is published. If it lives on your own instance, add that domain under Settings → Andarama. If the tour is published with the "Domains" visibility, make sure your WordPress domain is on its allowed list in the Andarama editor.

= Can I hide the "Create yours with Andarama" link? =

Yes, in Settings → Andarama, or per tour with `badge="no"`. We would love it if you kept it: it is how other people discover the free software behind the tour.

== Screenshots ==

1. The "Andarama 360 Tour" block with a live preview in the editor.
2. Block settings: URL, aspect ratio, height and accessible title.
3. A tour embedded in a post, with VR and fullscreen controls.
4. Settings → Andarama: allowed instances, defaults and the Andarama link.
5. The Andarama editor where tours are created (andarama.com).

== Privacy ==

* This plugin does not collect, store or send any personal data from your site and it does not set cookies.
* Each embedded tour is an `<iframe>` that loads from the Andarama instance you configure (andarama.com by default). The visitor's browser sends the usual HTTP request data (IP address, user agent, referrer) to that server, as with any embedded content.
* Andarama published tours do not use cookies. Its visitor analytics are aggregated and do not store IP addresses. Details: https://andarama.com/privacidad
* If you self-host Andarama, nothing leaves your infrastructure.

== Changelog ==

= 1.0.0 =
* First release: block, shortcode, URL paste (embed handler), settings page, Spanish translation.

== Upgrade Notice ==

= 1.0.0 =
First release.
