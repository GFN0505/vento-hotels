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

export class MemoryEmailProvider implements EmailProvider {
  readonly sent: EmailMessage[] = []

  async send(message: EmailMessage): Promise<void> {
    this.sent.push(message)
  }

  lastTo(email: string): EmailMessage | undefined {
    return this.sent.findLast((m) => m.to === email)
  }
}
