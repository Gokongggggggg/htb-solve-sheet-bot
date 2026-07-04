const CONFIG = {
  HTB_USER_ID: "2885938",
  SOLVES_SHEET_NAME: "HTB Solves",
  STATUS_SHEET_NAME: "HTB Bot Status",
  DAILY_STANDUP_SHEET_NAME: "Daily Standup",
  POLL_EVERY_MINUTES: 10,
  BACKFILL_ON_FIRST_RUN: false,
  WRITE_DAILY_STANDUP: true,
};

const PROP_KEYS = {
  TOKEN: "HTB_API_TOKEN",
  LAST_DATE: "HTB_LAST_ACTIVITY_DATE",
  SEEN_KEYS: "HTB_SEEN_ACTIVITY_KEYS",
  INSTALLED_AT: "HTB_DETECTOR_INSTALLED_AT",
  LAST_CHECK_AT: "HTB_LAST_CHECK_AT",
  LAST_CHECK_STATUS: "HTB_LAST_CHECK_STATUS",
};

function onOpen() {
  const props = PropertiesService.getScriptProperties();
  const installed = props.getProperty(PROP_KEYS.INSTALLED_AT);
  const installLabel = installed
    ? `Install 10-min detector (installed ${localDate_(installed)})`
    : "Install 10-min detector";

  SpreadsheetApp.getUi()
    .createMenu("HTB Bot")
    .addItem("Setup sheets", "setupHtbBot")
    .addItem("Set HTB token", "setHtbToken")
    .addItem("Test HTB token", "testHtbToken")
    .addItem("Baseline current solves", "baselineCurrentHtbSolves")
    .addItem("Import latest activity", "importLatestHtbActivity")
    .addItem(installLabel, "installHtbDetector")
    .addItem("Run check now", "checkHtbSolves")
    .addItem("Reset detector state", "resetHtbDetectorState")
    .addToUi();
}

function setupHtbBot() {
  ensureSolvesSheet_();
  updateStatusSheet_("Setup complete");
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
  updateStatusSheet_("Token saved");
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

  const installedAt = new Date().toISOString();
  PropertiesService.getScriptProperties().setProperty(PROP_KEYS.INSTALLED_AT, installedAt);
  updateStatusSheet_(`Detector installed. Checks every ${CONFIG.POLL_EVERY_MINUTES} minutes.`);

  SpreadsheetApp.getUi().alert(
    `HTB detector installed at ${localDate_(installedAt)}. It will check every ${CONFIG.POLL_EVERY_MINUTES} minutes. Reload the sheet to see the menu label update.`
  );
}

function resetHtbDetectorState() {
  PropertiesService.getScriptProperties().deleteProperty(PROP_KEYS.LAST_DATE);
  PropertiesService.getScriptProperties().deleteProperty(PROP_KEYS.SEEN_KEYS);
  updateStatusSheet_("Detector state reset");
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
  updateStatusSheet_("Token test passed");
}

function baselineCurrentHtbSolves() {
  const token = getToken_();
  const activities = fetchHtbActivities_(token);
  if (!activities.length) {
    SpreadsheetApp.getUi().alert("No HTB activity returned. Baseline was not changed.");
    return;
  }

  const latestActivity = latestActivity_(activities);
  const props = PropertiesService.getScriptProperties();
  props.setProperty(PROP_KEYS.LAST_DATE, activityDate_(latestActivity));
  props.setProperty(PROP_KEYS.SEEN_KEYS, JSON.stringify(activities.map(activityKey_).slice(0, 500)));
  updateStatusSheet_(`Baseline saved at ${localDate_(activityDate_(latestActivity))}`);

  SpreadsheetApp.getUi().alert("Baseline saved. Future runs will only append newer solves.");
}

function checkHtbSolves() {
  const props = PropertiesService.getScriptProperties();
  const token = getToken_();

  const activities = fetchHtbActivities_(token);
  if (!activities.length) {
    recordCheckStatus_("No HTB activity returned");
    return;
  }

  const lastDate = props.getProperty(PROP_KEYS.LAST_DATE);
  const seenKeys = new Set(JSON.parse(props.getProperty(PROP_KEYS.SEEN_KEYS) || "[]"));
  const latestDate = activityDate_(latestActivity_(activities));

  if (!lastDate && !CONFIG.BACKFILL_ON_FIRST_RUN) {
    props.setProperty(PROP_KEYS.LAST_DATE, latestDate);
    props.setProperty(PROP_KEYS.SEEN_KEYS, JSON.stringify(activities.map(activityKey_).slice(0, 500)));
    recordCheckStatus_("Baseline initialized; no old solves appended");
    return;
  }

  const newSolves = activities.filter((activity) => {
    const key = activityKey_(activity);
    const isNewer = !lastDate || new Date(activityDate_(activity)) > new Date(lastDate);
    return isNewer && isSolveActivity_(activity) && !seenKeys.has(key);
  }).reverse();

  if (newSolves.length) {
    appendSolves_(newSolves);
    if (CONFIG.WRITE_DAILY_STANDUP) appendDailyStandup_(newSolves);
  }

  newSolves.forEach((activity) => seenKeys.add(activityKey_(activity)));
  props.setProperty(PROP_KEYS.LAST_DATE, latestDate);
  props.setProperty(PROP_KEYS.SEEN_KEYS, JSON.stringify(Array.from(seenKeys).slice(-500)));
  recordCheckStatus_(newSolves.length ? `Imported ${newSolves.length} new HTB activit${newSolves.length === 1 ? "y" : "ies"}` : "Checked; no new HTB activity");
}

function importLatestHtbActivity() {
  const props = PropertiesService.getScriptProperties();
  const token = getToken_();
  const activities = fetchHtbActivities_(token);
  if (!activities.length) {
    SpreadsheetApp.getUi().alert("No HTB activity returned.");
    return;
  }

  const latestSolve = activities.find(isSolveActivity_) || latestActivity_(activities);

  appendSolves_([latestSolve]);
  if (CONFIG.WRITE_DAILY_STANDUP) appendDailyStandup_([latestSolve]);

  const seenKeys = new Set(JSON.parse(props.getProperty(PROP_KEYS.SEEN_KEYS) || "[]"));
  seenKeys.add(activityKey_(latestSolve));
  props.setProperty(PROP_KEYS.LAST_DATE, activityDate_(latestSolve));
  props.setProperty(PROP_KEYS.SEEN_KEYS, JSON.stringify(Array.from(seenKeys).slice(-500)));
  updateStatusSheet_(`Imported latest activity: ${activityName_(latestSolve)}`);

  SpreadsheetApp.getUi().alert(`Imported latest HTB activity: ${activityName_(latestSolve)}`);
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
    localDate_(activityDate_(activity)),
    activityType_(activity),
    activitySolveType_(activity),
    activityName_(activity),
    activityCategory_(activity),
    activityLink_(activity),
  ]);

  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
}

function ensureSolvesSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(CONFIG.SOLVES_SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(CONFIG.SOLVES_SHEET_NAME);

  normalizeSolvesSheet_(sheet);

  if (sheet.getLastRow() === 0) {
    writeSolvesHeader_(sheet);
  }

  ensureStatusSheet_();
  return sheet;
}

function normalizeSolvesSheet_(sheet) {
  if (sheet.getLastRow() === 0) return;

  const header = sheet.getRange(1, 1, 1, Math.min(sheet.getLastColumn(), 8)).getValues()[0];
  const oldFormat =
    header[0] === "HTB Time" &&
    header[1] === "Local Date" &&
    header[6] === "Asset URL" &&
    header[7] === "Raw Activity JSON";

  if (oldFormat) {
    sheet.deleteColumn(8);
    sheet.deleteColumn(1);
  }

  writeSolvesHeader_(sheet);
}

function writeSolvesHeader_(sheet) {
  const headers = ["Local Date", "Object Type", "Solve Type", "Name", "Category", "LINK"];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange("A1:F1").setFontWeight("bold");
  sheet.setFrozenRows(1);
  if (sheet.getLastColumn() > headers.length) {
    sheet.getRange(1, headers.length + 1, 1, sheet.getLastColumn() - headers.length).clearContent();
  }
}

function appendDailyStandup_(activities) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.DAILY_STANDUP_SHEET_NAME);
  if (!sheet) return;

  const today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
  const summary = activities
    .map((activity) => {
      const kind = activity.object_type || "HTB";
      const solveType = activitySolveType_(activity);
      const name = activityName_(activity);
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

function latestActivity_(activities) {
  return activities.find((activity) => activityDate_(activity)) || activities[0];
}

function activityType_(activity) {
  const explicitType = String(activity.object_type || activity.objectType || activity.object || activity.kind || "").toLowerCase();
  if (explicitType) return explicitType;

  const text = [
    activity.type,
    activity.activity_type,
    activity.activityType,
    activity.flag_title,
    activity.object_name,
    activity.objectName,
  ].filter(Boolean).join(" ").toLowerCase();

  if (activity.challenge_category || activity.challenge_category_id || text.includes("challenge")) return "challenge";
  if (activity.machine_avatar || activity.machine_id || activity.machine_name || text.includes("machine")) return "machine";
  if (text.includes("fortress")) return "fortress";
  if (text.includes("endgame")) return "endgame";
  return "";
}

function activitySolveType_(activity) {
  return String(activity.type || activity.solve_type || activity.solveType || activity.flag_title || "own");
}

function activityName_(activity) {
  return String(activity.name || activity.object_name || activity.objectName || activity.machine_name || activity.challenge_name || "unknown");
}

function activityCategory_(activity) {
  return String(
    activity.challenge_category ||
    activity.challengeCategory ||
    activity.category ||
    activity.category_name ||
    activity.categoryName ||
    activity.machine_category ||
    activity.difficulty ||
    activity.difficultyText ||
    ""
  );
}

function activityLink_(activity) {
  const direct =
    activity.url ||
    activity.link ||
    activity.path ||
    activity.machine_url ||
    activity.challenge_url ||
    activity.object_url ||
    activity.objectUrl ||
    "";

  if (direct) return absoluteHtbUrl_(direct);

  const type = activityType_(activity);
  const id = activity.id || activity.object_id || activity.objectId || activity.machine_id || activity.challenge_id || "";
  const name = activityName_(activity);
  const slug = slugify_(name);

  if (type === "machine") {
    if (slug) return `https://app.hackthebox.com/machines/${slug}`;
    if (id) return `https://app.hackthebox.com/machines/${id}`;
  }

  if (type === "challenge") {
    if (slug) return `https://app.hackthebox.com/challenges/${slug}`;
    if (id) return `https://app.hackthebox.com/challenges/${id}`;
  }

  return "";
}

function absoluteHtbUrl_(value) {
  const url = String(value);
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;
  return `https://app.hackthebox.com${url.startsWith("/") ? "" : "/"}${url}`;
}

function slugify_(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function isSolveActivity_(activity) {
  const type = activityType_(activity);
  if (["machine", "challenge", "fortress", "endgame"].includes(type)) return true;

  const text = [
    activity.type,
    activity.activity_type,
    activity.activityType,
    activity.flag_title,
    activity.name,
  ].filter(Boolean).join(" ").toLowerCase();

  return ["own", "owned", "root", "user", "blood", "solve", "completed"].some((word) => text.includes(word));
}

function ensureStatusSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(CONFIG.STATUS_SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(CONFIG.STATUS_SHEET_NAME);

  if (sheet.getLastRow() === 0) {
    sheet.getRange("A1:B1").setValues([["Key", "Value"]]).setFontWeight("bold");
    sheet.setFrozenRows(1);
  }

  updateStatusSheet_();
  return sheet;
}

function recordCheckStatus_(status) {
  const props = PropertiesService.getScriptProperties();
  props.setProperty(PROP_KEYS.LAST_CHECK_AT, new Date().toISOString());
  props.setProperty(PROP_KEYS.LAST_CHECK_STATUS, status);
  updateStatusSheet_(status);
}

function updateStatusSheet_(latestStatus) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(CONFIG.STATUS_SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(CONFIG.STATUS_SHEET_NAME);

  const props = PropertiesService.getScriptProperties();
  const installedAt = props.getProperty(PROP_KEYS.INSTALLED_AT);
  const lastCheckAt = props.getProperty(PROP_KEYS.LAST_CHECK_AT);
  const lastStatus = latestStatus || props.getProperty(PROP_KEYS.LAST_CHECK_STATUS) || "";
  const triggerCount = ScriptApp.getProjectTriggers()
    .filter((trigger) => trigger.getHandlerFunction() === "checkHtbSolves")
    .length;

  const rows = [
    ["Detector installed", installedAt ? `Yes, ${localDate_(installedAt)}` : "No"],
    ["Check interval", `${CONFIG.POLL_EVERY_MINUTES} minutes`],
    ["Active triggers", triggerCount],
    ["Last check", lastCheckAt ? localDate_(lastCheckAt) : ""],
    ["Last status", lastStatus],
  ];

  sheet.clearContents();
  sheet.getRange("A1:B1").setValues([["Key", "Value"]]).setFontWeight("bold");
  sheet.getRange(2, 1, rows.length, 2).setValues(rows);
  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, 2);
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
