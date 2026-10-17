PE League update notes

Included changes
1. Leaderboard remains competition-aware: League table, UCL group standings / knockout bracket, and FA Cup knockout bracket.
2. Home preview no longer shows a misleading combined league table for UCL or FA Cup; it directs users to the correct Leaderboard view.
3. When editing a knockout score after later rounds have already been generated, the app asks for confirmation and removes later rounds that may now be invalid. Admin can then regenerate the correct next round.
4. When a knockout score changes to a draw, the previous winner is cleared and the user must select the correct winner again.
5. Fixed PWA manifest and service-worker icon paths to match the icon files at the project root; bumped service-worker cache to v23 so the updated app can be installed/refreshed.

Before deploying
- Keep a copy of the currently deployed files.
- Export JSON from Settings before replacing files.
- Upload all files from this ZIP to the same GitHub Pages folder (keep filenames and folder structure).
- Open the site and test a League season, a UCL season, and an FA Cup season.
- Test correcting a knockout score after a later round has been generated; confirm the warning and verify the next round must be created again.
- On mobile, reload the site once after deployment so the service worker can refresh its cache.

Validation performed
- JavaScript syntax check passed for inline scripts.
- Manifest icon paths and service-worker precache paths were checked against files in the package.
- This package has not been browser-tested against the user's live Google Sheets endpoint or real production data. Test with an exported backup / test season before relying on it for live fixtures.

Update 2026-10-17: Tournament picker and club Top 6
- The Home page's "เริ่มการแข่งขัน" button opens a picker for League, Champions League (UCL), and FA Cup.
- Each tournament type uses its own season record. If no season exists for a selected tournament, a separate season is created so the other tournament's scores and fixtures are not reused. New UCL/FA Cup seasons need their tournament schedule generated from Settings before fixtures appear.
- Home shows a Top 6 club panel for League seasons, with each club's saved badge, rank, points, and goal difference. It is hidden for cup tournaments where a league-style Top 6 would be misleading.
- Club names and badges are saved on each team record. Admins can choose one of the built-in crest presets or upload a club image in Settings; the same badge appears in team lists and standings.
- Inline JavaScript syntax check passed. Please test using a JSON backup first, especially if the app is connected to a live Google Sheets endpoint.

Update 2026-10-17: National team database
- Added a Settings button to import the 48 national teams that participated in FIFA World Cup 2026.
- Imported teams are added to the existing team database (existing names are not duplicated), with national flag images and a national-team metadata tag. They can then be selected in the season roster builder like other teams.
- Flag images are hosted by FlagCDN and therefore need internet access to load; the app itself remains installable as a PWA.
- The 48-team list was checked against FIFA's World Cup 2026 qualified/participating teams page: https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026/teams
- Inline JavaScript syntax validation passed. Please test in a backup/test season before using with live data.

Update 2026-10-17 (v25): Tournament switcher + national-team fixes
- Schedule page: chip bar to switch between League / UCL / FA Cup seasons of the same year (shows progress x/y and live/finished/draft status). The Season dropdown now shows the tournament name.
- New seasons created from Home "เริ่มการแข่งขัน" use club teams only (national teams are no longer pulled into new League/UCL/FA Cup rosters automatically). If there are no clubs, all teams are used.
- Settings roster: teams are grouped into Clubs / National teams, with filter buttons (All / Clubs / National). "Select all" / "Clear all" apply only to the visible group.
- teamType, competitionSource and flag are now kept in Google Sheets sync (wireTeam / normRemote / buildState). The Teams sheet tab has a new "ประเภททีม" column.
- National team flags are stored as a country code (flag) instead of a logo URL, so they are no longer synced as "custom logos". Existing imported flags (flagcdn URLs) are migrated automatically on load.
- Service worker (cache v25) now also caches flagcdn.com flag images so flags work offline after the first load.
- Validation: inline JS syntax check passed; a headless (jsdom) test confirmed 48 flag teams import as code-only, new UCL/FA Cup seasons get club-only rosters, the switcher renders 3 chips, roster filter/select-all behave correctly, and sync serialization keeps the new fields. Not tested against a live Google Sheets endpoint - back up with Export JSON first.

Update 2026-10-17 (v26): Club / National-team categories
- Every season now has a category (club or national). Existing seasons are treated as "club" automatically.
- Home "เริ่มการแข่งขัน" picker: choose category first (Club / National), then League / UCL / FA Cup. Each category+tournament pair uses its own season.
- Schedule page: category tabs (shown when national teams exist) plus tournament chips filtered to the current category. "+ เพิ่ม Season" and next-season creation inherit the current category.
- Settings: new "หมวดการแข่งขัน" selector; the roster only lists teams of that category. Saving/creating a schedule is blocked if teams of the other category are selected.
- Team form: new "ประเภททีม" (club / national) so custom teams can be classified or reclassified.
- History: new category filter (all / club / national); champion counts and all-time stats follow the filter.
- Home Top 6 title follows the category. Google Sheets "Seasons" tab has a new last column "หมวด"; category is stored with each season in sync/backup.
- National league seasons with more than 24 teams are not auto-scheduled (a full round-robin would be very large) - use UCL / FA Cup, or pick a smaller roster, then generate the schedule from Settings.
- Validation: inline JS syntax check passed; jsdom test covered picker per category, category tabs/chips, roster per category, mismatch guard, history filter, new national team, addSeason inheritance, and sync serialization. Not tested against a live Google Sheets endpoint - export a JSON backup first. Service worker cache v26.

Update 2026-10-17 (v27): Club-only + Top 8 club database
- Removed everything related to national teams: the World Cup 2026 import button/list, national flags, the Club/National category picker, category tabs on the Schedule page, the History category filter, the "ประเภททีม" field and the category selector in Settings.
- Old data is cleaned automatically on load/import: national teams (and any Season marked national) are dropped; if that leaves no Season, a fresh club Season is created from the remaining teams. Export a JSON backup first.
- League / Champions League / FA Cup tournaments are kept (they are club competitions).
- New Settings section "ฐานข้อมูลสโมสร Top 8 ของ 5 ลีกใหญ่": England, Spain, Germany, Italy, France - the top 8 of each 2025/26 final table (40 clubs). Tap a club to fill the team form (name + badge), or add one league / all 40 at once. Existing names are not duplicated.
- Badges are simple generated shields in each club's colours with a short code. Official club crests are trademarked and are not bundled: open a team with "แก้ไข" and upload the official image to replace the badge.
- Service worker cache v27 (flagcdn caching removed).
- Validation: inline JS syntax check passed; node test confirmed 40 unique clubs (8 per league) and that national teams/seasons are purged from old data. Not browser-tested against a live Google Sheets endpoint.

Update 2026-10-17 (v28): Fresh start
- On first open after this version, the device wipes its saved local data once and starts from the original defaults (10 original teams, one empty Season, no fixtures/results, auto-sync OFF, no sheet URL). Runs once per browser (flag pe_fresh_v28).
- Nothing is sent to Google Sheets automatically. Export JSON first if you want to keep the old data.
- To bring data back from the existing sheet: Settings > enter URL > use the force "ดึงข้อมูลจากชีต" (pull) button. Do not turn on auto-sync before pulling, or the empty state may be merged into the sheet.


UPDATE v29 - Thai League 1 club logos
- Added all 16 Thai League 1 2026/27 club logo choices to the team logo picker.
- Added automatic logo matching when a new team name exactly matches a listed Thai League 1 club (English or Thai name).
- Logo assets are referenced from FootyLogos current 2026/27 collection; the site identifies the official source as Thai League.
