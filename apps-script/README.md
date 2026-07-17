# apps-script — Google Apps Script backend

โค้ดฝั่งเซิร์ฟเวอร์ (Google Apps Script Web App) ของ 7KDB เก็บไว้ที่นี่เป็น
**reference** — ไม่ได้ถูก build รวมเข้าแอป Vue (อยู่นอก `src/`)

## ไฟล์
- `code.gs` — โค้ด Apps Script ทั้งหมด (doPost, action ต่าง ๆ, การอ่าน/เขียน Google Sheets)

## หมายเหตุ
- แอป Vue เรียก backend ผ่าน `src/api/appsScript.js` (action เช่น `getAllData`, `saveOneItem`)
- แผนถัดไป: เพิ่ม sheet `_versions` + action `getUpdates` เพื่อโหลดเฉพาะ category ที่เปลี่ยน
  (incremental loading) ลดข้อมูลที่ต้องโหลดและทำให้เร็วขึ้น — ดูรายละเอียดหลังเพิ่ม `code.gs`
- การ deploy: Apps Script Editor → Deploy → Web app (execute as: me, access: anyone)
  URL ที่ได้ต้องตรงกับ `SCRIPT_URL` ใน `src/api/config.js`
