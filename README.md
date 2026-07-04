# HTB Solve Sheet Bot

Track Hack The Box solves directly in Google Sheets.

This project is a small Google Apps Script automation that polls your Hack The Box profile activity, detects new solves, and appends them into a spreadsheet. It does not need a VPS, Discord bot, local process, or always-open Codex session. Once installed, Google runs the checker for you.

## Why

Hack The Box activity is useful, but it is not always where you want your learning log to live.

This bot is meant for people who already use Google Sheets for:

- daily standups
- learning journals
- challenge tracking
- accountability logs
- weekly reviews

Instead of manually copying every new HTB solve into a spreadsheet, the script checks your HTB activity feed and writes new solves into a dedicated `HTB Solves` tab.

## What It Does

- Runs inside Google Apps Script, attached to your Google Sheet.
- Uses an HTB App Token to read your profile activity.
- Checks for new activity every 10 minutes.
- Detects machine, challenge, fortress, and endgame solves.
- Writes solved items into `HTB Solves`.
- Can also append a short summary into `Daily Standup`.
- Keeps a saved baseline so old solves do not spam your sheet.
- Adds an `HTB Bot Status` tab so you can see whether the detector is installed and when it last ran.

## Output Format

The `HTB Solves` sheet uses these columns:

| Column | Meaning |
| --- | --- |
| `Local Date` | Solve/import time converted to your spreadsheet timezone. |
| `Object Type` | HTB object type, such as `machine` or `challenge`. |
| `Solve Type` | Activity type, such as `own`, `user`, `root`, or similar. |
| `Name` | Machine/challenge/object name. |
| `Category` | Challenge category, difficulty, or any category-like field HTB returns. |
| `LINK` | Best-effort link to the HTB machine/challenge/object. |

The script does not keep raw activity JSON in the sheet by default, because the sheet is intended to stay readable as a habit tracker/log.

## How It Works

```text
You solve something on HTB
  -> HTB profile activity updates
  -> Google Apps Script trigger runs every 10 minutes
  -> script fetches recent HTB activity
  -> script compares activity with saved baseline/seen keys
  -> new solves are appended to HTB Solves
  -> optional summary is appended to Daily Standup
  -> status is updated in HTB Bot Status
```

The checker stores state in Apps Script Properties:

- HTB token
- latest seen activity date
- recent seen activity keys
- detector install time
- last check time/status

These values are not stored in visible spreadsheet cells.

## Install

1. Open the Google Sheet you want to use.
2. Go to `Extensions > Apps Script`.
3. Create or open a script file, for example `HTBBot.gs`.
4. Paste the contents of [`apps-script/Code.js`](apps-script/Code.js).
5. Save the Apps Script project.
6. Reload the Google Sheet.
7. Open the new `HTB Bot` menu.
8. Run `Setup sheets`.
9. Run `Set HTB token`.
10. Run `Test HTB token`.
11. Run `Baseline current solves`.
12. Run `Install 10-min detector`.

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

Use the app token as a bearer token. Do not paste your HTB password into the script.

## First Run Behavior

By default:

```js
BACKFILL_ON_FIRST_RUN: false
```

That means the first automatic run will baseline your current HTB activity and will not import old solves.

Recommended setup:

1. Run `Baseline current solves` once after setting the token.
2. Install the detector.
3. Use `Import latest activity` only if you intentionally want to pull the newest activity into the sheet.

If you want old activity imported, change `BACKFILL_ON_FIRST_RUN` to `true`, but expect the first run to append more rows.

## Menu Reference

| Menu Item | What It Does |
| --- | --- |
| `Setup sheets` | Creates/migrates `HTB Solves` and creates `HTB Bot Status`. |
| `Set HTB token` | Stores your HTB App Token in Apps Script Properties. |
| `Test HTB token` | Fetches recent activity and confirms the token works. |
| `Baseline current solves` | Marks current HTB activity as already seen. |
| `Import latest activity` | Imports the newest solve-like activity immediately. Useful for testing. |
| `Install 10-min detector` | Installs or refreshes the recurring Google trigger. |
| `Run check now` | Runs detection immediately. |
| `Reset detector state` | Clears saved baseline/seen state. |

## Status Sheet

`HTB Bot Status` is there so you do not have to wonder whether you already installed the checker.

It shows:

- whether the detector is installed
- check interval
- number of active triggers
- last check time
- last status message

If you press `Install 10-min detector` more than once, the script deletes the old trigger and creates a fresh one, so you do not get duplicate 10-minute checks.

## Configuration

Edit the `CONFIG` object at the top of [`apps-script/Code.js`](apps-script/Code.js):

```js
const CONFIG = {
  HTB_USER_ID: "2885938",
  SOLVES_SHEET_NAME: "HTB Solves",
  STATUS_SHEET_NAME: "HTB Bot Status",
  DAILY_STANDUP_SHEET_NAME: "Daily Standup",
  POLL_EVERY_MINUTES: 10,
  BACKFILL_ON_FIRST_RUN: false,
  WRITE_DAILY_STANDUP: true,
};
```

Important fields:

- `HTB_USER_ID`: your Hack The Box user ID.
- `POLL_EVERY_MINUTES`: how often Google should check HTB.
- `WRITE_DAILY_STANDUP`: set to `false` if you only want `HTB Solves`.
- `DAILY_STANDUP_SHEET_NAME`: sheet name used for optional standup summaries.

## How To Find Your HTB User ID

Open your HTB profile in the browser. The URL usually contains your numeric ID:

```text
https://app.hackthebox.com/users/2885938
```

In that example, the user ID is:

```text
2885938
```

## Troubleshooting

### The menu does not show up

Reload the Google Sheet after saving Apps Script. Custom menus are created when the sheet opens.

### The detector does not seem installed

Open `HTB Bot Status` and check:

- `Detector installed`
- `Active triggers`
- `Last check`
- `Last status`

You can safely run `Install 10-min detector` again. It replaces the old trigger.

### My latest solve did not appear

Run:

```text
HTB Bot -> Run check now
```

If it still does not show up, try:

```text
HTB Bot -> Import latest activity
```

HTB activity can take a moment to appear in the profile feed.

### Category or link is blank

The script maps category and link from whichever fields HTB returns in the activity payload. Some HTB activity items do not include complete metadata. In those cases, the script fills what it can and leaves the rest blank.

### Local Date is blank or weird

The script tries multiple date fields and nested date-like values. If HTB changes the payload shape, date parsing may need a small update.

## Limitations

This project uses undocumented HTB API endpoints observed from HTB web app behavior and community tooling. HTB can change these endpoints or payloads at any time.

This is a personal automation helper, not an official Hack The Box integration.

## Security Notes

- Treat your HTB App Token like a password.
- Do not commit your token.
- Do not store your token in a visible sheet cell.
- The script stores the token in Apps Script Properties.
- If you accidentally expose a token, revoke it in HTB and create a new one.

## Related Prior Art

- [Drahoxx/HTB-University-Completion-Tracker](https://github.com/Drahoxx/HTB-University-Completion-Tracker)
- [4d4c/PWNgress](https://github.com/4d4c/PWNgress)
- [hackthebox/Hackster](https://github.com/hackthebox/Hackster)
