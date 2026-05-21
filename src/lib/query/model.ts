interface JoinDef {
	table: string;
	leftKey: string;
	rightKey: string;
}

interface GenerateJoinSQLOptions {
	base: string;
	joins: JoinDef[];
}

export function generateJoinSQL(opts: GenerateJoinSQLOptions): string {
	if (!opts.base.trim()) throw new Error('base table name must not be empty');
	const baseAlias = opts.base[0];
	let sql = `SELECT *\nFROM ${opts.base} ${baseAlias}`;
	for (const join of opts.joins) {
		const alias = join.table[0];
		sql += `\nLEFT JOIN ${join.table} ${alias} ON ${baseAlias}.${join.leftKey} = ${alias}.${join.rightKey}`;
	}
	return sql;
}

export function buildCreateViewSQL(viewName: string, modelSQL: string): string {
	return `CREATE OR REPLACE VIEW ${viewName} AS\n${modelSQL}`;
}
