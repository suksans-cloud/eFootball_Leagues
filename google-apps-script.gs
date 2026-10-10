/**
 * PE League 2026 - Google Sheets Sync (Apps Script Web App)  v3.11
 * วิธีใช้: เปิด Google Sheet -> ส่วนขยาย -> Apps Script -> วางโค้ดนี้ (ทับของเดิมทั้งหมด) -> Deploy เป็น Web app
 *   Execute as: Me   |   Who has access: Anyone
 *   ถ้าแก้โค้ด ต้อง Deploy > Manage deployments > Edit > Version: New version ทุกครั้ง
 * (ถ้าต้องการป้องกัน ให้ตั้ง SECRET แล้วกรอกรหัสเดียวกันในแอป)
 *
 * v3.11: รองรับการใช้งานหลายเครื่อง (ซิงค์สองทาง)
 *   - เก็บ "รหัสเวอร์ชันข้อมูล" (rev) และไม่ยอมให้เครื่องที่ข้อมูลเก่าเขียนทับของใหม่
 *   - เก็บโลโก้ที่อัปโหลดเองไว้ในแท็บ Logos เพื่อให้ทุกเครื่องเห็นโลโก้ตรงกัน (อย่าแก้ไข)
 *
 * แท็บที่เขียนให้อัตโนมัติ:
 *   Leaderboard  ตารางคะแนนของ Season ปัจจุบัน
 *   Schedule     ตารางแข่งขันทุกสัปดาห์ ทุก Season (พร้อมผู้ชนะ/สถานะ)
 *   TopScorers   ดาวซัลโว / MVP / GK ยอดเยี่ยม ของแต่ละ Season
 *   ประวัติการแข่งขัน  แชมป์-รองแชมป์ของ Season ที่จบแล้ว (ชื่อแท็บตั้งได้ที่ TAB_NAMES)
 *   Teams, Seasons, Matches, Standings, TeamStats, AllTime
 *   Backup, Logos  ก้อนสำรองสำหรับซิงค์/กู้คืน (อย่าแก้ไข)
 * แท็บอื่นที่คุณสร้างเอง (เช่น Sheet5) จะไม่ถูกแตะต้อง
 */
var SECRET = ""; // เช่น "pe2026-abc"  (เว้นว่าง = ไม่ใช้รหัส)
var VERSION = "3.11";

// ชื่อแท็บในชีต: ถ้าเปลี่ยนชื่อแท็บ ให้แก้ตรงนี้ (ซ้าย = ชื่อภายในที่แอปส่งมา, ขวา = ชื่อแท็บจริงในชีต)
var TAB_NAMES = {
  "Champions": "ประวัติการแข่งขัน"
};

function out_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

function withLock_(fn) {
  var lock = LockService.getScriptLock();
  try { lock.waitLock(25000); } catch (e) { return { ok: false, error: "ระบบกำลังบันทึกข้อมูลอยู่ ลองใหม่อีกครั้ง" }; }
  try { return fn(); } finally { lock.releaseLock(); }
}

function getRev_() { return PropertiesService.getScriptProperties().getProperty("rev") || ""; }

function hasBackup_() {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Backup");
  return !!sh && sh.getLastRow() > 1;
}

function doGet(e) {
  var p = (e && e.parameter) || {};
  if (SECRET && p.key !== SECRET) return out_({ ok: false, error: "รหัสไม่ถูกต้อง" });
  if (p.action === "meta") return out_({ ok: true, version: VERSION, rev: getRev_(), hasData: hasBackup_() });
  if (p.action === "pull") return out_(withLock_(pull_));
  return out_({ ok: true, version: VERSION, message: "PE League sync พร้อมใช้งาน" });
}

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    if (SECRET && body.key !== SECRET) return out_({ ok: false, error: "รหัสไม่ถูกต้อง" });
    if (body.action === "push") return out_(withLock_(function () { return push_(body); }));
    return out_({ ok: false, error: "ไม่รู้จักคำสั่ง" });
  } catch (err) {
    return out_({ ok: false, error: String(err) });
  }
}

function sheet_(name) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName(name) || ss.insertSheet(name);
}

// ขยายแผ่นงานให้พอดีกับข้อมูล (กันกรณีแถว/คอลัมน์ไม่พอ)
function ensureSize_(sh, rows, cols) {
  if (sh.getMaxRows() < rows) sh.insertRowsAfter(sh.getMaxRows(), rows - sh.getMaxRows());
  if (sh.getMaxColumns() < cols) sh.insertColumnsAfter(sh.getMaxColumns(), cols - sh.getMaxColumns());
}

// เขียนตาราง (แถวแรก = หัวตาราง) คืนค่า "จำนวนแถวข้อมูล" ที่เขียนจริง
function writeTable_(name, rows) {
  var sh = sheet_(TAB_NAMES[name] || name);
  sh.clearContents();
  if (!rows || !rows.length) return 0;
  var w = 1, i, j;
  for (i = 0; i < rows.length; i++) if (rows[i].length > w) w = rows[i].length;
  var vals = [];
  for (i = 0; i < rows.length; i++) {
    var a = rows[i].slice();
    for (j = a.length; j < w; j++) a.push("");
    vals.push(a);
  }
  ensureSize_(sh, vals.length, w);
  sh.getRange(1, 1, vals.length, w).setValues(vals);
  sh.setFrozenRows(1);
  sh.getRange(1, 1, 1, w).setFontWeight("bold");
  return vals.length - 1;
}

function push_(b) {
  var cur = getRev_();
  // กันเครื่องที่ข้อมูลเก่าเขียนทับของใหม่: baseRev ต้องตรงกับ rev ปัจจุบันของชีต (ยกเว้นสั่ง force)
  if (!b.force && cur && b.baseRev !== cur) {
    return { ok: false, conflict: true, rev: cur, version: VERSION };
  }
  var names = [], counts = {};
  for (var n in b.tables) { counts[n] = writeTable_(n, b.tables[n]); names.push(TAB_NAMES[n] || n); }
  // สำรองข้อมูลทั้งก้อน (แบ่งท่อนละ 40,000 ตัวอักษร เพราะ 1 เซลล์เก็บได้ไม่เกิน 50,000)
  var s = b.backup || "", rows = [["part", "json"]];
  for (var i = 0; i < s.length; i += 40000) rows.push([rows.length - 1, s.slice(i, i + 40000)]);
  writeTable_("Backup", rows);
  // โลโก้ที่อัปโหลดเอง (ส่งมาเฉพาะตอนที่มีการเปลี่ยน)
  if (b.logos) {
    var lr = [["id", "part", "data"]];
    for (var id in b.logos) {
      var d = b.logos[id] || "", k = 0;
      for (var p = 0; p < d.length; p += 40000) lr.push([id, k++, d.slice(p, p + 40000)]);
    }
    writeTable_("Logos", lr);
  }
  if (b.rev) PropertiesService.getScriptProperties().setProperty("rev", b.rev);
  SpreadsheetApp.flush();
  return { ok: true, version: VERSION, rev: b.rev || cur, updatedAt: new Date().toISOString(), sheets: names.concat(["Backup"]), counts: counts };
}

function pull_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName("Backup");
  if (!sh) return { ok: false, error: "ยังไม่มีข้อมูลสำรองในชีต (ให้กดส่งข้อมูลจากแอปก่อน)" };
  var v = sh.getDataRange().getValues().slice(1);
  v.sort(function (a, b) { return a[0] - b[0]; });
  var s = "";
  for (var i = 0; i < v.length; i++) s += v[i][1];
  var data = JSON.parse(s);
  var logos = {}, ls = ss.getSheetByName("Logos");
  if (ls && ls.getLastRow() > 1) {
    var lv = ls.getDataRange().getValues().slice(1);
    lv.sort(function (a, b) { return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] - b[1]; });
    for (var j = 0; j < lv.length; j++) logos[lv[j][0]] = (logos[lv[j][0]] || "") + lv[j][2];
  }
  return { ok: true, data: data, rev: getRev_() || data.rev || "", logos: logos };
}
