// Every outside service sits behind an interface (decision 0011). The real email provider is still
// an open question; until then emails print to the console locally and are captured in tests.
export type EmailMessage = { to: string; subject: string; text: string }

export interface EmailProvider {
  send(message: EmailMessage): Promise<void>
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
    const { mkdir, writeFile } = await import('node:fs/promises')
    const { join } = await import('node:path')
    await mkdir(this.folder, { recursive: true })
    const safe = message.to.replace(/[^a-z0-9@.-]/gi, '_')
    await writeFile(
      join(this.folder, `${Date.now()}-${safe}.json`),
      JSON.stringify(message, null, 2),
    )
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
