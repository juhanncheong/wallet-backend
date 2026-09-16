const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");

const Transaction = require("../models/Transaction");
const Balance = require("../models/Balance");
const User = require("../models/User");
const auth = require("../middleware/auth");

const fetchFn =
  global.fetch ||
  ((...args) => import("node-fetch").then(({ default: f }) => f(...args)));

const USDT_AED_RATE_URL =
  "https://api.coinbase.com/v2/exchange-rates?currency=USDT";
const UAE_COUNTRY = "AE";
const RATE_CACHE_MS = 30 * 1000;

let usdtAedRateCache = {
  rate: null,
  fetchedAt: 0,
};

function roundAED(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function normalizeUaeIban(value) {
  return String(value || "")
    .replace(/[\s-]/g, "")
    .trim()
    .toUpperCase();
}

async function getCurrentUsdtAedRate() {
  const now = Date.now();

  if (
    Number.isFinite(usdtAedRateCache.rate) &&
    usdtAedRateCache.rate > 0 &&
    now - usdtAedRateCache.fetchedAt < RATE_CACHE_MS
  ) {
    return {
      rate: usdtAedRateCache.rate,
      source: "coinbase",
      quotedAt: new Date(usdtAedRateCache.fetchedAt),
    };
  }

  const response = await fetchFn(USDT_AED_RATE_URL, {
    headers: { accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(
      `USDT/AED rate provider failed with status ${response.status}`,
    );
  }

  const data = await response.json();
  const rate = Number(data?.data?.rates?.AED);

  if (!Number.isFinite(rate) || rate <= 0) {
    throw new Error("Invalid USDT/AED rate received");
  }

  usdtAedRateCache = {
    rate,
    fetchedAt: now,
  };

  return {
    rate,
    source: "coinbase",
    quotedAt: new Date(now),
  };
}

// ADMIN: GET /admin/withdrawals
router.get("/withdrawals", async (req, res) => {
  const withdrawals = await Transaction.find({ type: "withdrawal" })
    .populate("userId", "email")
    .sort({ createdAt: -1 });

  res.json(withdrawals);
});

// USER: GET /api/withdrawals/uae-quote?amount=100
// Returns the current USDT -> AED rate and calculated AED amount.
router.get("/uae-quote", auth, async (req, res) => {
  try {
    const amount = Number(req.query.amount);

    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ message: "Invalid USDT amount" });
    }

    const quote = await getCurrentUsdtAedRate();

    return res.json({
      success: true,
      coin: "USDT",
      amountUSDT: amount,
      currency: "AED",
      rate: quote.rate,
      amountAED: roundAED(amount * quote.rate),
      country: UAE_COUNTRY,
      rateSource: quote.source,
      quotedAt: quote.quotedAt,
    });
  } catch (err) {
    console.error("UAE withdrawal quote error:", err);
    return res.status(503).json({
      message: "Unable to get current USDT/AED rate. Please try again.",
    });
  }
});

// USER: POST /api/withdrawals
router.post("/", auth, async (req, res) => {
  try {
    const userId = req.user.userId;

    let {
      coin,
      amount,
      address,
      network,
      method,
      pin,

      // Existing USA wire fields
      bankName,
      accountName,
      accountNumber,
      swiftCode,
      bankAddress,

      // UAE local bank fields
      name,
      iban,
    } = req.body;

    coin = String(coin || "")
      .trim()
      .toUpperCase();
    amount = Number(amount);
    method = String(method || "CRYPTO")
      .trim()
      .toUpperCase();
    pin = String(pin || "").trim();

    if (!coin) {
      return res.status(400).json({ message: "Coin required" });
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ message: "Invalid amount" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Same protection logic as /api/wallet/withdraw
    if (user.isWithdrawFrozen) {
      return res.status(403).json({ message: "Withdrawals are frozen" });
    }

    if (user.isWithdrawLocked) {
      return res.status(403).json({ message: "Balance Unavailable." });
    }

    if (!user.withdrawalPin) {
      return res.status(400).json({ message: "No PIN set" });
    }

    const MAX_PIN_TRIES = 3;

    if (user.isWithdrawPinLocked) {
      return res.status(403).json({
        message:
          "Withdrawals locked due to 3 wrong PIN attempts. Contact admin to reset.",
        triesLeft: 0,
        isWithdrawPinLocked: true,
      });
    }

    if (pin !== user.withdrawalPin) {
      user.withdrawalPinFailCount = (user.withdrawalPinFailCount || 0) + 1;

      const triesLeft = Math.max(
        0,
        MAX_PIN_TRIES - user.withdrawalPinFailCount,
      );

      if (triesLeft === 0) {
        user.isWithdrawPinLocked = true;
      }

      await user.save();

      return res.status(401).json({
        message:
          triesLeft === 0
            ? "Too many wrong PIN attempts. Withdrawals are locked until admin resets."
            : `Invalid PIN. ${triesLeft} tries left.`,
        triesLeft,
        isWithdrawPinLocked: user.isWithdrawPinLocked,
      });
    }

    // Correct PIN: reset fail count
    if ((user.withdrawalPinFailCount || 0) !== 0) {
      user.withdrawalPinFailCount = 0;
      await user.save();
    }

    let uaeQuote = null;
    let normalizedUaeIban = "";

    if (method === "USDT_WIRE") {
      // Existing USA wire withdrawal remains unchanged.
      if (coin !== "USDT") {
        return res
          .status(400)
          .json({ message: "Wire withdrawal only allowed for USDT" });
      }

      if (!bankName || !accountName || !accountNumber || !swiftCode) {
        return res.status(400).json({ message: "Incomplete bank details" });
      }
    } else if (method === "USDT_UAE_BANK") {
      if (coin !== "USDT") {
        return res.status(400).json({
          message: "UAE bank withdrawal only allowed for USDT",
        });
      }

      const cleanName = String(name || "").trim();
      const cleanBankName = String(bankName || "").trim();
      normalizedUaeIban = normalizeUaeIban(iban);

      if (!cleanName || !cleanBankName || !normalizedUaeIban) {
        return res.status(400).json({
          message: "Name, bank name and IBAN are required",
        });
      }

      if (!/^AE\d{21}$/.test(normalizedUaeIban)) {
        return res.status(400).json({ message: "Invalid UAE IBAN" });
      }

      try {
        uaeQuote = await getCurrentUsdtAedRate();
      } catch (rateErr) {
        console.error("USDT/AED rate error:", rateErr);
        return res.status(503).json({
          message: "Unable to get current USDT/AED rate. Please try again.",
        });
      }
    } else if (method === "CRYPTO") {
      // Normal crypto validation
      if (!address || String(address).trim().length < 8) {
        return res.status(400).json({ message: "Invalid address" });
      }

      if (!network || String(network).trim().length < 2) {
        return res.status(400).json({ message: "Network required" });
      }
    } else {
      return res.status(400).json({ message: "Invalid withdrawal method" });
    }

    // Create the withdrawal atomically. `withdrawalReserve` is a policy floor
    // on the available balance; it does not move or reclassify user funds.
    const session = await mongoose.startSession();
    let tx = null;

    try {
      await session.withTransaction(async () => {
        // Re-check the master/full withdrawal controls inside the transaction.
        const currentUser = await User.findById(userId)
          .select("isWithdrawFrozen isWithdrawLocked isWithdrawPinLocked")
          .session(session);

        if (!currentUser) {
          const err = new Error("User not found");
          err.status = 404;
          throw err;
        }

        if (currentUser.isWithdrawFrozen) {
          const err = new Error("Withdrawals are frozen");
          err.status = 403;
          throw err;
        }

        if (currentUser.isWithdrawLocked) {
          const err = new Error("Balance Unavailable.");
          err.status = 403;
          throw err;
        }

        if (currentUser.isWithdrawPinLocked) {
          const err = new Error(
            "Withdrawals locked due to 3 wrong PIN attempts. Contact admin to reset.",
          );
          err.status = 403;
          throw err;
        }

        // One atomic balance update prevents concurrent requests from both
        // spending the same withdrawable amount. Existing rows that pre-date
        // this feature are treated as withdrawalReserve = 0.
        const updatedBalance = await Balance.findOneAndUpdate(
          {
            userId,
            asset: coin,
            $expr: {
              $gte: [
                {
                  $subtract: [
                    { $ifNull: ["$available", 0] },
                    { $ifNull: ["$withdrawalReserve", 0] },
                  ],
                },
                amount,
              ],
            },
          },
          { $inc: { available: -amount } },
          { new: true, session },
        );

        if (!updatedBalance) {
          const currentBalance = await Balance.findOne({ userId, asset: coin })
            .session(session)
            .lean();

          const available = Number(currentBalance?.available || 0);
          const withdrawalReserve = Math.max(
            0,
            Number(currentBalance?.withdrawalReserve || 0),
          );
          const withdrawable = Math.max(available - withdrawalReserve, 0);

          const err = new Error(
            withdrawalReserve > 0
              ? "Amount exceeds withdrawable balance."
              : "Insufficient balance",
          );
          err.status = 400;
          err.details = { available, withdrawalReserve, withdrawable };
          throw err;
        }

        const created = await Transaction.create(
          [
            {
              userId,
              type: "withdrawal",
              coin,
              amount,
              method,

              network: method === "CRYPTO" ? String(network || "").trim() : "",
              address: method === "CRYPTO" ? String(address || "").trim() : "",

              wireInfo:
                method === "USDT_WIRE"
                  ? {
                      bankName: String(bankName || "").trim(),
                      accountName: String(accountName || "").trim(),
                      accountNumber: String(accountNumber || "").trim(),
                      swiftCode: String(swiftCode || "").trim(),
                      bankAddress: String(bankAddress || "").trim(),
                    }
                  : undefined,

              uaeBankInfo:
                method === "USDT_UAE_BANK"
                  ? {
                      name: String(name || "").trim(),
                      bankName: String(bankName || "").trim(),
                      iban: normalizedUaeIban,
                      country: UAE_COUNTRY,
                      amountAED: roundAED(amount * uaeQuote.rate),
                      exchangeRate: uaeQuote.rate,
                      rateSource: uaeQuote.source,
                      quotedAt: uaeQuote.quotedAt,
                    }
                  : undefined,

              status: "pending",
            },
          ],
          { session },
        );

        tx = created[0];
      });
    } catch (err) {
      if (err.status) {
        return res.status(err.status).json({
          message: err.message,
          ...(err.details || {}),
        });
      }
      throw err;
    } finally {
      session.endSession();
    }

    return res.json({ success: true, transaction: tx });
  } catch (err) {
    console.error("Create withdrawal error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
