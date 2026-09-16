exports.handler = async (event) => {
    if (event.httpMethod !== "POST") {
        return {
            statusCode: 405,
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                error: "Method not allowed"
            })
        };
    }

    try {
        const { message } = JSON.parse(event.body || "{}");

        if (!message || !message.trim()) {
            return {
                statusCode: 400,
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    error: "Message is required"
                })
            };
        }

        const apiKey = process.env.ANTHROPIC_API_KEY;

        if (!apiKey) {
            return {
                statusCode: 500,
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    error: "ANTHROPIC_API_KEY is not configured in Netlify"
                })
            };
        }

        const response = await fetch(
            "https://api.anthropic.com/v1/messages",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-api-key": apiKey,
                    "anthropic-version": "2023-06-01"
                },
                body: JSON.stringify({
                    model: "claude-sonnet-4-5",
                    max_tokens: 1024,
                    system:
                        "You are AKOS, Akash's personal AI assistant. Be helpful, calm, practical and conversational. Answer clearly and naturally.",
                    messages: [
                        {
                            role: "user",
                            content: message
                        }
                    ]
                })
            }
        );

        const data = await response.json();

        if (!response.ok) {
            return {
                statusCode: response.status,
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    error: data?.error?.message || "Anthropic API request failed"
                })
            };
        }

        const text =
            data?.content
                ?.filter((item) => item.type === "text")
                ?.map((item) => item.text)
                ?.join("\n") || "I couldn't generate a response.";

        return {
            statusCode: 200,
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                response: text
            })
        };

    } catch (error) {
        console.error("AKOS error:", error);

        return {
            statusCode: 500,
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                error: "AKOS server error"
            })
        };
    }
};
