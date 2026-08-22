// --- Google Apps Script (Code.gs) ---
// ⚠️ แก้ ID ให้ตรงกับ Sheet ของคุณ
var SHEET_ID = '1jwsNSHRNZ62r1hsO6UXJ-NMHASGQJDqvhqQJL4zhiew'; 
var IMAGE_FOLDER_ID = '1aoMOA52d1Ojn4Cr97PKMnSCK2cg1IB8D';
var VIDEO_FOLDER_ID = '1jTnrjTdNLtw9E58TB_sQ5ShELr-6uPrY'; // โฟลเดอร์เก็บวิดีโอทีม 3v3
var SKILL_FOLDER_ID = '12S_ycyylGP6T3oQVLtwkoRJwUNVmM-33'; // โฟลเดอร์เก็บไอคอน/รูปสกิลของตัวละคร
var EQUIP_FOLDER_ID = '14Ci7SczLyh1rg071_jMIP03j0DjSu5Ki'; // โฟลเดอร์เก็บรูปอุปกรณ์ (เซ็ตอุปกรณ์)
var HERO_IMAGE_FOLDER_ID = '1dg4tEQHjhnRd41hqxI2S8oLh-Fv0uR2M'; // โฟลเดอร์เก็บรูปฮีโร่ (Normal/Awakening)
var RING_FOLDER_ID = '1OdiSJQz8Our2k2WSGEburQTHB_TNrLdW'; // โฟลเดอร์เก็บรูปแหวน
var SERVER_VERSION = "6.1.1"; // Updated Version

// 1. ส่วนเปิดหน้าเว็บ
function doGet(e) {
  // รับค่า teamId จาก URL (ถ้ามี)
  var teamId = e.parameter.teamId || null;
  
  // 🟢 เปลี่ยนจาก createHtmlOutput เป็น createTemplate เพื่อให้ส่งตัวแปรได้
  var template = HtmlService.createTemplateFromFile('index');
  
  // ส่งค่า teamId ไปที่หน้าเว็บ
  template.initialTeamId = teamId;
  
  return template.evaluate()
      .setTitle('7K Seven Deadly Sins')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/**
 * include() — ดึงเนื้อหาไฟล์ .html อื่นมาแทรกใน index.html
 * ใช้ใน index.html ด้วย  <?!= include('vue-app') ?>
 * (Apps Script เสิร์ฟไฟล์ .js แยกตรง ๆ ไม่ได้ จึงเก็บ JS ในไฟล์ .html ที่มี <script>)
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// 2. ส่วนรับ-ส่งข้อมูล (API)
function doPost(e) {
  var lock = LockService.getScriptLock();
  // รอสูงสุด 30 วินาที
  try { lock.waitLock(30000); } catch (e) { return out({ status: 'error', message: 'Server Busy' }); }

  try {
    console.log('🔍 DEBUG doPost - SHEET_ID:', SHEET_ID);
    var ss = SpreadsheetApp.openById(SHEET_ID);
    console.log('🔍 DEBUG doPost - ss opened:', ss ? 'success' : 'failed');
    if (!ss) {
      return out({ status: 'error', message: 'Cannot open spreadsheet' });
    }
    var request = JSON.parse(e.postData.contents);
    var action = request.action;

    // =========================================================
    // 🛡️ 0. EMERGENCY VERIFY (แทรกตรงนี้ครับ!)
    // =========================================================
    if (action === 'verifyAdmin') {
     // 👇 แก้รหัสผ่านตรงนี้ครับ
     var myRealSecret = "@#$a1B2c3%^&"; 
     
     if (request.secret === myRealSecret) {
        return out({ status: 'success' });
     } else {
        return out({ status: 'fail' });
     }
  }

    // =========================================================
    // ⚡ INCREMENTAL SAVE — บันทึก/แก้ไข/ลบ "ทีละแถว" ต่อหมวด (ไม่ล้างทั้งชีต = เร็ว)
    // =========================================================
    if (action === 'saveOneItem') {
       var okU = upsertManagerItem(ss, request.category, request.item);
       if (okU) bumpVersion_(ss, request.category);
       return out(okU ? { status: 'success' } : { status: 'error', message: 'Unknown category: ' + request.category });
    }
    if (action === 'deleteOneItem') {
       var okD = deleteManagerItem(ss, request.category, request.id);
       if (okD) bumpVersion_(ss, request.category);
       return out(okD ? { status: 'success' } : { status: 'error', message: 'Unknown category: ' + request.category });
    }
    // 🟢 3v3 Teams / Enemy Patterns — upsert ทีละแถว (ไม่ clear ทั้งชีต, ไม่แตะแถวคนอื่น)
    if (action === 'saveOne3v3Team') {
       var ok3 = upsertOne3v3Team(ss, request.team, request._userGuild || 'all');
       if (ok3) bumpVersion_(ss, 'teams_3v3');
       return out(ok3 ? { status: 'success' } : { status: 'error', message: 'Invalid team (missing id)' });
    }
    if (action === 'deleteOne3v3Team') {
       deleteOne3v3Team(ss, request.id);
       bumpVersion_(ss, 'teams_3v3');
       return out({ status: 'success' });
    }
    if (action === 'saveOneEnemyPattern') {
       var okE = upsertOneEnemyPattern(ss, request.pattern, request._userGuild || 'all');
       if (okE) bumpVersion_(ss, 'enemyPatterns');
       return out(okE ? { status: 'success' } : { status: 'error', message: 'Invalid pattern (missing id)' });
    }
    if (action === 'deleteOneEnemyPattern') {
       deleteOneEnemyPattern(ss, request.id);
       bumpVersion_(ss, 'enemyPatterns');
       return out({ status: 'success' });
    }
    // 🟢 บันทึกหลายทีม/หลายแพทเทิร์นใน request เดียว — แต่เป็น upsert รายแถว (ไม่ clear ทั้งชีต, ไม่แตะกิลด์อื่น)
    if (action === 'saveMany3v3Teams') {
       var t3List = request.teams_3v3 || [];
       var t3Del = request.deletedIds || [];
       var t3Guild = request._userGuild || 'all';
       for (var ti = 0; ti < t3List.length; ti++) { upsertOne3v3Team(ss, t3List[ti], t3Guild); }
       for (var td = 0; td < t3Del.length; td++) { deleteOne3v3Team(ss, t3Del[td]); }
       bumpVersion_(ss, 'teams_3v3');
       return out({ status: 'success', teams_3v3: loadFromSheet(ss, 'Teams3v3', []) });
    }
    // 🗑️ ถังขยะทีม 3v3 — ดูรายการที่ถูกลบ / กู้คืน / ลบถาวร
    if (action === 'getDeleted3v3Teams') {
       return out({ status: 'success', teams: loadDeleted3v3Teams_(ss) });
    }
    if (action === 'restore3v3Team') {
       var rTeam = restoreOne3v3Team(ss, request.id);
       if (!rTeam) return out({ status: 'error', message: 'ไม่พบทีมนี้ในถังขยะ' });
       bumpVersion_(ss, 'teams_3v3');
       return out({ status: 'success', team: rTeam });
    }
    if (action === 'purge3v3Team') {
       hardDeleteOne3v3Team(ss, request.id);
       bumpVersion_(ss, 'teams_3v3');
       return out({ status: 'success' });
    }
    if (action === 'saveManyEnemyPatterns') {
       var epList = request.enemyPatterns || [];
       var epDel = request.deletedIds || [];
       var epGuild = request._userGuild || 'all';
       for (var ei = 0; ei < epList.length; ei++) { upsertOneEnemyPattern(ss, epList[ei], epGuild); }
       for (var ed = 0; ed < epDel.length; ed++) { deleteOneEnemyPattern(ss, epDel[ed]); }
       bumpVersion_(ss, 'enemyPatterns');
       return out({ status: 'success', enemyPatterns: loadFromSheet(ss, 'EnemyPatterns', []) });
    }
    // 🧠 AI Counter snapshot — เขียน (admin) / อ่าน (public, read-only)
    if (action === 'saveCounterSnapshot') {
       if (request._userRole !== 'admin') return out({ status: 'error', message: 'forbidden' });
       saveCounterSnapshotBlob(ss, String(request.snapshot || ''));
       return out({ status: 'success' });
    }
    if (action === 'getCounterSnapshot') {
       return out({ status: 'success', snapshot: loadCounterSnapshotBlob(ss) });
    }
    // 📚 คลังสกิล — บันทึกหลายรายการในครั้งเดียว (bulk import) แบบ upsert รายแถว
    if (action === 'saveManySkillLib') {
       var slList = request.items || [];
       var slOk = 0;
       for (var si = 0; si < slList.length; si++) { if (upsertManagerItem(ss, 'skill_lib', slList[si])) slOk++; }
       if (slOk) bumpVersion_(ss, 'skillLib');
       return out({ status: 'success', saved: slOk });
    }

    // =========================================================
    // 🔐 1. LOGIN
    // =========================================================
    if (action === 'login') {
      var user = verifyUser(ss, request.username, request.password);
      if (user) {
        return out({ status: 'success', user: user });
      } else {
        return out({ status: 'error', message: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
      }
    }

    else if (action === 'shareTeam') {
        var s = ss.getSheetByName('Teams3v3');
        var data = s.getDataRange().getValues();
        var targetName = request.teamName;
        var targetId = request.teamId != null ? String(request.teamId) : ''; // 🟢 ระบุด้วย ID ก่อน (กันชื่อซ้ำอัปเดตผิดแถว)
        var isSharedValue = request.isShared; // รับค่า true/false จากหน้าเว็บ
        var guildName = request.guild_name || 'all'; // 🟢 รับค่า guild_name
        var foundRowIndex = -1;

        // หาแถว: ใช้ ID (คอลัมน์ A) ก่อน ถ้าไม่ได้ส่ง ID มาค่อย fallback ใช้ชื่อทีม
        for (var i = 1; i < data.length; i++) {
            var matchById = targetId && String(data[i][0]) === targetId;
            var matchByName = !targetId && String(data[i][1]) === String(targetName);
            if (matchById || matchByName) {
                foundRowIndex = i + 1;
                break;
            }
        }

        if (foundRowIndex !== -1) {
            // อัปเดตช่อง "Share" (คอลัมน์ที่ 6 หรือ F)
            s.getRange(foundRowIndex, 6).setValue(isSharedValue);
            // 🟢 อัปเดต guild_name (คอลัมน์ที่ 12 หรือ L — Guild_Name; คอลัมน์ 11 คือ LastModified)
            s.getRange(foundRowIndex, 12).setValue(guildName);
            return out({ status: 'success', message: 'อัปเดตสถานะการแชร์เรียบร้อย' });
        } else {
            return out({ status: 'error', message: 'ไม่พบชื่อทีมในฐานข้อมูลหลัก' });
        }
    }

    // =========================================================
    // 🔍 2. GET SHARED TEAM (ดึงข้อมูลทีมเดียวจากหน้า Gallery)
    // =========================================================
    else if (action === 'getSharedTeam') {
        var s = ss.getSheetByName('Teams3v3');
        var data = s.getDataRange().getValues();
        var foundTeam = null;
        var userGuild = request.userGuild || 'all'; // 🟢 รับค่า guild ของผู้ใช้
        var isAdmin = request.isAdmin === true || request.isAdmin === 'true';

        for (var i = 1; i < data.length; i++) {
            if (is3v3RowDeleted_(data[i][16])) continue;   // 🗑️ ข้ามทีมที่ถูกลบ (soft delete)
            if (String(data[i][0]) === String(request.teamId) && (data[i][5] === true || data[i][5] === "true")) {
                var teamGuild = data[i][11] || 'all'; // 🟢 Guild_Name = คอลัมน์ที่ 12 (index 11); index 10 คือ LastModified

                // 🟢 กรอง: Admin เห็นทั้งหมด, User ธรรมดาเห็นเฉพาะ guild ตัวเอง
                if (!isAdmin && userGuild !== 'all' && teamGuild !== 'all' && teamGuild !== userGuild) {
                    continue; // ข้ามทีมที่ไม่ใช่ guild ตัวเอง
                }

                foundTeam = {
                  id: data[i][0],
                  name: data[i][1],
                  data: {
                      teamType: data[i][2],
                      formation: data[i][3],
                      skillQueue: JSON.parse(data[i][4] || '[]'),
                      enemyTeams: JSON.parse(data[i][6] || '[]'),
                      pet: JSON.parse(data[i][7] || 'null'),  // 🟢 เก็บเพื่อ backwards compatibility
                      pets: JSON.parse(data[i][7] || '[null,null,null]'),  // 🟢 อ่าน Pets Array
                      slots: JSON.parse(data[i][8] || '[]'),  // 🟢 แก้ Index เป็น 8
                      note: data[i][9] || '',
                      video: JSON.parse(data[i][12] || 'null'),  // 🎬 Video_JSON
                      skillQueueAlts: JSON.parse(data[i][13] || '[]'),  // 🆕 ชุดจองสกิลเสริม B/C/D...
                      notifyEnabled: data[i][14] === true || data[i][14] === "true"  // 🔔 แจ้งเตือนโน้ตนี้ในหน้าแชร์
                  },
                  guild_name: teamGuild // 🟢 เพิ่ม guild_name
                };
                break;
            }
        }

        if (foundTeam) {
            var masterData = getAllDataSafe(ss);
            return out({ status: 'success', team: foundTeam, masterData: masterData });
        } else {
            return out({ status: 'error', message: 'ไม่พบข้อมูลทีมที่แชร์' });
        }
    }

    // =========================================================
    // 🌎 3. GET ALL SHARED TEAMS (ดึงทุกทีมที่ Share = true)
    // =========================================================
    // 🟢 ส่งข้อมูลทั้งหมดที่ Share=true ไม่กรอง Guild (ให้ Frontend กรองเอง)
    else if (action === 'getAllSharedTeams') {
        var s = ss.getSheetByName('Teams3v3');
        var teamList = [];

        if (s) {
            // อ่านทั้งแผ่น
            var data = s.getDataRange().getValues();
            console.log('🔍 Total rows in sheet:', data.length);
            
            // เริ่มแถวที่ 2 (index 1)
            for (var i = 1; i < data.length; i++) {
                // เช็ค Share (Index 5) - รองรับทุกกรณี
                var shareVal = data[i][5];
                var isShared = shareVal === true || shareVal === "true" || shareVal === "TRUE" || shareVal === "True";
                if (is3v3RowDeleted_(data[i][16])) continue;   // 🗑️ ข้ามทีมที่ถูกลบ (soft delete)
                
                if (isShared) {
                    try {
                        var teamGuild = (data[i][11] || 'all').toString().trim(); // 🟢 คอลัมน์ที่ 12 (index 11)
                        
                        // 🟢 DEBUG: ดูค่าทีมแต่ละทีม (แสดงแค่ 5 ทีมแรก)
                        if (i <= 5) console.log('🔍 Row', i, 'team:', data[i][1], 'guild:', teamGuild, 'share:', shareVal);

                        // 🟢 DEBUG: ดูค่าก่อน push
                        console.log('🔍 BEFORE push - teamGuild:', teamGuild, 'data[i][10]:', data[i][10]);
                        
                        var teamObj = {
                          id: data[i][0],
                          name: data[i][1],
                          data: {
                              teamType: data[i][2],
                              formation: data[i][3],
                              skillQueue: JSON.parse(data[i][4] || '[]'),
                              enemyTeams: JSON.parse(data[i][6] || '[]'),
                              pet: JSON.parse(data[i][7] || 'null'),
                              pets: JSON.parse(data[i][7] || '[null,null,null]'),
                              slots: JSON.parse(data[i][8] || '[]'),
                              note: data[i][9] || '',
                              video: JSON.parse(data[i][12] || 'null'),  // 🎬 Video_JSON
                              skillQueueAlts: JSON.parse(data[i][13] || '[]'),  // 🆕 ชุดจองสกิลเสริม B/C/D...
                              notifyEnabled: data[i][14] === true || data[i][14] === "true",  // 🔔 แจ้งเตือนโน้ตนี้ในหน้าแชร์
                              owner: JSON.parse(data[i][15] || 'null')  // 👥 ทีมที่แอดมินจัดให้ลูกกิล
                          },
                          owner: JSON.parse(data[i][15] || 'null'),
                          guild_name: teamGuild,
                          date: new Date().toISOString()
                        };
                        
                        teamList.push(teamObj);
                        
                        // 🟢 DEBUG: ดูค่าหลัง push
                        console.log('🔍 AFTER push - teamObj.guild_name:', teamObj.guild_name);
                        console.log('🔍 LAST in teamList:', teamList[teamList.length-1].guild_name);
                    } catch(e) { console.log("JSON Parse Error at row " + i); }
                }
            }
        }

        // ⚡ INCREMENTAL: ส่งเฉพาะ category ที่เปลี่ยน (เทียบกับเวอร์ชันที่ client มี)
        var GALLERY_CACHE_CATS = ['heroes', 'pets', 'rings', 'equip_sets', 'accessories', 'skillLib'];
        var clientVersions = request.versions || {};
        var serverVersions = computeServerVersions_(ss);
        var masterData = {};
        GALLERY_CACHE_CATS.forEach(function (cat) {
          if ((clientVersions[cat] || 0) < serverVersions[cat]) {
            masterData[cat] = loadCategoryData_(ss, cat);
          }
        });

        console.log('🔍 SUMMARY - Total shared teams sent:', teamList.length, '| categories refreshed:', Object.keys(masterData));
        return out({ status: 'success', teams: teamList, masterData: masterData, versions: serverVersions });
    }
    
    // =========================================================
    // 📂 2. GET ALL DATA
    // =========================================================
    else if (action === 'getAllData') {
      var data = getAllDataSafe(ss);
      return out(data);
    }

    // ⚡ INCREMENTAL: ส่งเฉพาะ category ที่เปลี่ยน (เทียบกับเวอร์ชันที่ client มี)
    else if (action === 'getUpdates') {
      var clientV = request.versions || {};
      var serverV = computeServerVersions_(ss);
      var changed = {};
      Object.keys(serverV).forEach(function (cat) {
        if ((clientV[cat] || 0) < serverV[cat]) {
          var d = loadCategoryData_(ss, cat);
          if (d !== null) changed[cat] = d;
        }
      });
      return out({ status: 'success', timestamp: new Date().getTime(), versions: serverV, changed: changed });
    }

    // ⚡ INCREMENTAL: ส่งแค่เวอร์ชันปัจจุบัน (เล็กมาก) ไว้ให้ client seed baseline
    else if (action === 'getVersions') {
      return out({ status: 'success', versions: computeServerVersions_(ss) });
    }

    // ⭐ เช็คระดับสมาชิก (Premium) จากอีเมล
    else if (action === 'getUserTier') {
      return out({ status: 'success', tier: checkUserTier_(ss, request.email) });
    }

    // ⚔️ ทีมบุก/ทีมรับ — ดึงเฉพาะที่ผู้ใช้ (email) มีสิทธิ์เห็น
    else if (action === 'getWarTeams') {
      var wEmail = warNorm_(request.email);
      var wTeams = loadWarTeams_(ss).filter(function (t) { return warCanView_(t, wEmail); }).map(function (t) {
        var owner = warNorm_(t.owner) === wEmail;
        return {
          id: t.id, name: t.name, type: t.type, formation: t.formation, heroes: t.heroes, pets: t.pets,
          skillQueue: t.skillQueue, skillQueueAlts: t.skillQueueAlts, note: t.note,
          owner: t.owner, visibility: t.visibility, updatedAt: t.updatedAt,
          canEdit: warCanEdit_(t, wEmail), isOwner: owner,
          // ส่งรายชื่ออีเมลกลับเฉพาะเจ้าของ (ไว้แก้การแชร์)
          allowedEmails: owner ? t.allowedEmails : undefined,
          editorEmails: owner ? t.editorEmails : undefined,
        };
      });
      return out({ status: 'success', teams: wTeams });
    }

    // ⚔️ สร้าง/แก้ไขทีม — ต้อง login; แก้ของเดิมได้เฉพาะ owner/editor
    else if (action === 'saveWarTeam') {
      var svEmail = String(request.email || '').trim();
      if (!svEmail) return out({ status: 'error', message: 'ต้องเข้าสู่ระบบ' });
      var t = request.team || {};
      var wsheet = getWarTeamsSheet_(ss);
      var all = loadWarTeams_(ss);
      var idx = -1;
      for (var wi = 0; wi < all.length; wi++) { if (all[wi].id === String(t.id)) { idx = wi; break; } }
      if (idx === -1) {
        t.owner = svEmail;
        if (!t.id) t.id = 'wt_' + new Date().getTime() + '_' + Math.floor(Math.random() * 1e6);
        t.updatedAt = new Date().getTime();
        wsheet.appendRow(warObjToRow_(t));
      } else {
        var ex = all[idx];
        if (!warCanEdit_(ex, svEmail)) return out({ status: 'error', message: 'ไม่มีสิทธิ์แก้ไขทีมนี้' });
        t.owner = ex.owner; // คงเจ้าของเดิม
        // แก้การแชร์ได้เฉพาะเจ้าของ — คนอื่น (editor) แก้ได้แค่เนื้อทีม
        if (warNorm_(ex.owner) !== warNorm_(svEmail)) {
          t.visibility = ex.visibility; t.allowedEmails = ex.allowedEmails; t.editorEmails = ex.editorEmails;
        }
        t.updatedAt = new Date().getTime();
        wsheet.getRange(idx + 2, 1, 1, WAR_HEADERS.length).setValues([warObjToRow_(t)]);
      }
      return out({ status: 'success', team: t });
    }

    // ⚔️ ลบทีม — เฉพาะเจ้าของ
    else if (action === 'deleteWarTeam') {
      var delEmail = warNorm_(request.email);
      var dsheet = getWarTeamsSheet_(ss);
      var dall = loadWarTeams_(ss);
      for (var di = 0; di < dall.length; di++) {
        if (dall[di].id === String(request.id)) {
          if (warNorm_(dall[di].owner) !== delEmail) return out({ status: 'error', message: 'ลบได้เฉพาะเจ้าของทีม' });
          dsheet.deleteRow(di + 2);
          return out({ status: 'success' });
        }
      }
      return out({ status: 'success' });
    }

    // =========================================================
    // 🎯 SAVE 3V3 TEAMS (Server-Side Guild-Based Merge)
    // =========================================================
    else if (action === 'save3v3Teams') {
      var sheet = ss.getSheetByName('Teams3v3');
      if (!sheet) {
        sheet = ss.insertSheet('Teams3v3');
        var headers = ["Index", "TeamName", "TeamType", "Formation", "SkillQueue", "Share", "Enemy_Targets", "Pet_JSON", "Slots_JSON", "Note", "LastModified", "Guild_Name", "Video_JSON", "SkillQueueAlts_JSON"];
        sheet.appendRow(headers);
        sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold").setBackground("#cfe2f3");
        sheet.setFrozenRows(1);
        sheet.getRange("A:N").setNumberFormat("@");
      }

      var clientTeams = request.teams_3v3 || [];
      var userGuild = request._userGuild || 'all';
      var isAdmin = request._userRole === 'admin' || userGuild === 'all';
      
      Logger.log('🟢 Server-Side Merge for guild: ' + userGuild + ', isAdmin: ' + isAdmin);

      // อ่านข้อมูลปัจจุบันจาก sheet
      var lastRow = sheet.getLastRow();
      var serverData = [];

      if (lastRow > 1) {
        var data = sheet.getRange(2, 1, lastRow - 1, Math.min(14, sheet.getLastColumn())).getValues();
        for (var i = 0; i < data.length; i++) {
          var row = data[i];
          try {
            serverData.push({
              id: row[0],
              name: row[1],
              teamType: row[2] || 'Attack',
              formation: row[3] || 'Basic',
              skillQueue: JSON.parse(row[4] || '[]'),
              isShared: row[5] === true || row[5] === "true",
              enemyTeams: JSON.parse(row[6] || '[]'),
              pet: JSON.parse(row[7] || 'null'),
              pets: JSON.parse(row[7] || '[null,null,null]'),
              slots: JSON.parse(row[8] || '[]'),
              note: row[9] || '',
              lastModified: row[10] || 0,
              guild_name: row[11] || 'all',
              video: JSON.parse(row[12] || 'null'),
              skillQueueAlts: JSON.parse(row[13] || '[]')   // 🆕 ชุดจองสกิลเสริม B/C/D...
            });
          } catch(e) { }
        }
      }

      // 🟢 Server-Side Guild-Based Merge
      var mergedTeams = [];
      var clientTeamIds = {};
      
      // เก็บ ID ของทีมที่ client ส่งมา
      for (var k = 0; k < clientTeams.length; k++) {
        clientTeamIds[clientTeams[k].id] = true;
      }

      // 🟢 แยกข้อมูลกิลอื่นออกมาก่อน (เก็บไว้ทั้งหมด)
      var otherGuildsTeams = serverData.filter(function(team) {
        var teamGuild = team.guild_name || 'all';
        // ถ้าเป็น admin หรือ all guild ให้ client จัดการเอง
        if (isAdmin) return false; // Admin ส่งมาทั้งหมด ไม่ต้องแยก
        // แยกเฉพาะทีมที่ไม่ใช่กิลของ client
        return teamGuild !== userGuild;
      });

      Logger.log('🟢 Other guilds teams: ' + otherGuildsTeams.length);

      mergedTeams = dedupeTeams3v3ById(otherGuildsTeams.concat(clientTeams));

      mergedTeams.sort(function(a, b) {
        return String(a.id).localeCompare(String(b.id));
      });

      sheet.clear();
      var headers = ["Index", "TeamName", "TeamType", "Formation", "SkillQueue", "Share", "Enemy_Targets", "Pet_JSON", "Slots_JSON", "Note", "LastModified", "Guild_Name", "Video_JSON", "SkillQueueAlts_JSON"];
      sheet.appendRow(headers);
      sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold").setBackground("#cfe2f3");
      sheet.setFrozenRows(1);

      var now = Date.now();
      var rows = [];
      for (var n = 0; n < mergedTeams.length; n++) {
        var team = mergedTeams[n];
        rows.push([
          team.id || n,
          team.name || ('Team ' + (n + 1)),
          team.teamType || 'Attack',
          team.formation || 'Basic',
          JSON.stringify(team.skillQueue || []),
          team.isShared || false,
          JSON.stringify(team.enemyTeams || []),
          JSON.stringify(team.pets || [null, null, null]),
          JSON.stringify(team.slots || []),
          team.note || '',
          team.lastModified || now,
          team.guild_name || 'all',
          JSON.stringify(team.video || null),
          JSON.stringify(team.skillQueueAlts || [])   // 🆕 ชุดจองสกิลเสริม B/C/D...
        ]);
      }

      if (rows.length > 0) {
        sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
      }

      Logger.log('🟢 Saved total teams: ' + mergedTeams.length);

      var freshData = loadFromSheet(ss, 'Teams3v3', []);
      bumpVersion_(ss, 'teams_3v3');

      return out({
        status: 'success',
        message: '3v3 Teams saved with server-side guild merge',
        teams_3v3: freshData,
        timestamp: now
      });
    }

    // =========================================================
    // 🎯 SAVE ENEMY PATTERNS (Server-Side Guild-Based Merge)
    // =========================================================
    else if (action === 'saveEnemyPatterns') {
      var sheet = ss.getSheetByName('EnemyPatterns');
      if (!sheet) {
        sheet = ss.insertSheet('EnemyPatterns');
        var headers = ["ID", "Name", "Formation", "Note", "Slots_JSON", "Pet_JSON", "Guild_Name"];
        sheet.appendRow(headers);
        sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold").setBackground("#cfe2f3");
        sheet.setFrozenRows(1);
        sheet.getRange("A:G").setNumberFormat("@");
      }

      var clientPatterns = request.enemyPatterns || [];
      var userGuild = request._userGuild || 'all';
      var isAdmin = request._userRole === 'admin' || userGuild === 'all';
      
      Logger.log('🟢 EnemyPatterns Server-Side Merge for guild: ' + userGuild + ', isAdmin: ' + isAdmin);

      // อ่านข้อมูลปัจจุบันจาก sheet
      var lastRow = sheet.getLastRow();
      var serverData = [];

      if (lastRow > 1) {
        var data = sheet.getRange(2, 1, lastRow - 1, 7).getValues();
        for (var i = 0; i < data.length; i++) {
          var row = data[i];
          try {
            serverData.push({
              id: row[0],
              name: row[1],
              formation: row[2] || 'Basic',
              note: row[3] || '',
              slots: JSON.parse(row[4] || '[]'),
              pet: JSON.parse(row[5] || 'null'),
              guild_name: row[6] || 'all'
            });
          } catch(e) { }
        }
      }

      // 🟢 Server-Side Guild-Based Merge
      var mergedPatterns = [];
      
      // 🟢 แยกข้อมูลกิลอื่นออกมาก่อน (เก็บไว้ทั้งหมด)
      var otherGuildsPatterns = serverData.filter(function(pattern) {
        var patternGuild = pattern.guild_name || 'all';
        if (isAdmin) return false; // Admin ส่งมาทั้งหมด ไม่ต้องแยก
        return patternGuild !== userGuild;
      });

      Logger.log('🟢 Other guilds patterns: ' + otherGuildsPatterns.length);

      // 🟢 รวม: ข้อมูลกิลอื่น + ข้อมูลใหม่ของกิลนี้
      mergedPatterns = otherGuildsPatterns.concat(clientPatterns);

      // เรียงลำดับตาม id
      mergedPatterns.sort(function(a, b) {
        return String(a.id).localeCompare(String(b.id));
      });

      // เขียนข้อมูลใหม่
      sheet.clear();
      var headers = ["ID", "Name", "Formation", "Note", "Slots_JSON", "Pet_JSON", "Guild_Name"];
      sheet.appendRow(headers);
      sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold").setBackground("#cfe2f3");
      sheet.setFrozenRows(1);

      var now = Date.now();
      var rows = [];
      for (var n = 0; n < mergedPatterns.length; n++) {
        var pattern = mergedPatterns[n];
        rows.push([
          pattern.id || n,
          pattern.name || ('Pattern ' + (n + 1)),
          pattern.formation || 'Basic',
          pattern.note || '',
          JSON.stringify(pattern.slots || []),
          JSON.stringify(pattern.pet || null),
          pattern.guild_name || 'all'
        ]);
      }

      if (rows.length > 0) {
        sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
      }

      Logger.log('🟢 Saved total patterns: ' + mergedPatterns.length);

      var freshData = loadFromSheet(ss, 'EnemyPatterns', []);
      bumpVersion_(ss, 'enemyPatterns');

      return out({
        status: 'success',
        message: 'Enemy Patterns saved with server-side guild merge',
        enemyPatterns: freshData,
        timestamp: now
      });
    }

    // =========================================================
    // 📝 3. OTHER ACTIONS
    // =========================================================
    else if (action === 'getPublicConfig') {
      var conf = loadFromSheet(ss, 'SurveyConfig', []);
      return out({ status: 'success', surveyConfig: conf });
    }
    else if (action === 'submitApplication') {
       if (request.data && request.data.images && Array.isArray(request.data.images)) {
           var tempApps = [request.data]; 
           processApplicationImages(tempApps);
           request.data = tempApps[0]; 
       }
       appendApplicationToSheet(ss, request.data);
       bumpVersion_(ss, 'applications');
       return out('success', 'Application Received');
    }
    else if (action === 'deleteImages') {
       if (request.urls) deleteImagesFromDrive(request.urls);
       return out('success', 'Images Deleted');
    }
    else if (action === 'uploadVideo') {
       var vid = uploadVideoToDrive(request.fileData, request.fileName);
       if (vid) {
         return out({ status: 'success', video: vid });
       }
       return out({ status: 'error', message: 'อัปโหลดวิดีโอไม่สำเร็จ' });
    }
    else if (action === 'uploadSkillImage') {
       var simg = uploadImageToFolder(request.fileData, request.fileName, SKILL_FOLDER_ID);
       if (simg) {
         return out({ status: 'success', url: simg });
       }
       return out({ status: 'error', message: 'อัปโหลดไอคอนสกิลไม่สำเร็จ' });
    }
    else if (action === 'uploadEquipImage') {
       var eFolder = request.folderId || EQUIP_FOLDER_ID;
       var eimg = uploadImageToFolder(request.fileData, request.fileName, eFolder);
       if (eimg) {
         return out({ status: 'success', url: eimg });
       }
       return out({ status: 'error', message: 'อัปโหลดรูปอุปกรณ์ไม่สำเร็จ' });
    }
    else if (action === 'uploadHeroImage') {
       var hFolder = request.folderId || HERO_IMAGE_FOLDER_ID;
       var himg = uploadImageToFolder(request.fileData, request.fileName, hFolder);
       if (himg) {
         return out({ status: 'success', url: himg });
       }
       return out({ status: 'error', message: 'อัปโหลดรูปฮีโร่ไม่สำเร็จ' });
    }
    else if (action === 'uploadRingImage') {
       var rFolder = request.folderId || RING_FOLDER_ID;
       var rimg = uploadImageToFolder(request.fileData, request.fileName, rFolder);
       if (rimg) {
         return out({ status: 'success', url: rimg });
       }
       return out({ status: 'error', message: 'อัปโหลดรูปแหวนไม่สำเร็จ' });
    }

    // =========================================================
    // 👤 GET MEMBER INVENTORY (โหลด inventory สมาชิกคนเดียว)
    // =========================================================
    else if (action === 'getMemberInventory') {
      var gId = String(request.guild_id || '');
      var gName = String(request.guild_name || '');
      var mId = String(request.member_id != null ? request.member_id : '');
      var aCode = request.accessCode ? String(request.accessCode).trim() : '';
      // 🟢 ถ้าไม่มี guild_id แต่ส่งค่าจาก g= มา (อาจเป็น "ชื่อกิล" หรือ "รหัสกิล") → จับคู่ให้ได้ทั้งคู่
      if (!gId && gName) {
        var gMeta = loadFromSheet(ss, 'Guilds', []);
        var lc = gName.toLowerCase();
        for (var gi = 0; gi < gMeta.length; gi++) {
          if (!gMeta[gi]) continue;
          if (String(gMeta[gi].name || '').toLowerCase() === lc || String(gMeta[gi].id || '').toLowerCase() === lc) { gId = String(gMeta[gi].id); break; }
        }
        if (!gId) gId = gName; // ไม่เจอในตาราง → ใช้ค่านั้นเป็น guild_id ตรงๆ (เผื่อ member rows ใช้ค่านี้)
      }
      if (!gId) gId = 'G_MAIN';
      var rows = loadMemberRowsForTarget(ss, gId, mId, aCode);
      if (!rows.length) {
        return out({ status: 'not_found', message: 'Member not found' });
      }
      var mem = rows[0];
      return out({
        status: 'success',
        name: mem.name || '',
        member_id: mem.id || '',
        hero_list: mem.hero_list || [],
        pet_list: mem.pet_list || [],
        ring_list: mem.ring_list || [],
        inventoryUpdatedAt: mem.inventoryUpdatedAt || 0,
        heroCount: (mem.hero_list || []).length,
        petCount: (mem.pet_list || []).length,
        ringCount: (mem.ring_list || []).length
      });
    }

    // =========================================================
    // 👤 SAVE MEMBER INVENTORY (Hero / Pet / Ring — บันทึกเฉพาะสมาชิก)
    // =========================================================
    else if (action === 'saveMemberInventory') {
      var guildId = String(request.guild_id || 'G_MAIN');
      var memberId = String(request.member_id != null ? request.member_id : '');
      var accessCode = request.accessCode ? String(request.accessCode).trim() : '';
      var patch = cloneMemberInventoryPatch(request.patch || {});
      var saveMode = request.saveMode === 'replace' ? 'replace' : 'merge';
      var portalSource = String(request.source || '');
      if (portalSource === 'roster') {
        delete patch.teams;
      }

      // 🔒 Lock + โหลดเฉพาะแถวสมาชิกเป้าหมาย (ไม่โหลดทั้งชีต) → patch → upsert แถวเดียว
      var memberRows = loadMemberRowsForTarget(ss, guildId, memberId, accessCode);
      var rowIdx = memberRows.length > 0 ? 0 : -1;
      // ไม่ใช้ optimistic-lock conflict — ลูกกิลด์บันทึกแหวนแบบ replace ทั้งรายการ
      // มักชน serverAt > expectedAt หลัง admin pushData bump timestamp โดยไม่แตะ inventory

      if (rowIdx < 0) {
        memberRows = [{
          guild_id: guildId,
          id: memberId,
          name: patch.name || '',
          accessCode: patch.accessCode || accessCode || '',
          hero_list: patch.hero_list || [],
          pet_list: patch.pet_list || [],
          ring_list: patch.ring_list || [],
          teams: patch.teams || [],
          inventoryUpdatedAt: Date.now()
        }];
        rowIdx = 0;
      } else {
        applyInventoryPatchToRow(memberRows[rowIdx], patch, saveMode);
      }

      var saved = memberRows[rowIdx] || null;
      var savedRow = rowIdx;
      // บันทึกเฉพาะแถวสมาชิก (ไม่ clear ทั้งชีต GuildMembers)
      if (saved) {
        saved.guild_id = saved.guild_id || guildId;
        saved.accessCode = saved.accessCode || accessCode || '';
        saved.ring_list = normalizeRingList(saved.ring_list || []);
        var sheetRowWritten = upsertGuildMemberInventoryRow(ss, saved);
        deleteDuplicateMemberSheetRows(ss, saved);
        // อ่านกลับจากแถวที่เพิ่งเขียน (ไม่ใช้ dedupe แถวอื่นที่อาจเก่ากว่า)
        if (sheetRowWritten > 0) {
          var s = ss.getSheetByName('GuildMembers');
          var rowBlock = readGuildMemberSheetBlock(s, sheetRowWritten, sheetRowWritten, GUILD_MEMBERS_COL_COUNT);
          if (rowBlock.length) {
            saved = parseGuildMemberSheetValues(rowBlock[0], GUILD_MEMBERS_COL_COUNT);
            saved.guild_id = saved.guild_id || guildId;
          }
        }
      }
      bumpVersion_(ss, 'guilds'); // สมาชิก/inventory เปลี่ยน → guilds เวอร์ชันใหม่
      return out({
        status: 'success',
        message: 'Member inventory saved',
        saveMode: saveMode,
        heroCount: saved ? ((saved.hero_list || []).length) : 0,
        petCount: saved ? ((saved.pet_list || []).length) : 0,
        ringCount: saved ? ((saved.ring_list || []).length) : 0,
        rowIndex: savedRow,
        inventoryUpdatedAt: saved ? (saved.inventoryUpdatedAt || Date.now()) : Date.now(),
        hero_list: saved ? (saved.hero_list || []) : [],
        pet_list: saved ? (saved.pet_list || []) : [],
        ring_list: saved ? (saved.ring_list || []) : []
      });
    }

    // =========================================================
    // 💾 4. SAVE DATA (บันทึกข้อมูลหลัก)
    // =========================================================
    else {
       // จัดการรูปก่อน
       if (request.applications) processApplicationImages(request.applications);

       var keyMap = getKeyMap();
       var isServerMerge = request._mergeMode === 'server';
       var userGuild = request._userGuild || 'all';
       var isAdmin = request._userRole === 'admin' || userGuild === 'all';

       // 1. บันทึก GuildMembers (ถ้ามี)
       if (request.guildMembers) {
           saveToSheet(ss, 'GuildMembers', request.guildMembers);
       }

       // 2. 🟢 teams_3v3 / enemyPatterns — upsert รายแถวเสมอ (ไม่ clear ทั้งชีต, ไม่แตะแถวกิลด์อื่น)
       if (request.teams_3v3 !== undefined && request.teams_3v3) {
          for (var qt = 0; qt < request.teams_3v3.length; qt++) {
             upsertOne3v3Team(ss, request.teams_3v3[qt], userGuild);
          }
       }
       if (request.enemyPatterns !== undefined && request.enemyPatterns) {
          for (var qe = 0; qe < request.enemyPatterns.length; qe++) {
             upsertOneEnemyPattern(ss, request.enemyPatterns[qe], userGuild);
          }
       }

       // 3. บันทึกส่วนอื่นๆ (teams_3v3/enemyPatterns ข้ามเสมอ — upsert ไปแล้วข้างบน ห้ามให้ clear ทั้งชีต)
       Object.keys(keyMap).forEach(function(k) {
          if (request[k] !== undefined && k !== 'guildMembers') {
             if (k === 'teams_3v3' || k === 'enemyPatterns') {
                Logger.log('🟢 Skipped ' + k + ' (per-row upserted)');
                return;
             }
             var sheetOpts = (k === 'guilds' && request._skipMemberInventorySync === true)
               ? { skipMemberInventory: true }
               : null;
             saveToSheet(ss, keyMap[k], request[k], sheetOpts);
          }
       });
       
       // 4. บันทึก User & Logs
       if(request.users) saveUsersToSheet(ss, request.users);
       if(request.auditLogs) saveLogsToSheet(ss, request.auditLogs);

       return out({ status: 'success', message: 'Saved successfully' + (isServerMerge ? ' (Server Merge)' : '') });
    }

  } catch (err) { 
    return out({ status: 'error', message: err.toString() }); 
  } finally { 
    lock.releaseLock(); 
  }
}

// 🟢 ลบทีมซ้ำตาม id (เก็บตัวที่ lastModified ใหม่กว่า) — กัน concat ซ้ำเมื่อ client ส่งครบทุกกิลด์
function dedupeTeams3v3ById(teams) {
  var byId = {};
  for (var i = 0; i < teams.length; i++) {
    var t = teams[i];
    if (!t || t.id === undefined || t.id === null || t.id === '') continue;
    var id = String(t.id);
    var prev = byId[id];
    if (!prev || (t.lastModified || 0) >= (prev.lastModified || 0)) {
      byId[id] = t;
    }
  }
  var keys = Object.keys(byId);
  var out = [];
  for (var k = 0; k < keys.length; k++) {
    out.push(byId[keys[k]]);
  }
  return out;
}


// --- CORE LOGIC FUNCTIONS ---

function getAllDataSafe(ss) {
  var result = { status: 'success', timestamp: new Date().getTime() };
  var keyMap = getKeyMap();
  
  Object.keys(keyMap).forEach(function(k) {
    if (k === 'guilds' || k === 'guildMembers') return;
    var def = (k === 'manualUsage' || k === 'seasonInfo') ? {} : [];
    result[k] = loadFromSheet(ss, keyMap[k], def);
  });

  var guildMeta = loadFromSheet(ss, 'Guilds', []);
  var memberRows = loadFromSheet(ss, 'GuildMembers', []);
  result.guilds = assembleGuildsWithMembers(guildMeta, memberRows);
  result.guildMembers = memberRows;
  
  result.auditLogs = loadLogsFromSheet(ss);
  result.versions = computeServerVersions_(ss); // ⚡ เวอร์ชันต่อ category (ให้ client seed baseline / ทำ incremental)
  return result;
}

// --- GUILD MEMBERS: แยกแถวต่อสมาชิก (หลีกเลี่ยง limit 50K ต่อเซลล์) ---

function memberRowToObject(m) {
  return {
    id: String(m.id != null ? m.id : ''),
    name: m.name || '',
    accessCode: m.accessCode || '',
    hero_list: m.hero_list || m.ownedHeroes || [],
    pet_list: m.pet_list || [],
    ring_list: m.ring_list || [],
    teams: m.teams || [],
    inventoryUpdatedAt: parseInt(m.inventoryUpdatedAt, 10) || 0
  };
}

function normalizeMemberCodeServer(code) {
  return String(code != null ? code : '').trim();
}

/** อ่าน AccessCode จากชีต — เก็บเป็น String เสมอ (รักษา 001, player01) */
function accessCodeFromSheetCell(val) {
  if (val === null || val === undefined) return '';
  return String(val).trim();
}

function memberCodesMatchServer(a, b) {
  var x = normalizeMemberCodeServer(a).toLowerCase();
  var y = normalizeMemberCodeServer(b).toLowerCase();
  return x.length > 0 && x === y;
}

function sheetColLetter(colNum) {
  var letter = '';
  var n = colNum;
  while (n > 0) {
    var rem = (n - 1) % 26;
    letter = String.fromCharCode(65 + rem) + letter;
    n = Math.floor((n - 1) / 26);
  }
  return letter;
}

/** อ่านบล็อกชีต GuildMembers แบบ A1 (หลีกเลี่ยงความกำกวมของ getRange 4 พารามิเตอร์) */
function readGuildMemberSheetBlock(s, startRow, endRow, numCols) {
  if (!s || endRow < startRow || startRow < 1) return [];
  var endCol = sheetColLetter(numCols || GUILD_MEMBERS_COL_COUNT);
  return s.getRange('A' + startRow + ':' + endCol + endRow).getValues();
}

function safeParseJsonArray(str, fallback) {
  try {
    var v = JSON.parse(str || '[]');
    return Array.isArray(v) ? v : (fallback || []);
  } catch (e) {
    return fallback || [];
  }
}

/** หัวคอลัมน์ชีต GuildMembers (1 สมาชิก = 1 แถว) */
var GUILD_MEMBERS_HEADERS = [
  'Guild_ID', 'Member_ID', 'Name', 'AccessCode',
  'Heroes_JSON', 'Pets_JSON', 'Rings_JSON', 'Teams_JSON', 'Updated_At'
];
var GUILD_MEMBERS_COL_COUNT = 9;

/** แปลง object สมาชิก → แถวชีต 9 คอลัมน์ */
function memberObjectToSheetRow(m) {
  return [
    String(m.guild_id || 'G_MAIN'),
    String(m.id != null ? m.id : ''),
    m.name || '',
    String(m.accessCode != null ? m.accessCode : ''),
    JSON.stringify(m.hero_list || m.ownedHeroes || []),
    JSON.stringify(m.pet_list || []),
    JSON.stringify(m.ring_list || []),
    JSON.stringify(m.teams || []),
    String(parseInt(m.inventoryUpdatedAt, 10) || Date.now())
  ];
}

/** สร้างหัวตารางถ้ายังไม่มี (ไม่ลบข้อมูลเดิม) */
function ensureGuildMembersSheet(ss) {
  var s = ss.getSheetByName('GuildMembers') || ss.insertSheet('GuildMembers');
  if (s.getLastRow() < 1) {
    s.appendRow(GUILD_MEMBERS_HEADERS);
    s.getRange(1, 1, 1, GUILD_MEMBERS_COL_COUNT).setFontWeight('bold').setBackground('#c9daf8');
    s.setFrozenRows(1);
    s.getRange('A:I').setNumberFormat('@');
  } else {
    var h1 = String(s.getRange(1, 1).getValue() || '').trim();
    if (h1 !== 'Guild_ID') {
      s.getRange(1, 1, 1, GUILD_MEMBERS_COL_COUNT).setValues([GUILD_MEMBERS_HEADERS]);
      s.getRange(1, 1, 1, GUILD_MEMBERS_COL_COUNT).setFontWeight('bold').setBackground('#c9daf8');
      s.setFrozenRows(1);
    }
    s.getRange('A:I').setNumberFormat('@');
  }
  return s;
}

/**
 * สแกนคอลัมน์ A–D ทั้งชีต (เบา) หาแถวที่ตรงกับสมาชิก — คืนเลขแถวชีต (1-based) ทั้งหมด
 */
function findAllMemberSheetRowIndices(ss, guildId, memberId, accessCode) {
  var s = ss.getSheetByName('GuildMembers');
  if (!s || s.getLastRow() < 2) return [];

  var lastRow = s.getLastRow();
  var data = readGuildMemberSheetBlock(s, 2, lastRow, 4);
  var out = [];

  for (var i = 0; i < data.length; i++) {
    if (memberSheetRowMatchesMember(data[i], guildId, memberId, accessCode)) {
      out.push(i + 2);
    }
  }
  return out;
}

/** หาแถวแรกที่ตรง (ใช้ upsert) */
function findMemberSheetRowIndex(ss, guildId, memberId, accessCode) {
  var all = findAllMemberSheetRowIndices(ss, guildId, memberId, accessCode);
  return all.length > 0 ? all[0] : -1;
}

/** แปลงค่าในแถวชีต → object สมาชิก */
function parseGuildMemberSheetValues(r, readCols) {
  readCols = readCols || GUILD_MEMBERS_COL_COUNT;
  return {
    guild_id: String(r[0] || 'G_MAIN'),
    id: String(r[1] != null ? r[1] : ''),
    name: r[2] || '',
    accessCode: accessCodeFromSheetCell(r[3]),
    hero_list: safeParseJsonArray(r[4], []),
    pet_list: safeParseJsonArray(r[5], []),
    ring_list: safeParseJsonArray(r[6], []),
    teams: safeParseJsonArray(r[7], []),
    inventoryUpdatedAt: readCols >= 9 ? (parseInt(r[8], 10) || 0) : 0
  };
}

/** อ่านเฉพาะแถวที่ตรงกับสมาชิก (รองรับแถวซ้ำในชีต) */
function loadAllMatchingMemberRowsFromSheet(ss, guildId, memberId, accessCode) {
  var indices = findAllMemberSheetRowIndices(ss, guildId, memberId, accessCode);
  if (!indices.length) return [];

  var s = ss.getSheetByName('GuildMembers');
  var sheetCols = s.getLastColumn();
  var readCols = sheetCols >= 9 ? 9 : (sheetCols >= 8 ? 8 : GUILD_MEMBERS_COL_COUNT);
  var rows = [];

  for (var k = 0; k < indices.length; k++) {
    var rowBlock = readGuildMemberSheetBlock(s, indices[k], indices[k], readCols);
    if (!rowBlock.length) continue;
    rows.push(parseGuildMemberSheetValues(rowBlock[0], readCols));
  }
  return rows;
}

/**
 * โหลดข้อมูลสมาชิกเป้าหมายสำหรับ saveMemberInventory
 * — สแกน A–D ทั้งชีต (ไม่ parse JSON ทุกแถว)
 * — อ่าน JSON เฉพาะแถวที่ตรง + รวมแถวซ้ำใน memory
 */
function loadMemberRowsForTarget(ss, guildId, memberId, accessCode) {
  var rows = loadAllMatchingMemberRowsFromSheet(ss, guildId, memberId, accessCode);
  if (rows.length > 0) return dedupeMemberRowsByKey(rows);

  // fallback: ยังไม่มีแถวในชีต (สมาชิกใหม่ / migration จาก Guilds เก่า)
  var all = loadMemberRowsForSave(ss);
  var idx = findMemberRowIndex(all, guildId, memberId, accessCode);
  if (idx >= 0) return [all[idx]];
  return [];
}

function memberSheetRowMatchesMember(sheetRowValues, guildId, memberId, accessCode) {
  if (!sheetRowValues || !sheetRowValues.length) return false;
  var gid = String(sheetRowValues[0] || 'G_MAIN');
  var gidTarget = String(guildId || 'G_MAIN');
  if (gid !== gidTarget) return false;
  if (accessCode && memberCodesMatchServer(sheetRowValues[3], accessCode)) return true;
  if (memberId && String(sheetRowValues[1]) === String(memberId)) return true;
  return false;
}

/**
 * บันทึก inventory สมาชิกคนเดียว — อัปเดตแถวเดิมหรือ append แถวใหม่
 * ใช้กับ saveMemberInventory (ไม่เขียนทับสมาชิกคนอื่น)
 */
function upsertGuildMemberInventoryRow(ss, memberRow) {
  var s = ensureGuildMembersSheet(ss);
  var values = memberObjectToSheetRow(memberRow);
  var sheetRow = findMemberSheetRowIndex(
    ss,
    memberRow.guild_id,
    memberRow.id,
    memberRow.accessCode
  );

  if (sheetRow > 0) {
    s.getRange('A' + sheetRow + ':I' + sheetRow).setValues([values]);
    return sheetRow;
  }

  s.appendRow(values);
  return s.getLastRow();
}

/**
 * ลบแถวซ้ำของสมาชิกคนเดียวกันในชีต (เก็บแถวที่ upsert ล่าสุด)
 */
function deleteDuplicateMemberSheetRows(ss, keptMember) {
  var s = ss.getSheetByName('GuildMembers');
  if (!s || s.getLastRow() < 2 || !keptMember) return 0;

  var guildId = keptMember.guild_id || 'G_MAIN';
  var memberId = keptMember.id;
  var accessCode = keptMember.accessCode || '';
  var keepSheetRow = findMemberSheetRowIndex(ss, guildId, memberId, accessCode);
  var deleted = 0;

  for (var r = s.getLastRow(); r >= 2; r--) {
    if (r === keepSheetRow) continue;
    var rowVals = s.getRange(r, 1, 1, 4).getValues()[0];
    if (memberSheetRowMatchesMember(rowVals, guildId, memberId, accessCode)) {
      s.deleteRow(r);
      deleted++;
      if (keepSheetRow > r) keepSheetRow--;
    }
  }
  return deleted;
}

function loadMemberRowsForSave(ss) {
  var memberRows = loadFromSheet(ss, 'GuildMembers', []);
  if (memberRows && memberRows.length > 0) return memberRows;
  var guildMeta = loadFromSheet(ss, 'Guilds', []);
  return flattenMembersFromGuilds(assembleGuildsWithMembers(guildMeta, []));
}

function findMemberRowIndex(memberRows, guildId, memberId, accessCode) {
  var gidTarget = String(guildId || 'G_MAIN');
  var codeTarget = accessCode ? normalizeMemberCodeServer(accessCode).toLowerCase() : '';

  // 1) จับคู่ด้วย accessCode ก่อน (ลูกกิลด์ login ด้วยรหัส — แม่นที่สุด)
  if (codeTarget) {
    for (var i = 0; i < (memberRows || []).length; i++) {
      var rCode = memberRows[i];
      if (String(rCode.guild_id || 'G_MAIN') !== gidTarget) continue;
      if (memberCodesMatchServer(rCode.accessCode, accessCode)) return i;
    }
  }

  // 2) จับคู่ด้วย member id
  if (memberId) {
    for (var j = 0; j < (memberRows || []).length; j++) {
      var rId = memberRows[j];
      if (String(rId.guild_id || 'G_MAIN') !== gidTarget) continue;
      if (String(rId.id) === String(memberId)) return j;
    }
  }
  return -1;
}

function cloneMemberInventoryPatch(patch) {
  var out = {};
  if (!patch) return out;
  if (patch.name !== undefined) out.name = patch.name;
  if (patch.accessCode !== undefined) out.accessCode = String(patch.accessCode).trim();
  if (patch.hero_list !== undefined) out.hero_list = JSON.parse(JSON.stringify(patch.hero_list || []));
  if (patch.pet_list !== undefined) out.pet_list = JSON.parse(JSON.stringify(patch.pet_list || []));
  if (patch.ring_list !== undefined) out.ring_list = normalizeRingList(patch.ring_list || []);
  if (patch.teams !== undefined) out.teams = JSON.parse(JSON.stringify(patch.teams || []));
  return out;
}

function memberRowKey(r) {
  var gid = String(r.guild_id || 'G_MAIN');
  var code = normalizeMemberCodeServer(r.accessCode).toLowerCase();
  if (code) return gid + '::code::' + code;
  return gid + '::id::' + String(r.id != null ? r.id : '');
}

/** รวมรายการตาม id — ค่าจาก incoming ทับของเดิม (รองรับการลด C / แก้สเตตัสย้อนลง) */
function mergeHeroLists(baseList, incomingList) {
  var byId = {};
  function put(h) {
    if (!h || h.id == null || h.id === '') return;
    var id = String(h.id);
    byId[id] = { id: id, star: parseInt(h.star, 10) || 0, awakened: !!h.awakened, hasAcc: !!h.hasAcc };
  }
  (baseList || []).forEach(put);
  (incomingList || []).forEach(put);
  return Object.keys(byId).map(function(k) { return byId[k]; });
}

function mergePetLists(baseList, incomingList) {
  var byId = {};
  function put(p) {
    if (!p || p.id == null || p.id === '') return;
    var id = String(p.id);
    var pot = parseInt(p.potential, 10);
    var sk = parseInt(p.skillUnlock, 10);
    byId[id] = {
      id: id,
      star: parseInt(p.star, 10) || 0,
      potential: pot >= 1 && pot <= 4 ? pot : 0,
      skillUnlock: sk >= 1 && sk <= 3 ? sk : 0
    };
  }
  (baseList || []).forEach(put);
  (incomingList || []).forEach(put);
  return Object.keys(byId).map(function(k) { return byId[k]; });
}

function generateRingUid() {
  return 'rng_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

/**
 * แต่ละชิ้นแหวนในรายการสมาชิก:
 * - uid  = รหัสสุ่มไม่ซ้ำ (ใช้ merge/บันทึก — แม้ชื่อแหวน id เดียวกัน)
 * - no   = ลำดับที่แสดง (1, 2, 3…) อาจเรียงใหม่ตามลำดับใน list ตอนบันทึก
 */
function normalizeRingEntry(r, index) {
  if (!r || r.id == null || r.id === '') return null;
  var entry = {
    no: parseInt(r.no, 10) || (index != null ? index + 1 : 1),
    id: String(r.id),
    stackId: r.stackId ? String(r.stackId) : null,
    uid: r.uid ? String(r.uid) : generateRingUid()
  };
  return entry;
}

function normalizeRingList(list) {
  var out = [];
  (list || []).forEach(function(r, i) {
    var n = normalizeRingEntry(r, i);
    if (n) {
      n.no = i + 1;
      out.push(n);
    }
  });
  return out;
}

function mergeRingLists(baseList, incomingList) {
  var byUid = {};
  var order = [];
  function addList(list) {
    (list || []).forEach(function(r, i) {
      var n = normalizeRingEntry(r, i);
      if (!n) return;
      if (!byUid[n.uid]) order.push(n.uid);
      byUid[n.uid] = n;
    });
  }
  addList(baseList);
  addList(incomingList);
  return order.map(function(uid) { return byUid[uid]; });
}

function applyInventoryPatchToRow(row, patch, saveMode) {
  var isReplace = saveMode === 'replace';
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.accessCode !== undefined) row.accessCode = String(patch.accessCode).trim();
  if (patch.hero_list !== undefined) {
    row.hero_list = isReplace
      ? (patch.hero_list || [])
      : mergeHeroLists(row.hero_list || row.ownedHeroes || [], patch.hero_list || []);
  }
  if (patch.pet_list !== undefined) {
    row.pet_list = isReplace
      ? (patch.pet_list || [])
      : mergePetLists(row.pet_list || [], patch.pet_list || []);
  }
  if (patch.ring_list !== undefined) {
    row.ring_list = isReplace
      ? normalizeRingList(patch.ring_list || [])
      : mergeRingLists(row.ring_list || [], patch.ring_list || []);
  }
  if (patch.teams !== undefined) row.teams = patch.teams;
  row.inventoryUpdatedAt = Date.now();
}

function pickNewerInventoryList(existingList, incomingList, existingAt, incomingAt, mergeFn) {
  var ex = existingList || [];
  var inc = incomingList || [];
  var exAt = parseInt(existingAt, 10) || 0;
  var inAt = parseInt(incomingAt, 10) || 0;
  if (inAt > exAt) {
    if (inc.length === 0 && ex.length > 0) return ex;
    return inc;
  }
  if (exAt > inAt) return ex;
  if (typeof mergeFn === 'function') return mergeFn(ex, inc);
  return ex.length >= inc.length ? ex : inc;
}

function hasMeaningfulTeams(teams) {
  if (!Array.isArray(teams) || teams.length === 0) return false;
  for (var i = 0; i < teams.length; i++) {
    var t = teams[i];
    if (!t) continue;
    if (t.id || t.name) return true;
    if (Array.isArray(t.slots) && t.slots.some(function(s) { return s && s.id; })) return true;
  }
  return false;
}

function pickTeamsForMerge(existingTeams, incomingTeams) {
  var ex = Array.isArray(existingTeams) ? existingTeams : [];
  var inc = Array.isArray(incomingTeams) ? incomingTeams : [];
  if (hasMeaningfulTeams(inc)) return inc;
  if (hasMeaningfulTeams(ex)) return ex;
  return inc.length ? inc : ex;
}

function dedupeMemberRowsByKey(rows) {
  var byKey = {};
  (rows || []).forEach(function(r) {
    var key = memberRowKey(r);
    if (!byKey[key]) {
      byKey[key] = r;
      return;
    }
    var existing = byKey[key];
    var exAt = parseInt(existing.inventoryUpdatedAt, 10) || 0;
    var rAt = parseInt(r.inventoryUpdatedAt, 10) || 0;
    if (rAt > exAt) {
      byKey[key] = r;
      return;
    }
    if (rAt < exAt) return;
    var exHeroes = (existing.hero_list || existing.ownedHeroes || []).length;
    var rHeroes = (r.hero_list || r.ownedHeroes || []).length;
    var exPets = (existing.pet_list || []).length;
    var rPets = (r.pet_list || []).length;
    var exRings = (existing.ring_list || []).length;
    var rRings = (r.ring_list || []).length;
    var existingScore = exHeroes + exPets + exRings;
    var rScore = rHeroes + rPets + rRings;
    byKey[key] = rScore >= existingScore ? r : existing;
  });
  var out = [];
  Object.keys(byKey).forEach(function(k) { out.push(byKey[k]); });
  return out;
}

function mergeMemberInventoryRows(existingRows, incomingRows, options) {
  var skipInventory = options && options.skipInventory === true;
  var existingByKey = {};
  (existingRows || []).forEach(function(r) {
    existingByKey[memberRowKey(r)] = r;
  });

  var merged = [];
  var usedKeys = {};

  (incomingRows || []).forEach(function(incoming) {
    var key = memberRowKey(incoming);
    var existing = existingByKey[key];
    usedKeys[key] = true;

    if (!existing) {
      merged.push(incoming);
      return;
    }

    var inHeroes = incoming.hero_list || incoming.ownedHeroes || [];
    var exHeroes = existing.hero_list || existing.ownedHeroes || [];
    var inPets = incoming.pet_list || [];
    var exPets = existing.pet_list || [];
    var inRings = incoming.ring_list || [];
    var exRings = existing.ring_list || [];

    merged.push({
      guild_id: incoming.guild_id || existing.guild_id || 'G_MAIN',
      id: incoming.id != null ? incoming.id : existing.id,
      name: incoming.name || existing.name || '',
      accessCode: incoming.accessCode || existing.accessCode || '',
      hero_list: skipInventory ? exHeroes : pickNewerInventoryList(exHeroes, inHeroes, existing.inventoryUpdatedAt, incoming.inventoryUpdatedAt, mergeHeroLists),
      pet_list: skipInventory ? exPets : pickNewerInventoryList(exPets, inPets, existing.inventoryUpdatedAt, incoming.inventoryUpdatedAt, mergePetLists),
      ring_list: skipInventory ? exRings : pickNewerInventoryList(exRings, inRings, existing.inventoryUpdatedAt, incoming.inventoryUpdatedAt, mergeRingLists),
      teams: pickTeamsForMerge(existing.teams, incoming.teams),
      inventoryUpdatedAt: skipInventory
        ? (parseInt(existing.inventoryUpdatedAt, 10) || 0)
        : Math.max(parseInt(existing.inventoryUpdatedAt, 10) || 0, parseInt(incoming.inventoryUpdatedAt, 10) || 0)
    });
  });

  (existingRows || []).forEach(function(r) {
    var key = memberRowKey(r);
    if (!usedKeys[key]) merged.push(r);
  });

  return merged;
}

/**
 * Admin pushData (_skipMemberInventorySync): อัปเดตเฉพาะชื่อ / รหัส / ทีม ต่อแถว
 * ไม่ clear ทั้งชีต — ไม่แตะ Heroes_JSON, Pets_JSON, Rings_JSON, Updated_At
 * ลูกกิลด์บันทึก inventory ผ่าน saveMemberInventory เท่านั้น
 */
function flattenMembersAdminMetadataFromGuilds(guildsData) {
  var rows = [];
  (guildsData || []).forEach(function(g) {
    (g.members || []).forEach(function(m) {
      rows.push({
        guild_id: String(g.id),
        id: String(m.id != null ? m.id : ''),
        name: m.name || '',
        accessCode: accessCodeFromSheetCell(m.accessCode),
        teams: Array.isArray(m.teams) ? m.teams : []
      });
    });
  });
  return rows;
}

function patchGuildMembersAdminMetadata(ss, guildsData) {
  var incoming = flattenMembersAdminMetadataFromGuilds(guildsData);
  incoming.forEach(function(inc) {
    var existingList = loadMemberRowsForTarget(ss, inc.guild_id, inc.id, inc.accessCode);
    var row;
    if (existingList.length > 0) {
      row = existingList[0];
      if (inc.name) row.name = inc.name;
      if (inc.accessCode) row.accessCode = inc.accessCode;
      row.teams = pickTeamsForMerge(row.teams, inc.teams);
    } else {
      row = {
        guild_id: inc.guild_id,
        id: inc.id,
        name: inc.name || '',
        accessCode: inc.accessCode || '',
        hero_list: [],
        pet_list: [],
        ring_list: [],
        teams: inc.teams || [],
        inventoryUpdatedAt: 0
      };
    }
    row.guild_id = inc.guild_id;
    upsertGuildMemberInventoryRow(ss, row);
    deleteDuplicateMemberSheetRows(ss, row);
  });
}

function flattenMembersFromGuilds(guildsData) {
  var rows = [];
  (guildsData || []).forEach(function(g) {
    (g.members || []).forEach(function(m) {
      rows.push({
        guild_id: String(g.id),
        id: String(m.id != null ? m.id : ''),
        name: m.name || '',
        accessCode: m.accessCode || '',
        hero_list: m.hero_list || m.ownedHeroes || [],
        pet_list: m.pet_list || [],
        ring_list: m.ring_list || [],
        teams: m.teams || [],
        inventoryUpdatedAt: parseInt(m.inventoryUpdatedAt, 10) || 0
      });
    });
  });
  return rows;
}

function assembleGuildsWithMembers(guildMeta, memberRows) {
  var guilds = (guildMeta || []).map(function(g) {
    return {
      id: g.id,
      name: g.name,
      type: g.type || 'sub',
      members: []
    };
  });

  if (!guilds.length) {
    guilds = [{ id: 'G_MAIN', name: 'Main Guild (กิลด์หลัก)', type: 'main', members: [] }];
  }

  var guildById = {};
  guilds.forEach(function(g) { guildById[String(g.id)] = g; });

  // Legacy: Members_JSON ในแถว Guilds (รูปแบบเก่า)
  (guildMeta || []).forEach(function(g) {
    if (g.members && g.members.length > 0) {
      var target = guildById[String(g.id)];
      if (target && target.members.length === 0) {
        target.members = g.members.map(memberRowToObject);
      }
    }
  });

  var hasNewFormat = memberRows && memberRows.length > 0 && memberRows[0].guild_id !== undefined;

  if (hasNewFormat) {
    guilds.forEach(function(g) { g.members = []; });
    var uniqueMemberRows = dedupeMemberRowsByKey(memberRows || []);
    uniqueMemberRows.forEach(function(m) {
      var gid = String(m.guild_id || 'G_MAIN');
      if (!guildById[gid]) {
        var newG = { id: gid, name: gid, type: 'sub', members: [] };
        guilds.push(newG);
        guildById[gid] = newG;
      }
      guildById[gid].members.push(memberRowToObject(m));
    });
    guilds.forEach(function(g) {
      g.members.sort(function(a, b) {
        var ai = parseInt(a.id, 10), bi = parseInt(b.id, 10);
        if (!isNaN(ai) && !isNaN(bi)) return ai - bi;
        return String(a.id).localeCompare(String(b.id));
      });
    });
  } else if (memberRows && memberRows.length > 0) {
    // Legacy GuildMembers: ID | Name | Teams_JSON (ไม่มี guild_id)
    var main = guildById['G_MAIN'] || guilds[0];
    if (main && main.members.length === 0) {
      main.members = memberRows.map(function(m) {
        return memberRowToObject(m);
      });
    }
  }

  return guilds;
}

/**
 * บันทึกสมาชิกทั้งชีตใหม่ (clear + เขียนใหม่)
 * ใช้เมื่อแอดมิน sync ทั้งกิลด์ / saveToSheet('GuildMembers') เท่านั้น
 * ลูกกิลด์บันทึกรายคน → ใช้ upsertGuildMemberInventoryRow แทน
 */
function saveGuildMembersSheet(ss, memberRows) {
  var s = ss.getSheetByName('GuildMembers') || ss.insertSheet('GuildMembers');
  s.clear();
  s.appendRow(GUILD_MEMBERS_HEADERS);
  s.getRange(1, 1, 1, GUILD_MEMBERS_COL_COUNT).setFontWeight('bold').setBackground('#c9daf8');
  s.setFrozenRows(1);
  s.getRange('A:I').setNumberFormat('@');

  if (!memberRows || memberRows.length === 0) return;

  var rows = memberRows.map(memberObjectToSheetRow);

  if (rows.length > 0) {
    s.getRange(2, 1, rows.length, GUILD_MEMBERS_COL_COUNT).setValues(rows);
  }
}

function verifyUser(ss, u, p) {
  var users = loadUsersFromSheet(ss);
  console.log('🔍 DEBUG verifyUser - Loaded users count:', users.length);
  for(var i=0; i<users.length; i++) {
    console.log('🔍 DEBUG verifyUser - Checking user:', users[i].id, 'role:', users[i].role);
    if(String(users[i].id) === String(u) && String(users[i].pass) === String(p)) {
      var found = users[i];
      console.log('🔍 DEBUG verifyUser - Found user:', found.id, 'role:', found.role, 'guild_name:', found.guild_name);
      delete found.pass;
      return found;
    }
  }
  return null;
}

function getKeyMap() {
  return {
      'heroes': 'Heroes', 
      'pets': 'Pets', 
      'rings': 'Rings', 
      'items': 'Items',
      'affiliations': 'Affiliations', 
      'battleHistory': 'BattleHistory', 
      'surveyConfig': 'SurveyConfig', 
      'applications': 'Applications',
      'heroLists': 'HeroLists', 
      'manualUsage': 'ManualUsage',
      'guildMembers': 'GuildMembers',
      'guilds': 'Guilds',
      'heroSets': 'HeroSets',
      'seasonInfo': 'SeasonInfo',
      'archivedSeasons': 'ArchivedSeasons',
      'knownEnemies': 'KnownEnemies',
      'equip_sets': 'EquipSets',
      'accessories': 'Accessories',
      'teams_3v3': 'Teams3v3',
      'enemyPatterns': 'EnemyPatterns',
      'hero_builds': 'HeroBuilds',
      'skillLib': 'SkillLibrary',
      'teams': 'Teams',
      'tierModes': 'TierModes'
  };
}

// =========================================================
// ⚡ INCREMENTAL LOADING — sheet "_Versions" เก็บเวอร์ชัน (timestamp) ต่อ category
// client เก็บเวอร์ชันที่ตัวเองมี แล้วเรียก getUpdates เพื่อโหลด "เฉพาะ category ที่เปลี่ยน"
// =========================================================
function getVersionsSheet_(ss) {
  var s = ss.getSheetByName('_Versions');
  if (!s) {
    s = ss.insertSheet('_Versions');
    s.appendRow(['Category', 'Version']);
    s.getRange(1, 1, 1, 2).setFontWeight('bold').setBackground('#d9ead3');
    s.setFrozenRows(1);
    s.getRange('A:A').setNumberFormat('@');
  }
  return s;
}

// อ่านเวอร์ชันดิบทั้งหมดจากชีต -> { category: number }
function readAllVersions_(ss) {
  var s = getVersionsSheet_(ss);
  var map = {};
  var last = s.getLastRow();
  if (last > 1) {
    var vals = s.getRange(2, 1, last - 1, 2).getValues();
    for (var i = 0; i < vals.length; i++) {
      var cat = String(vals[i][0] || '').trim();
      if (cat) map[cat] = parseInt(vals[i][1], 10) || 0;
    }
  }
  return map;
}

// เวอร์ชันของทุก category (ที่ไม่มีในชีต = baseline 1 เพื่อให้ client โหลดครั้งแรก)
function computeServerVersions_(ss) {
  var raw = readAllVersions_(ss);
  var keyMap = getKeyMap();
  var out = {};
  Object.keys(keyMap).forEach(function (cat) {
    if (cat === 'guildMembers') return; // รวมอยู่ใน guilds แล้ว
    out[cat] = raw[cat] || 1;
  });
  return out;
}

// เพิ่มเวอร์ชันของ category (เรียกทุกครั้งที่มีการเขียนข้อมูล)
function bumpVersion_(ss, category) {
  if (!category) return;
  if (category === 'skill_lib') category = 'skillLib'; // ให้ตรงกับชื่อใน getKeyMap/client
  try {
    var s = getVersionsSheet_(ss);
    var now = new Date().getTime();
    var last = s.getLastRow();
    var rowIdx = -1;
    if (last > 1) {
      var cats = s.getRange(2, 1, last - 1, 1).getValues();
      for (var i = 0; i < cats.length; i++) {
        if (String(cats[i][0]).trim() === category) { rowIdx = i + 2; break; }
      }
    }
    if (rowIdx === -1) s.appendRow([category, now]);
    else s.getRange(rowIdx, 2).setValue(now);
  } catch (e) {
    Logger.log('bumpVersion_ failed for ' + category + ': ' + e);
  }
}

// =========================================================
// ⭐ PREMIUM — sheet "Premium" เก็บอีเมลสมาชิก (จัดการในชีตได้เลย ไม่ต้อง build)
// คอลัมน์: Email | Name | Plan | ExpiresAt | Note
//   Plan เว้นว่าง = premium ; ExpiresAt เว้นว่าง = ไม่หมดอายุ (ใส่วันที่เพื่อกำหนดหมดอายุ)
// =========================================================
function getPremiumSheet_(ss) {
  var s = ss.getSheetByName('Premium');
  if (!s) {
    s = ss.insertSheet('Premium');
    s.appendRow(['Email', 'Name', 'Plan', 'ExpiresAt', 'Note']);
    s.getRange(1, 1, 1, 5).setFontWeight('bold').setBackground('#fff2cc');
    s.setFrozenRows(1);
    s.getRange('A:A').setNumberFormat('@');
  }
  return s;
}

// เช็คระดับสมาชิกจากอีเมล → 'premium' | 'vip' | 'free'
function checkUserTier_(ss, email) {
  var target = String(email || '').trim().toLowerCase();
  if (!target) return 'free';
  try {
    var s = getPremiumSheet_(ss);
    var last = s.getLastRow();
    if (last < 2) return 'free';
    var vals = s.getRange(2, 1, last - 1, 4).getValues(); // Email, Name, Plan, ExpiresAt
    var now = new Date().getTime();
    for (var i = 0; i < vals.length; i++) {
      var em = String(vals[i][0] || '').trim().toLowerCase();
      if (em && em === target) {
        var exp = vals[i][3];
        if (exp) {
          var t = (exp instanceof Date) ? exp.getTime() : new Date(exp).getTime();
          if (!isNaN(t) && t < now) return 'free'; // หมดอายุแล้ว
        }
        var plan = String(vals[i][2] || 'premium').trim().toLowerCase();
        return plan || 'premium';
      }
    }
  } catch (e) {
    Logger.log('checkUserTier_ error: ' + e);
  }
  return 'free';
}

// =========================================================
// ⚔️ WAR TEAMS — ทีมบุก/ทีมรับ + ระบบแชร์/สิทธิ์ (sheet "WarTeams")
// คอลัมน์: ID | Name | Type | Heroes_JSON | Pet | Note | Owner | Visibility | AllowedEmails | EditorEmails | UpdatedAt
//   Type: 'attack' | 'defense'  ·  Visibility: 'public' | 'restricted'
// =========================================================
var WAR_HEADERS = ['ID', 'Name', 'Type', 'Formation', 'Heroes_JSON', 'Pets_JSON', 'SkillQueue_JSON', 'SkillQueueAlts_JSON', 'Note', 'Owner', 'Visibility', 'AllowedEmails', 'EditorEmails', 'UpdatedAt'];

function getWarTeamsSheet_(ss) {
  var s = ss.getSheetByName('WarTeams');
  if (!s) {
    s = ss.insertSheet('WarTeams');
    s.appendRow(WAR_HEADERS);
    s.getRange(1, 1, 1, WAR_HEADERS.length).setFontWeight('bold').setBackground('#d9ead3');
    s.setFrozenRows(1);
    s.getRange('A:A').setNumberFormat('@');
  }
  return s;
}
function warParse_(v, d) { try { return JSON.parse(v || d); } catch (e) { return JSON.parse(d); } }
function warParseHeroes_(raw) {
  var h = warParse_(raw, '[]');
  if (Array.isArray(h)) return { heroes: h, heroAwakened: [] };
  return {
    heroes: Array.isArray(h && h.ids) ? h.ids : [],
    heroAwakened: Array.isArray(h && h.awakened) ? h.awakened : [],
  };
}
function warHeroesJson_(t) {
  return JSON.stringify({ ids: t.heroes || [], awakened: t.heroAwakened || [] });
}
function warRowToObj_(r) {
  var heroesPack = warParseHeroes_(r[4]);
  return {
    id: String(r[0] || ''), name: r[1] || '', type: r[2] || 'attack', formation: r[3] || 'basic',
    heroes: heroesPack.heroes, heroAwakened: heroesPack.heroAwakened, pets: warParse_(r[5], '[]'),
    skillQueue: warParse_(r[6], '[]'), skillQueueAlts: warParse_(r[7], '[]'), note: r[8] || '',
    owner: r[9] || '', visibility: r[10] || 'public',
    allowedEmails: warParse_(r[11], '[]'), editorEmails: warParse_(r[12], '[]'),
    updatedAt: parseInt(r[13], 10) || 0,
  };
}
function warObjToRow_(t) {
  return [String(t.id), t.name || '', t.type || 'attack', t.formation || 'basic',
    warHeroesJson_(t), JSON.stringify(t.pets || []), JSON.stringify(t.skillQueue || []), JSON.stringify(t.skillQueueAlts || []),
    t.note || '', t.owner || '', t.visibility || 'public',
    JSON.stringify(t.allowedEmails || []), JSON.stringify(t.editorEmails || []),
    String(t.updatedAt || new Date().getTime())];
}
function warNorm_(e) { return String(e || '').trim().toLowerCase(); }
function warEmailIn_(list, email) {
  var e = warNorm_(email); if (!e) return false;
  return (list || []).some(function (x) { return warNorm_(x) === e; });
}
function warCanView_(t, email) {
  if (t.visibility === 'public' || !t.visibility) return true;
  var e = warNorm_(email); if (!e) return false;
  return warNorm_(t.owner) === e || warEmailIn_(t.allowedEmails, e) || warEmailIn_(t.editorEmails, e);
}
function warCanEdit_(t, email) {
  var e = warNorm_(email); if (!e) return false;
  return warNorm_(t.owner) === e || warEmailIn_(t.editorEmails, e);
}
function loadWarTeams_(ss) {
  var s = getWarTeamsSheet_(ss); var last = s.getLastRow();
  if (last < 2) return [];
  return s.getRange(2, 1, last - 1, WAR_HEADERS.length).getValues().map(warRowToObj_);
}

// โหลดข้อมูลของ category เดียว (จัดการ guilds เป็นกรณีพิเศษ)
function loadCategoryData_(ss, cat) {
  if (cat === 'guilds') {
    return assembleGuildsWithMembers(loadFromSheet(ss, 'Guilds', []), loadFromSheet(ss, 'GuildMembers', []));
  }
  var keyMap = getKeyMap();
  var sheet = keyMap[cat];
  if (!sheet) return null;
  var def = (cat === 'manualUsage' || cat === 'seasonInfo' || cat === 'surveyConfig') ? {} : [];
  return loadFromSheet(ss, sheet, def);
}

// =========================================================
// ⚡ INCREMENTAL MANAGER SAVE — บันทึกทีละแถวต่อหมวด (row-per-item upsert/delete)
// =========================================================
// คอลัมน์มาตรฐานต่อหมวด + ตัวสร้างแถว (ต้องตรงกับ saveToSheet ของแต่ละหมวดเป๊ะ)
function getManagerSheets() {
  return {
    'heroes': {
      sheet: 'Heroes',
      headers: ["ID","Name","Rarity","Type","Affiliation","Img","BaseStats","Skills","SkillData","GrowthConfig","Img2","AccImg","AttackType","AwakenStats"],
      row: function(h){ return [h.id, h.name, h.rarity, h.type, h.affiliation, h.img, JSON.stringify(h.baseStats||{}), JSON.stringify(h.skills||{}), JSON.stringify(h.skillData||{}), JSON.stringify(h.growthConfig||{}), h.img2||'', h.accImg||'', h.attackType||'', JSON.stringify(h.awakenStats||{})]; }
    },
    'rings': {
      sheet: 'Rings',
      headers: ['ID','Name','RingType','Grade','Img','Desc','Options_JSON','Full_JSON'],
      row: function(item){ return [String(item.id!=null?item.id:''), item.name||'', item.ringType||item.type||'แหวนเทา', String(item.grade!=null?item.grade:4), item.img||'', item.desc||'', JSON.stringify(item.options||[]), JSON.stringify(item)]; }
    },
    'accessories': {
      sheet: 'Accessories',
      headers: ['ID','Name','HeroID','Img','Desc','Full_JSON'],
      row: function(item){ return [String(item.id!=null?item.id:''), item.name||'', String(item.heroId!=null?item.heroId:''), item.img||'', item.desc||'', JSON.stringify(item)]; }
    },
    'equip_sets': {
      sheet: 'EquipSets',
      headers: ["ID","Name","Img","Desc","Full_JSON"],
      row: function(item){ return [item.id, item.name, item.img||'', item.desc||'', JSON.stringify(item)]; }
    },
    'pets': {
      sheet: 'Pets',
      headers: ["ID","Name","Img","Full_JSON"],
      row: function(item){ return [String(item.id!=null?item.id:''), item.name||'', item.img||'', JSON.stringify(item)]; }
    },
    'items': {
      sheet: 'Items',
      headers: ["ID","Name","Img","Full_JSON"],
      row: function(item){ return [String(item.id!=null?item.id:''), item.name||'', item.img||'', JSON.stringify(item)]; }
    },
    'hero_builds': {
      sheet: 'HeroBuilds',
      headers: ["ID","Name","Owner","HeroID","Full_JSON"],
      row: function(item){ return [String(item.id!=null?item.id:''), item.name||'', item.owner||'', String(item.heroId!=null?item.heroId:''), JSON.stringify(item)]; }
    },
    'skill_lib': {
      sheet: 'SkillLibrary',
      headers: ["ID","Name","Category","Full_JSON"],
      row: function(item){ return [String(item.id!=null?item.id:''), item.name||'', item.category||'', JSON.stringify(item)]; }
    }
  };
}

// เขียนชีตทั้งหมดแบบ row (header + ทุกแถว) — ใช้ตอน migrate จากรูปแบบเก่า/ตอน full save (Pets/Items)
function writeManagerSheetAll(s, def, data) {
  s.clear();
  s.appendRow(def.headers);
  s.getRange(1, 1, 1, def.headers.length).setFontWeight('bold');
  s.setFrozenRows(1);
  s.getRange('A:' + columnLetter(def.headers.length)).setNumberFormat('@');
  if (!data || !data.length) return;
  var rows = data.map(def.row);
  s.getRange(2, 1, rows.length, def.headers.length).setValues(rows);
}

function columnLetter(n) { var s = ''; while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }

// ทำให้ชีตอยู่ในรูปแบบ row (ถ้ายังเป็นรูปแบบเก่า/blob ใน A1 จะ migrate ให้ครั้งเดียว)
function ensureManagerRowFormat(ss, def) {
  var s = ss.getSheetByName(def.sheet);
  if (!s) { s = ss.insertSheet(def.sheet); writeManagerSheetAll(s, def, []); return s; }
  var a1 = s.getLastRow() === 0 ? '' : String(s.getRange(1, 1).getValue());
  if (a1 === 'ID') return s; // อยู่ในรูปแบบ row แล้ว
  // รูปแบบเก่า (JSON blob ใน A1 หรือว่าง) → โหลดของเดิมแล้วเขียนใหม่เป็น row
  var existing = loadFromSheet(ss, def.sheet, []);
  if (!existing || !existing.length) existing = [];
  // กันข้อมูลหาย: ถ้า A1 มีเนื้อหา (blob) แต่ parse ออกมาว่าง = อ่านไม่ได้ → ห้ามทับ
  if (existing.length === 0 && a1 && String(a1).length > 2) {
    throw new Error('Cannot migrate ' + def.sheet + ' safely (existing data unreadable)');
  }
  writeManagerSheetAll(s, def, existing);
  return s;
}

// หาเลขแถวจาก ID (คอลัมน์ A) — คืน -1 ถ้าไม่เจอ
function findManagerRowById(s, id) {
  var lastRow = s.getLastRow();
  if (lastRow < 2) return -1;
  var ids = s.getRange(2, 1, lastRow - 1, 1).getValues();
  var target = String(id);
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === target) return i + 2;
  }
  return -1;
}

// บันทึก/แก้ไข item เดียว — ใหม่=เพิ่มแถว, เดิม=เขียนทับเฉพาะแถวตัวเอง (ไม่ล้างทั้งชีต)
function upsertManagerItem(ss, category, item) {
  var def = getManagerSheets()[category];
  if (!def || !item || item.id == null) return false;
  var s = ensureManagerRowFormat(ss, def);
  var row = def.row(item);
  var foundRow = findManagerRowById(s, item.id);
  if (foundRow === -1) {
    s.appendRow(row);                                          // ข้อมูลใหม่ → เพิ่มแถว
  } else {
    s.getRange(foundRow, 1, 1, row.length).setValues([row]);   // แก้ไข → เขียนทับเฉพาะแถวตัวเอง
  }
  return true;
}

// ลบ item เดียว — ลบเฉพาะแถวตัวเอง
function deleteManagerItem(ss, category, id) {
  var def = getManagerSheets()[category];
  if (!def || id == null) return false;
  var s = ss.getSheetByName(def.sheet);
  if (!s) return true;
  var a1 = s.getLastRow() === 0 ? '' : String(s.getRange(1, 1).getValue());
  if (a1 !== 'ID') s = ensureManagerRowFormat(ss, def); // migrate ก่อนถ้ายังเป็นรูปแบบเก่า
  var foundRow = findManagerRowById(s, id);
  if (foundRow !== -1) s.deleteRow(foundRow);
  return true;
}

// =========================================================
// 🟢 3v3 Teams — upsert/delete ทีละแถว (ไม่ clear ทั้งชีต)
// =========================================================
// 🗑️ Deleted/DeletedAt = soft delete — แถวยังอยู่ในชีต แต่แอปไม่อ่านขึ้นมา
var TEAMS3V3_HEADERS = ["Index", "TeamName", "TeamType", "Formation", "SkillQueue", "Share", "Enemy_Targets", "Pet_JSON", "Slots_JSON", "Note", "LastModified", "Guild_Name", "Video_JSON", "SkillQueueAlts_JSON", "NotifyEnabled", "Owner_JSON", "Deleted", "DeletedAt"];

// อ่านธง Deleted จากชีต (คอลัมน์เป็น text ค่าที่อ่านได้จึงมีทั้ง boolean และ "TRUE")
function is3v3RowDeleted_(v) {
  return v === true || String(v).toLowerCase() === 'true';
}

function ensureTeams3v3Sheet(ss) {
  var sheet = ss.getSheetByName('Teams3v3');
  if (!sheet) {
    sheet = ss.insertSheet('Teams3v3');
    sheet.appendRow(TEAMS3V3_HEADERS);
    sheet.getRange(1, 1, 1, TEAMS3V3_HEADERS.length).setFontWeight("bold").setBackground("#cfe2f3");
    sheet.setFrozenRows(1);
    sheet.getRange("A:R").setNumberFormat("@");
  } else if (sheet.getLastColumn() < TEAMS3V3_HEADERS.length) {
    // 🔁 migration: ชีตเก่ายังไม่มีคอลัมน์ที่เพิ่มล่าสุด → เขียนหัวคอลัมน์ใหม่ทั้งแถว
    sheet.getRange(1, 1, 1, TEAMS3V3_HEADERS.length)
         .setValues([TEAMS3V3_HEADERS])
         .setFontWeight("bold").setBackground("#cfe2f3");
    sheet.getRange("A:R").setNumberFormat("@");
  }
  return sheet;
}

function team3v3ToRow(team, now) {
  return [
    team.id,
    team.name || 'Team',
    team.teamType || 'Attack',
    team.formation || 'Basic',
    JSON.stringify(team.skillQueue || []),
    team.isShared || false,
    JSON.stringify(team.enemyTeams || []),
    JSON.stringify(team.pets || [null, null, null]),
    JSON.stringify(team.slots || []),
    team.note || '',
    team.lastModified || now,
    team.guild_name || 'all',
    JSON.stringify(team.video || null),
    JSON.stringify(team.skillQueueAlts || []),  // 🆕 ชุดจองสกิลเสริม B/C/D...
    team.notifyEnabled || false,                // 🔔 แจ้งเตือนโน้ตนี้ในหน้าแชร์
    JSON.stringify(team.owner || null),         // 👥 ทีมที่แอดมินจัดให้ลูกกิล {guildId,guildName,memberId,memberName,slot}
    team.deleted === true ? 'TRUE' : '',        // 🗑️ Deleted — soft delete
    team.deleted === true ? (team.deletedAt || new Date().toISOString()) : ''   // DeletedAt
  ];
}

function upsertOne3v3Team(ss, team, userGuild) {
  if (!team || team.id == null) return false;
  var sheet = ensureTeams3v3Sheet(ss);
  if (!team.guild_name) team.guild_name = userGuild || 'all';
  var row = team3v3ToRow(team, Date.now());
  var foundRow = findManagerRowById(sheet, team.id); // คอลัมน์ A (Index) = team.id
  if (foundRow === -1) sheet.appendRow(row);
  else sheet.getRange(foundRow, 1, 1, row.length).setValues([row]);
  return true;
}

// 🗑️ ลบทีม 3v3 = soft delete — ไม่ลบแถวทิ้ง แค่ติดธง Deleted + DeletedAt
//    แถวยังอยู่ในชีตเป็นข้อมูลสำรอง แต่แอปจะไม่เห็น
//    กู้คืน: ล้างค่าในคอลัมน์ Deleted (Q) ของแถวนั้นในชีต
function deleteOne3v3Team(ss, id) {
  if (id == null) return true;
  var sheet = ensureTeams3v3Sheet(ss);   // migrate หัวคอลัมน์ก่อน — ชีตเก่ายังไม่มี Deleted/DeletedAt
  if (!sheet) return true;
  var foundRow = findManagerRowById(sheet, id);
  if (foundRow === -1) return true;
  var delCol = TEAMS3V3_HEADERS.indexOf('Deleted') + 1;      // 17
  sheet.getRange(foundRow, delCol, 1, 2).setValues([['TRUE', new Date().toISOString()]]);
  return true;
}

// ⚠️ ลบถาวรจริง (ลบแถวทิ้ง กู้ไม่ได้) — ไม่มีที่ไหนเรียกอัตโนมัติ
//    ใช้เคลียร์ถังขยะเองจาก Apps Script editor เท่านั้น
function hardDeleteOne3v3Team(ss, id) {
  var sheet = ss.getSheetByName('Teams3v3');
  if (!sheet || id == null) return true;
  var foundRow = findManagerRowById(sheet, id);
  if (foundRow !== -1) sheet.deleteRow(foundRow);
  return true;
}

// 🗑️ อ่านรายการทีมในถังขยะ (แถวที่ Deleted = TRUE)
function loadDeleted3v3Teams_(ss) {
  var sheet = ss.getSheetByName('Teams3v3');
  if (!sheet) return [];
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return [];
  var readCols = Math.max(9, Math.min(sheet.getLastColumn(), TEAMS3V3_HEADERS.length));
  if (readCols < 17) return [];   // ชีตยังไม่มีคอลัมน์ Deleted → ไม่มีของในถังขยะ
  var data = sheet.getRange(2, 1, lastRow - 1, readCols).getValues();
  var list = [];
  for (var i = 0; i < data.length; i++) {
    var r = data[i];
    if (!is3v3RowDeleted_(r[16])) continue;
    var item = {
      id: r[0],
      name: r[1],
      teamType: r[2] || 'Attack',
      formation: r[3] || 'Basic',
      slots: [],
      pets: [],
      note: r[9] || '',
      guild_name: r[11] || 'all',
      deletedAt: r[17] || ''
    };
    try { item.slots = JSON.parse(r[8] || '[]'); } catch (e) {}
    try { item.pets = JSON.parse(r[7] || '[]'); } catch (e) {}
    list.push(item);
  }
  return list;
}

// ↩️ กู้คืนทีมจากถังขยะ — ล้างธง Deleted/DeletedAt แล้วคืนข้อมูลทีมเต็ม
function restoreOne3v3Team(ss, id) {
  if (id == null) return null;
  var sheet = ensureTeams3v3Sheet(ss);
  if (!sheet) return null;
  var foundRow = findManagerRowById(sheet, id);
  if (foundRow === -1) return null;
  var delCol = TEAMS3V3_HEADERS.indexOf('Deleted') + 1;
  if (!is3v3RowDeleted_(sheet.getRange(foundRow, delCol).getValue())) return null;  // ไม่ได้อยู่ในถังขยะ
  sheet.getRange(foundRow, delCol, 1, 2).setValues([['', '']]);
  var all = loadFromSheet(ss, 'Teams3v3', []);
  for (var i = 0; i < all.length; i++) {
    if (String(all[i].id) === String(id)) return all[i];
  }
  return null;
}

// =========================================================
// 🟢 Enemy Patterns — upsert/delete ทีละแถว (ไม่ clear ทั้งชีต)
// =========================================================
var ENEMYPATTERNS_HEADERS = ["ID", "Name", "Formation", "Note", "Slots_JSON", "Pet_JSON", "Guild_Name"];

function ensureEnemyPatternsSheet(ss) {
  var sheet = ss.getSheetByName('EnemyPatterns');
  if (!sheet) {
    sheet = ss.insertSheet('EnemyPatterns');
    sheet.appendRow(ENEMYPATTERNS_HEADERS);
    sheet.getRange(1, 1, 1, ENEMYPATTERNS_HEADERS.length).setFontWeight("bold").setBackground("#cfe2f3");
    sheet.setFrozenRows(1);
    sheet.getRange("A:G").setNumberFormat("@");
  }
  return sheet;
}

function enemyPatternToRow(p) {
  return [
    p.id,
    p.name || 'Pattern',
    p.formation || 'Basic',
    p.note || '',
    JSON.stringify(p.slots || []),
    JSON.stringify(p.pet || null),
    p.guild_name || 'all'
  ];
}

function upsertOneEnemyPattern(ss, pattern, userGuild) {
  if (!pattern || pattern.id == null) return false;
  var sheet = ensureEnemyPatternsSheet(ss);
  if (!pattern.guild_name) pattern.guild_name = userGuild || 'all';
  var row = enemyPatternToRow(pattern);
  var foundRow = findManagerRowById(sheet, pattern.id); // คอลัมน์ A (ID)
  if (foundRow === -1) sheet.appendRow(row);
  else sheet.getRange(foundRow, 1, 1, row.length).setValues([row]);
  return true;
}

function deleteOneEnemyPattern(ss, id) {
  var sheet = ss.getSheetByName('EnemyPatterns');
  if (!sheet || id == null) return true;
  var foundRow = findManagerRowById(sheet, id);
  if (foundRow !== -1) sheet.deleteRow(foundRow);
  return true;
}

// =========================================================
// 🧠 AI Counter snapshot — เก็บ JSON ก้อนเดียว (แบ่ง chunk กันเกิน 50,000 ตัว/เซลล์)
// =========================================================
function saveCounterSnapshotBlob(ss, json) {
  var s = ss.getSheetByName('CounterSnapshot');
  if (!s) { s = ss.insertSheet('CounterSnapshot'); }
  s.clear();
  s.getRange('A:A').setNumberFormat('@'); // เก็บเป็น text ล้วน กันแปลงค่า
  var CH = 45000, rows = [];
  for (var i = 0; i < json.length; i += CH) rows.push([json.substr(i, CH)]);
  if (!rows.length) rows.push(['']);
  s.getRange(1, 1, rows.length, 1).setValues(rows);
}
function loadCounterSnapshotBlob(ss) {
  var s = ss.getSheetByName('CounterSnapshot');
  if (!s) return '';
  var lr = s.getLastRow();
  if (lr < 1) return '';
  var vals = s.getRange(1, 1, lr, 1).getValues();
  var out = '';
  for (var i = 0; i < vals.length; i++) out += String(vals[i][0] || '');
  return out;
}

// --- SHEET IO (READ/WRITE) ---

function saveToSheet(ss, name, data, saveOptions) {
  var s = ss.getSheetByName(name);
  if (!s) s = ss.insertSheet(name);

  if (name === 'EnemyPatterns') {
    s.clear();
    // 🟢 เพิ่ม Guild_Name คอลัมน์
    var headers = ["ID", "Name", "Formation", "Note", "Slots_JSON", "Pet_JSON", "Guild_Name"];
    s.appendRow(headers);
    s.getRange(1, 1, 1, headers.length).setFontWeight("bold").setBackground("#f4cccc"); // สีแดงอ่อนๆ
    s.setFrozenRows(1);
    s.getRange("A:G").setNumberFormat("@"); // บังคับเป็น Text ทั้งหมด (ขยายเป็น 7 คอลัมน์)

    if (!data || data.length === 0) return;

    var rows = data.map(function(item) {
      return [
        item.id,
        item.name,
        item.formation,
        item.note,
        JSON.stringify(item.slots || {}),
        JSON.stringify(item.pet || null),
        item.guild_name || 'all' // 🟢 เพิ่ม guild_name
      ];
    });

    if (rows.length > 0) {
      s.getRange(2, 1, rows.length, headers.length).setValues(rows);
    }
    return;
  }

  if (name === 'Teams3v3') {
    s.clear();
    // 🟢 เพิ่ม Header "Pets_JSON" (เก็บ Array 3 ตัว), "Note", "LastModified", และ "Guild_Name"
    var headers = ["Index", "TeamName", "TeamType", "Formation", "SkillQueue", "Share", "Enemy_Targets", "Pet_JSON", "Slots_JSON", "Note", "LastModified", "Guild_Name", "Video_JSON", "SkillQueueAlts_JSON"];
    s.appendRow(headers);
    s.getRange(1, 1, 1, headers.length).setFontWeight("bold").setBackground("#cfe2f3");
    s.setFrozenRows(1);
    s.getRange("A:N").setNumberFormat("@"); // ขยายเป็น 12 คอลัมน์ (A-L)

    if (!data || data.length === 0) return;

    var now = Date.now();
    var rows = data.map(function(team, index) {
      return [
        team.id || index,
        team.name || ('Team ' + (index + 1)),
        team.teamType || 'Attack',
        team.formation || 'Basic',
        JSON.stringify(team.skillQueue || []),
        team.isShared || false,
        JSON.stringify(team.enemyTeams || []),
        JSON.stringify(team.pets || [null, null, null]),  // 🟢 บันทึก Pets Array (3 ตัว)
        JSON.stringify(team.slots || []),      // Slots ขยับไปท้ายสุด
        team.note || '',
        team.lastModified || now,              // 🟢 Timestamp สำหรับ Queue System
        team.guild_name || 'all',              // 🟢 เพิ่ม guild_name
        JSON.stringify(team.video || null),    // 🎬 Video_JSON
        JSON.stringify(team.skillQueueAlts || [])   // 🆕 ชุดจองสกิลเสริม B/C/D...
      ];
    });

    if (rows.length > 0) {
      s.getRange(2, 1, rows.length, headers.length).setValues(rows);
    }
    return;
  }

  // 🟢 CASE: EquipSets (บันทึกเซตอุปกรณ์)
  if (name === 'EquipSets') {
    s.clear();
    // เปลี่ยนหัวตารางให้ตรงกับ Heroes/Rings
    var headers = ["ID", "Name", "Img", "Desc", "Full_JSON"];
    s.appendRow(headers);
    s.getRange(1, 1, 1, headers.length).setFontWeight("bold").setBackground("#d9ead3"); 
    s.setFrozenRows(1);
    s.getRange("A:E").setNumberFormat("@"); // Format Text

    if (!data || data.length === 0) return;

    var rows = data.map(function(item) {
      return [
        item.id,
        item.name,
        item.img || '',  // เก็บลิงก์รูปภาพ
        item.desc || '', // เก็บรายละเอียด
        JSON.stringify(item) // เก็บ JSON เต็มเผื่อไว้
      ];
    });

    if (rows.length > 0) {
      s.getRange(2, 1, rows.length, headers.length).setValues(rows);
    }
    return;
  }
  
  // 🟢 CASE 1: GuildMembers (บันทึกแบบแยกแถว — 1 สมาชิกต่อ 1 แถว)
  if (name === 'GuildMembers') {
    var existingMemberRows = loadFromSheet(ss, 'GuildMembers', []);
    var mergedMemberRows = mergeMemberInventoryRows(existingMemberRows, data);
    saveGuildMembersSheet(ss, dedupeMemberRowsByKey(mergedMemberRows));
    return;
  }

  if (name === 'Guilds') {
    // แยกสมาชิกออกไปชีต GuildMembers แล้วเก็บแค่ metadata ของกิลด์
    var skipInv = saveOptions && saveOptions.skipMemberInventory === true;
    if (skipInv) {
      patchGuildMembersAdminMetadata(ss, data);
    } else {
      var incomingMemberRows = flattenMembersFromGuilds(data);
      var existingRowsForGuilds = loadFromSheet(ss, 'GuildMembers', []);
      var mergedRowsForGuilds = mergeMemberInventoryRows(existingRowsForGuilds, incomingMemberRows, { skipInventory: false });
      saveGuildMembersSheet(ss, dedupeMemberRowsByKey(mergedRowsForGuilds));
    }

    s.clear();
    var headers = ["ID", "Name", "Type"];
    s.appendRow(headers);
    s.getRange(1, 1, 1, headers.length).setFontWeight("bold").setBackground("#d9d2e9");
    s.setFrozenRows(1);
    s.getRange("A:C").setNumberFormat("@");

    if (!data || data.length === 0) return;

    var rows = data.map(function(g) {
      return [
        g.id.toString(),
        g.name || '',
        g.type || 'sub'
      ];
    });

    if (rows.length > 0) s.getRange(2, 1, rows.length, headers.length).setValues(rows);
    return;
  }

  // 🟢 CASE: Rings (บันทึกแบบแยกแถว — 1 แหวนต่อ 1 แถว)
  if (name === 'Rings') {
    s.clear();
    var ringHeaders = ['ID', 'Name', 'RingType', 'Grade', 'Img', 'Desc', 'Options_JSON', 'Full_JSON'];
    s.appendRow(ringHeaders);
    s.getRange(1, 1, 1, ringHeaders.length).setFontWeight('bold').setBackground('#fff2cc');
    s.setFrozenRows(1);
    s.getRange('A:H').setNumberFormat('@');

    if (!data || data.length === 0) return;

    var ringRows = data.map(function(item) {
      return [
        String(item.id != null ? item.id : ''),
        item.name || '',
        item.ringType || item.type || 'แหวนเทา',
        String(item.grade != null ? item.grade : 4),
        item.img || '',
        item.desc || '',
        JSON.stringify(item.options || []),
        JSON.stringify(item)
      ];
    });

    if (ringRows.length > 0) {
      s.getRange(2, 1, ringRows.length, ringHeaders.length).setValues(ringRows);
    }
    return;
  }

  // 🟢 CASE: Accessories (บันทึกแบบแยกแถว — แถวใครแถวมัน)
  if (name === 'Accessories') {
    s.clear();
    var accHeaders = ['ID', 'Name', 'HeroID', 'Img', 'Desc', 'Full_JSON'];
    s.appendRow(accHeaders);
    s.getRange(1, 1, 1, accHeaders.length).setFontWeight('bold').setBackground('#d9ead3');
    s.setFrozenRows(1);
    s.getRange('A:F').setNumberFormat('@');

    if (!data || data.length === 0) return;

    var accRows = data.map(function(item) {
      return [
        String(item.id != null ? item.id : ''),
        item.name || '',
        String(item.heroId != null ? item.heroId : ''),
        item.img || '',
        item.desc || '',
        JSON.stringify(item)
      ];
    });

    if (accRows.length > 0) {
      s.getRange(2, 1, accRows.length, accHeaders.length).setValues(accRows);
    }
    return;
  }

  // 🟢 CASE 2: Heroes (บันทึกแบบแยกแถว)
  if (name === 'Heroes') {
    s.clear();
    var headers = ["ID", "Name", "Rarity", "Type", "Affiliation", "Img", "BaseStats", "Skills", "SkillData", "GrowthConfig", "Img2", "AccImg", "AttackType", "AwakenStats"];
    s.appendRow(headers);
    s.getRange(1, 1, 1, headers.length).setFontWeight("bold").setBackground("#fce5cd");
    s.setFrozenRows(1);

    if (!data || data.length === 0) return;

    var rows = data.map(function(h) {
      return [
        h.id, h.name, h.rarity, h.type, h.affiliation, h.img,
        JSON.stringify(h.baseStats || {}),
        JSON.stringify(h.skills || {}),
        JSON.stringify(h.skillData || {}),
        JSON.stringify(h.growthConfig || {}),
        h.img2 || '',
        h.accImg || '', // 💎 รูปเครื่องประดับเฉพาะตัว
        h.attackType || '', // ⚔️/🔮 ประเภทการโจมตี
        JSON.stringify(h.awakenStats || {}) // ✨ Base Stats ของ Awakening
      ];
    });

    if (rows.length > 0) {
      s.getRange(2, 1, rows.length, headers.length).setValues(rows);
    }
    return;
  }

  // 🟢 CASE 3: HeroLists (รายการจัดกลุ่ม)
  if (name === 'HeroLists') {
    s.clear();
    var headers = ["ID", "Name", "Note", "HeroIDs_JSON"];
    s.appendRow(headers);
    s.getRange(1, 1, 1, headers.length).setFontWeight("bold").setBackground("#ead1dc");
    s.setFrozenRows(1);
    s.getRange("A:D").setNumberFormat("@");

    if (!data || !Array.isArray(data) || data.length === 0) return;

    var rows = data.map(function(list) {
      return [
        list.id,
        list.name || '',
        list.note || '',
        JSON.stringify(list.heroIds || [])
      ];
    });
    if (rows.length > 0) s.getRange(2, 1, rows.length, headers.length).setValues(rows);
    return;
  }

  // 🟢 CASE 4: ManualUsage
  if (name === 'ManualUsage') {
    s.clear();
    var headers = ["HeroID", "Count"];
    s.appendRow(headers);
    s.getRange(1, 1, 1, 2).setFontWeight("bold").setBackground("#fff2cc");
    s.setFrozenRows(1);
    s.getRange("A:A").setNumberFormat("@");

    if (!data || Object.keys(data).length === 0) return;
    var rows = [];
    Object.keys(data).forEach(function(key) { rows.push([key, data[key]]); });
    if (rows.length > 0) s.getRange(2, 1, rows.length, 2).setValues(rows);
    return;
  }

  // 🟡 CASE 5: General Tables (Append Only logic mostly)
  if (name === 'Applications' || name === 'BattleHistory') {
      s.clear();
      if (name === 'Applications') {
          s.appendRow(["ID", "Name", "Date", "JSON"]);
          var rows = data.map(function(d){ return [d.id, d.name, d.date, JSON.stringify(d)]; });
          if(rows.length) s.getRange(2, 1, rows.length, 4).setValues(rows);
      } else {
          s.appendRow(["ID", "Date", "MyTeam", "Enemy", "Result", "JSON_DATA"]);
          var rows = data.map(function(log){ 
              return [log.id, log.date, log.myTeamName||'', log.enemyName||'', log.result||'', JSON.stringify(log)]; 
          });
          if(rows.length > 2000) rows = rows.slice(0, 2000); 
          if(rows.length) s.getRange(2, 1, rows.length, 6).setValues(rows);
      }
      s.setFrozenRows(1);
      return;
  }

  // 🟢 Pets / Items — เก็บแบบ row-per-item (เหมือน Accessories) เพื่อให้ upsert ทีละแถวได้
  if (name === 'Pets' || name === 'Items') {
    var defMS = getManagerSheets()[name === 'Pets' ? 'pets' : 'items'];
    writeManagerSheetAll(s, defMS, data || []);
    return;
  }

  // ⚪ CASE Default: JSON A1
  var str = JSON.stringify(data);
  s.clear();
  s.getRange(1, 1).setValue(str);
}

function loadFromSheet(ss, name, def) {
  var s = ss.getSheetByName(name);
  if (!s) return def;

  var val = s.getRange(1, 1).getValue();

  if (name === 'SurveyConfig') {
     try {
         // ถ้าใน Sheet ช่อง A1 เก็บข้อมูลเป็น JSON เลย ให้ดึงมาตรงๆ
         return JSON.parse(val);
     } catch(e) {
         // ถ้าไม่ได้เก็บเป็นก้อน (เช่นเก็บแบบตาราง) ให้เขียน Logic แปลงตามตาราง
         // แต่ปกติ SurveyConfig ในระบบนี้มักจะเก็บเป็น JSON ยัดช่อง A1 อยู่แล้ว
         return def; 
     }
  }
  
  if (name === 'EnemyPatterns') {
    var lastRow = s.getLastRow();
    if (lastRow <= 1) return [];

    // 🟢 อ่าน 7 คอลัมน์ (เพิ่ม Guild_Name)
    var sheetCols = s.getLastColumn();
    var readCols = sheetCols >= 7 ? 7 : 6;
    var data = s.getRange(2, 1, lastRow - 1, readCols).getValues();
    return data.map(function(r) {
      try {
        return {
          id: r[0],
          name: r[1],
          formation: r[2],
          note: r[3],
          slots: JSON.parse(r[4] || '{}'),
          pet: JSON.parse(r[5] || 'null'),
          guild_name: r[6] || 'all' // 🟢 เพิ่ม guild_name
        };
      } catch (e) {
        return null;
      }
    }).filter(function(x) { return x !== null; });
  }

  if (name === 'Teams3v3' && val === "Index") {
    var lastRow = s.getLastRow();
    if (lastRow <= 1) return [];

    // 🟢 รองรับทั้งโครงสร้างเก่า (9-11 คอลัมน์) และใหม่ (12-15 คอลัมน์ พร้อม Guild_Name + Video_JSON + NotifyEnabled)
    var sheetCols = s.getLastColumn();
    var readCols = Math.max(9, Math.min(sheetCols, TEAMS3V3_HEADERS.length));
    var data = s.getRange(2, 1, lastRow - 1, readCols).getValues();
    return data.map(function(r) {
      try {
          return {
            id: r[0],
            name: r[1],
            teamType: r[2] || 'Attack',
            formation: r[3] || 'Basic',
            skillQueue: JSON.parse(r[4] || '[]'),
            isShared: r[5] === true || r[5] === "true",
            enemyTeams: JSON.parse(r[6] || '[]'),
            pet: JSON.parse(r[7] || 'null'),      // 🟢 Backwards compatibility
            pets: JSON.parse(r[7] || '[null,null,null]'),  // 🟢 อ่าน Pets Array (Index 7)
            slots: JSON.parse(r[8] || '[]'),      // Slots ขยับไป Index 8
            note: r[9] || '',
            lastModified: r[10] || Date.now(),    // 🟢 Timestamp สำหรับ Queue System
            guild_name: r[11] || 'all',           // 🟢 Guild_Name (Index 11)
            video: JSON.parse(r[12] || 'null'),   // 🎬 Video_JSON (Index 12)
            skillQueueAlts: JSON.parse(r[13] || '[]'),  // 🆕 ชุดจองสกิลเสริม B/C/D... (Index 13)
            notifyEnabled: r[14] === true || r[14] === "true",  // 🔔 แจ้งเตือนโน้ตนี้ในหน้าแชร์ (Index 14)
            owner: JSON.parse(r[15] || 'null'),   // 👥 ทีมที่แอดมินจัดให้ลูกกิล (Index 15)
            deleted: is3v3RowDeleted_(r[16]),     // 🗑️ soft delete (Index 16)
            deletedAt: r[17] || ''                // (Index 17)
          };
      } catch(e) {
          return { id: r[0], name: r[1], slots: [], enemyTeams: [], pet: null, pets: [null,null,null], isShared: false, note: '', lastModified: Date.now(), guild_name: 'all', notifyEnabled: false, owner: null, deleted: is3v3RowDeleted_(r[16]), deletedAt: r[17] || '' };
      }
    }).filter(function(t) { return t && t.deleted !== true; });   // 🗑️ ทีมที่ถูก soft delete ไม่ส่งกลับไปให้แอป
  }

  // 🟢 LOAD EquipSets
  if (name === 'EquipSets' && val === "ID") {
    var lastRow = s.getLastRow();
    if (lastRow <= 1) return [];

    var data = s.getRange(2, 1, lastRow - 1, 5).getValues();
    return data.map(function(r) {
      // พยายามอ่านจาก JSON ก่อนเพื่อให้ได้ข้อมูลครบถ้วน
      try {
          return JSON.parse(r[4]);
      } catch(e) {
          // ถ้าไม่มี JSON ให้อ่านจากคอลัมน์ปกติ
          return {
            id: r[0],
            name: r[1],
            img: r[2],
            desc: r[3],
            color: 'gray' // ค่า Default
          };
      }
    });
  }

  // 🟢 LOAD HeroBuilds (บิ้วตัวละครที่เผยแพร่) — Full_JSON อยู่คอลัมน์สุดท้าย (E)
  if (name === 'HeroBuilds' && val === "ID") {
    var lastRow = s.getLastRow();
    if (lastRow <= 1) return [];
    var data = s.getRange(2, 1, lastRow - 1, 5).getValues();
    return data.map(function(r) {
      try { return JSON.parse(r[4]); }
      catch(e) { return { id: r[0], name: r[1], owner: r[2], heroId: r[3] }; }
    }).filter(function(x){ return x && x.id; });
  }

  // 🟢 LOAD SkillLibrary (คลังสกิล/สถานะ) — Full_JSON คอลัมน์สุดท้าย (D)
  if (name === 'SkillLibrary' && val === "ID") {
    var lastRow = s.getLastRow();
    if (lastRow <= 1) return [];
    var data = s.getRange(2, 1, lastRow - 1, 4).getValues();
    return data.map(function(r) {
      try { return JSON.parse(r[3]); }
      catch(e) { return { id: r[0], name: r[1], category: r[2] }; }
    }).filter(function(x){ return x && x.id; });
  }

  // 🟢 LOAD GuildMembers (รูปแบบใหม่ 8 คอลัมน์ + รองรับเก่า 3 คอลัมน์)
  if (name === 'GuildMembers' && (val === "Guild_ID" || val === "ID")) {
    var lastRow = s.getLastRow();
    if (lastRow <= 1) return [];

    var sheetCols = s.getLastColumn();
    var isNewFormat = (val === "Guild_ID" || sheetCols >= 8);

    if (isNewFormat && sheetCols >= 8) {
      var readCols = sheetCols >= 9 ? 9 : 8;
      var data = readGuildMemberSheetBlock(s, 2, lastRow, readCols);
      return data.map(function(r) {
        return parseGuildMemberSheetValues(r, readCols);
      });
    }

    // Legacy: ID | Name | Teams_JSON
    var legacyData = readGuildMemberSheetBlock(s, 2, lastRow, Math.min(sheetCols, 3));
    return legacyData.map(function(r) {
      try {
        return {
          id: r[0],
          name: r[1],
          teams: JSON.parse(r[2] || '[]')
        };
      } catch (e) {
        return { id: r[0], name: r[1], teams: [], error: true };
      }
    });
  }

  if (name === 'Guilds' && val === "ID") {
    var lastRow = s.getLastRow();
    if (lastRow <= 1) return [];

    var sheetCols = s.getLastColumn();
    var readCols = sheetCols >= 4 ? 4 : 3;
    var data = s.getRange(2, 1, lastRow - 1, readCols).getValues();
    return data.map(function(r) {
      var g = {
        id: r[0],
        name: r[1],
        type: r[2] || 'sub',
        members: []
      };
      // Legacy Members_JSON (คอลัมน์ที่ 4)
      if (readCols >= 4 && r[3]) {
        try {
          g.members = JSON.parse(r[3] || '[]');
        } catch (e) {
          g.members = [];
        }
      }
      return g;
    });
  }

  // 🟢 LOAD Rings (แถว — รองรับ JSON ก้อนเดิมใน A1)
  if (name === 'Rings') {
    if (val && val !== 'ID') {
      try {
        var legacyRings = JSON.parse(val);
        if (Array.isArray(legacyRings)) return legacyRings;
      } catch (eLegacyRings) { /* fall through */ }
    }
    if (val === 'ID') {
      var ringLastRow = s.getLastRow();
      if (ringLastRow <= 1) return [];

      var ringSheetCols = s.getLastColumn();
      var ringReadCols = ringSheetCols >= 8 ? 8 : (ringSheetCols >= 7 ? 7 : 6);
      var ringData = s.getRange(2, 1, ringLastRow - 1, ringReadCols).getValues();
      return ringData.map(function(r) {
        if (ringReadCols >= 8 && r[7]) {
          try {
            return JSON.parse(r[7]);
          } catch (eFull) { /* use columns */ }
        }
        try {
          return {
            id: String(r[0] != null ? r[0] : ''),
            name: r[1] || '',
            ringType: r[2] || 'แหวนเทา',
            grade: parseInt(r[3], 10) || 4,
            img: r[4] || '',
            desc: r[5] || '',
            options: JSON.parse(r[6] || '[]')
          };
        } catch (eRow) {
          return { id: String(r[0] != null ? r[0] : ''), name: r[1] || '', error: true };
        }
      }).filter(function(x) { return x && x.id; });
    }
    return def;
  }

  // 🟢 LOAD Accessories
  if (name === 'Accessories') {
    // รองรับโครงสร้างเก่า (JSON เก็บใน A1 ทั้งก้อน)
    if (val && val !== 'ID') {
      try {
        var legacyAcc = JSON.parse(val);
        if (Array.isArray(legacyAcc)) return legacyAcc;
      } catch (eLegacyAcc) { /* fall through */ }
    }
    if (val === 'ID') {
      var accLastRow = s.getLastRow();
      if (accLastRow <= 1) return [];
      var accSheetCols = s.getLastColumn();
      var accReadCols = accSheetCols >= 6 ? 6 : 5;
      var accData = s.getRange(2, 1, accLastRow - 1, accReadCols).getValues();
      return accData.map(function(r) {
        // ลองใช้ Full_JSON ก่อน (เก็บ field ครบทุกตัว)
        if (accReadCols >= 6 && r[5]) {
          try { return JSON.parse(r[5]); } catch (eFull) { /* use columns */ }
        }
        try {
          return {
            id: String(r[0] != null ? r[0] : ''),
            name: r[1] || '',
            heroId: String(r[2] != null ? r[2] : ''),
            img: r[3] || '',
            desc: r[4] || ''
          };
        } catch (eRow) {
          return { id: String(r[0] != null ? r[0] : ''), name: r[1] || '', error: true };
        }
      }).filter(function(x) { return x && x.id; });
    }
    return def;
  }

  // 🟢 LOAD Heroes
  if (name === 'Heroes' && val === "ID") {
    var lastRow = s.getLastRow();
    if (lastRow <= 1) return [];
    var lastCol = Math.max(s.getLastColumn(), 14);
    var data = s.getRange(2, 1, lastRow - 1, lastCol).getValues();
    return data.map(function(r) {
      try {
        return {
          id: r[0], name: r[1], rarity: r[2], type: r[3], affiliation: r[4], img: r[5],
          baseStats: JSON.parse(r[6] || '{}'),
          skills: JSON.parse(r[7] || '{}'),
          skillData: JSON.parse(r[8] || '{}'),
          growthConfig: JSON.parse(r[9] || '{}'),
          img2: r[10] || '',
          accImg: r[11] || '', // 💎 รูปเครื่องประดับเฉพาะตัว
          attackType: r[12] || '', // ⚔️/🔮 ประเภทการโจมตี
          awakenStats: JSON.parse(r[13] || '{}') // ✨ Base Stats ของ Awakening
        };
      } catch (e) { return { id: r[0], name: r[1], error: true }; }
    });
  }

  // 🟢 LOAD HeroLists
  if (name === 'HeroLists' && val === "ID") {
    var lastRow = s.getLastRow();
    if (lastRow <= 1) return [];
    var data = s.getRange(2, 1, lastRow - 1, 4).getValues();
    return data.map(function(r) {
      try { return { id: r[0], name: r[1], note: r[2], heroIds: JSON.parse(r[3] || '[]') }; } catch (e) { return null; }
    }).filter(function(x) { return x; });
  }

  // 🟢 LOAD ManualUsage
  if (name === 'ManualUsage' && val === "HeroID") {
    var lastRow = s.getLastRow();
    if (lastRow <= 1) return {};
    var data = s.getRange(2, 1, lastRow - 1, 2).getValues();
    var resultObj = {};
    data.forEach(function(r) { if(r[0]) resultObj[r[0]] = Number(r[1]); });
    return resultObj;
  }

  // 🟡 LOAD Tables
  if ((name === 'Applications' || name === 'BattleHistory') && val === "ID") {
     var rows = s.getDataRange().getValues();
     if(rows.length <= 1) return [];
     var arr = [];
     var jsonColIndex = (name === 'BattleHistory') ? 5 : 3;
     for(var i=rows.length-1; i>=1; i--) { 
         try{ 
             var rowJson = rows[i][jsonColIndex];
             if(rowJson) arr.push(JSON.parse(rowJson)); 
         } catch(e){} 
     }
     return arr;
  }
  
  // 🟢 Pets / Items — รองรับทั้งรูปแบบใหม่ (row + Full_JSON) และเก่า (JSON blob ใน A1)
  if (name === 'Pets' || name === 'Items') {
    if (val === 'ID') { // รูปแบบใหม่: อ่านทีละแถว ใช้ Full_JSON (คอลัมน์สุดท้าย)
      var lastRowPI = s.getLastRow();
      if (lastRowPI <= 1) return [];
      var colsPI = Math.max(s.getLastColumn(), 4);
      var dataPI = s.getRange(2, 1, lastRowPI - 1, colsPI).getValues();
      return dataPI.map(function(r) {
        if (r[3]) { try { return JSON.parse(r[3]); } catch (e) {} }
        return { id: String(r[0] != null ? r[0] : ''), name: r[1] || '', img: r[2] || '' };
      }).filter(function(x) { return x && x.id != null && x.id !== ''; });
    }
    try { return JSON.parse(val); } catch (e) { return def; } // เก่า: blob
  }

  // ⚪ Default JSON
  try { return JSON.parse(val); } catch(e) { return def; }
}

// --- USERS & LOGS ---
function saveUsersToSheet(ss, users) {
  var s = ss.getSheetByName('Users') || ss.insertSheet('Users'); s.clear();
  if(!users || !users.length) return;
  var r = users.map(function(u) { return [u.id, u.name, "'"+u.pass, u.role, JSON.stringify(u.permissions||[]), u.guild_name || 'all']; }); // 🟢 เพิ่ม guild_name
  s.getRange(1, 1, r.length, r[0].length).setValues(r);
}
function loadUsersFromSheet(ss) {
  var s = ss.getSheetByName('Users'); if(!s) return [];
  var rows = s.getDataRange().getValues();
  return rows.map(function(r) {
    // 🟢 แก้ไข: รองรับทั้ง JSON ปกติ (double quotes) และ single quotes
    var perms = [];
    try {
      perms = JSON.parse(r[4] || '[]');
    } catch(e) {
      // ถ้า parse ไม่ได้ (เช่น มี single quotes), แปลงเป็น double quotes แล้วลองใหม่
      try {
        var fixed = String(r[4]).replace(/'/g, '"');
        perms = JSON.parse(fixed || '[]');
      } catch(e2) {
        perms = [];
      }
    }
    return {
      id: r[0],
      name: r[1],
      pass: String(r[2]),
      role: r[3],
      permissions: perms,
      guild_name: r[5] || 'all' // 🟢 เพิ่ม guild_name (คอลัมน์ที่ 6)
    };
  }).filter(function(u){ return u.id; });
}
function saveLogsToSheet(ss, logs) {
  var s = ss.getSheetByName('UserLogs') || ss.insertSheet('UserLogs'); s.clear();
  if(!logs || !logs.length) return;
  var r = logs.slice(0,500).map(function(l){ return [l.timestamp, l.user, l.action, l.target, l.details]; });
  s.getRange(1, 1, r.length, r[0].length).setValues(r);
}
function loadLogsFromSheet(ss) {
  var s = ss.getSheetByName('UserLogs'); if(!s) return [];
  var vals = s.getDataRange().getValues();
  return vals.map(function(r){ return {timestamp:r[0], user:r[1], action:r[2], target:r[3], details:r[4]}; });
}

// --- HELPER & IMAGE ---
function out(data) { return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON); }
function processApplicationImages(apps) {
  for (var i = 0; i < apps.length; i++) {
    var app = apps[i];
    if (app.images && Array.isArray(app.images)) {
      for (var j = 0; j < app.images.length; j++) {
        if (app.images[j] && app.images[j].indexOf('data:image') === 0) {
           var fileName = app.name + "_" + app.id + "_" + j;
           app.images[j] = uploadImageToDrive(app.images[j], fileName) || "UPLOAD_FAILED";
        }
      }
      if (app.images.length > 0) { app.img = app.images[0]; if (app.petImg) app.petImg = app.images[app.images.length - 1]; }
    } else if (app.img && app.img.indexOf('data:image') === 0) {
       app.img = uploadImageToDrive(app.img, app.name + "_" + app.id + "_main") || "UPLOAD_FAILED";
    }
  }
}
function uploadImageToDrive(base64String, fileName) {
  return uploadImageToFolder(base64String, fileName, IMAGE_FOLDER_ID);
}
// อัปโหลดรูป base64 ลงโฟลเดอร์ Drive ที่ระบุ แล้วคืน URL แบบ public
function uploadImageToFolder(base64String, fileName, folderId) {
  try {
    var folder = DriveApp.getFolderById(folderId);
    var contentType = base64String.substring(5, base64String.indexOf(';'));
    var cleanBase64 = base64String.substring(base64String.indexOf(',') + 1);
    var blob = Utilities.newBlob(Utilities.base64Decode(cleanBase64), contentType, fileName);
    var file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return "https://lh3.googleusercontent.com/d/" + file.getId();
  } catch (e) { Logger.log("Upload Error: " + e.toString()); return null; }
}
function uploadVideoToDrive(base64String, fileName) {
  try {
    var folder = DriveApp.getFolderById(VIDEO_FOLDER_ID);
    var contentType = base64String.substring(5, base64String.indexOf(';'));
    var cleanBase64 = base64String.substring(base64String.indexOf(',') + 1);
    var blob = Utilities.newBlob(Utilities.base64Decode(cleanBase64), contentType, fileName);
    var file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    var id = file.getId();
    return {
      fileId: id,
      url: "https://drive.google.com/file/d/" + id + "/view",
      embedUrl: "https://drive.google.com/file/d/" + id + "/preview",
      name: fileName,
      uploadedAt: Date.now()
    };
  } catch (e) {
    Logger.log("Video Upload Error: " + e.toString());
    return null;
  }
}
function deleteImagesFromDrive(urls) {
  if (!urls || !Array.isArray(urls)) return 0;
  var count = 0;
  urls.forEach(function(url) {
    try {
      if (!url) return;
      var match = url.match(/[-\w]{25,}/); 
      if (match) { var file = DriveApp.getFileById(match[0]); file.setTrashed(true); count++; }
    } catch(e) {}
  });
  return count;
}
function appendApplicationToSheet(ss, appData) {
  var s = ss.getSheetByName('Applications');
  if (!s) {
    s = ss.insertSheet('Applications');
    s.appendRow(["ID", "Name", "Date", "JSON"]);
    s.getRange(1, 1, 1, 4).setFontWeight("bold").setBackground("#f3f3f3");
    s.setFrozenRows(1);
  }
  var safeData = JSON.parse(JSON.stringify(appData));
  if (JSON.stringify(safeData).length > 45000) {
      safeData.img = "Image too large"; safeData.images = ["Image too large"]; safeData.petImg = "Image too large";
  }
  s.appendRow([appData.id, appData.name, appData.date, JSON.stringify(safeData)]);
}