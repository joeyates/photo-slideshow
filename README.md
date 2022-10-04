# photo-slideshow

A photo slideshow presenter.

* frontend only, you create the JSON file that lists images
  and configures the slideshow,
* HTML, CSS and pure JS.

# Setup

Create a JSON file like this:

```json
{
  "images": [
    {"url": "https://example.com/image.jpg"}
  ],
  "timeout": 5000
}
```

Open photo-slideshow with the JSON file's URL as
a parameter: `https://example.com/photo-slideshow/index.html?json=slides.json`

# Features

* shows photos in a loop,
* configurable wait time between changes,
* controllable via keybindings.

# Keybindings

* "c" - toggle caption (filename) visibility,
* "l" - get the list of noted photos (see "n"),
* "n" - take note of a photo,
* "r" - reset the list of noted photos (see "n"),
* "<del>" - remove a photo from the list,
* "<spacebar>" - pause,
* "←" - go back,
* "→" - go forwards,
* "-" - slow down slide changes,
" "+" - speed up slide changes.

# Development

npx static-server

http://localhost:9080
