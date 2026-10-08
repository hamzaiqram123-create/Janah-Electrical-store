import { db, type Db } from "../db";
import { conflict, notFound } from "../http";

export type StockMove = "stock_in" | "stock_out" | "adjustment" | "sale" | "return" | "cancellation";

export interface StockChange {
  productId: number;
  type: StockMove;
  /** signed change; for `adjustment` pass `setTo` instead */
  delta?: number;
  setTo?: number;
  unitCost?: number | null;
  referenceType?: string;
  referenceId?: string | number;
  note?: string | null;
  userId?: number | null;
}

/**
 * Applies a stock movement inside the caller's transaction. The inventory row is locked (FOR UPDATE)
 * so concurrent orders can never drive stock below zero.
 */
export async function moveStock(t: Db, ch: StockChange): Promise<{ balance: number; min_stock: number; delta: number }> {
  const inv = await t.one<{ quantity: number; min_stock: number }>(`SELECT quantity, min_stock FROM inventory WHERE product_id = $1 FOR UPDATE`, [ch.productId]);
  if (!inv) {
    const exists = await t.one(`SELECT 1 AS ok FROM products WHERE id = $1`, [ch.productId]);
    if (!exists) throw notFound("product_not_found");
    await t.exec(`INSERT INTO inventory (product_id, quantity) VALUES ($1, 0)`, [ch.productId]);
  }
  const current = inv?.quantity ?? 0;
  const delta = ch.setTo !== undefined ? ch.setTo - current : (ch.delta ?? 0);
  const balance = current + delta;
  if (balance < 0) throw conflict("insufficient_stock", { product_id: ch.productId, available: current });
  await t.exec(`UPDATE inventory SET quantity = $2, updated_at = now() WHERE product_id = $1`, [ch.productId, balance]);
  await t.exec(
    `INSERT INTO inventory_transactions (product_id, type, quantity, balance_after, unit_cost, reference_type, reference_id, note, user_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [ch.productId, ch.type, delta, balance, ch.unitCost ?? null, ch.referenceType ?? null, ch.referenceId == null ? null : String(ch.referenceId), ch.note ?? null, ch.userId ?? null],
  );
  return { balance, min_stock: inv?.min_stock ?? 5, delta };
}

export async function lowStockProducts(limit = 100) {
  return db.q(
    `SELECT p.id, p.sku, p.barcode, p.name_ar, p.name_en, p.name_ur, i.quantity, i.min_stock, i.location
       FROM inventory i JOIN products p ON p.id = i.product_id
      WHERE p.status <> 'archived' AND i.quantity <= i.min_stock ORDER BY i.quantity ASC, p.id LIMIT $1`, [limit]);
}
