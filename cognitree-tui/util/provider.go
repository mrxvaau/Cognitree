package util

import (
	"net/url"
	"strings"
)

// ExtractProvider derives a human-friendly provider name from an LLM base URL.
//
// Rules:
//   - Parse the hostname, split by "."
//   - Take the second-to-last label (the domain name without TLD)
//   - Special case: localhost → "local"
//   - If URL is empty or unparseable → return "anthropic"
//
// Examples:
//
//	"https://api.openai.com/v1"              → "openai"
//	"https://api.anthropic.com"              → "anthropic"
//	"https://router.bynara.id/v1"            → "bynara"
//	"https://api.tokenrouter.com/v1"         → "tokenrouter"
//	"http://localhost:11434/v1"              → "local"
//	"http://127.0.0.1:11434"                 → "local"
func ExtractProvider(baseURL string) string {
	if baseURL == "" {
		return "anthropic"
	}
	u, err := url.Parse(baseURL)
	if err != nil {
		return "anthropic"
	}
	host := u.Hostname()
	if host == "" {
		return "anthropic"
	}
	// localhost / loopback → local
	if host == "localhost" || strings.HasPrefix(host, "127.") || host == "::1" {
		return "local"
	}
	parts := strings.Split(host, ".")
	if len(parts) == 1 {
		return parts[0]
	}
	// second-to-last label is the domain name
	return parts[len(parts)-2]
}
