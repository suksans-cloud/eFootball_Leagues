/**
 * PE League 2026 - Google Sheets Sync (Apps Script Web App)  v3.13
 * วิธีใช้: เปิด Google Sheet -> ส่วนขยาย -> Apps Script -> วางโค้ดนี้ (ทับของเดิมทั้งหมด) -> Deploy เป็น Web app
 *   Execute as: Me   |   Who has access: Anyone
 *   ถ้าแก้โค้ด ต้อง Deploy > Manage deployments > Edit > Version: New version ทุกครั้ง
 * (ถ้าต้องการป้องกัน ให้ตั้ง SECRET แล้วกรอกรหัสเดียวกันในแอป)
 *
 * v3.11: รองรับการใช้งานหลายเครื่อง (ซิงค์สองทาง)
 *   - เก็บ "รหัสเวอร์ชันข้อมูล" (rev) และไม่ยอมให้เครื่องที่ข้อมูลเก่าเขียนทับของใหม่
 *   - เก็บโลโก้ที่อัปโหลดเองไว้ในแท็บ Logos เพื่อให้ทุกเครื่องเห็นโลโก้ตรงกัน (อย่าแก้ไข)
 *
 * v3.13: ห้องสนทนา เพิ่มตอบกลับ (Reply), รีแอ็กชัน, ประกาศผลแข่งอัตโนมัติ (ข้อความระบบ) — แท็บ Chat เดิมจาก v3.12 อัปเกรดให้เองอัตโนมัติ
 * v3.12: เพิ่ม "ห้องสนทนา" (ห้องรวมห้องเดียว) เก็บข้อความในแท็บ Chat (อย่าแก้หัวตาราง; ลบแถวข้อความได้ที่ชีตโดยตรง)
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
var VERSION = "3.13";

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
  if (p.action === "chat") return out_(chatList_(p));
  if (p.action === "chatmeta") return out_({ ok: true, last: chatLast_(), version: VERSION });
  if (p.action === "pull") return out_(withLock_(pull_));
  return out_({ ok: true, version: VERSION, message: "PE League sync พร้อมใช้งาน" });
}

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    if (SECRET && body.key !== SECRET) return out_({ ok: false, error: "รหัสไม่ถูกต้อง" });
    if (body.action === "push") return out_(withLock_(function () { return push_(body); }));
    if (body.action === "chatPost") return out_(withLock_(function () { return chatPost_(body); }));
    if (body.action === "chatDelete") return out_(withLock_(function () { return chatDelete_(body); }));
    if (body.action === "chatSys") return out_(withLock_(function () { return chatSys_(body); }));
    if (body.action === "chatReact") return out_(withLock_(function () { return chatReact_(body); }));
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

// ===================== ห้องสนทนา (ห้องรวมห้องเดียว) =====================
// คอลัมน์แท็บ Chat: seq | time | name | text | cid | deleted | reply(JSON) | kind("sys"=ข้อความระบบ) | reacts(JSON)
var CHAT_TAB = "Chat";
var CHAT_COLS = 9;
var CHAT_REACTS = ["\uD83D\uDC4D", "\u2764\uFE0F", "\uD83D\uDE02", "\uD83D\uDE2E", "\uD83D\uDE4F", "\uD83D\uDC4F"]; // 👍 ❤️ 😂 😮 🙏 👏

function chatSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(CHAT_TAB);
  if (!sh) {
    sh = ss.insertSheet(CHAT_TAB);
    sh.getRange(1, 1, 1, CHAT_COLS).setValues([["seq", "time", "name", "text", "cid", "deleted", "reply", "kind", "reacts"]]).setFontWeight("bold");
    sh.setFrozenRows(1);
    sh.getRange("B:I").setNumberFormat("@"); // เก็บเป็นข้อความล้วน กันข้อความที่ขึ้นต้นด้วย = ถูกตีเป็นสูตร
  } else if (String(sh.getRange(1, 7).getValue()) !== "reply") { // อัปเกรดแท็บเดิมจาก v3.12
    sh.getRange(1, 7, 1, 3).setValues([["reply", "kind", "reacts"]]).setFontWeight("bold");
    sh.getRange("G:I").setNumberFormat("@");
  }
  return sh;
}

function chatLast_() { return Number(PropertiesService.getScriptProperties().getProperty("chatSeq") || 0); }

function chatJson_(s, def) {
  try { var v = JSON.parse(s); return (v && typeof v === "object") ? v : def; } catch (e) { return def; }
}

function chatRow_(r) {
  var del = String(r[5] || "") !== "";
  return {
    s: Number(r[0]), t: String(r[1]), n: String(r[2]), x: del ? "" : String(r[3]), c: String(r[4]), d: del ? 1 : 0,
    k: String(r[7] || ""), r: (del || !r[6]) ? null : chatJson_(String(r[6]), null), rx: chatJson_(String(r[8] || ""), {})
  };
}

// หาแถวของข้อความตาม seq จาก 1,000 แถวล่าสุด
function chatFind_(sh, seq) {
  var last = sh.getLastRow();
  if (last < 2) return null;
  var from = Math.max(2, last - 999), n = last - from + 1;
  var vals = sh.getRange(from, 1, n, CHAT_COLS).getValues();
  for (var i = vals.length - 1; i >= 0; i--) {
    if (Number(vals[i][0]) === Number(seq)) return { row: from + i, vals: vals[i] };
  }
  return null;
}

// คืนข้อความล่าสุด (limit) หรือข้อความที่เก่ากว่า seq ที่ระบุใน before
function chatList_(p) {
  var limit = Math.min(200, Math.max(1, Number(p.limit) || 80));
  var sh = chatSheet_(), last = sh.getLastRow(), i;
  if (last < 2) return { ok: true, msgs: [], hasMore: false, last: chatLast_() };
  var start, count;
  if (p.before) {
    var seqs = sh.getRange(2, 1, last - 1, 1).getValues(), idx = -1;
    for (i = 0; i < seqs.length; i++) if (Number(seqs[i][0]) < Number(p.before)) idx = i;
    if (idx < 0) return { ok: true, msgs: [], hasMore: false, last: chatLast_() };
    start = Math.max(0, idx - limit + 1); count = idx - start + 1;
    var rows1 = sh.getRange(start + 2, 1, count, CHAT_COLS).getValues();
    return { ok: true, msgs: rows1.map(chatRow_), hasMore: start > 0, last: chatLast_() };
  }
  count = Math.min(limit, last - 1);
  var rows = sh.getRange(last - count + 1, 1, count, CHAT_COLS).getValues();
  return { ok: true, msgs: rows.map(chatRow_), hasMore: (last - 1) > count, last: chatLast_() };
}

function chatAppend_(sh, name, text, cid, reply, kind) {
  var seq = chatLast_() + 1, now = new Date().toISOString();
  sh.appendRow([seq, now, name, text, cid, "", reply || "", kind || "", ""]);
  PropertiesService.getScriptProperties().setProperty("chatSeq", String(seq));
  SpreadsheetApp.flush();
  return { s: seq, t: now, n: name, x: text, c: cid, d: 0, k: kind || "", r: reply ? chatJson_(reply, null) : null, rx: {} };
}

function chatPost_(b) {
  var name = String(b.name || "").replace(/\s+/g, " ").trim().slice(0, 24);
  var text = String(b.text || "").replace(/\r/g, "").trim().slice(0, 500);
  var cid = String(b.cid || "").slice(0, 32);
  if (!name || !text || !cid) return { ok: false, error: "ข้อมูลข้อความไม่ครบ" };
  if (cid === "sys") return { ok: false, error: "รหัสนี้สงวนไว้สำหรับระบบ" };
  var sh = chatSheet_(), rp = "";
  if (b.re) { // ตอบกลับ: ให้เซิร์ฟเวอร์สร้างข้อความอ้างอิงเอง (กันการปลอมข้อความอ้างอิง)
    var f = chatFind_(sh, b.re);
    if (f && String(f.vals[5] || "") === "") {
      rp = JSON.stringify({ s: Number(f.vals[0]), n: String(f.vals[2]), x: String(f.vals[3]).slice(0, 80) });
    }
  }
  return { ok: true, msg: chatAppend_(sh, name, text, cid, rp, "") };
}

// ข้อความระบบ/ประกาศผลแข่ง (ข้อความซ้ำกับข้อความล่าสุดจะไม่ถูกโพสต์ซ้ำ)
function chatSys_(b) {
  var text = String(b.text || "").replace(/\r/g, "").trim().slice(0, 300);
  if (!text) return { ok: false, error: "ไม่มีข้อความ" };
  var sh = chatSheet_(), last = sh.getLastRow();
  if (last >= 2) {
    var lr = sh.getRange(last, 1, 1, CHAT_COLS).getValues()[0];
    if (String(lr[7]) === "sys" && String(lr[3]) === text) return { ok: true, dedup: true };
  }
  return { ok: true, msg: chatAppend_(sh, "ระบบ", text, "sys", "", "sys") };
}

// กด/ยกเลิกรีแอ็กชัน (1 รหัสเครื่อง/ชื่อ ต่อ 1 อิโมจิ ต่อ 1 ข้อความ)
function chatReact_(b) {
  var em = String(b.emoji || ""), cid = String(b.cid || "").slice(0, 32);
  if (CHAT_REACTS.indexOf(em) < 0 || !cid || cid === "sys") return { ok: false, error: "รีแอ็กชันไม่ถูกต้อง" };
  var sh = chatSheet_(), f = chatFind_(sh, b.seq);
  if (!f) return { ok: false, error: "ไม่พบข้อความ (อาจเก่าเกินไป)" };
  if (String(f.vals[5] || "") !== "") return { ok: false, error: "ข้อความถูกลบแล้ว" };
  var rx = chatJson_(String(f.vals[8] || ""), {});
  var list = Array.isArray(rx[em]) ? rx[em] : [], i = list.indexOf(cid);
  if (i >= 0) list.splice(i, 1); else if (list.length < 100) list.push(cid);
  if (list.length) rx[em] = list; else delete rx[em];
  sh.getRange(f.row, 9).setValue(JSON.stringify(rx));
  SpreadsheetApp.flush();
  return { ok: true, rx: rx };
}

// ลบได้เฉพาะข้อความของเครื่อง/ชื่อตัวเอง (ตรวจจากรหัส cid) แถวยังอยู่แต่ล้างเนื้อหา
function chatDelete_(b) {
  if (String(b.cid || "") === "sys") return { ok: false, error: "ลบข้อความระบบไม่ได้" };
  var sh = chatSheet_(), f = chatFind_(sh, b.seq);
  if (!f) return { ok: false, error: "ไม่พบข้อความ (อาจเก่าเกินไป)" };
  if (String(f.vals[4]) !== String(b.cid || "")) return { ok: false, error: "ลบได้เฉพาะข้อความของตัวเอง" };
  sh.getRange(f.row, 4).setValue("");
  sh.getRange(f.row, 6).setValue("1");
  SpreadsheetApp.flush();
  return { ok: true };
}
