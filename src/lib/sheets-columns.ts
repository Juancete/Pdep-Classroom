// Utilidades puras para direccionar columnas y rangos de Google Sheets.
// Viven acá (y no en infrastructure/sheets.ts) porque también las necesita
// el form de comisiones, que es client component y no puede importar de
// infrastructure/.

// Convierte índice 0-based a letra de columna (0→A, 25→Z, 26→AA…)
export function colLetter(index: number): string {
  let result = "";
  let remaining = index;
  do {
    result = String.fromCharCode(65 + (remaining % 26)) + result;
    remaining = Math.floor(remaining / 26) - 1;
  } while (remaining >= 0);
  return result;
}

// Arma un rango A1 con el nombre de hoja siempre entrecomillado, escapando
// apóstrofes duplicándolos. Entrecomillar siempre (incluso nombres simples)
// es válido en A1 notation y evita ramificar: la API de Sheets exige las
// comillas cuando el nombre tiene espacios o apóstrofes.
export function rangoDeHoja(sheetName: string, a1: string): string {
  const sheetNameEscapado = sheetName.replace(/'/g, "''");
  return `'${sheetNameEscapado}'!${a1}`;
}
