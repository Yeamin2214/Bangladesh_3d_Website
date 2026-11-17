# Bangladesh 3D Journey

An interactive 3D website about Bangladesh for your stall. It runs on your own laptop. No internet is needed, except for the AI chatbot.

## How to run it

1. Install Node.js (version 18 or newer) from https://nodejs.org if you do not have it.
2. Open this folder.
3. On Windows, double-click `start.bat`. On Mac or Linux, run `node server.js` in a terminal.
4. Open Chrome and go to http://localhost:3000
5. Press F for full screen.

Do not open `index.html` by double-clicking. The 3D models only load through the server.

## Show it on an iPad

1. Put the laptop and the iPad on the same Wi-Fi (a phone hotspot works).
2. When the server starts, it prints a line like `On iPad / phone: http://192.168.x.x:3000`.
3. Type that address into Safari on the iPad.
4. Tip: use Share, then Add to Home Screen. It opens full screen like an app.

## Turn on the AI chatbot (OpenRouter)

1. Make a copy of `.env.example` and name it `.env`
2. Paste your OpenRouter key after `OPENROUTER_API_KEY=`
3. Restart the server. The chat window will show "AI online".

Your key stays on the laptop. Visitors can never see it.
Without a key, or without internet, the tiger still answers from the built-in notes.
To change the model, edit `OPENROUTER_MODEL` in `.env`.

## Music

- Music is off when the site opens. The music button in the top bar turns it on, and it stays the way you left it.
- The journey show always plays the song, and closing the show stops it.
- `public/assets/audio/background.mp3` is the full Dhono Dhanne Pushpe Bhora. The site starts it from second 30. To change that, edit `songStart` at the top of `public/js/main.js`. `songEnd` makes it loop early (0 means play to the end).
- `public/assets/audio/anthem.mp3` is the national anthem, with the first 25 seconds cut off.

## How visitors use it

- The landing page scrolls through nine 3D stops in one zigzag: welcome, National Martyrs' Memorial, Central Shaheed Minar, National Parliament House, tiger, rickshaw, Sixty Dome Mosque, the map, and the doorways. Use the mouse wheel, swipe up, the arrow keys, or the dots on the right.
- "See it in 3D" opens a model you can spin and zoom.
- Tap a doorway to enter a section. Swipe, use the arrows, or tap the small pictures.
- The name of each photo sits under the photo. Tap **More details** for the full story and **Listen** to hear it.
- Ask the guide about any city, district or famous place (Sylhet, Cox's Bazar, Sreemangal, Saint Martin's Island and the other 64 districts). It answers and flies the map there with a pin, while the chat stays open. The places are in `public/data/map.json` under `places`.
- Tap the cartoon tiger to open the chat. It asks for English or Arabic first, and it also follows the language of each message.
- The guide can open screens for you. Ask "Where is Bangladesh?" and it points to the map. Say "Show me Sylhet on the map", "Play the anthem" or "Open the tiger" and it goes there by itself.
- Keyboard: arrows, Esc to go back, J for the journey, F for full screen.

## The map

Open it from the Map button or the map stop on the landing page. Tap a division (or its name at the bottom) and it lifts out of the map. The side panel shows what it is famous for. Tap empty space to see all of Bangladesh again, with location, area, divisions, districts and rivers.

Zoom inside the map, not with the browser. Use the + and − buttons, the mouse wheel, a double click, or pinch on the iPad. Drag to move around. The ↻ button shows the whole country again. This keeps the map sharp, because it is drawn again at every zoom. Browser zoom only stretches the screen picture, so it turns blurry. Browser pinch zoom is switched off on the iPad for that reason.

- Division text is in `public/data/map.json`.
- The picture on the map is your poster. Division borders come from geoBoundaries (CC BY 4.0) and are simplified, so small details near borders are approximate.

## The anthem screen

The Anthem button opens a full screen with the lyrics moving as the song plays, with English and Arabic under the current line.

- The lines and their timing are in `public/data/anthem.json` (`"lines"` and `"times"`, one time in seconds per line).

## The journey show

Press **Start the journey**. The screen goes full screen, shows a loading card, then plays every photo with the song. Each chapter opens with a title card. The order is Natural Beauty, History, Heritage, Culture, Art, Food. At the end it says thank you, shows the team who made the fest, then starts again with the song from the top.

- Each photo shows its name and one line in English, Bangla and Arabic, under the picture.
- To leave, move the mouse to the top right corner and click the X. On a touch screen, tap anywhere and the X appears. Esc also works. Closing stops the music and returns to the landing page.
- The show also starts by itself after 3 minutes with no touch.
- Timing is automatic. The site reads the length of the song and shares it out, so the whole show (loading, chapter cards, every photo, thank you and team) ends before the song does. With 70 photos that is about 4.6 seconds per photo. Add or remove photos and it recalculates by itself. To force a fixed time instead, set `journeySeconds` at the top of `public/js/main.js` (0 means automatic).
- Pause: press Enter or double-click (double-tap on the iPad) during the show. The photo, the progress bar and the song stop. Do the same again to carry on.
- Chapter order: `JOURNEY_ORDER` in the same file.
- The team: names are in `public/data/team.json` and photos in `public/assets/img/team/` (portrait, 640x800). `tier` 1 sits in the middle and is biggest, then 2, then 3 on the outside.
- The three-language lines are in `public/data/i18n.json`.

## Change text or photos

- All text is in `public/data/content.json`. Edit the titles, descriptions and facts there.
- Photos are in `public/assets/img/`. Each picture has three files: `name.jpg` (main), `name_t.jpg` (small), `name_d.jpg` (depth map).
  To swap a photo, replace `name.jpg` and `name_t.jpg` with the same file names.
- Settings such as tour speed and music volume are at the top of `public/js/main.js`.

## Folder map

- `server.js` the small local server (also hides your API key)
- `public/index.html` the page
- `public/js/main.js` the 3D scene
- `public/js/guide.js` the guide, read-aloud voice and chatbot
- `public/data/i18n.json` Bangla and Arabic names and lines for the journey show
- `public/css/style.css` the look
- `public/assets/models/` tiger, rickshaw, Sixty Dome Mosque, Shaheed Minar and Smriti Soudho 3D models
- `public/data/map.json` and `public/data/anthem.json` map and anthem content
- `public/vendor/three/` the 3D library (three.js), stored locally so it works offline

## Put it online with Vercel

The site works on Vercel as it is. The pages and photos come from `public/`, and the chatbot runs as two small functions in `api/` (`chat.js` and `health.js`). Your OpenRouter key stays secret on Vercel, the same way `.env` keeps it secret on the laptop.

1. Make a new empty repository on github.com (no README). Copy its link.
2. In this folder, run:
   ```
   git init
   git add .
   git commit -m "Bangladesh 3D Journey"
   git branch -M main
   git remote add origin https://github.com/YOUR-NAME/YOUR-REPO.git
   git push -u origin main
   ```
   `.gitignore` keeps `.env` out of GitHub, so your key is never uploaded. Check with `git status` before the commit: `.env` must not be in the list.
3. Go to vercel.com, sign in with GitHub, click **Add New > Project** and import the repository.
4. Leave Framework Preset as **Other**. Do not change the build settings. `vercel.json` already tells Vercel to serve `public/`.
5. Open **Environment Variables** and add `OPENROUTER_API_KEY` with your key. You can also add `OPENROUTER_MODEL` (for example `openai/gpt-4o-mini`).
6. Click **Deploy**. After a minute you get a link like `your-project.vercel.app`.
7. Open the link and tap the tiger. The chat badge should say **AI online**.

To update the site later, change the files and run `git add .`, `git commit -m "update"`, `git push`. Vercel puts the new version online by itself.

If you add or change the key on Vercel after the first deploy, open **Deployments**, click the three dots on the latest one and choose **Redeploy**, so the new key is picked up.

`node server.js` still works the same on the laptop, for the stall without internet.
