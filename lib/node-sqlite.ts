import { ColumnTypeEnum, type ColumnType, type SqlDriverAdapter, type SqlDriverAdapterFactory, type SqlQuery, type SqlResultSet, type Transaction } from "@prisma/driver-adapter-utils";

type StatementColumn = { name: string; type: string | null };
type StatementSync = {
  columns?: () => StatementColumn[];
  all(...args: unknown[]): unknown[];
  run(...args: unknown[]): { changes: number | bigint; lastInsertRowid: number | bigint };
};
type DatabaseSync = {
  exec(sql: string): void;
  prepare(sql: string): StatementSync;
  close(): void;
};

const loadSqlite = new Function("return import('node:sqlite')") as () => Promise<{
  DatabaseSync: new (path: string) => DatabaseSync;
}>;

const isoDate = /^(\d{4}-[01]\d-[0-3]\dT[0-2]\d:[0-5]\d:[0-5]\d\.\d+([+-][0-2]\d:[0-5]\d|Z))$|^(\d{4}-[01]\d-[0-3]\dT[0-2]\d:[0-5]\d:[0-5]\d([+-][0-2]\d:[0-5]\d|Z))$|^(\d{4}-[01]\d-[0-3]\dT[0-2]\d:[0-5]\d([+-][0-2]\d:[0-5]\d|Z))$|^(\d{4}-[01]\d-[0-3]\d [0-2]\d:[0-5]\d:[0-5]\d)$/;

function columnType(value: unknown): ColumnType {
  if (typeof value === "string") return isoDate.test(value) ? ColumnTypeEnum.DateTime : ColumnTypeEnum.Text;
  if (typeof value === "bigint") return ColumnTypeEnum.Int64;
  if (typeof value === "number") return ColumnTypeEnum.UnknownNumber;
  if (typeof value === "boolean") return ColumnTypeEnum.Boolean;
  if (value instanceof Uint8Array) return ColumnTypeEnum.Bytes;
  return ColumnTypeEnum.Text;
}

function columnTypes(rows: unknown[][]): ColumnType[] {
  if (rows.length === 0) return [];
  return rows[0].map((_, index) => {
    for (const row of rows) {
      if (row[index] !== null && row[index] !== undefined) return columnType(row[index]);
    }
    return ColumnTypeEnum.Int32;
  });
}

function bind(arg: unknown, scalarType: string) {
  if (arg === null || arg === undefined) return null;
  if (typeof arg === "bigint" || scalarType === "bigint") return Number(arg);
  if (arg === true) return 1;
  if (arg === false) return 0;
  if (arg instanceof Date) return arg.toISOString().replace("Z", "+00:00");
  return arg;
}

function isMutatingSql(sql: string) {
  const trimmed = sql.trim().replace(/^\(+/, "");
  return (
    !/\bRETURNING\b/i.test(trimmed) &&
    /^(INSERT|UPDATE|DELETE|REPLACE|CREATE|DROP|ALTER|BEGIN|COMMIT|ROLLBACK|VACUUM|REINDEX)\b/i.test(trimmed)
  );
}

class NodeSqliteConnection implements SqlDriverAdapter {
  readonly provider = "sqlite" as const;
  readonly adapterName = "node-sqlite";

  constructor(private readonly db: DatabaseSync) {}

  async queryRaw(params: SqlQuery): Promise<SqlResultSet> {
    const statement = this.db.prepare(params.sql);
    const args = params.args.map((arg, index) => bind(arg, params.argTypes[index]?.scalarType ?? "unknown"));
    const columnsApi = typeof statement.columns === "function" ? statement.columns.bind(statement) : null;

    if ((!columnsApi && isMutatingSql(params.sql)) || (columnsApi && columnsApi().length === 0)) {
      const result = statement.run(...(args as never[]));
      return {
        columnNames: [],
        columnTypes: [],
        rows: [],
        lastInsertId: String(result.lastInsertRowid),
      };
    }

    const objects = statement.all(...(args as never[])) as Record<string, unknown>[];
    const columns: StatementColumn[] =
      columnsApi?.() ??
      (objects[0] ? Object.keys(objects[0]).map((name) => ({ name, type: null })) : []);
    const names = columns.map((column) => column.name);
    const rows = objects.map((row) =>
      columns.map((column: StatementColumn) => {
        const value = row[column.name] ?? null;
        if (typeof value === "number" && (column.type ?? "").toUpperCase().includes("DATE")) {
          return new Date(value).toISOString();
        }
        return value;
      }),
    );
    return {
      columnNames: names,
      columnTypes: columnTypes(rows.length > 0 ? rows : [names.map(() => null)]),
      rows,
    };
  }

  async executeRaw(params: SqlQuery): Promise<number> {
    const statement = this.db.prepare(params.sql);
    const args = params.args.map((arg, index) => bind(arg, params.argTypes[index]?.scalarType ?? "unknown"));
    const result = statement.run(...(args as never[]));
    return Number(result.changes);
  }

  async executeScript(script: string): Promise<void> {
    this.db.exec(script);
  }

  async startTransaction(): Promise<Transaction> {
    this.db.exec("BEGIN");
    const queryRaw = this.queryRaw.bind(this);
    const executeRaw = this.executeRaw.bind(this);
    return {
      provider: "sqlite",
      adapterName: "node-sqlite",
      options: { usePhantomQuery: true },
      queryRaw,
      executeRaw,
      commit: async () => {
        this.db.exec("COMMIT");
      },
      rollback: async () => {
        this.db.exec("ROLLBACK");
      },
    };
  }

  async dispose(): Promise<void> {
    this.db.close();
  }
}

export function createNodeSqliteAdapter(filename: string): SqlDriverAdapterFactory {
  return {
    provider: "sqlite",
    adapterName: "node-sqlite",
    async connect() {
      const { DatabaseSync } = await loadSqlite();
      const db = new DatabaseSync(filename);
      db.exec("PRAGMA foreign_keys = ON");
      return new NodeSqliteConnection(db);
    },
  };
}
