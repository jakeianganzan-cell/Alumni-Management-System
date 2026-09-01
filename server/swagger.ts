import swaggerJsdoc from "swagger-jsdoc";

export const swaggerSpec = swaggerJsdoc({
    definition: {
        openapi: "3.0.3",
        info: {
            title: "Alumni Management API",
            version: "1.0.0",
            description: "API documentation for the Alumni Management Portal."
        },
        servers: [
            {
                url: "/",
                description: "Current server"
            }
        ],
        components: {
            securitySchemes: {
                bearerAuth: {
                    type: "http",
                    scheme: "bearer",
                    bearerFormat: "JWT"
                }
            }
        },
        security: [{ bearerAuth: [] }],
        paths: {
            "/api/health": {
                get: {
                    summary: "Health check",
                    security: [],
                    responses: {
                        "200": {
                            description: "Backend status"
                        }
                    }
                }
            },
            "/api/auth/login": {
                post: {
                    summary: "Login with email/student ID and password",
                    security: [],
                    responses: {
                        "200": { description: "Authenticated session or role selection challenge" },
                        "400": { description: "Invalid credentials" },
                        "429": { description: "Too many login attempts" }
                    }
                }
            },
            "/api/auth/select-role": {
                post: {
                    summary: "Select one role after multi-role login",
                    security: [],
                    responses: {
                        "200": { description: "Authenticated session" },
                        "401": { description: "Expired or invalid role selection token" },
                        "403": { description: "Selected role is not assigned" }
                    }
                }
            },
            "/api/auth/session": {
                get: {
                    summary: "Restore authenticated session",
                    responses: {
                        "200": { description: "Authenticated user payload" },
                        "401": { description: "Missing token" },
                        "403": { description: "Invalid or ended session" }
                    }
                }
            },
            "/api/profiles": {
                get: {
                    summary: "List alumni profiles",
                    responses: {
                        "200": { description: "Profile list" },
                        "401": { description: "Missing token" }
                    }
                },
                post: {
                    summary: "Create alumni profile",
                    responses: {
                        "201": { description: "Created alumni account" },
                        "403": { description: "Admin access required" }
                    }
                }
            },
            "/api/profiles/import": {
                post: {
                    summary: "Import alumni records from XLSX",
                    responses: {
                        "200": { description: "Import summary" },
                        "400": { description: "Invalid import file or rows" },
                        "429": { description: "Too many import attempts" }
                    }
                }
            }
        }
    },
    apis: []
});
