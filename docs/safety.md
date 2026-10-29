# Safety

Star Temple inherits The Hero's Journey's checks, unchanged: the WCAG 2.3.1 flash and red-flash analyser, the regular-pattern analyser after the ITC (Ofcom) guidance, whole-field motion caps from optical flow, red-capped colour, the start gate and held frames. Their rules, sources and limits are written up in [The Hero's Journey's docs/safety.md](../../herosjourney/docs/safety.md). Every effect and preset here runs through them in `npm test`, at the default and at the strong dose (0.7).

What this family takes from the others before measuring anything of its own:

- **Motion is the hazard, not flashing.** Forward flight, warp and zooming starfields are what WCAG 2.3.3 warns about. Snow Temple measured that flakes 3 m away approached at walking pace expand at 0.67 zoom doublings a second, nearly seven times the 0.1 cap ([its vection study](../../snowtemple/docs/studies/vection.md)). Anything here that flies is a gated preset or a transition after a click, and under reduced motion a still frame or a cross-fade.
- **The motion check cannot see sparse, faint points.** Block matching needs texture, and a faint starfield leaves only a few trackable blocks. The estimator needs twenty blocks as evidence (Snow Temple). Flight and parallax are also held to the caps from the effect's own transform.
- **A whole field moving one way is a drift.** `hello`'s stars all drift the same way, so their speeds keep the field under the 0.05 widths a second cap. Parallax at many depths breaks a drift into many speeds.
- **Twinkle is flicker.** Stars twinkle only near a horizon, through Fire Temple's band-limited flicker construction, which cannot pass three flashes a second.
- **Meteors and the diamond ring are flashes.** They are checked as flashes at the strong dose, and the held frame never shows one at its peak.
- **Long star trails are a regular pattern.** Concentric arcs round a pole are rings of light and dark. Past about 28° of arc (under two hours of sky) the pattern analyser reads them as stripes however few the stars, so `star-trails` defaults to 26° and its six-hour preset is declared and gated, and a held frame never shows more than 26°.
- **Scintillation is flicker, and built as flicker.** `real-sky`'s stars twinkle hardest near the horizon, through the capped flicker signal, so no star can pass three flashes a second however low it is.
