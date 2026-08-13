const PRINTIFY_BASE_URL = 'https://api.printify.com/v1';

function getToken() {
  return process.env.PRINTIFY_API_TOKEN || null;
}

function isConfigured() {
  return !!getToken();
}

async function printifyRequest(path, options = {}) {
  const token = getToken();
  if (!token) {
    const err = new Error('Printify is not connected yet. Add PRINTIFY_API_TOKEN in Render.');
    err.code = 'NOT_CONFIGURED';
    throw err;
  }

  const res = await fetch(`${PRINTIFY_BASE_URL}${path}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'WaileaArt/1.0 (contact via wailea.art)',
      ...(options.headers || {})
    }
  });

  if (!res.ok) {
    let detail = '';
    try {
      const body = await res.json();
      detail = body.error || body.message || JSON.stringify(body);
    } catch (e) {
      detail = await res.text().catch(() => '');
    }

    if (res.status === 401) {
      const err = new Error('Printify rejected the connection (invalid or expired token). Check PRINTIFY_API_TOKEN in Render.');
      err.code = 'UNAUTHORIZED';
      throw err;
    }

    const err = new Error(`Printify request failed (${res.status}): ${detail || res.statusText}`);
    err.code = 'REQUEST_FAILED';
    err.status = res.status;
    throw err;
  }

  return res.json();
}

// Returns the list of shops tied to this account, e.g.
// [{ id: 5432, title: "My Store", sales_channel: "..." }, ...]
async function listShops() {
  return printifyRequest('/shops.json');
}

// Returns one page of products for a given shop. Printify paginates
// results, so callers may need to loop using the returned pagination info.
async function listProducts(shopId, page = 1) {
  return printifyRequest(`/shops/${shopId}/products.json?page=${page}&limit=50`);
}

// Fetches every page of products for a shop, up to a safety cap so a huge
// catalog can't accidentally hang a sync forever.
async function listAllProducts(shopId, maxPages = 20) {
  const all = [];
  let page = 1;
  let lastPage = 1;

  do {
    const result = await listProducts(shopId, page);
    const items = Array.isArray(result.data) ? result.data : (Array.isArray(result) ? result : []);
    all.push(...items);
    lastPage = result.last_page || 1;
    page++;
  } while (page <= lastPage && page <= maxPages);

  return all;
}

module.exports = { isConfigured, listShops, listProducts, listAllProducts };
