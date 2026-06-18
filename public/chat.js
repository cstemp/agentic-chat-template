/**
 * Agent Workflow App Frontend
 *
 * Handles the chat UI interactions and communication with the backend API.
 */

// DOM elements
const chatMessages = document.getElementById("chat-messages");
const userInput = document.getElementById("user-input");
const sendButton = document.getElementById("send-button");
const typingIndicator = document.getElementById("typing-indicator");
const skillSelect = document.getElementById("skill-select");

// Chat state
let chatHistory = [
	{
		role: "assistant",
		content:
			"Describe a task and I will plan the workflow, call demo tools, and stream back a final answer.",
	},
];
let isProcessing = false;

// Auto-resize textarea as user types
userInput.addEventListener("input", function () {
	this.style.height = "auto";
	this.style.height = this.scrollHeight + "px";
});

// Send message on Enter (without Shift)
userInput.addEventListener("keydown", function (e) {
	if (e.key === "Enter" && !e.shiftKey) {
		e.preventDefault();
		sendMessage();
	}
});

// Send button click handler
sendButton.addEventListener("click", sendMessage);

loadSkills();

/**
 * Sends a message to the chat API and processes the response
 */
async function sendMessage() {
	const message = userInput.value.trim();

	// Don't send empty messages
	if (message === "" || isProcessing) return;

	// Disable input while processing
	isProcessing = true;
	userInput.disabled = true;
	sendButton.disabled = true;

	// Add user message to chat
	addMessageToChat("user", message);

	// Clear input
	userInput.value = "";
	userInput.style.height = "auto";

	// Show typing indicator
	typingIndicator.classList.add("visible");

	// Add message to history
	chatHistory.push({ role: "user", content: message });

	try {
		const agentRun = createAgentRunMessage();

		// Scroll to bottom
		chatMessages.scrollTop = chatMessages.scrollHeight;

		// Send request to API
		const response = await fetch("/api/agent", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				messages: chatHistory,
				skill: skillSelect.value || undefined,
			}),
		});

		// Handle errors
		if (!response.ok) {
			throw new Error("Failed to get response");
		}
		if (!response.body) {
			throw new Error("Response body is null");
		}

		// Process streaming agent events.
		const reader = response.body.getReader();
		const decoder = new TextDecoder();
		let responseText = "";
		let buffer = "";
		const flushAssistantText = () => {
			agentRun.answerEl.textContent = responseText;
			chatMessages.scrollTop = chatMessages.scrollHeight;
		};

		let sawDone = false;
		while (true) {
			const { done, value } = await reader.read();

			if (done) {
				const parsed = consumeSseEvents(buffer + "\n\n");
				for (const data of parsed.events) {
					const result = processAgentEvent(data, agentRun, responseText);
					responseText = result.responseText;
					if (result.updatedAnswer) flushAssistantText();
				}
				break;
			}

			// Decode chunk
			buffer += decoder.decode(value, { stream: true });
			const parsed = consumeSseEvents(buffer);
			buffer = parsed.buffer;
			for (const data of parsed.events) {
				const result = processAgentEvent(data, agentRun, responseText);
				responseText = result.responseText;
				if (result.updatedAnswer) flushAssistantText();
				if (result.done) {
					sawDone = true;
					buffer = "";
					break;
				}
			}
			if (sawDone) {
				break;
			}
		}

		// Add completed response to chat history
		if (responseText.length > 0) {
			chatHistory.push({ role: "assistant", content: responseText });
		}
	} catch (error) {
		console.error("Error:", error);
		addMessageToChat(
			"assistant",
			"Sorry, there was an error processing your request.",
		);
	} finally {
		// Hide typing indicator
		typingIndicator.classList.remove("visible");

		// Re-enable input
		isProcessing = false;
		userInput.disabled = false;
		sendButton.disabled = false;
		userInput.focus();
	}
}

/**
 * Helper function to add message to chat
 */
function addMessageToChat(role, content) {
	const messageEl = document.createElement("div");
	messageEl.className = `message ${role}-message`;
	const messageTextEl = document.createElement("p");
	messageTextEl.textContent = content;
	messageEl.appendChild(messageTextEl);
	chatMessages.appendChild(messageEl);

	// Scroll to bottom
	chatMessages.scrollTop = chatMessages.scrollHeight;
}

async function loadSkills() {
	try {
		const response = await fetch("/api/skills");
		if (!response.ok) return;

		const data = await response.json();
		for (const skill of data.skills ?? []) {
			const option = document.createElement("option");
			option.value = skill.name;
			option.textContent = skill.name;
			option.title = skill.description;
			skillSelect.appendChild(option);
		}
	} catch (error) {
		console.error("Error loading skills:", error);
	}
}

function createAgentRunMessage() {
	const messageEl = document.createElement("div");
	messageEl.className = "message assistant-message";

	const stepsEl = document.createElement("div");
	stepsEl.className = "agent-steps";

	const answerEl = document.createElement("p");
	answerEl.textContent = "";

	messageEl.appendChild(stepsEl);
	messageEl.appendChild(answerEl);
	chatMessages.appendChild(messageEl);

	return { stepsEl, answerEl };
}

function processAgentEvent(data, agentRun, responseText) {
	try {
		const event = JSON.parse(data);

		if (event.type === "status") {
			addAgentStep(agentRun.stepsEl, "Status", event.message);
			return { responseText, updatedAnswer: false, done: false };
		}

		if (event.type === "plan") {
			const tools = event.toolCalls?.map((tool) => tool.name).join(", ") || "none";
			addAgentStep(agentRun.stepsEl, "Plan", `${event.thought}\nTools: ${tools}`);
			return { responseText, updatedAnswer: false, done: false };
		}

		if (event.type === "tool_result") {
			addAgentStep(agentRun.stepsEl, `Tool: ${event.name}`, event.result);
			return { responseText, updatedAnswer: false, done: false };
		}

		if (event.type === "answer_delta") {
			return {
				responseText: responseText + event.content,
				updatedAnswer: true,
				done: false,
			};
		}

		if (event.type === "error") {
			addAgentStep(agentRun.stepsEl, "Error", event.message);
			return { responseText, updatedAnswer: false, done: true };
		}

		return { responseText, updatedAnswer: false, done: event.type === "done" };
	} catch (error) {
		console.error("Error parsing agent SSE data:", error, data);
		return { responseText, updatedAnswer: false, done: false };
	}
}

function addAgentStep(stepsEl, label, content) {
	const stepEl = document.createElement("div");
	stepEl.className = "agent-step";

	const labelEl = document.createElement("strong");
	labelEl.textContent = label;

	const contentEl = document.createElement("p");
	contentEl.textContent = content;

	stepEl.appendChild(labelEl);
	stepEl.appendChild(contentEl);
	stepsEl.appendChild(stepEl);
	chatMessages.scrollTop = chatMessages.scrollHeight;
}

function consumeSseEvents(buffer) {
	let normalized = buffer.replace(/\r/g, "");
	const events = [];
	let eventEndIndex;
	while ((eventEndIndex = normalized.indexOf("\n\n")) !== -1) {
		const rawEvent = normalized.slice(0, eventEndIndex);
		normalized = normalized.slice(eventEndIndex + 2);

		const lines = rawEvent.split("\n");
		const dataLines = [];
		for (const line of lines) {
			if (line.startsWith("data:")) {
				dataLines.push(line.slice("data:".length).trimStart());
			}
		}
		if (dataLines.length === 0) continue;
		events.push(dataLines.join("\n"));
	}
	return { events, buffer: normalized };
}
