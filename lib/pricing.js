const BULK_MIN_QTY = 10;

/**
 * Computes the validated unit price and quantity rules for an order.
 * This runs SERVER-SIDE at checkout time so prices can never be
 * tampered with from the browser.
 *
 * @param {object} artwork - row from the artworks table
 * @param {string} mode - 'retail' | 'bulk'
 * @param {boolean} packaging - only relevant when mode === 'bulk'
 * @param {number} quantity
 * @returns {{ok: true, unitPrice: number, quantity: number, label: string}|{ok: false, error: string}}
 */
function resolveOrder(artwork, mode, packaging, quantity) {
  quantity = parseInt(quantity, 10);
  if (!Number.isInteger(quantity) || quantity < 1) {
    return { ok: false, error: 'Invalid quantity.' };
  }

  if (mode === 'retail') {
    return {
      ok: true,
      unitPrice: artwork.price_retail,
      quantity,
      label: 'Retail print'
    };
  }

  if (mode === 'bulk') {
    if (quantity < BULK_MIN_QTY) {
      return { ok: false, error: `Bulk orders require a minimum of ${BULK_MIN_QTY} pieces.` };
    }
    const unitPrice = packaging
      ? artwork.price_bulk_packaging
      : artwork.price_bulk_no_packaging;
    return {
      ok: true,
      unitPrice,
      quantity,
      label: packaging ? 'Bulk (with packaging)' : 'Bulk (no packaging)'
    };
  }

  return { ok: false, error: 'Invalid order mode.' };
}

module.exports = { resolveOrder, BULK_MIN_QTY };
