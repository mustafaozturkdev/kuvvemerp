// Database barrel export — NestJS CommonJS runtime icin
// TypeScript tipler src/index.ts'den, runtime export'lar buradan gelir
const master = require('./node_modules/.prisma/master/index.js');
const tenant = require('./node_modules/.prisma/client-tenant/index.js');

module.exports.MasterClient = master.PrismaClient;
module.exports.TenantClient = tenant.PrismaClient;
