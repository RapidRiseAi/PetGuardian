/**
 * PetGuardian static app bootstrap
 *
 * Local run:
 * 1) From repo root run: `python3 -m http.server 4173`
 * 2) Open: http://localhost:4173
 *
 * GitHub Pages deploy:
 * 1) Push this repository to GitHub.
 * 2) In repo settings, enable Pages from the root branch.
 * 3) The app serves as a static site with relative module paths.
 *
 * CHANGELOG (refactor):
 * - Split former single-file CSS and JS into /css and /js ES modules.
 * - Preserved init order by running the original boot flow from ui.js.
 */

import { boot } from "./ui.js";

boot();
