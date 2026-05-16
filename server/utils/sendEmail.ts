import nodemailer from "nodemailer";
import { sendAlumniCredentialsEmail, sendTransactionalEmail } from "../services/emailService";

interface EmailParams {
    to: string;
    name: string;
    alumniId: string;
    temporaryPassword?: string;
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

    return sendTransactionalEmail({ to, subject, html, text });
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

const sendEmail = async ({ to, name, alumniId, temporaryPassword }: EmailParams) => {
    return sendAlumniCredentialsEmail({
        to,
        name,
        alumniId,
        temporaryPassword: temporaryPassword || alumniId
    });
};

export default sendEmail;
