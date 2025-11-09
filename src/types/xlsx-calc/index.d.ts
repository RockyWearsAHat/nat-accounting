import type { WorkBook } from "xlsx";

declare function calc(workbook: WorkBook, opts?: {
  functions?: Record<string, (...args: any[]) => any>;
}): void;

declare namespace calc {
  function setVariable(workbook: WorkBook, name: string, value: any): void;
  function import_functions(functions: Record<string, (...args: any[]) => any>, options?: {
    override?: boolean;
  }): void;
}

declare module "xlsx-calc" {
  export = calc;
}
