// services/depositAllocator.js
const Wallet = require("../models/Wallet");

// Reserve 1 address from pool (atomic)
async function reserveNextAddress({ network, userId, session }) {
  const filter = {
    network,
    $or: [{ status: "available" }, { status: { $exists: false } }],
    assignedTo: null,
  };

  const update = {
    $set: { status: "assigned", assignedTo: userId, assignedAt: new Date() },
  };

  const opts = { new: true, sort: { createdAt: 1 }, session };

  return Wallet.findOneAndUpdate(filter, update, opts);
}

async function allocateDepositWallets(userId, session) {
  const wanted = [
    { key: "ERC20", network: "ERC20" },
    { key: "BEP20", network: "BEP20" },
    { key: "TRC20", network: "TRC20" },
  ];

  const out = {};
  for (const w of wanted) {
    const doc = await reserveNextAddress({ network: w.network, userId, session });
    if (!doc) {
      const err = new Error(`No available ${w.network} deposit address in pool`);
      err.status = 503;
      err.code = "ADDRESS_POOL_EMPTY";
      err.missing = w.key;
      throw err;
    }
    out[w.key] = doc.address;
  }

  return out;
}

module.exports = { allocateDepositWallets };
