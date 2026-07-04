const CONFIG = {
  HTB_USER_ID: "2885938",
  SOLVES_SHEET_NAME: "HTB Solves",
  DAILY_STANDUP_SHEET_NAME: "Daily Standup",
  POLL_EVERY_MINUTES: 10,
  BACKFILL_ON_FIRST_RUN: false,
  WRITE_DAILY_STANDUP: true,
};

const PROP_KEYS = {
  TOKEN: "HTB_API_TOKEN",
  LAST_DATE: "HTB_LAST_ACTIVITY_DATE",
  SEEN_KEYS: "HTB_SEEN_ACTIVITY_KEYS",
};

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("HTB Bot")
    .addItem("Setup sheets", "setupHtbBot")
    .addItem("Set HTB token", "setHtbToken")
    .addItem("Test HTB token", "testHtbToken")
    .addItem("Baseline current solves", "baselineCurrentHtbSolves")
    .addItem("Install 10-min detector", "installHtbDetector")
    .addItem("Run check now", "checkHtbSolves")
    .addItem("Reset detector state", "resetHtbDetectorState")
    .addToUi();
}

function setupHtbBot() {
  ensureSolvesSheet_();
  SpreadsheetApp.getUi().alert("HTB Bot sheets are ready.");
}

function setHtbToken() {
  const ui = SpreadsheetApp.getUi();
  const response = ui.prompt(
    "HTB API Token",
    "Paste your HTB bearer token/API token. It will be stored in this spreadsheet script properties.",
    ui.ButtonSet.OK_CANCEL
  );

  if (response.getSelectedButton() !== ui.Button.OK) return;

  const token = response.getResponseText().trim();
  if (!token) {
    ui.alert("Token is empty.");
    return;
  }

  PropertiesService.getScriptProperties().setProperty(PROP_KEYS.TOKEN, token);
  ui.alert("HTB token saved.");
}

function installHtbDetector() {
  ensureSolvesSheet_();

  ScriptApp.getProjectTriggers()
    .filter((trigger) => trigger.getHandlerFunction() === "checkHtbSolves")
    .forEach((trigger) => ScriptApp.deleteTrigger(trigger));

  ScriptApp.newTrigger("checkHtbSolves")
    .timeBased()
    .everyMinutes(CONFIG.POLL_EVERY_MINUTES)
    .create();

  SpreadsheetApp.getUi().alert(
    `HTB detector installed. It will check every ${CONFIG.POLL_EVERY_MINUTES} minutes.`
  );
}

function resetHtbDetectorState() {
  PropertiesService.getScriptProperties().deleteProperty(PROP_KEYS.LAST_DATE);
  PropertiesService.getScriptProperties().deleteProperty(PROP_KEYS.SEEN_KEYS);
  SpreadsheetApp.getUi().alert("Detector state reset. Next run will baseline again.");
}

function testHtbToken() {
  const token = getToken_();
  const activities = fetchHtbActivities_(token);
  const latest = activities.length ? activities[0] : null;

  SpreadsheetApp.getUi().alert(
    latest
      ? `Token works. Latest visible activity: ${latest.name || latest.object_type || "unknown"}`
      : "Token works, but no activity was returned."
  );
}

function baselineCurrentHtbSolves() {
  const token = getToken_();
  const activities = fetchHtbActivities_(token);
  if (!activities.length) {
    SpreadsheetApp.getUi().alert("No HTB activity returned. Baseline was not changed.");
    return;
  }

  activities.sort((a, b) => new Date(activityDate_(a)) - new Date(activityDate_(b)));
  const props = PropertiesService.getScriptProperties();
  props.setProperty(PROP_KEYS.LAST_DATE, activityDate_(activities[activities.length - 1]));
  props.setProperty(PROP_KEYS.SEEN_KEYS, JSON.stringify(activities.map(activityKey_).slice(-500)));

  SpreadsheetApp.getUi().alert("Baseline saved. Future runs will only append newer solves.");
}

function checkHtbSolves() {
  const props = PropertiesService.getScriptProperties();
  const token = getToken_();

  const activities = fetchHtbActivities_(token);
  if (!activities.length) return;

  activities.sort((a, b) => new Date(activityDate_(a)) - new Date(activityDate_(b)));

  const lastDate = props.getProperty(PROP_KEYS.LAST_DATE);
  const seenKeys = new Set(JSON.parse(props.getProperty(PROP_KEYS.SEEN_KEYS) || "[]"));
  const latestDate = activityDate_(activities[activities.length - 1]);

  if (!lastDate && !CONFIG.BACKFILL_ON_FIRST_RUN) {
    props.setProperty(PROP_KEYS.LAST_DATE, latestDate);
    props.setProperty(PROP_KEYS.SEEN_KEYS, JSON.stringify(activities.map(activityKey_)));
    return;
  }

  const newSolves = activities.filter((activity) => {
    const key = activityKey_(activity);
    const isNewer = !lastDate || new Date(activityDate_(activity)) > new Date(lastDate);
    const isSolveType = ["machine", "challenge", "fortress", "endgame"].includes(activityType_(activity));
    return isNewer && isSolveType && !seenKeys.has(key);
  });

  if (newSolves.length) {
    appendSolves_(newSolves);
    if (CONFIG.WRITE_DAILY_STANDUP) appendDailyStandup_(newSolves);
  }

  newSolves.forEach((activity) => seenKeys.add(activityKey_(activity)));
  props.setProperty(PROP_KEYS.LAST_DATE, latestDate);
  props.setProperty(PROP_KEYS.SEEN_KEYS, JSON.stringify(Array.from(seenKeys).slice(-500)));
}

function getToken_() {
  const token = PropertiesService.getScriptProperties().getProperty(PROP_KEYS.TOKEN);
  if (!token) throw new Error("Missing HTB token. Use HTB Bot > Set HTB token first.");
  return token;
}

function fetchHtbActivities_(token) {
  const urls = [
    `https://labs.hackthebox.com/api/v5/user/profile/activity/${CONFIG.HTB_USER_ID}`,
    `https://labs.hackthebox.com/api/v4/user/profile/activity/${CONFIG.HTB_USER_ID}`,
    `https://www.hackthebox.com/api/v4/user/profile/activity/${CONFIG.HTB_USER_ID}`,
    `https://app.hackthebox.com/api/v4/user/profile/activity/${CONFIG.HTB_USER_ID}`,
  ];
  const errors = [];
  let data = null;

  for (const url of urls) {
    const response = UrlFetchApp.fetch(url, {
      method: "get",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
        "X-Requested-With": "XMLHttpRequest",
        "User-Agent": "Mozilla/5.0",
      },
      muteHttpExceptions: true,
    });

    const status = response.getResponseCode();
    const text = response.getContentText();
    if (status >= 200 && status < 300) {
      try {
        data = JSON.parse(text);
        break;
      } catch (error) {
        errors.push(`${url} => ${status}: non-JSON response (${text.slice(0, 80)})`);
        continue;
      }
    }

    errors.push(`${url} => ${status}: ${text.slice(0, 120)}`);
  }

  if (!data) {
    throw new Error(`HTB API failed. Tried: ${errors.join(" | ")}`);
  }

  return (
    ((data || {}).profile || {}).activity ||
    ((data || {}).info || {}).activity ||
    (Array.isArray((data || {}).data) ? data.data : []) ||
    []
  );
}

function appendSolves_(activities) {
  const sheet = ensureSolvesSheet_();
  const rows = activities.map((activity) => [
    activityDate_(activity),
    localDate_(activityDate_(activity)),
    activityType_(activity),
    activity.type || activity.flag_title || "own",
    activity.name || "",
    activity.challenge_category || "",
    activity.machine_avatar ? `https://www.hackthebox.com${activity.machine_avatar}` : "",
    JSON.stringify(activity),
  ]);

  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
}

function ensureSolvesSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(CONFIG.SOLVES_SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(CONFIG.SOLVES_SHEET_NAME);

  if (sheet.getLastRow() === 0) {
    sheet.appendRow([
      "HTB Time",
      "Local Date",
      "Object Type",
      "Solve Type",
      "Name",
      "Category",
      "Asset URL",
      "Raw Activity JSON",
    ]);
    sheet.getRange("A1:H1").setFontWeight("bold");
    sheet.setFrozenRows(1);
  }

  return sheet;
}

function appendDailyStandup_(activities) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.DAILY_STANDUP_SHEET_NAME);
  if (!sheet) return;

  const today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
  const summary = activities
    .map((activity) => {
      const kind = activity.object_type || "HTB";
      const solveType = activity.type || activity.flag_title || "own";
      const name = activity.name || "unknown";
      return `Solved ${kind} ${name} (${solveType})`;
    })
    .join("\n");

  const nextRow = Math.max(sheet.getLastRow() + 1, 2);
  sheet.getRange(nextRow, 1, 1, 2).setValues([[today, summary]]);
}

function localDate_(isoDate) {
  if (!isoDate) return "";
  return Utilities.formatDate(new Date(isoDate), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss");
}

function activityDate_(activity) {
  return (
    activity.date ||
    activity.created_at ||
    activity.createdAt ||
    activity.completed_at ||
    activity.completedAt ||
    activity.owned_at ||
    activity.ownedAt ||
    activity.timestamp ||
    activity.time ||
    ""
  );
}

function activityType_(activity) {
  return String(activity.object_type || activity.objectType || activity.object || activity.kind || "").toLowerCase();
}

function activityKey_(activity) {
  return [
    activityDate_(activity),
    activityType_(activity),
    activity.type || "",
    activity.name || "",
    activity.flag_title || "",
  ].join("|");
}
