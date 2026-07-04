# HTB Solve Sheet Bot

Google Sheets automation for tracking Hack The Box solves without keeping a local bot or Codex session running.

It polls your HTB profile activity with an HTB App Token, detects new machine/challenge/fortress/endgame solves, and writes them into a Google Sheet.

## Features

- Runs inside Google Apps Script.
- Checks HTB every 10 minutes.
- Appends new solves to an `HTB Solves` sheet.
- Optionally appends a short summary to `Daily Standup`.
- Baselines existing solves so first setup does not spam old activity.
- Stores the HTB token in Apps Script Properties, not in sheet cells.

## Install

1. Open your Google Sheet.
2. Go to `Extensions > Apps Script`.
3. Paste [`apps-script/Code.js`](apps-script/Code.js) into the Apps Script editor.
4. Save the script project.
5. Reload the Google Sheet.
6. Open the new `HTB Bot` menu.
7. Run:
   - `Setup sheets`
   - `Set HTB token`
   - `Test HTB token`
   - `Baseline current solves`
   - `Install 10-min detector`

After that, the automation runs by itself.

## Getting An HTB App Token

In Hack The Box:

```text
Profile -> Settings -> App Tokens -> Create App Token
```

Direct page:

```text
https://app.hackthebox.com/profile/settings
```

Use the app token as a bearer token. Do not use or store your HTB password.

## Workflow

```text
HTB solve happens
  -> Google Apps Script trigger runs every 10 minutes
  -> HTB profile activity is fetched
  -> script compares with saved baseline
  -> new solve is appended to HTB Solves
  -> optional standup summary is appended to Daily Standup
```

## Configuration

Edit the `CONFIG` object at the top of `apps-script/Code.js`:

```js
const CONFIG = {
  HTB_USER_ID: "2885938",
  SOLVES_SHEET_NAME: "HTB Solves",
  DAILY_STANDUP_SHEET_NAME: "Daily Standup",
  POLL_EVERY_MINUTES: 10,
  BACKFILL_ON_FIRST_RUN: false,
  WRITE_DAILY_STANDUP: true,
};
```

## Menu Reference

- `Setup sheets`: creates the output sheet if needed.
- `Set HTB token`: stores your HTB App Token in script properties.
- `Test HTB token`: verifies that HTB profile activity can be fetched.
- `Baseline current solves`: marks current activity as already seen.
- `Install 10-min detector`: installs the recurring trigger.
- `Run check now`: runs the detector immediately.
- `Reset detector state`: clears saved activity state.

## Notes

This project uses undocumented HTB API endpoints observed in community tooling. HTB may change those endpoints at any time.

Related prior art:

- [Drahoxx/HTB-University-Completion-Tracker](https://github.com/Drahoxx/HTB-University-Completion-Tracker)
- [4d4c/PWNgress](https://github.com/4d4c/PWNgress)
- [hackthebox/Hackster](https://github.com/hackthebox/Hackster)
