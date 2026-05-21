import { describe, it, expect } from 'vitest';
import { generateJoinSQL } from './model';

describe('generateJoinSQL', () => {
  it('single table (no joins) returns SELECT * FROM base', () => {
    const sql = generateJoinSQL({ base: 'orders', joins: [] });
    expect(sql).toContain('FROM orders');
    expect(sql).not.toContain('JOIN');
  });

  it('one join produces a LEFT JOIN clause', () => {
    const sql = generateJoinSQL({
      base: 'orders',
      joins: [{ table: 'customers', leftKey: 'customer_id', rightKey: 'customer_id' }]
    });
    expect(sql).toMatch(/LEFT JOIN customers/i);
    expect(sql).toMatch(/ON \w+\.customer_id = \w+\.customer_id/i);
  });

  it('two joins produces two LEFT JOIN clauses', () => {
    const sql = generateJoinSQL({
      base: 'orders',
      joins: [
        { table: 'customers', leftKey: 'customer_id', rightKey: 'customer_id' },
        { table: 'products', leftKey: 'product_id', rightKey: 'product_id' }
      ]
    });
    expect(sql.match(/LEFT JOIN/gi)).toHaveLength(2);
  });

  it('throws for empty base table name', () => {
    expect(() => generateJoinSQL({ base: '', joins: [] })).toThrow();
  });
});
