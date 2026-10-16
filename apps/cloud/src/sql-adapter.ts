export interface SqlDb {
  exec(query: string, ...params: any[]): { toArray(): any[] };
  run(query: string, ...params: any[]): void;
}

export function createSqlAdapter(nativeSql: any): SqlDb {
  // If bun:sqlite Database (has query method):
  if (nativeSql && typeof nativeSql.query === 'function') {
    return {
      exec(query: string, ...params: any[]) {
        return {
          toArray() {
            return nativeSql.query(query).all(...params);
          },
        };
      },
      run(query: string, ...params: any[]) {
        nativeSql.prepare(query).run(...params);
      },
    };
  }

  // If Cloudflare Workers DO sql:
  if (nativeSql && typeof nativeSql.exec === 'function') {
    return {
      exec(query: string, ...params: any[]) {
        const cursor = nativeSql.exec(query, ...params);
        return {
          toArray() {
            return cursor.toArray ? cursor.toArray() : Array.from(cursor);
          },
        };
      },
      run(query: string, ...params: any[]) {
        nativeSql.exec(query, ...params);
      },
    };
  }

  throw new Error('Unsupported SQL engine');
}
