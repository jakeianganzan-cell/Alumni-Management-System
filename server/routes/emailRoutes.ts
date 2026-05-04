import express from "express";
import { TransactionalEmailsClient } from "@getbrevo/brevo/transactionalEmails";

const router = express.Router();

router.post("/send-reminder", async (req, res) => {
  try {
    const { emails, subject, message } = req.body || {};

    if (!emails || !Array.isArray(emails) || emails.length === 0) {
      return res.status(400).json({ success: false, message: "No emails provided" });
    }

    if (!subject || !message) {
      return res.status(400).json({ success: false, message: "Subject and message are required" });
    }

    if (!process.env.BREVO_API_KEY || !process.env.BREVO_SENDER_EMAIL) {
      return res.status(500).json({ success: false, message: "Brevo environment variables are missing" });
    }

    const emailAPI = new TransactionalEmailsClient({
      apiKey: process.env.BREVO_API_KEY,
    });

    await emailAPI.sendTransacEmail({
      sender: {
        name: process.env.BREVO_SENDER_NAME || "Salay Community College",
        email: process.env.BREVO_SENDER_EMAIL,
      },
      to: emails.map((address: string) => ({ email: address })),
      subject: String(subject),
      htmlContent: `
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
