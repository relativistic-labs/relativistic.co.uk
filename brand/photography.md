# Relativistic founder portraits: photography brief

For the photographer, and for whoever makes the AI edit. Five founders, one look.

## What the photos are for

Each founder appears on the company website as a card. The card first shows an AI edit of the founder looking sharp and businesslike, labelled `RENDERED / AI`. Once, as the card comes into view, the picture shifts to the real photograph, labelled `AS OBSERVED`. The joke is disclosed, and the real photograph is the point.

So there are two images of each founder:

1. **The real photograph** from this shoot. It is what stays on screen and what is used everywhere else.
2. **The AI edit** of that same photograph. It is used only inside the shift on the website.

The shift only works if the two images line up pixel for pixel. Everything below serves that.

## Part 1: the shoot

### People and clothes

- Photograph the founders **as they really are**: the clothes they actually work in. No styling and no borrowed blazers. The casual version is the real one.
- Glasses, beards and hair as they normally wear them.

### One session, identical conditions

Photograph all five in one session, with one photographer, so the photos read as a set. If one founder must be shot on another day, rebuild the set exactly from the notes below.

| | Specification |
|---|---|
| Background | One seamless paper roll in a mid, warm grey (about 50% reflectance), at least 1.5 m behind the sitter so it falls evenly out of focus. No texture, no gradient lighting on it. |
| Light | Soft and directional: one large softbox as key, about 45° to camera left and slightly above eye level; a white reflector for fill on camera right. No hair light, rim light or coloured gels. |
| Camera | On a tripod at the sitter's eye height. Tape the tripod's and the sitter's floor positions and do not move them between sitters. |
| Lens | 85 to 105 mm (full-frame equivalent). f/5.6 to f/8 so the whole head is sharp. |
| Exposure | Manual exposure and a fixed white balance, the same for all five. No auto anything. |
| Pose | Seated or standing, the same for everyone. Shoulders turned slightly, face to camera, eyes to the lens. A relaxed, natural expression. |

### Framing

- Portrait orientation, **4:5**.
- Chest-up: the frame's bottom edge crosses mid-chest.
- **Eyes at the same height in every photo**: 36% down from the top of the frame. Use a grid overlay in tethered capture so each sitter matches.
- About 10% clear space above the top of the head.
- Leave extra room on every side (shoot a little wider than 4:5). The final crop is made from the selected frames, with the eye line locked.

### Retouching

Colour and exposure correction only, matched across the five. No skin smoothing, reshaping, teeth whitening or background clean-up beyond removing dust. The real photo must stay real.

### Deliverables

- One selected frame per founder, chosen with the founder.
- At least **2400 × 3000 px**, sRGB, as 16-bit TIFF plus the RAW file.
- Name files `<firstname>-observed.tif`, for example `harry-observed.tif`.
- The website makes its own web formats. Do not send web exports.
- If a single shared session cannot happen, grade all five to a matching monochrome so they still read as a set.

## Part 2: the AI edit

The AI version is an **image edit of the delivered photograph**, never a new generation. Start from `<firstname>-observed.tif` and change only two things:

- **Clothes**: a sharp, businesslike outfit (a dark suit or blazer and a plain shirt).
- **Grooming**: tidier hair, and a neat trim of any beard.

Everything else stays identical: pose, framing and crop, background, lighting and shadows, eye line, face, expression, skin, age, body shape and the pixel dimensions. Mask the edit to the clothing and hair regions so nothing else can change.

**Check the alignment.** Stack the two images and set the top one to *difference*. Everything outside clothes and hair should be black or nearly black. If the face, edges or background show, redo the edit.

Name the result `<firstname>-rendered.tif`. The founder in it reviews and approves it before it is used.

## Part 3: consent

Every founder gives written consent, before publication, to:

- the real photograph and where it is used;
- an AI edit being made of their photograph;
- that edit appearing on the website inside the shift, labelled as AI.

Any founder can withdraw consent to the AI edit at any time. The website then shows their real photograph only, and the edited file is deleted. Keep the signed consent with the image files.

## Part 4: where each image is used

**The real photograph is the default, everywhere:**

- social cards and Open Graph images, LinkedIn, press, proposals and slides;
- on the website for anyone without JavaScript, anyone with reduced motion turned on, and screen readers (the alt text describes the real photograph).

**The AI edit is used only inside the website's shift.** Never on its own, never in social posts or press, and never captioned as a real photograph. The shift itself is a brand component: see `portraits/glitch-demo.html` and `portraits/glitch.js`.

## Still never

The brief's list still stands for everything except this disclosed edit: no stock photography, no AI-generated people made from scratch, no robots, brains, glowing networks, the ✨ sparkle, or logo walls.
