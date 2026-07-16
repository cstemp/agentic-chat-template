# Agent Workspace Template

## Executive Summary

A production-ready template for building AI-powered workspace applications that runs entirely on Cloudflare's infrastructure. Deploy in minutes with zero external dependencies.

## What It Does

The template provides a complete workspace-based AI assistant interface where users can:

- Create and manage multiple workspaces for different projects
- Chat with an AI agent that can plan, use tools, and provide informed responses
- Configure external tool integrations via MCP (Model Context Protocol) servers
- Access their workspaces from any device with persistent history

## Architecture

The entire application runs on Cloudflare's edge network:

| Component | Cloudflare Service |
|-----------|-------------------|
| Compute & API | Workers |
| AI Inference | Workers AI |
| Database | D1 (SQLite) |
| Authentication | Access |
| Analytics & Caching | AI Gateway |
| Web Content Extraction | Browser Run |

No external databases, no third-party AI APIs, no additional infrastructure to manage.

## Key Capabilities

**Agent Workflow**: The AI doesn't just respond—it plans its approach, calls relevant tools to gather information, then synthesizes a final answer. Users see this process in real-time.

**Tool Integration**: Built-in tools for common tasks, plus users can connect their own MCP-compatible tool servers for custom integrations (CRM systems, internal APIs, etc.).

**Multi-Model Support**: 16 Workers AI models available out of the box, from fast 8B parameter models to high-capability 70B models. Easily extensible to include any model supported by Workers AI, or bring your own models through AI Gateway's universal endpoint (OpenAI, Anthropic, Azure, Google AI, and more).

**Enterprise-Ready Authentication**: Cloudflare Access provides SSO integration with identity providers (Google, Okta, Azure AD, etc.) out of the box.

## Extensibility

The template is designed as a starting point. Common extensions include:

- **Custom tools**: Add domain-specific tools for your use case
- **Skills**: Create reusable workflow recipes in markdown
- **Branding**: White-label the interface for your organization
- **Storage**: Add R2 for file attachments and outputs

## Cost Model

Cloudflare's usage-based pricing means you pay for what you use:

- **Workers**: First 100K requests/day free, then $0.30/million
- **Workers AI**: Pay per inference (varies by model)
- **D1**: 5GB free, then $0.75/GB-month
- **Access**: Free for up to 50 users

## Resources

- [Technical Documentation](./README.md)
- [Cloudflare Reference Architecture](https://developers.cloudflare.com/reference-architecture/diagrams/ai/enterprise-ai-agent-workspace/)
