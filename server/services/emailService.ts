interface TransactionalEmailParams {
    to: string | string[];
    subject: string;
    html: string;
    text?: string;
}

export type TargetedEmailPurpose =
    | "graduate_tracer_reminder"
    | "event_invitation"
    | "important_announcement"
    | "document_request"
    | "account_verification_reminder";

interface EmailEnvironment {
    apiKey: string;
    senderEmail: string;
    senderName: string;
    frontendUrl: string;
}

interface TargetedAlumniEmailParams {
    to: string;
    name: string;
    purpose: TargetedEmailPurpose;
    subject: string;
    message: string;
}

interface AlumniCredentialsParams {
    to: string;
    name: string;
    alumniId: string;
    temporaryPassword: string;
}

export interface EmailDeliveryResult {
    success: true;
    messageId: string;
}

export class BrevoEmailError extends Error {
    status?: number;
    details?: unknown;

    constructor(message: string, status?: number, details?: unknown) {
        super(message);
        this.name = "BrevoEmailError";
        this.status = status;
        this.details = details;
    }
}

const escapeHtml = (value: string) =>
    value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");

const normalizeRecipients = (to: string | string[]) => {
    const recipients = Array.isArray(to) ? to : [to];
    return recipients
        .map((email) => String(email || "").trim().toLowerCase())
        .filter(Boolean)
        .map((email) => ({ email }));
};

export const validateEmailEnvironment = (): EmailEnvironment => {
    const required = {
        BREVO_API_KEY: process.env.BREVO_API_KEY,
        BREVO_SENDER_EMAIL: process.env.BREVO_SENDER_EMAIL,
        BREVO_SENDER_NAME: process.env.BREVO_SENDER_NAME,
        FRONTEND_URL: process.env.FRONTEND_URL
    };
    const missing = Object.entries(required)
        .filter(([, value]) => !String(value || "").trim())
        .map(([key]) => key);

    if (missing.length > 0) {
        throw new BrevoEmailError(`Email service is not configured. Missing: ${missing.join(", ")}.`);
    }

    return {
        apiKey: required.BREVO_API_KEY!.trim(),
        senderEmail: required.BREVO_SENDER_EMAIL!.trim(),
        senderName: required.BREVO_SENDER_NAME!.trim(),
        frontendUrl: required.FRONTEND_URL!.trim()
    };
};

const getPortalUrl = (frontendUrl = process.env.FRONTEND_URL || process.env.APP_BASE_URL || "") => {
    const explicitLoginUrl = String(process.env.APP_LOGIN_URL || "").trim();
    const configuredUrl = explicitLoginUrl || frontendUrl;
    return configuredUrl.replace(/\/+$/, "");
};

const getBrevoErrorDetails = async (response: Response) => {
    const raw = await response.text();

    try {
        return raw ? JSON.parse(raw) : null;
    } catch {
        return raw;
    }
};

const getBrevoErrorMessage = (details: unknown) => {
    if (details && typeof details === "object" && "message" in details) {
        return String((details as { message?: unknown }).message || "Brevo rejected the email request.");
    }

    if (typeof details === "string" && details.trim()) {
        return details.trim();
    }

    return "Brevo rejected the email request.";
};

export const sendTransactionalEmail = async ({
    to,
    subject,
    html,
    text
}: TransactionalEmailParams): Promise<EmailDeliveryResult> => {
    const { apiKey, senderEmail, senderName } = validateEmailEnvironment();
    const recipients = normalizeRecipients(to);

    if (recipients.length === 0) {
        throw new BrevoEmailError("At least one recipient email is required.");
    }

    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
            "accept": "application/json",
            "api-key": apiKey,
            "content-type": "application/json"
        },
        body: JSON.stringify({
            sender: {
                name: senderName,
                email: senderEmail
            },
            to: recipients,
            subject,
            htmlContent: html,
            textContent: text
        })
    });

    if (!response.ok) {
        const details = await getBrevoErrorDetails(response);
        const message = getBrevoErrorMessage(details);
        console.error("BREVO EMAIL ERROR:", {
            status: response.status,
            message
        });
        throw new BrevoEmailError(message, response.status, details);
    }

    const body = await response.json().catch(() => ({}));

    return {
        success: true,
        messageId: String(body?.messageId || "brevo-accepted")
    };
};

const purposeLabels: Record<TargetedEmailPurpose, string> = {
    graduate_tracer_reminder: "Graduate Tracer Reminder",
    event_invitation: "Event Invitation",
    important_announcement: "Important Announcement",
    document_request: "Document Request",
    account_verification_reminder: "Account Verification Reminder"
};

export const sendTargetedAlumniEmail = async ({
    to,
    name,
    purpose,
    subject,
    message
}: TargetedAlumniEmailParams) => {
    const { senderName, frontendUrl } = validateEmailEnvironment();
    const portalUrl = getPortalUrl(frontendUrl);
    const safeName = escapeHtml(name || "Alumni");
    const safePurpose = escapeHtml(purposeLabels[purpose] || "Alumni Email");
    const safeMessage = escapeHtml(message).replace(/\n/g, "<br />");
    const safeSenderName = escapeHtml(senderName);
    const safePortalUrl = escapeHtml(portalUrl);

    return sendTransactionalEmail({
        to,
        subject,
        text:
            `Hello ${name || "Alumni"},\n\n` +
            `${message}\n\n` +
            `Purpose: ${purposeLabels[purpose] || "Alumni Email"}\n` +
            `Alumni Portal: ${portalUrl}\n\n` +
            `Thank you,\n${senderName}`,
        html: `
            <div style="font-family: Arial, sans-serif; color: #1f2937; line-height: 1.6;">
                <p>Hello ${safeName},</p>
                <p>${safeMessage}</p>
                <p><strong>Purpose:</strong> ${safePurpose}</p>
                <p><a href="${safePortalUrl}">Open Alumni Portal</a></p>
                <p>Thank you,<br/>${safeSenderName}</p>
            </div>
        `
    });
};

export const sendAlumniCredentialsEmail = async ({
    to,
    name,
    alumniId,
    temporaryPassword
}: AlumniCredentialsParams) => {
    const { senderName, frontendUrl } = validateEmailEnvironment();
    const portalUrl = getPortalUrl(frontendUrl);
    const safeName = escapeHtml(name);
    const safeEmail = escapeHtml(to);
    const safeAlumniId = escapeHtml(alumniId);
    const safePassword = escapeHtml(temporaryPassword);
    const safeSenderName = escapeHtml(senderName);
    const safePortalUrl = escapeHtml(portalUrl);

    return sendTransactionalEmail({
        to,
        subject: "Your Alumni Portal Account Credentials",
        text:
            `Hello ${name},\n\n` +
            "Your alumni account has been created.\n\n" +
            `Alumni Portal: ${portalUrl}\n` +
            `Email: ${to}\n` +
            `Alumni ID: ${alumniId}\n` +
            `Temporary Password: ${temporaryPassword}\n\n` +
            "Please sign in and change your password immediately.",
        html: `
            <div style="font-family: Arial, sans-serif; color: #1f2937; line-height: 1.6;">
                <h2 style="color: #550000;">Hello ${safeName},</h2>
                <p>Your alumni account has been created.</p>
                <table style="border-collapse: collapse; width: 100%; max-width: 520px;">
                    <tr>
                        <td style="padding: 8px; border: 1px solid #e5e7eb;"><strong>Alumni Portal</strong></td>
                        <td style="padding: 8px; border: 1px solid #e5e7eb;"><a href="${safePortalUrl}">${safePortalUrl}</a></td>
                    </tr>
                    <tr>
                        <td style="padding: 8px; border: 1px solid #e5e7eb;"><strong>Email</strong></td>
                        <td style="padding: 8px; border: 1px solid #e5e7eb;">${safeEmail}</td>
                    </tr>
                    <tr>
                        <td style="padding: 8px; border: 1px solid #e5e7eb;"><strong>Alumni ID</strong></td>
                        <td style="padding: 8px; border: 1px solid #e5e7eb;">${safeAlumniId}</td>
                    </tr>
                    <tr>
                        <td style="padding: 8px; border: 1px solid #e5e7eb;"><strong>Temporary Password</strong></td>
                        <td style="padding: 8px; border: 1px solid #e5e7eb;">${safePassword}</td>
                    </tr>
                </table>
                <p>Please sign in and change your password immediately.</p>
                <p>Thank you,<br/>${safeSenderName}</p>
            </div>
        `
    });
};
