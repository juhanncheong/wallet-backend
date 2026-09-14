const express = require("express");
const router = express.Router();

const verifyAdmin = require("../middleware/verifyAdmin");
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
      error: {
        code: "VALIDATION_ERROR",
        message: err.message,
      },
    });
  }

  console.error("Admin P2P error", {
    name: err?.name,
    code: err?.code,
    message: err?.message,
  });

  return res.status(500).json({
    error: {
      code: "ADMIN_P2P_INTERNAL_ERROR",
      message: "Admin P2P request failed",
    },
  });
}

function route(fn) {
  return async (req, res) => {
    try {
      await fn(req, res);
    } catch (err) {
      return handleError(res, err);
    }
  };
}

router.use(verifyAdmin);

// Dashboard
router.get(
  "/overview",
  route(async (req, res) => {
    const data = await p2p.adminGetOverview();
    res.json({ data });
  }),
);

// Advertisements
router.get(
  "/ads",
  route(async (req, res) => {
    const data = await p2p.adminListAdvertisements({
      status: req.query.status,
      side: req.query.side,
      fiatCurrency: req.query.currency,
      page: req.query.page,
      limit: req.query.limit,
    });

    res.json(data);
  }),
);

router.patch(
  "/ads/:adId/status",
  route(async (req, res) => {
    const data = await p2p.adminSetAdvertisementStatus(
      req.adminId,
      req.params.adId,
      req.body?.status,
    );

    res.json({ data });
  }),
);

// Orders
router.get(
  "/orders",
  route(async (req, res) => {
    const data = await p2p.adminListOrders({
      status: req.query.status,
      fiatCurrency: req.query.currency,
      page: req.query.page,
      limit: req.query.limit,
    });

    res.json(data);
  }),
);

// Appeals / disputes
router.get(
  "/appeals",
  route(async (req, res) => {
    const data = await p2p.adminListDisputes({
      status: req.query.status,
      page: req.query.page,
      limit: req.query.limit,
    });

    res.json(data);
  }),
);

router.post(
  "/appeals/:appealId/resolve",
  route(async (req, res) => {
    const data = await p2p.adminResolveDispute(
      req.adminId,
      req.params.appealId,
      {
        winner: req.body?.winner,
        note: req.body?.note,
      },
    );

    res.json({ data });
  }),
);

// P2P profiles / controls
router.get(
  "/users",
  route(async (req, res) => {
    const data = await p2p.adminListProfiles({
      page: req.query.page,
      limit: req.query.limit,
    });

    res.json(data);
  }),
);

router.patch(
  "/users/:userId/freeze",
  route(async (req, res) => {
    const data = await p2p.adminSetP2PFreeze(
      req.adminId,
      req.params.userId,
      req.body?.frozen,
      req.body?.reason,
    );

    res.json({ data });
  }),
);

module.exports = router;
