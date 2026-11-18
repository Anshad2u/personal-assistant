# Personal Assistant

A private AI assistant for each member of your workspace. It remembers what matters about you, keeps separate project conversations with their files, runs tasks on a schedule, suggests next steps and browses the web for you, asking before it sends anything.

Inspired by https://hark.com

Built with [oss.new](https://oss.new) for [EveryApp](https://github.com/every-app/every-app).

## Features

- Chat with the assistant in one ongoing conversation, with streamed Markdown replies and a retry for failed ones.
- Keep projects, each with its own conversation and uploaded files the assistant reads.
- Review, add, edit and delete what the assistant remembers, or ask it in chat to forget something.
- Schedule tasks once, daily or weekly in your time zone, from a form or by asking in chat.
- Act on suggested next-step cards on Home, or dismiss them.
- Hand off a web errand: watch each step and approve or reject any form before it is sent.

Left out: accounts and sign-in, which your Gateway handles; mobile apps and texting; generated mini-apps and saved workflows; mail, calendar and other service connections; saved logins and payments; plans and billing.

## Setup

- Install: `pnpm install`
- Run locally: `pnpm dev` (put an AI provider key such as `OPENROUTER_API_KEY` in `.dev.vars`)
- Test: `pnpm test` for unit tests; `checks/` holds the release suites run against a packaged build.
- Deploy: `pnpm run deploy`, or install a release with `pnpm everyapp install <repository url>`.

There are no secrets or settings. The app uses the workspace's default AI model through the Gateway (`everyapp ai default`, or add a provider key with `everyapp provider add openrouter`), a D1 database, an R2 bucket for project files and a queue for web handoffs, all created by the deploy. R2 must be enabled on the Cloudflare account once.

## Limitations

- Web handoffs read pages over plain HTTP from the Worker: no JavaScript, logins or cookies, so script-heavy sites read poorly.
- Scheduled tasks are checked once a minute.
- Files are read into replies only when they are .txt, .md, .csv or .json and at most 100 KB; uploads are limited to 10 MB.
- Real AI provider calls and live deployment were not exercised by the local checks, which use a stand-in model.
