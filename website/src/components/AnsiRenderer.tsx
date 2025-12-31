import React, { useEffect, useRef, useState } from "react";
import Convert from "ansi-to-html";
import { useWebSocket } from "@/contexts/WebSocketContext";

const convert = new Convert({
  fg: "#1f2937", // slate-800
  bg: "#ffffff",
  newline: true,
  escapeXML: true,
  stream: false,
  colors: {
    // Override the default ANSI colors with brighter variants
    // Especially important for blue
    1: "#dc2626", // red
    2: "#16a34a", // green
    3: "#ca8a04", // yellow
    4: "#2563eb", // blue
    5: "#c026d3", // magenta
    6: "#0891b2", // cyan
  },
});

interface AnsiRendererProps {
  text: string;
  readyState: number;
  setTerminalOutput: (text: string) => void;
}

const AnsiRenderer: React.FC<AnsiRendererProps> = ({
  text,
  readyState,
  setTerminalOutput,
}) => {
  const html = convert.toHtml(text);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [userInput, setUserInput] = useState("");
  const { sendMessage } = useWebSocket();

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [text]);

  const handleSendMessage = () => {
    const trimmedInput = userInput.trim();
    if (trimmedInput) {
      sendMessage(trimmedInput);
      setTerminalOutput(text + "\n$ " + trimmedInput);
      setUserInput("");
    }
  };

  const isWebSocketClosed = readyState === WebSocket.CLOSED;

  return (
    <div
      className={`flex flex-col h-full bg-white text-slate-800 font-mono rounded-lg border border-slate-200 overflow-hidden ${
        isWebSocketClosed ? "opacity-60" : ""
      }`}
    >
      <div
        ref={scrollRef}
        className="flex-1 min-h-0 overflow-y-auto p-4 scrollbar-thin scrollbar-thumb-slate-300 scrollbar-track-slate-100 hover:scrollbar-thumb-slate-400"
      >
        <pre
          className="m-0 whitespace-pre-wrap break-words leading-tight text-sm"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
      <div className="flex-none p-2 border-t border-slate-200">
        <div className="flex items-center mb-2">
          <span className="text-emerald-600 mr-2">$</span>
          <input
            type="text"
            value={userInput}
            onChange={(e) => setUserInput(e.target.value)}
            onKeyPress={(e) => e.key === "Enter" && handleSendMessage()}
            className={`flex-grow bg-transparent text-slate-800 outline-none placeholder:text-slate-400 ${
              isWebSocketClosed ? "cursor-not-allowed" : ""
            }`}
            placeholder={isWebSocketClosed ? "WebSocket 已断开..." : ""}
            disabled={isWebSocketClosed}
          />
          {userInput.trim() && !isWebSocketClosed && (
            <button
              onClick={handleSendMessage}
              className="ml-2 px-2 py-1 bg-emerald-600 text-white rounded hover:bg-emerald-700 transition-colors"
            >
              ⏎
            </button>
          )}
        </div>
        <div className="flex justify-between items-center text-xs text-slate-500">
          <div className={isWebSocketClosed ? "text-red-500" : ""}>
            状态：
            {readyState === WebSocket.CONNECTING
              ? "连接中"
              : readyState === WebSocket.OPEN
              ? "已连接"
              : readyState === WebSocket.CLOSING
              ? "关闭中"
              : readyState === WebSocket.CLOSED
              ? "已断开"
              : "未知"}
          </div>
          <button
            onClick={() => setTerminalOutput("")}
            className={`hover:text-slate-900 transition-colors ${
              isWebSocketClosed ? "cursor-not-allowed opacity-50" : ""
            }`}
            disabled={isWebSocketClosed}
          >
            清空
          </button>
        </div>
      </div>
    </div>
  );
};

export default AnsiRenderer;
