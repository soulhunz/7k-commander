# 🔐 ระบบลูกกิล — ช่องโหว่และวิธีปิด

เอกสารนี้คู่กับการแก้ฝั่งหน้าเว็บใน `index.html`
**ข้อ 1 กับ 2 ปิดไม่ได้ด้วย JavaScript ฝั่งหน้าเว็บ** ต้องแก้ `code.gs` (Google Apps Script) แล้ว Deploy ใหม่

---

## สถานะ

| # | ปัญหา | สถานะ |
|---|---|---|
| 1 | พอร์ทัลลูกกิลโหลดข้อมูล **ทุกคนทุกกิลด์** รวมรหัสทุกคน | ⚠️ ลดความเสี่ยงแล้ว · ต้นเหตุต้องแก้ `code.gs` |
| 2 | ตรวจรหัสฝั่งหน้าเว็บล้วน ปลอมตัวเป็นคนอื่นได้ | ⚠️ ต้องแก้ `code.gs` |
| 3 | ตอนเซฟส่งรหัสที่อ่านจากหน่วยความจำ ไม่ใช่รหัสที่ผู้ใช้กรอก | ✅ แก้แล้ว |
| 4 | เปลี่ยนโปรไฟล์แก้ข้อมูลในเครื่องก่อนเซฟผ่าน → รหัสใหม่กลายเป็นตัวยืนยันเอง | ✅ แก้แล้ว |
| 5 | รหัสสั้นอย่าง `001` ผ่านได้ | ✅ บังคับอย่างน้อย 6 ตัว |

---

## ข้อ 1 — ส่งมาแค่ข้อมูลของคนที่ล็อกอิน

ตอนนี้ `index.html` เรียก `fetchCloudData('getAllData')` ในโหมดพอร์ทัล = ได้ทุกอย่างมาทั้งก้อน
ต้องเพิ่ม action ใหม่ที่คืน **เฉพาะสมาชิกคนนั้น**

```javascript
// code.gs — เพิ่ม action นี้
function verifyMemberCode(req) {
  var code = String(req.accessCode || '').trim();
  if (code.length < 6) return { status: 'error', message: 'invalid code' };

  var found = findMemberRowByAccessCode_(code);   // ต้องเทียบแบบ case-insensitive ให้ตรงกับหน้าเว็บ
  if (!found) return { status: 'error', message: 'invalid code' };

  var token = Utilities.getUuid();
  var cache = CacheService.getScriptCache();
  cache.put('roster_' + token, JSON.stringify({
    guild_id: found.guild_id,
    member_id: found.member_id
  }), 60 * 60 * 6);   // token อายุ 6 ชั่วโมง

  return {
    status: 'success',
    token: token,
    member: {                       // ⚠️ คืนแค่ข้อมูลคนนี้ ห้ามใส่ accessCode ของคนอื่นเด็ดขาด
      guild_id: found.guild_id,
      guild_name: found.guild_name,
      member_id: found.member_id,
      name: found.name,
      hero_list: found.hero_list,
      pet_list: found.pet_list,
      ring_list: found.ring_list
    },
    masterData: getMasterDataOnly_()  // ฮีโร่/สัตว์เลี้ยง/แหวน — ข้อมูลกลาง ไม่ใช่ข้อมูลคน
  };
}
```

**สำคัญ:** `getMasterDataOnly_()` ต้องไม่มี `guilds`, `members`, `users`, `accessCode`

---

## ข้อ 2 — ตรวจสิทธิ์ตอนเซฟที่ฝั่ง server

`saveMemberInventory` ต้องไม่เชื่อ `guild_id` / `member_id` ที่หน้าเว็บส่งมาเปล่าๆ
หน้าเว็บส่ง `accessCode` ที่ผู้ใช้กรอกจริงมาแล้ว (แก้ข้อ 3 เรียบร้อย) ให้ server เทียบ

```javascript
// code.gs — ใน saveMemberInventory ก่อนเขียนข้อมูล
if (String(req.source) === 'roster') {
  var code = String(req.accessCode || '').trim();
  var owner = findMemberRowByAccessCode_(code);

  // รหัสต้องเป็นของสมาชิกแถวที่กำลังจะเขียนจริงๆ
  if (!owner ||
      String(owner.guild_id)  !== String(req.guild_id) ||
      String(owner.member_id) !== String(req.member_id)) {
    return { status: 'error', message: 'ไม่มีสิทธิ์แก้ข้อมูลสมาชิกคนนี้' };
  }

  // ลูกกิลแก้ได้แค่ field เหล่านี้ — กันแก้ role / guild / field ระบบ
  var ALLOWED = ['hero_list', 'pet_list', 'ring_list', 'name', 'accessCode'];
  Object.keys(req.patch || {}).forEach(function (k) {
    if (ALLOWED.indexOf(k) < 0) delete req.patch[k];
  });

  // เปลี่ยนรหัสตัวเอง: ต้องยาวพอ และห้ามชนคนอื่น
  if (req.patch.accessCode !== undefined) {
    var nc = String(req.patch.accessCode).trim();
    if (nc.length < 6) return { status: 'error', message: 'รหัสสั้นเกินไป' };
    var clash = findMemberRowByAccessCode_(nc);
    if (clash && String(clash.member_id) !== String(req.member_id)) {
      return { status: 'error', message: 'รหัสนี้ถูกใช้แล้ว' };
    }
  }
}
```

---

## ลำดับที่ควรทำ

1. เพิ่ม `verifyMemberCode` + `getMasterDataOnly_` แล้ว Deploy
2. เพิ่มการตรวจสิทธิ์ใน `saveMemberInventory` แล้ว Deploy
3. บอกผมให้เปลี่ยน `index.html` โหมดพอร์ทัลจาก `getAllData` ไปเรียก `verifyMemberCode` แทน
4. สั่งลูกกิลทุกคนเปลี่ยนรหัสเป็นอย่างน้อย 6 ตัว — **รหัสเก่าถือว่ารั่วไปแล้วทั้งหมด**

จนกว่าจะทำข้อ 1-2 เสร็จ ให้ถือว่าลิงก์ `?mode=roster` = ใครมีลิงก์ก็อ่านรหัสของทุกคนได้
