package main

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
)

const openRouterURL = "https://openrouter.ai/api/v1/chat/completions"

// openRouterClient talks to OpenRouter's OpenAI-compatible chat completions API.
type openRouterClient struct {
	key   string
	model string
	http  *http.Client
}

// llmMessage is the OpenAI/OpenRouter request message shape.
type llmMessage struct {
	Role    string `json:"role"` // "system" | "user" | "assistant"
	Content string `json:"content"`
}

// stream POSTs msgs with stream:true and calls onText for each text delta. It
// returns an error if the request fails, the status is not 200, or the scan
// errors. ctx cancellation (client disconnect) aborts the upstream call.
func (c *openRouterClient) stream(ctx context.Context, msgs []llmMessage, onText func(string)) error {
	reqBody, err := json.Marshal(map[string]any{
		"model":    c.model,
		"messages": msgs,
		"stream":   true,
	})
	if err != nil {
		return err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, openRouterURL, bytes.NewReader(reqBody))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+c.key)
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.http.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("openrouter: status %d", resp.StatusCode)
	}

	// OpenAI-style SSE: lines like `data: {json}`, ending with `data: [DONE]`.
	// Lines that don't start with "data: " (blanks, ":" keep-alives) are skipped.
	scanner := bufio.NewScanner(resp.Body)
	scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024) // allow long SSE lines
	for scanner.Scan() {
		line := scanner.Text()
		if !strings.HasPrefix(line, "data: ") {
			continue
		}
		data := strings.TrimPrefix(line, "data: ")
		if data == "[DONE]" {
			break
		}
		var chunk struct {
			Choices []struct {
				Delta struct {
					Content string `json:"content"`
				} `json:"delta"`
			} `json:"choices"`
		}
		if err := json.Unmarshal([]byte(data), &chunk); err != nil {
			continue // ignore unexpected frames
		}
		if len(chunk.Choices) > 0 && chunk.Choices[0].Delta.Content != "" {
			onText(chunk.Choices[0].Delta.Content)
		}
	}
	return scanner.Err()
}
