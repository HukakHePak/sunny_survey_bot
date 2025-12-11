declare module 'better-sqlite3' {
  interface DatabaseOptions {
    readonly?: boolean;
    fileMustExist?: boolean;
    verbose?: (msg?: any) => void;
  }

  interface RunResult {
    changes: number;
    lastInsertRowid?: number;
  }

  export default class Database {
    constructor(filename: string, options?: DatabaseOptions);
    prepare(sql: string): { run(...params: any[]): RunResult; all(...params: any[]): any[]; get(...params: any[]): any };
    exec(sql: string): void;
    pragma(sql: string): any;
    close(): void;
  }
}
