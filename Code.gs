// This is the complete backend script for your Google Sheet.
// It handles both fetching the data (doGet) and saving the new entries (doPost).

function doGet(e) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // Readings
  const readSheet = ss.getSheetByName('readings');
  let readings = [];
  if (readSheet) {
    const readData = readSheet.getDataRange().getValues();
    if (readData.length > 1) {
      const readHeaders = readData.shift();
      readings = readData.map(row => {
        let obj = {};
        readHeaders.forEach((h, i) => obj[h] = row[i]);
        return obj;
      });
    }
  }

  // Payments
  const paySheet = ss.getSheetByName('payments');
  let payments = [];
  if (paySheet) {
    const payData = paySheet.getDataRange().getValues();
    if (payData.length > 1) {
      const payHeaders = payData.shift();
      payments = payData.map(row => {
        let obj = {};
        payHeaders.forEach((h, i) => obj[h] = row[i]);
        return obj;
      });
    }
  }

  return ContentService.createTextOutput(JSON.stringify({
    ok: true,
    readings: readings,
    payments: payments
  }))
  .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    
    // The web app sends data here perfectly using 'no-cors' mode
    const data = JSON.parse(e.postData.contents);
    
    const dateISO = data.dateISO || new Date().toISOString();
    const createdAt = new Date().toISOString();
    
    // 1. Process Reading
    // Checks if the user actually sent a valid reading number
    if (data.valueKwh && parseFloat(data.valueKwh) > 0) {
      const id = Utilities.getUuid();
      const readSheet = ss.getSheetByName('readings');
      // Sheet Headers must be: id | dateISO | valueKwh | createdAt
      readSheet.appendRow([id, dateISO, parseFloat(data.valueKwh), createdAt]);
    }
    
    // 2. Process Payment
    // Checks if the user actually sent a valid payment amount
    if (data.paymentAmount && parseFloat(data.paymentAmount) > 0) {
      const id = Utilities.getUuid();
      const paySheet = ss.getSheetByName('payments');
      // Sheet Headers must be: id | dateISO | amount | createdAt
      paySheet.appendRow([id, dateISO, parseFloat(data.paymentAmount), createdAt]);
    }
    
    return ContentService.createTextOutput(JSON.stringify({ok: true, message: "Saved successfully"}))
        .setMimeType(ContentService.MimeType.JSON);
        
  } catch (error) {
    // If anything fails, it returns the error string
    return ContentService.createTextOutput(JSON.stringify({ok: false, error: error.toString()}))
        .setMimeType(ContentService.MimeType.JSON);
  }
}
