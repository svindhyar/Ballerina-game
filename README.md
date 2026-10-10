# Prima — a tiny ballet adventure

A dependency-free endless runner starring a leaping ballerina. Jump over pointe shoes, chase a high score, and see how long you can keep dancing.

Featuring an original retro chiptune soundtrack generated in the browser with Web Audio. Music starts when you begin playing and can be toggled from the header. Created by **Viniverse by Vindhya**.

## Play

- Press **Space** or **↑** to jump.
- Press **Escape** or use the pause button to pause.
- On a phone or tablet, tap the game to jump.
- Your best score is saved in this browser.

## Publish on Vercel

This is a static site; it needs no build command or dependencies.

1. Import this project into Vercel, or run `npx vercel` from the project directory.
2. Leave the framework preset as **Other**.
3. Leave the build command empty and set the output directory to `.`.
4. Deploy.

The included `vercel.json` enables clean URLs. The game is served from `index.html` with its stylesheet and script alongside it.
