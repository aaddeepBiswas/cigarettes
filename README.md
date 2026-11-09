# Slow Burn

An interactive, cinematic cigarette and smoke animation. Plain HTML, CSS and JavaScript, with no libraries and no image files: the cigarette, smoke, ember, ash and sound are all generated in code.

## Controls
| | Desktop | Phone / tablet |
|---|---|---|
| Draw (ember brightens) | Hold the mouse button or Space | Press and hold |
| Exhale a plume of smoke | Release | Lift your finger |
| Flick the ash | Click the ash, or press F | Tap the ash |
| Stir the smoke | Move the cursor | Drag |
| Light another | N or the button | The button |
| Sound on / off | M or the button | The button |

Sound is synthesised in the browser and starts off. Browsers only allow audio after a tap or key press.

## Put it online (GitHub Pages)
1. Create a repository and upload `index.html`, `style.css`, `script.js` and `README.md`.
2. **Settings → Pages**: deploy from the `main` branch, `/ (root)`.
3. Open `https://<your-username>.github.io/<repo-name>/`.

You can also just double-click `index.html`. The headline fonts load from Google Fonts and fall back to system serif and sans-serif when offline.

## How the smoke works
Each puff is a soft sprite pushed by buoyancy, drag and a curl-noise flow field, so it stays smooth and swirls instead of jittering. Smoke starts as a thin laminar column and turns turbulent as it rises. The cursor adds wind, and a long draw produces a larger exhale.

*Smoking harms nearly every organ in the body. This project is an animation study, not encouragement.*
