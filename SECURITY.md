# Security Policy

## Reporting a Vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**
Public issues are visible to everyone immediately, including anyone who
might exploit the report before a fix ships.

Instead, report privately to: **[your-security-contact-email]**
(or use GitHub's private "Report a vulnerability" button under the
Security tab, if enabled on this repo).

Please include:
- A description of the vulnerability and its potential impact
- Steps to reproduce, or a proof-of-concept if available
- The version/commit affected

## What to expect

- Acknowledgment of your report within a reasonable time frame
- An assessment of severity and an estimated timeline for a fix
- Credit in the release notes once fixed, if you'd like (opt-in — let us
  know your preference when reporting)

## Scope

This policy covers the SuperAgent CLI, desktop app, and web/VPS GUI code
in this repository. It does not cover third-party model providers you
connect (OpenRouter, Ollama, Nvidia, etc.) — please report issues with
those services directly to their maintainers.

## Supported Versions

| Version        | Supported          |
| -------------- | ------------------ |
| Latest release | :white_check_mark: |
| Older releases | :x:                |

## Good-faith security research

We support good-faith security research conducted in line with this
policy. We will not pursue legal action against researchers who:
- Report privately and give us reasonable time to fix before disclosure
- Avoid accessing, modifying, or deleting data beyond what's needed to
  demonstrate the issue
- Do not test against production instances they don't own or have explicit
  permission to test
