# Live My Vibe

**A multimodal application: five instruments you can walk into.**

Sight, sound, touch, movement and space meet in the browser. Every world turns what you see and do into music, and the music back into light.

Live: **https://live-my-vibe.vercel.app**

| App | What you do | Modes |
|---|---|---|
| **BodyBeat** | Play a living x-ray of the human body as a beat maker; tap organs, build grooves, follow the signals | 3D anatomy, sequencer, voice, keyboard, MIDI-style keys |
| **Scatter** | Drop in pictures; each becomes half a million points that drift, splash and gather into the next | image → point cloud, depth, light, pointer |
| **Migros** | Play the shape of chaos: 39 strange attractors drive a synth; two voices drift apart | maths, synthesis, keyboard, MIDI, your own sounds |
| **Niagra** | Six loops become 96 glass tiles on a 4×4×4 cube; every turn remixes the song | 3D, loops, drag-to-turn, WAV export |
| **Summits** | Walk a Himalayan forest at night; everything you touch glows and sings into a 16-step loop | first-person walking, spatial audio, glowing point clouds, storms |

The landing page is an animated point-cloud artwork that morphs between the five worlds as you scroll; each app opens inside the page.

## Run it

It is a static site with no build step:

```
python -m http.server 8900
```

Then open `http://localhost:8900`. The apps live in `play.html` (`?app=body|scatter|migros|niagra|summits`).

## Built with

- [three.js](https://threejs.org) (MIT) for all 3D, point clouds and post-processing
- The Web Audio API and AudioWorklets: every sound is synthesised in the browser, with no samples

## Credits

Anatomy in BodyBeat: **BodyParts3D**, © The Database Center for Life Science, licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
