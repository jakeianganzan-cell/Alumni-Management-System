import nodemailer from "nodemailer";
import { TransactionalEmailsClient } from "@getbrevo/brevo/transactionalEmails";

interface EmailParams {
    to: string;
    name: string;
    alumniId: string;
}

interface GenericEmailParams {
    to: string | string[];
    subject: string;
    html: string;
    text?: string;
}

let transporterPromise: Promise<nodemailer.Transporter> | null = null;

const parseBoolean = (value?: string) => {
    if (!value) return false;
    return ["1", "true", "yes", "on"].includes(value.toLowerCase());
};

const buildTransporter = async () => {
    const smtpHost = process.env.SMTP_HOST;
    const smtpPort = Number(process.env.SMTP_PORT || 587);
    const smtpSecure = parseBoolean(process.env.SMTP_SECURE);
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;
    const smtpService = process.env.SMTP_SERVICE;
    const hasAuth = Boolean(smtpUser && smtpPass);

    if (!smtpHost && !smtpService) {
        throw new Error("Email service is not configured. Set SMTP_HOST or SMTP_SERVICE in environment variables.");
    }

    if (hasAuth === false && (smtpUser || smtpPass)) {
        throw new Error("Incomplete SMTP credentials. Set both SMTP_USER and SMTP_PASS.");
    }

    const transporter = smtpService
        ? nodemailer.createTransport({
            service: smtpService,
            auth: hasAuth
                ? {
                    user: smtpUser,
                    pass: smtpPass
                }
                : undefined
        })
        : nodemailer.createTransport({
            host: smtpHost,
            port: smtpPort,
            secure: smtpSecure,
            auth: hasAuth
                ? {
                    user: smtpUser,
                    pass: smtpPass
                }
                : undefined
        });

    await transporter.verify();

    return transporter;
};

const getTransporter = async () => {
    if (!transporterPromise) {
        transporterPromise = buildTransporter().catch((error) => {
            transporterPromise = null;
            throw error;
        });
    }

    return transporterPromise;
};

const hasSmtpConfig = () => {
    return Boolean(process.env.SMTP_HOST || process.env.SMTP_SERVICE);
};

const hasBrevoConfig = () => {
    return Boolean(process.env.BREVO_API_KEY && process.env.BREVO_SENDER_EMAIL);
};

const sendViaBrevo = async ({ to, subject, html, text }: GenericEmailParams) => {
    if (!hasBrevoConfig()) {
        throw new Error("Email service is not configured. Set SMTP_* or BREVO_* environment variables.");
    }

    const emailAPI = new TransactionalEmailsClient({
        apiKey: process.env.BREVO_API_KEY as string,
    });

    const recipients = Array.isArray(to)
        ? to.map((email) => ({ email }))
        : [{ email: to }];

    const response = await emailAPI.sendTransacEmail({
        sender: {
            name: process.env.BREVO_SENDER_NAME || "Salay Community College",
            email: process.env.BREVO_SENDER_EMAIL as string,
        },
        to: recipients,
        subject,
        htmlContent: html,
        textContent: text,
    });

    return {
        success: true,
        messageId: response.messageId || "brevo-accepted",
    };
};

export const sendMail = async ({ to, subject, html, text }: GenericEmailParams) => {
    if (!hasSmtpConfig()) {
        return sendViaBrevo({ to, subject, html, text });
    }

    try {
        const smtpFrom = process.env.SMTP_FROM || process.env.SMTP_USER || "no-reply@example.com";
        const transporter = await getTransporter();
        const info = await transporter.sendMail({
            from: smtpFrom,
            to,
            subject,
            html,
            text
        });

        return {
            success: true,
            messageId: info.messageId
        };
    } catch (error: unknown) {
        if (hasBrevoConfig()) {
            return sendViaBrevo({ to, subject, html, text });
        }

        const message = error instanceof Error ? error.message : "Unknown email error";
        throw new Error(`Failed to send email: ${message}`);
    }
};

const sendEmail = async ({ to, name, alumniId }: EmailParams) => {
    const loginUrl = process.env.APP_LOGIN_URL || "http://localhost:8080/login";

    return sendMail({
        to,
        subject: "Alumni Account Created",
        text:
            `Hello ${name},\n\n` +
            "Your alumni account has been created successfully.\n\n" +
            `Email: ${to}\n` +
            `Alumni ID / Default Password: ${alumniId}\n` +
            `Sign in here: ${loginUrl}\n\n` +
            "Please log in and update your credentials as soon as possible.",
        html: `
            <h2>Hello ${name},</h2>
            <p>Your alumni account has been created successfully.</p>
            <p><strong>Login Details:</strong></p>
            <ul>
                <li>Email: ${to}</li>
                <li>Alumni ID / Default Password: ${alumniId}</li>
            </ul>
            <p>You can sign in here: <a href="${loginUrl}">${loginUrl}</a></p>
            <p>Please log in and update your credentials as soon as possible.</p>
            <p>Welcome to the alumni community.</p>
        `
    });
};

export default sendEmail;
