const BASE_URL = 'https://api.clore.ai/v1';
export const CURRENCY = 'USD-Blockchain';

async function request(apiKey, method, endpoint, body) {
  const url = `${BASE_URL}/${endpoint}`;
  const options = {
    method,
    headers: { auth: apiKey },
  };

  if (body) {
    options.headers['Content-type'] = 'application/json';
    options.body = JSON.stringify(body);
  }

  const res = await fetch(url, options);
  const data = await res.json();

  if (data.code !== 0) {
    throw new Error(`API error ${data.code}: ${data.error || 'unknown'}`);
  }

  return data;
}

export async function getMarketplace(apiKey) {
  const data = await request(apiKey, 'GET', 'marketplace');
  return data.servers || [];
}

export async function createOrder(apiKey, server, config) {
  return request(apiKey, 'POST', 'create_order', {
    currency: CURRENCY,
    image: config.image,
    renting_server: server.id,
    type: 'on-demand',
    ports: { 22: 'tcp' },
    ssh_password: config.sshPassword,
    required_price: server.price.on_demand[CURRENCY],
  });
}

export async function myOrders(apiKey) {
  const data = await request(apiKey, 'GET', 'my_orders');
  return data.orders || [];
}
