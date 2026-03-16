// HƯỚNG DẪN SỬ DỤNG:
// 1. Tạo 1 Google Sheet mới.
// 2. Vào Tiện ích mở rộng -> Apps Script.
// 3. Dán toàn bộ mã này vào.
// 4. Nhấn "Triển khai" (Deploy) -> "Triển khai mới" (New Deployment).
// 5. Chọn loại là "Ứng dụng Web" (Web App).
// 6. Mục "Người có quyền truy cập" chọn "Bất kỳ ai" (Anyone).
// 7. Copy URL nhận được và dán vào biến GAS_URL trong file App.tsx của ứng dụng.

const SHEET_NAME = "Accounts";

/**
 * Khởi tạo Sheet nếu chưa có
 */
function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(["Email", "Password", "Name", "Role"]);
    // Tài khoản mặc định
    sheet.appendRow(["admin@gmail.com", "123456@", "Đào Minh Tâm", "admin"]);
  }
}

/**
 * Xử lý yêu cầu POST từ ứng dụng React
 */
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const action = data.action;
    
    if (action === "login") {
      return loginUser(data.email, data.password);
    } else if (action === "register") {
      return registerUser(data.email, data.password, data.name);
    }
    
    return response({ success: false, message: "Hành động không hợp lệ" });
  } catch (err) {
    return response({ success: false, message: "Lỗi Server: " + err.toString() });
  }
}

/**
 * Kiểm tra đăng nhập
 */
function loginUser(email, password) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    setup();
    sheet = ss.getSheetByName(SHEET_NAME);
  }
  
  const data = sheet.getDataRange().getValues();
  
  for (let i = 1; i < data.length; i++) {
    const sEmail = data[i][0].toString().trim();
    const sPass = data[i][1].toString().trim();
    
    if (sEmail.toLowerCase() === email.toString().trim().toLowerCase() && sPass === password.toString().trim()) {
      return response({ 
        success: true, 
        user: { email: data[i][0], name: data[i][2], role: data[i][3] } 
      });
    }
  }
  return response({ success: false, message: "Email hoặc mật khẩu không đúng!" });
}

/**
 * Đăng ký tài khoản mới (Dùng để bạn tự thêm thủ công hoặc qua API)
 */
function registerUser(email, password, name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    setup();
    sheet = ss.getSheetByName(SHEET_NAME);
  }
  
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0].toString().toLowerCase() === email.toString().toLowerCase()) {
      return response({ success: false, message: "Email này đã tồn tại!" });
    }
  }
  
  sheet.appendRow([email, password, name, "user"]);
  return response({ success: true, message: "Đã tạo tài khoản thành công!" });
}

function response(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
