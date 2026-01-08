import express from "express";
const router = express.Router();

// Alexa is currently disabled to prevent startup crashes.
// The code is kept here but not active.

router.post("/", (req, res) => {
    res.status(200).json({ message: "Alexa endpoint is currently inactive." });
});

export default router;
