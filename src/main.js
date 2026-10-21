import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { CURRENCY, createOrder, getMarketplace, myOrders } from './api.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(readFileSync(join(__dirname, '..', 'config.json'), 'utf8'));

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getWatch(serverId) {
  return config.watchOwners.find((w) => w.server === serverId);
}

function getPrice(server) {
  return server.price?.on_demand?.[CURRENCY];
}

function isAvailable(server, maxPrice) {
  if (server.rented) return false;
  if (!server.allowed_coins?.includes(CURRENCY)) return false;

  const price = getPrice(server);
  return price != null && price <= maxPrice;
}

function findMatches(servers) {
  return servers
    .filter((server) => {
      const watch = getWatch(server.id);
      if (!watch) return false;
      if (server.owner !== watch.owner) return false;
      return isAvailable(server, watch.maxPrice);
    })
    .sort(
      (a, b) =>
        config.watchOwners.findIndex((w) => w.server === a.id) -
        config.watchOwners.findIndex((w) => w.server === b.id)
    );
}

function getWaiting(servers) {
  return config.watchOwners
    .filter(({ server, maxPrice }) => {
      const s = servers.find((item) => item.id === server);
      if (!s) return true;
      return !isAvailable(s, maxPrice);
    })
    .map(({ server }) => server);
}

function getTooExpensive(servers) {
  return config.watchOwners
    .map(({ owner, server, maxPrice }) => {
      const s = servers.find((item) => item.id === server);
      if (!s || s.rented || !s.allowed_coins?.includes(CURRENCY)) return null;

      const price = getPrice(s);
      if (price == null || price <= maxPrice) return null;

      return { owner, server, price, maxPrice };
    })
    .filter(Boolean);
}

function getFulfilledServers(orders) {
  const watchIds = new Set(config.watchOwners.map((w) => w.server));
  const fulfilled = new Set();

  for (const order of orders) {
    if (order.expired) continue;
    if (watchIds.has(order.si)) {
      fulfilled.add(order.si);
    }
  }

  return fulfilled;
}

function logFound(server) {
  const watch = getWatch(server.id);
  console.log('FOUND');
  console.log({
    host: server.owner,
    server: server.id,
    gpu: server.specs?.gpu,
    rented: server.rented,
    price: getPrice(server),
    maxPrice: watch.maxPrice,
  });
}

function logSuccess(order, server) {
  const cluster = order.pub_cluster?.[0];
  const sshPort = order.tcp_ports?.[0]?.split(':')[1];

  console.log('SUCCESS');
  console.log({
    host: server.owner,
    server: order.si,
    order: order.id,
  });

  if (cluster && sshPort) {
    console.log(`ssh root@${cluster} -p ${sshPort}`);
  }
}

async function main() {
  if (!config.apiKey) {
    console.error('Thiếu apiKey trong config.json');
    process.exit(1);
  }

  if (!config.watchOwners?.length) {
    console.error('Thiếu watchOwners trong config.json');
    process.exit(1);
  }

  for (const watch of config.watchOwners) {
    if (watch.owner == null || watch.server == null || watch.maxPrice == null) {
      console.error('Mỗi watchOwners cần owner, server và maxPrice');
      process.exit(1);
    }
  }

  console.log('Clore rent bot started');
  console.log(
    'watch=',
    config.watchOwners
      .map((w) => `host:${w.owner}/server:${w.server}(max ${w.maxPrice})`)
      .join(', ')
  );
  console.log(`interval=${config.interval}ms currency=${CURRENCY}`);

  while (true) {
    try {
      const servers = await getMarketplace(config.scanApiKey);
      const orders = await myOrders(config.rentApiKey);
      const fulfilled = getFulfilledServers(orders);
      const matched = findMatches(servers).filter((s) => !fulfilled.has(s.id));
      const waiting = getWaiting(servers);
      const tooExpensive = getTooExpensive(servers);

      if (matched.length === 0) {
        console.log(
          `[SCAN] ${servers.length} servers, fulfilled=[${[...fulfilled].join(', ')}]`
        );
        if (waiting.length) {
          console.log('waiting', waiting);
        }
        if (tooExpensive.length) {
          console.log('too_expensive', tooExpensive);
        }
        if (fulfilled.size === config.watchOwners.length) {
          console.log('ALL DONE — đã thuê đủ tất cả server');
          // process.exit(0);
        }
      } else {
        const server = matched[0];
        logFound(server);

        // const watch = getWatch(server.id);

        // const profile = config.profiles[watch.profile];

        // if (!profile) {
        //   throw new Error(`Profile "${watch.profile}" không tồn tại`);
        // }

        await createOrder(config.apiKey, server, config);
        console.log(`[ORDER] created host=${server.owner} server=${server.id}`);

        // await sleep(3000);

        const freshOrders = await myOrders(config.apiKey);
        const order = freshOrders.find(
          (o) => o.si === server.id && !o.expired
        );

        if (order) {
          logSuccess(order, server);
          if (fulfilled.size + 1 === config.watchOwners.length) {
            console.log('ALL DONE — đã thuê đủ tất cả server');
            process.exit(0);
          }
        } else {
          console.log('[ORDER] chưa thấy trong my_orders, tiếp tục scan...');
        }
      }
    } catch (err) {
      console.error(err);
    
    }

    await sleep(config.interval);
  }
}

main();
