/**
 * PE League 2026 - Google Sheets Sync (Apps Script Web App)
 * วิธีใช้: เปิด Google Sheet -> ส่วนขยาย -> Apps Script -> วางโค้ดนี้ -> Deploy เป็น Web app
 *   Execute as: Me   |   Who has access: Anyone
 * (ถ้าต้องการป้องกัน ให้ตั้ง SECRET แล้วกรอกรหัสเดียวกันในแอป)
 */
var SECRET = ""; // เช่น "pe2026-abc"  (เว้นว่าง = ไม่ใช้รหัส)

function out_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  var p = (e && e.parameter) || {};
  if (SECRET && p.key !== SECRET) return out_({ ok: false, error: "รหัสไม่ถูกต้อง" });
  if (p.action === "pull") return out_(pull_());
  return out_({ ok: true, message: "PE League sync พร้อมใช้งาน" });
}

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    if (SECRET && body.key !== SECRET) return out_({ ok: false, error: "รหัสไม่ถูกต้อง" });
    if (body.action === "push") return out_(push_(body));
    return out_({ ok: false, error: "ไม่รู้จักคำสั่ง" });
  } catch (err) {
    return out_({ ok: false, error: String(err) });
  }
}

function sheet_(name) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName(name) || ss.insertSheet(name);
}

function writeTable_(name, rows) {
  var sh = sheet_(name);
  sh.clearContents();
  if (!rows || !rows.length) return;
  var w = 1, i, j;
  for (i = 0; i < rows.length; i++) if (rows[i].length > w) w = rows[i].length;
  var vals = [];
  for (i = 0; i < rows.length; i++) {
    var a = rows[i].slice();
    for (j = a.length; j < w; j++) a.push("");
    vals.push(a);
  }
  sh.getRange(1, 1, vals.length, w).setValues(vals);
  sh.setFrozenRows(1);
  sh.getRange(1, 1, 1, w).setFontWeight("bold");
}

function push_(b) {
  var names = [];
  for (var n in b.tables) { writeTable_(n, b.tables[n]); names.push(n); }
  // สำรองข้อมูลทั้งก้อน (แบ่งท่อนละ 40,000 ตัวอักษร เพราะ 1 เซลล์เก็บได้ไม่เกิน 50,000)
  var s = b.backup || "", rows = [["part", "json"]];
  for (var i = 0; i < s.length; i += 40000) rows.push([rows.length - 1, s.slice(i, i + 40000)]);
  writeTable_("Backup", rows);
  return { ok: true, updatedAt: new Date().toISOString(), sheets: names.concat(["Backup"]) };
}

function pull_() {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Backup");
  if (!sh) return { ok: false, error: "ยังไม่มีข้อมูลสำรองในชีต (ให้กดส่งข้อมูลจากแอปก่อน)" };
  var v = sh.getDataRange().getValues().slice(1);
  v.sort(function (a, b) { return a[0] - b[0]; });
  var s = "";
  for (var i = 0; i < v.length; i++) s += v[i][1];
  return { ok: true, data: JSON.parse(s) };
}
