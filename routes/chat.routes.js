const express = require("express");
const router = express.Router();

const ChatMessage = require("../models/ChatMessage");
const ChatConversation = require("../models/ChatConversation");
const User = require("../models/User");
const Admin = require("../models/Admin");

const auth = require("../middleware/auth");
const verifyAdmin = require("../middleware/verifyAdmin");

router.post("/conversation", auth, async (req, res) => {
  try {
    const userId = req.user.userId;

    // ✅ get the most recent non-closed convo
    let convo = await ChatConversation.findOne({
      customer: userId,
      status: { $ne: "closed" },
    }).sort({ updatedAt: -1 });

    if (!convo) {
      const admin = await Admin.findOne();

      convo = await ChatConversation.create({
        customer: userId,
        agent: admin ? admin._id : null,
        status: admin ? "active" : "waiting",
        unreadByAgent: 0,
        unreadByCustomer: 0,
        lastMessage: "",
      });
    }

    // ✅ OPTION: return messages too (history)
    const messages = await ChatMessage.find({ conversation: convo._id }).sort({ createdAt: 1 });

    res.json({ conversation: convo, messages });
  } catch (err) {
    console.error("Create/Get conversation error:", err);
    res.status(500).json({ message: "Error creating conversation" });
  }
});

/*
|--------------------------------------------------------------------------
| 2️⃣  GET MESSAGES (Customer or Admin)
|--------------------------------------------------------------------------
*/

router.get("/messages/:conversationId", auth, async (req, res) => {
  try {
    const messages = await ChatMessage.find({
      conversation: req.params.conversationId,
    }).sort({ createdAt: 1 });

    res.json(messages);

  } catch (err) {
    console.error("Fetch messages error:", err);
    res.status(500).json({ message: "Error fetching messages" });
  }
});



/*
|--------------------------------------------------------------------------
| 3️⃣  ADMIN: Get All Conversations (Dashboard)
|--------------------------------------------------------------------------
*/

router.get("/admin/conversations", verifyAdmin, async (req, res) => {
  try {
    const conversations = await ChatConversation.find()
      .populate("customer", "username email")
      .populate("agent") // Admin
      .sort({ updatedAt: -1 });

    res.json(conversations);

  } catch (err) {
    console.error("Admin conversation list error:", err);
    res.status(500).json({ message: "Error fetching conversations" });
  }
});


/*
|--------------------------------------------------------------------------
| 3.5️⃣ ADMIN: Get Messages for a Conversation
|--------------------------------------------------------------------------
*/
router.get("/admin/messages/:conversationId", verifyAdmin, async (req, res) => {
  try {
    const messages = await ChatMessage.find({
      conversation: req.params.conversationId,
    }).sort({ createdAt: 1 });

    res.json(messages);
  } catch (err) {
    console.error("Admin fetch messages error:", err);
    res.status(500).json({ message: "Error fetching messages" });
  }
});

/*
|--------------------------------------------------------------------------
| 4️⃣  ADMIN: Close Conversation
|--------------------------------------------------------------------------
*/

router.patch("/admin/conversation/:id/close", verifyAdmin, async (req, res) => {
  try {
    const convo = await ChatConversation.findByIdAndUpdate(
      req.params.id,
      { status: "closed" },
      { new: true }
    );

    res.json(convo);

  } catch (err) {
    console.error("Close conversation error:", err);
    res.status(500).json({ message: "Error closing conversation" });
  }
});


/*
|--------------------------------------------------------------------------
| 5.5️⃣ ADMIN: Reset unreadByAgent
|--------------------------------------------------------------------------
*/
router.patch("/admin/conversation/:id/read", verifyAdmin, async (req, res) => {
  try {
    const convo = await ChatConversation.findById(req.params.id);
    if (!convo) return res.status(404).json({ message: "Conversation not found" });

    convo.unreadByAgent = 0;
    await convo.save();

    res.json({ success: true });
  } catch (err) {
    console.error("Admin reset unread error:", err);
    res.status(500).json({ message: "Error resetting unread counter" });
  }
});

/*
|--------------------------------------------------------------------------
| 5️⃣  RESET UNREAD COUNTERS
|--------------------------------------------------------------------------
*/

router.patch("/conversation/:id/read", auth, async (req, res) => {
  try {
    const convo = await ChatConversation.findById(req.params.id);

    if (!convo) {
      return res.status(404).json({ message: "Conversation not found" });
    }

    // If user is customer
    if (String(convo.customer) === req.user.userId) {
      convo.unreadByCustomer = 0;
    }

    await convo.save();

    res.json({ success: true });

  } catch (err) {
    console.error("Reset unread error:", err);
    res.status(500).json({ message: "Error resetting unread counter" });
  }
});



module.exports = router;