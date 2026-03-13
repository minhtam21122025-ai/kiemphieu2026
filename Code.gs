/**
 * Google Apps Script (Code.gs)
 * Hướng dẫn: Copy đoạn code này vào trình biên tập Apps Script của Google Sheets.
 */

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Hệ Thống Kiểm Phiếu Bầu Cử')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function getData(sheetName) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) return null;

  const numDelegates = sheet.getRange("B1").getValue();
  const candidates = sheet.getRange("B4:B30").getValues()
    .filter(row => row[0] !== "")
    .map(row => row[0]);

  return {
    numDelegates: numDelegates,
    candidates: candidates
  };
}

function saveData(sheetName, totalVotes, timestamp) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) return "Sheet không tồn tại";

  // Tìm hàng cuối cùng để lưu kết quả tổng hợp (ví dụ lưu vào cột J và K)
  // Hoặc bạn có thể tùy chỉnh vị trí lưu cụ thể theo yêu cầu
  const lastRow = sheet.getLastRow() + 1;
  sheet.getRange(lastRow, 10).setValue(timestamp); // Cột J: Thời gian
  sheet.getRange(lastRow, 11).setValue(JSON.stringify(totalVotes)); // Cột K: Dữ liệu tổng

  return "Lưu dữ liệu thành công!";
}
