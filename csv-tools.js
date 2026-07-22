// =========================================================
// csv-tools.js — shared Excel export/import helpers.
// Relies on window.XLSX, set up in the <script type="module">
// block at the bottom of the page (SheetJS).
// =========================================================

const MAX_IMPORT_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_IMPORT_ROWS = 2000;

// columns: [{ key: "company_title", header: "Firma Unvanı", format: fn (optional) }]
// Exports exactly what's on screen — same column set as the form fields, in
// the same order, so re-importing a file you just exported works cleanly.
function exportToExcel(rows, columns, filename) {
  const data = rows.map((row) => {
    const obj = {};
    columns.forEach((col) => {
      const raw = row[col.key];
      obj[col.header] = col.format ? col.format(raw) : (raw ?? "");
    });
    return obj;
  });

  const ws = window.XLSX.utils.json_to_sheet(data);
  const wb = window.XLSX.utils.book_new();
  window.XLSX.utils.book_append_sheet(wb, ws, "Veri");
  window.XLSX.writeFile(wb, filename);
}

// Reads a .xlsx or .csv file and resolves to an array of plain objects,
// one per row, keyed by whatever the column headers say (SheetJS handles
// both formats through the same reader).
function parseImportFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const wb = window.XLSX.read(data, { type: "array" });
        const firstSheet = wb.Sheets[wb.SheetNames[0]];
        const rows = window.XLSX.utils.sheet_to_json(firstSheet, { defval: "" });
        resolve(rows);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}

// Wires a hidden <input type="file"> to a visible "İçe Aktar" button, and
// calls onRows(parsedRows) once a file is picked and parsed successfully.
// Rejects oversized files and oversized row counts before they ever reach
// the database — a malformed or huge file just gets a clear error message.
function setupImportButton(buttonId, fileInputId, onRows) {
  const button = document.getElementById(buttonId);
  const fileInput = document.getElementById(fileInputId);

  button.addEventListener("click", () => fileInput.click());

  fileInput.addEventListener("change", async () => {
    const file = fileInput.files[0];
    if (!file) return;

    if (file.size > MAX_IMPORT_FILE_SIZE) {
      alert(`Dosya çok büyük (maksimum ${MAX_IMPORT_FILE_SIZE / 1024 / 1024}MB).`);
      fileInput.value = "";
      return;
    }

    try {
      const rows = await parseImportFile(file);

      if (rows.length > MAX_IMPORT_ROWS) {
        alert(
          `Dosya çok fazla satır içeriyor (${rows.length} satır). ` +
          `Tek seferde en fazla ${MAX_IMPORT_ROWS} satır içe aktarabilirsiniz — ` +
          `lütfen dosyayı daha küçük parçalara bölüp tekrar deneyin.`
        );
        return;
      }

      await onRows(rows);
    } catch (err) {
      alert(`Dosya okunamadı: ${err.message}`);
    } finally {
      fileInput.value = ""; // allows re-selecting the same file later
    }
  });
}
