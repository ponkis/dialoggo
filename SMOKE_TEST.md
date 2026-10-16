# Dialoggo Smoke Test

Use this checklist before a release, or after changes that touch the window, playback, panels, settings, the asset protocol, or packaging. `npm run test:smoke` covers startup automatically. This list covers the interactive behavior.

## Build

```bash
npm run verify
npm run package
```

Test the packaged app from `release/` (on Windows, run the `-setup.exe` installer or `win-unpacked/Dialoggo.exe`).

## Launch and window

- The loading animation plays, then the jiggy iris-out reveals the app with its sound.
- The footer shows the right version, `149 chars / 3 packs` (or the current counts), and the ponkis link.
- Minimize works. Close plays the reverse iris and sound, then quits.
- Launching a second copy focuses the existing window instead of opening another.
- Production builds ignore <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>I</kbd>. Development builds open DevTools.

## Characters

- Hovering a card animates its idle blink. Clicking selects it, plays the select sound and a voice clip, and adds it to **Recent**.
- Search filters the reel. Esc and the clear button reset it. A search with no results shows the empty message.
- Reel arrows and drag scrolling work, and a drag doesn't select a card.
- Right-click → favorite/hide works. The visualizer alert appears, and the **Favorites** and **Hidden** packs update. The Hidden pack collapses and expands.
- Unavailable characters show the warning badge and play the "forbidden" sound.

## Dialogue playback

- Play stays disabled until a character is selected and text is entered.
- `**shake**`, `_italic_`, and `~~strike~~` highlight in the input and render in the box. The format toolbar appears when text is selected.
- Playback opens the box, types with voice clips, wraps long text, and scrolls after two lines.
- Pause/resume, Stop, and holding Fast forward (button or <kbd>Shift</kbd>+<kbd>Space</kbd>) behave correctly. <kbd>Space</kbd> toggles play/pause and <kbd>Ctrl</kbd>+<kbd>Space</kbd> stops.
- While playing, the input is locked and the settings, guide, character, and export tabs are blocked.

## Backgrounds

- The Backgrounds tab flips the card. Pack arrows and scroll arrows work.
- Selecting a background cross-fades the preview and shows the title banner. Selecting it again clears it.
- The selection, favorites, and hidden items survive a restart.

## Settings and guide

- Settings and Guide collapse the preview into a strip (or dim it on tall screens) and restore it when closed.
- Mirror mode and N64 mode apply immediately, including during playback, and persist.
- Turning off the shortcut visualizer hides the overlay and alerts.
- The "hide broken" toggles hide unavailable characters and backgrounds.
- Guide screenshots open in the image viewer, which also opens with Enter or Space.

## Install and uninstall (Windows)

- The installer lets you choose the install directory and creates Start menu and desktop shortcuts.
- The uninstaller removes the app. A `Dialoggo Development` build installs and runs side by side.
