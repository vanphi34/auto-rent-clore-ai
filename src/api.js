const BASE_URL = 'https://api.clore.ai/v1';
export const CURRENCY = 'USD-Blockchain';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
    console.error("API RESPONSE:");
    console.error(JSON.stringify(data, null, 2));

    throw new Error(`API error ${data.code}: ${data.error || 'unknown'}`);
  }

  return data;
}

export async function getMarketplace(apiKey) {
  const data = await request(apiKey, 'GET', 'marketplace');
  return data.servers || [];
}

export async function createOrder(apiKey, server, config) {
  const watch = config.watchOwners.find(
    (w) => w.server === server.id
  );

  if (!watch) {
    throw new Error(`Watch config not found for server ${server.id}`);
  }

  const profile = config.commands[watch.command];

  if (!profile) {
    throw new Error(`Command "${watch.command}" không tồn tại`);
  }

  const command = profile.command.replaceAll(
    'SERVER_ID',
    String(server.id)
  );

  const body = {
    currency: CURRENCY,
    image: config.image,
    renting_server: server.id,
    type: 'on-demand',
    ports: { 22: 'tcp' },
    ssh_password: config.sshPassword,
    required_price: server.price.on_demand[CURRENCY],
    command,
  };
  
  console.log("CREATE ORDER BODY:");
  console.log(JSON.stringify(body, null, 2));
  await sleep(6000);
  return request(apiKey, 'POST', 'create_order', {
    currency: CURRENCY,
    image: config.image,
    renting_server: server.id,
    type: 'on-demand',
    ports: { 22: 'tcp' },
    ssh_password: config.sshPassword,
    required_price: server.price.on_demand[CURRENCY],
    command,
  });
}

export async function myOrders(apiKey) {
  const data = await request(apiKey, 'GET', 'my_orders');
  return data.orders || [];
}
