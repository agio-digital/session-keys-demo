import pino from "pino";

export const logger = pino({
  browser: {
    asObject: true,
    transmit: {
      level: "info",
      send: (level, logEvent) => {
        const { messages } = logEvent;

        const colors: Record<string, string> = {
          "10": "#808080",
          "20": "#008000",
          "30": "#0000FF",
          "40": "#FFA500",
          "50": "#FF0000",
          "60": "#8B0000",
        };

        const color = colors[String(level)] || "#000000";
        const levelNames = ["trace", "debug", "info", "warn", "error", "fatal"];
        const levelIndex = Math.floor(Number(level) / 10) - 1;
        const levelName = levelNames[levelIndex] || "unknown";

        // Expand objects by default using JSON.stringify
        const expandedMessages = messages.map((msg) => {
          if (typeof msg === "object" && msg !== null) {
            try {
              return JSON.stringify(msg, null, 2);
            } catch {
              return msg;
            }
          }
          return msg;
        });

        console.log(
          `%c[${levelName.toUpperCase()}]`,
          `color: ${color}; font-weight: bold`,
          ...expandedMessages
        );
      },
    },
  },
});
