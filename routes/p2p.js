const express = require("express");
const router = express.Router();

const auth = require("../middleware/auth");
const p2p = require("../services/p2pService");

function handleError(res, err) {
  if (err instanceof p2p.P2PError) {
    return res.status(err.status).json({
      error: {
        code: err.code,
        message: err.message,
        ...(err.details !== undefined ? { details: err.details } : {}),
      },
    });
  }

  if (err?.name === "ValidationError") {
    return res.status(400).json({
      error: { code: "VALIDATION_ERROR", message: err.message },
    });
  }

  console.error("P2P error", {
    name: err?.name,
    code: err?.code,
    message: err?.message,
  });

  return res.status(500).json({
    error: { code: "P2P_INTERNAL_ERROR", message: "P2P request failed" },
  });
}

function route(fn) {
  return async (req, res) => {
    try {
      await fn(req, res);
    } catch (err) {
      handleError(res, err);
    }
  };
}

// All P2P endpoints are wallet-user endpoints.
router.use(auth);

// Profile / reputation
router.get(
  "/profile/me",
  route(async (req, res) => {
    const profile = await p2p.getOrCreateProfile(req.userId);
    res.json({
      data: {
        p2pEnabled: profile.p2pEnabled,
        p2pFrozen: profile.p2pFrozen,
        freezeReason: profile.freezeReason,
        stats: p2p.serializeProfile(profile),
      },
    });
  }),
);

// P2P-only escrow. Do not use Balance.locked here because that field is
// shared with other products such as Spot limit orders.
router.get(
  "/escrow/me",
  route(async (req, res) => {
    const data = await p2p.getUserP2PEscrow(req.userId);
    res.json({ data });
  }),
);

// Payment methods
router.get(
  "/payment-methods",
  route(async (req, res) => {
    const data = await p2p.listMyPaymentMethods(req.userId, {
      currency: req.query.currency,
      activeOnly: String(req.query.activeOnly || "").toLowerCase() === "true",
    });
    res.json({ data });
  }),
);

router.post(
  "/payment-methods",
  route(async (req, res) => {
    const data = await p2p.createPaymentMethod(req.userId, req.body || {});
    res.status(201).json({ data });
  }),
);

router.patch(
  "/payment-methods/:methodId",
  route(async (req, res) => {
    const data = await p2p.updatePaymentMethod(
      req.userId,
      req.params.methodId,
      req.body || {},
    );
    res.json({ data });
  }),
);

router.patch(
  "/payment-methods/:methodId/active",
  route(async (req, res) => {
    const data = await p2p.setPaymentMethodActive(
      req.userId,
      req.params.methodId,
      req.body?.isActive,
    );
    res.json({ data });
  }),
);

// Marketplace
// IMPORTANT: currencies with zero active advertisements are NOT returned.
router.get(
  "/market/currencies",
  route(async (req, res) => {
    const data = await p2p.listActiveCurrencies(req.query.intent);
    res.json({ data });
  }),
);

router.get(
  "/ads",
  route(async (req, res) => {
    const data = await p2p.listMarketAdvertisements({
      intent: req.query.intent,
      fiatCurrency: req.query.currency,
      fiatAmount: req.query.amount,
      paymentMethodType: req.query.paymentMethod,
      page: req.query.page,
      limit: req.query.limit,
    });
    res.json(data);
  }),
);

router.get(
  "/ads/mine",
  route(async (req, res) => {
    const data = await p2p.listMyAdvertisements(req.userId, {
      status: req.query.status,
      page: req.query.page,
      limit: req.query.limit,
    });
    res.json(data);
  }),
);

router.get(
  "/ads/:adId",
  route(async (req, res) => {
    const data = await p2p.getAdvertisement(req.params.adId);
    if (!data)
      throw new p2p.P2PError("Advertisement not found", 404, "AD_NOT_FOUND");
    res.json({ data });
  }),
);

router.post(
  "/ads",
  route(async (req, res) => {
    const data = await p2p.createAdvertisement(req.userId, req.body || {});
    res.status(201).json({ data });
  }),
);

router.patch(
  "/ads/:adId",
  route(async (req, res) => {
    const data = await p2p.updateAdvertisement(
      req.userId,
      req.params.adId,
      req.body || {},
    );
    res.json({ data });
  }),
);

for (const action of ["pause", "resume", "cancel"]) {
  router.post(
    `/ads/:adId/${action}`,
    route(async (req, res) => {
      const data = await p2p.setAdvertisementStatus(
        req.userId,
        req.params.adId,
        action,
      );
      res.json({ data });
    }),
  );
}

// Orders / escrow
router.get(
  "/orders",
  route(async (req, res) => {
    const data = await p2p.listMyOrders(req.userId, {
      status: req.query.status,
      page: req.query.page,
      limit: req.query.limit,
    });
    res.json(data);
  }),
);

router.get(
  "/orders/:orderId",
  route(async (req, res) => {
    const data = await p2p.getOrderForUser(req.userId, req.params.orderId);
    res.json({ data });
  }),
);

router.post(
  "/orders",
  route(async (req, res) => {
    const idempotencyKey =
      req.headers["idempotency-key"] || req.body?.idempotencyKey;
    const data = await p2p.createOrder(
      req.userId,
      req.body || {},
      idempotencyKey,
    );
    res.status(201).json({ data });
  }),
);

router.post(
  "/orders/:orderId/paid",
  route(async (req, res) => {
    const data = await p2p.markPaid(req.userId, req.params.orderId);
    res.json({ data });
  }),
);

router.post(
  "/orders/:orderId/release",
  route(async (req, res) => {
    const data = await p2p.releaseOrder(req.userId, req.params.orderId);
    res.json({ data });
  }),
);

router.post(
  "/orders/:orderId/cancel",
  route(async (req, res) => {
    const data = await p2p.cancelOrder(
      req.userId,
      req.params.orderId,
      req.body?.reason,
    );
    res.json({ data });
  }),
);

// Appeal / dispute
router.post(
  "/orders/:orderId/appeal",
  route(async (req, res) => {
    const data = await p2p.openDispute(
      req.userId,
      req.params.orderId,
      req.body || {},
    );
    res.status(201).json({ data });
  }),
);

router.get(
  "/orders/:orderId/appeal",
  route(async (req, res) => {
    const data = await p2p.getDisputeForUser(req.userId, req.params.orderId);
    res.json({ data });
  }),
);

// Reputation
router.post(
  "/orders/:orderId/review",
  route(async (req, res) => {
    const data = await p2p.createReview(
      req.userId,
      req.params.orderId,
      req.body || {},
    );
    res.status(201).json({ data });
  }),
);

module.exports = router;
