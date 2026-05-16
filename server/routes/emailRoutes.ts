import express from "express";
import { sendTransactionalEmail } from "../services/emailService";

const router = express.Router();

router.post("/send-reminder", async (req, res) => {
  try {
    const { emails, subject, message } = req.body || {};

    if (!emails || !Array.isArray(emails) || emails.length === 0) {
      return res.status(400).json({ success: false, message: "No emails provided" });
    }

    if (emails.length > 10) {
      return res.status(400).json({ success: false, message: "Select a maximum of 10 alumni before sending email." });
    }

    if (!subject || !message) {
      return res.status(400).json({ success: false, message: "Subject and message are required" });
    }

    await sendTransactionalEmail({
      to: emails.map((address: string) => String(address).trim().toLowerCase()).filter(Boolean),
      subject: String(subject),
      html: `
        <h2>Alumni Reminder</h2>
        <p>${String(message)}</p>
        <br/>
        <p>Thank you,<br/>${process.env.BREVO_SENDER_NAME || "Salay Community College"}</p>
      `,
    });

    return res.json({
      success: true,
      message: "Reminder sent successfully",
    });
  } catch (error) {
    console.error("Brevo email error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to send reminder",
    });
  }
});

export default router;
