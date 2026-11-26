import '../polyfills';
import type ExcelJSType from 'exceljs';

// Import the browser/Hermes-safe prebuilt bundle directly so Metro never pulls Node fs/stream.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ExcelJSModule = require('exceljs/dist/exceljs.min.js') as typeof ExcelJSType;

export const ExcelJS = ExcelJSModule;

