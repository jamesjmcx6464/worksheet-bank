# Worksheet Bank (static site)

Colour, label and write worksheets for ages 6-8. Open `index.html` (the home menu). Every worksheet is one
self-contained HTML file (picture embedded), so the folder works offline, from a USB stick, or on any static host
(Netlify, Cloudflare Pages, GitHub Pages, itch.io as an HTML game). No build step; all links are relative.

The picture is on top (about one screen, with colours and tools under it). Scroll down to write. Work is saved
automatically in the browser (localStorage), per worksheet. Save / Print gives a portrait sheet (one page when it
fits, otherwise two).

`version.json` is a build stamp used to confirm a live deploy. Regenerate from the project folder with
`./clean_and_build.sh` (see the project README).
