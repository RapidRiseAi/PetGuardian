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
 *
 * UI sanity notes (Nike clean premium refresh):
 * - css/styles.css now uses tokenized dark theme values, unified controls, and calmer spacing.
 * - index.html keeps all business and API hooks, while adding accordion step wrappers and pet steppers.
 * - js/ui.js adds progressive disclosure behavior only, without changing pricing or API request logic.
 */

import { boot } from "./ui.js";

boot();
