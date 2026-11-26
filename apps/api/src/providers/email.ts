// Every outside service sits behind an interface (decision 0011). The real email provider is still
// an open question; until then emails print to the console locally and are captured in tests.
export type EmailMessage = { to: string; subject: string; text: string }

export interface EmailProvider {
  send(message: EmailMessage): Promise<void>
}

// On a real server with no email provider yet (an open question in docs/DOMAIN.md): refuse, with a
// warning naming the subject only. Printing the email would put sign-in links in the logs.
export class NoEmailProvider implements EmailProvider {
  async send(message: EmailMessage): Promise<void> {
    const { logger } = await import('../observability/log.ts')
    logger.warn({ subject: message.subject }, 'No email provider is set up; email not sent')
  }
}

export class ConsoleEmailProvider implements EmailProvider {
  async send(message: EmailMessage): Promise<void> {
    console.log(`✉ To ${message.to}: ${message.subject}\n${message.text}\n`)
  }
}

// Writes each email as a JSON file in a folder, for local development and browser tests: open the
// newest file to find a confirmation link. Never used in production.
export class FileEmailProvider implements EmailProvider {
  readonly folder: string

  constructor(folder: string) {
    this.folder = folder
  }

  async send(message: EmailMessage): Promise<void> {
    const { mkdir, rename, writeFile } = await import('node:fs/promises')
    const { join } = await import('node:path')
    await mkdir(this.folder, { recursive: true })
    const safe = message.to.replace(/[^a-z0-9@.-]/gi, '_')
    const file = join(this.folder, `${Date.now()}-${safe}.json`)
    // Written under a temporary name, then renamed: a reader never sees a half-written email.
    await writeFile(`${file}.tmp`, JSON.stringify(message, null, 2))
    await rename(`${file}.tmp`, file)
  }
}

export class MemoryEmailProvider implements EmailProvider {
  readonly sent: EmailMessage[] = []

  async send(message: EmailMessage): Promise<void> {
    this.sent.push(message)
  }

  lastTo(email: string): EmailMessage | undefined {
    return this.sent.findLast((m) => m.to === email)
  }
}
