interface Email {
  to: string;
  subject: string;
  body: string;
}

interface EmailLogEntry extends Email {
  sentAt: string;
}

const emailLog: EmailLogEntry[] = [];

export function sendEmail(email: Email): void {
  const entry: EmailLogEntry = {
    ...email,
    sentAt: new Date().toISOString(),
  };
  emailLog.push(entry);
  console.log(`[email] To: ${email.to} | Subject: ${email.subject}`);
}

export function getEmailLog(): readonly EmailLogEntry[] {
  return emailLog;
}

export function clearEmailLog(): void {
  emailLog.length = 0;
}
