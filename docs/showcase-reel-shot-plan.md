# MG Showcase Hero Reel — Regeneration Shot Plan (plan-first gate)

> **Status:** ✅ GENERATED 2026-07-15 (owner-authorized). New watermark-free reel live on `/showcase`
> (both the hero background `mg-hero-reel.*` and the StoryReel `story/mg-story-reel.*`, 1280×720 · 28.2s ·
> 6 scenes · 0.4s crossfades). Pipeline run: flux-2-pro keyframes → nano-banana composites (real War-Room
> red-alert screenshot on the Command Center wall, real MG app screen on the phone, Blue Alliance logo on
> the polos) → Kling v2.5 turbo pro I2V (5s ea) → ffmpeg xfade stitch. All 6 clips verified watermark-free.
> Known minor: the wide BA logo text softens on some moving polos (reads as "Blue Alliance"; far better than
> the old garbled military insignia). Cost ≈ $2.6. LOCAL only, HARD HOLD.
> Target = the 28.5s `story-reel` on `/showcase` (`apps/web/public/showcase/mg-hero-reel.{mp4,webm}` + poster).
> LOCAL only, HARD HOLD. Route: **image-first keyframe → Kling image-to-video** (premium fal.ai — `FAL_KEY`
> present in `claude-code-video-toolkit/.env`). Toolkit: `tools/fal_image.py` (keyframes), `tools/fal_video.py`
> (I2V), `tools/image_edit.py`/`qwen` (compositing), `ffmpeg` (stitch), `tools/addmusic.py`.

## One-line goal
Regenerate the hero reel so **every ranger reads as a Blue Alliance civilian marine steward (navy-blue BA
polo), never police/military**, and the three named scenes (Command Center, Fish-Catch Monitoring,
Community Support) depict what MG rangers *actually* do — grounded in the real app.

## What's wrong with the current reel (from the frame audit)
| t | scene | problem |
|---|---|---|
| 1s | Command center | operators in **military tactical vests**, garbled "FIGNI" text; wall map is a generic garble, not our Command Center page/red-alert |
| 5–9s | Boat patrol (RIB) | rangers in tactical/life gear — uniform not BA polo |
| 13s | Boat + dive gear | **military/dive look**, garbled "PLAS ROIF PCKA" insignia |
| 17s | Fish-catch / port | rangers in **tactical vests**, garbled "TFVRI/ANGLA"; generic, not clearly weighing/counting catch |
| 21s | Port, ranger on phone | **police peaked cap + badges** — explicitly disallowed |
| 25–27s | Community + kids | **police peaked cap** — disallowed; not clearly a livelihood-teaching scene |

→ The uniform fix is **global** (all 6 scenes); scenes 1, 17, 25/27 also get **content rewrites**.

---

## GLOBAL CONTINUITY BLOCK — repeat verbatim in EVERY shot prompt
Models have no memory between clips, so this exact wardrobe/world descriptor goes in all 6 specs:

> **WARDROBE:** Filipino marine stewards wearing a **plain NAVY-BLUE short-sleeve POLO shirt** (small pale
> emblem on the left chest; a wider emblem across the upper back), some with a **navy baseball cap**; dark
> neutral trousers. **NEGATIVE (exclude, always): no military tactical vest, no camouflage, no police peaked
> cap, no rank badges/epaulettes, no weapons, no body armor, no garbled text/letters on clothing.**
> **WORLD:** tropical coastal Philippines, bright natural daylight, documentary realism, gentle teal-and-warm
> grade, subtle film grain. **16:9.**

### ⚠ Logo-fidelity decision (needs your pick — AI video CANNOT render a real logo cleanly)
The BA logo will garble if we ask the video model to draw it. Real logo file exists at MG root
`bluealliance.png` (1500×600). Options:
- **(A) Generic emblem, no compositing** — prompt says "small pale emblem"; fast/cheap; logo not legible.
  Fine for the wide/motion B-roll scenes (boat, background). **Recommended for scenes 2–3 (boats).**
- **(B) Composite the REAL logo onto the approved KEYFRAME STILL** (via `image_edit.py`/qwen) before I2V —
  crisp BA logo in the first frame; may soften as the subject moves. **Recommended for the close/hero shots
  (Command Center operators, the fish-catch ranger, the community ranger) where the polo is clearly visible.**
- My default if you don't specify: **B for scenes 1/4/5/6, A for scenes 2/3.**

---

## Scene specs (ordered; ~5s each → re-stitch to ~28–30s)

### SHOT 1 — Command Center (RED ALERT) · content rewrite + composite
**Technique:** image-first with a REAL composite. Prep = capture a live screenshot of our **Command
Center / War Room** page showing a **red alert on the map** (from the running app :45204), then composite it
onto the wall display in the keyframe so the on-screen map is *real*, not garbled. Operators in BA polos.
```
1 subject   — 2–3 Filipino marine operators in navy-blue BA polos, seated/standing at a control desk
2 action    — one points at a red alert pulsing on the big wall map; another types; calm focus
3 context   — a modern marine operations "war room", dim blue ambient light, large wall screen showing a
              real coastal map with a glowing RED alert marker + patrol tracks (our Command Center page)
4 camera    — medium-wide, eye-level, very slow dolly-in
5 lens      — wide 24mm
6 lighting  — low-key blue ambient, screen glow as key, soft rim on shoulders
7 style     — clean documentary tech, cool teal grade, subtle grain
8 negative  — GLOBAL negatives + no military vests, no garbled UI text, no gibberish map labels
PROMPT (Scene→Characters→Action→Camera→Style): A modern marine operations war room in dim blue light, a
large wall screen showing a real coastal map with a glowing red alert marker and patrol tracks. Two or three
Filipino marine stewards in plain navy-blue polo shirts stand and sit at a control desk; one points calmly at
the red alert while another types. Slow dolly-in, wide 24mm, low-key blue ambient with screen glow as key
light, clean documentary style, cool teal grade. No military vests, no police caps, no garbled text.
MODEL: flux2 keyframe → composite real screenshot on wall → composite BA logo (opt B) → kling I2V (--image)
DURATION: 5s  ASPECT: 16:9
```

### SHOT 2 — Boat patrol (uniform fix only) · keep the action, fix wardrobe
```
1 subject   — 2 BA marine stewards in navy-blue BA polos (one in a navy cap), light life-vests OK over the polo
2 action    — scanning the water, one steering, calm patrol
3 context   — a small patrol boat cutting across calm turquoise sea, green islands behind, late morning
4 camera    — wide tracking shot alongside the boat, slight handheld
5 lens      — wide 24mm
6 lighting  — bright natural daylight, sun sparkle on water
7 style     — documentary, bright airy, gentle teal-warm grade
8 negative  — GLOBAL negatives + no tactical/dive military gear, no garbled insignia
PROMPT: Calm turquoise sea with green islands behind, a small patrol boat cutting across the water in bright
late-morning light. Two Filipino marine stewards in plain navy-blue polo shirts (one wearing a navy cap, light
life vests over the polos) scan the water as one steers. Wide 24mm tracking shot alongside the boat, slight
handheld, bright natural daylight, documentary airy teal-warm grade. No military or dive gear, no garbled text.
MODEL: flux2 keyframe → kling I2V (--image)  [logo option A]
DURATION: 5s  ASPECT: 16:9
```

### SHOT 3 — Coastal approach / arrival (uniform fix; replaces the dive-gear 13s shot)
```
1 subject   — 2 BA marine stewards in navy-blue BA polos on a small traditional banca (outrigger) boat
2 action    — approaching a mangrove/village shoreline, one waves toward shore, one holds a clipboard/tablet
3 context   — clear shallow coastal water, outrigger boat, mangroves + a stilt village ahead, morning
4 camera    — medium shot from the bow, gentle bob
5 lens      — normal 50mm
6 lighting  — soft morning sun, warm
7 style     — documentary, natural, warm-teal grade
8 negative  — GLOBAL negatives + no dive tanks, no tactical gear, no garbled text
PROMPT: Clear shallow coastal water with mangroves and a stilt fishing village ahead in soft morning sun. Two
Filipino marine stewards in plain navy-blue polo shirts ride a small wooden outrigger boat; one waves toward
shore while the other holds a tablet. Medium shot from the bow with a gentle bob, normal 50mm, warm natural
light, documentary warm-teal grade. No dive tanks, no military gear, no garbled text.
MODEL: flux2 keyframe → kling I2V (--image)  [logo option A]
DURATION: 4s  ASPECT: 16:9
```

### SHOT 4 — Fish-Catch Monitoring · content rewrite
```
1 subject   — one BA marine steward in navy-blue BA polo + navy cap, crouched with a weighing scale + tablet
2 action    — weighing a basket of fresh fish, counting, tapping the tablet, as fisherfolk hand over the catch
3 context   — a busy Philippine fishing port jetty at morning, wooden crates of silver fish, bancas behind,
              fisherfolk in casual clothes handing over baskets
4 camera    — medium shot, slight high angle over the crates, slow push-in
5 lens      — normal 50mm
6 lighting  — bright morning, soft overcast
7 style     — documentary, natural color, light film grain
8 negative  — GLOBAL negatives + no tactical vest, no police cap, no garbled labels
PROMPT: A busy Philippine fishing-port jetty in bright morning light, wooden crates of fresh silver fish,
outrigger boats behind, fisherfolk in casual clothes handing over baskets. A Filipino marine steward in a
plain navy-blue polo and navy cap crouches with a hanging scale and a tablet, weighing and counting the catch,
tapping the tablet. Medium shot, slight high angle, slow push-in, normal 50mm, soft morning light, documentary
natural grade. No tactical vest, no police cap, no garbled text.
MODEL: flux2 keyframe → composite BA logo (opt B) → kling I2V (--image)
DURATION: 5s  ASPECT: 16:9
```

### SHOT 5 — Community Support / Livelihood teaching · content rewrite
```
1 subject   — one BA steward in navy-blue BA polo teaching; a SECOND BA steward aside photographing on a phone
2 action    — the first gestures to a small seated group of coastal families (women, children, fishers) who
              listen; the second raises a phone to photograph the activity, its screen faintly shows an app form
3 context   — a remote seaside community under a simple nipa/bamboo shelter near the shore, boats + sea behind,
              warm late-afternoon light
4 camera    — wide establishing → medium, slow truck laterally
5 lens      — wide 24mm
6 lighting  — warm golden-hour, soft
7 style     — warm documentary, hopeful, gentle grain
8 negative  — GLOBAL negatives + no police cap, no classroom/urban setting, no garbled text
PROMPT: A remote seaside community under a simple bamboo-and-nipa shelter near the shore, boats and sea behind,
warm late-afternoon light. A Filipino marine steward in a plain navy-blue polo gestures as he teaches a small
seated group of coastal families — women, children, fishers — who listen; a second steward in a navy polo
stands aside raising a phone to photograph the activity. Wide 24mm establishing shot with a slow lateral truck,
warm golden-hour light, hopeful documentary grade. No police caps, no urban classroom, no garbled text.
MODEL: flux2 keyframe → composite BA logo (opt B) → kling I2V (--image)
DURATION: 5s  ASPECT: 16:9
```

### SHOT 6 — Ranger logs the event in the MG app (close, ties to the product) · content rewrite of 21s/25s
```
1 subject   — CU on a BA steward's hands + phone; steward in navy-blue BA polo
2 action    — thumbs filling a simple event form on the MG mobile app (title, location, photo), then a satisfied nod
3 context   — same seaside community, softly blurred families + shore behind (bokeh)
4 camera    — close-up over the shoulder on the phone, locked with a tiny drift
5 lens      — tele 85mm (compressed, portrait bokeh)
6 lighting  — warm golden-hour, screen glow on the hands
7 style     — warm documentary, shallow depth of field
8 negative  — GLOBAL negatives + no garbled UI (composite a REAL MG screenshot on the phone, opt B)
PROMPT: Close-up over the shoulder of a Filipino marine steward in a navy-blue polo, holding a phone in warm
golden-hour light with the seaside community softly blurred behind. His thumbs fill a simple event form on a
mobile app, then he nods, satisfied. Tele 85mm, shallow depth of field, warm documentary grade, screen glow on
the hands. No garbled interface, no police uniform.
MODEL: flux2 keyframe → composite REAL MG app screenshot on phone (opt B) → kling I2V (--image)
DURATION: 4s  ASPECT: 16:9
```

---

## Stitch + finish
1. Generate keyframes (`fal_image.py --model flux2`), re-roll each still until composition is right (cheap).
2. Composite where flagged (opt B): real Command Center screenshot (shot 1), real BA logo on polos (1/4/5/6),
   real MG app screenshot on the phone (shot 6) — via `image_edit.py`/qwen on the STILL.
3. I2V each approved still: `fal_video.py --model kling --image <still.png> --duration 5 --aspect-ratio 16:9`.
4. **Verify watermark-free** (corners + first/last 2s of each clip) before stitching.
5. Stitch with ffmpeg concat (+ optional 0.3s xfades) to ~28–30s → `mg-hero-reel.mp4`; re-encode `.webm`;
   refresh the poster (first frame); keep muted-autoplay + `prefers-reduced-motion` poster behavior (already
   handled by `story-reel.tsx`). Optional: re-apply the existing music bed via `addmusic.py`.
6. Drop new files into `apps/web/public/showcase/`, rebuild dev, verify `/showcase` live.

## Cost estimate (premium fal.ai)
~6 keyframes × ~$0.05 + a few re-rolls ≈ **$0.5**; 6 Kling I2V clips × ~$0.35 ≈ **$2.1**; compositing ~free.
**≈ $2.5–3.5 total** including re-rolls. (Free ZeroGPU/LTX is NOT used here — people/branding accuracy needs
premium; the whole point of this plan is to avoid re-roll waste.)

## Decisions — LOCKED by owner (2026-07-15) ✅
1. **Reel scope:** ALL 6 scenes (~28s) — fix wardrobe on every scene (incl. boats) + rewrite the 3 named scenes.
2. **Logo fidelity:** composite the REAL `bluealliance.png` logo on **EVERY** scene's keyframe (not just close shots).
3. **Command Center:** composite the REAL live War Room screenshot (with a red alert on the map) onto the wall.
4. **Boat scenes:** KEPT (part of the 6), wardrobe-fixed to BA polos.

**GENERATION GATE:** plan approved; holding the actual fal.ai generation (spends budget) until the owner says
"go / generate the videos." Prep steps that are free + reversible (capture the War Room screenshot, extract the
BA logo + an MG app screenshot for compositing) may run ahead so generation is one step away on "go".

---
### Separate queued task (NOT part of this video plan)
- **MG detailed documentation — larger fonts.** Bump the `/docs` prose type scale to a comfortable standard
  reading size (base ~16–18px body, proportional headings) in the doc-view/markdown component styling. Small,
  separate MG code change under HARD HOLD; tracked for the next work slot.
