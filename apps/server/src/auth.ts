import { createHash, randomBytes } from 'node:crypto';
import type { Client } from '@libsql/client';

/**
 * Email sign-in links and sessions. Tokens are random 256-bit values; only their
 * SHA-256 hashes are stored, so a database leak doesn't expose usable tokens.
 * Sign in with Apple / Google / passkeys come later and create the same sessions.
 */

export interface Mailer {
  send(msg: { to: string; subject: string; text: string }): Promise<void>;
}

/** Development mailer: logs the message and keeps the last ones in memory. */
export class DevMailer implements Mailer {
  readonly sent: Array<{ to: string; subject: string; text: string }> = [];
  constructor(private readonly log: (msg: string) => void = () => {}) {}
  async send(msg: { to: string; subject: string; text: string }) {
    this.sent.push(msg);
    if (this.sent.length > 50) this.sent.shift();
    this.log(`[dev mail] to ${msg.to}: ${msg.subject}\n${msg.text}`);
  }
}

export interface User {
  id: string;
  email: string;
}

const LINK_TTL_MS = 15 * 60_000;
const SESSION_TTL_MS = 30 * 24 * 3_600_000;
const MAX_LINKS_PER_HOUR = 5;

const hash = (token: string) => createHash('sha256').update(token).digest('hex');
const newToken = () => randomBytes(32).toString('base64url');

export function normalizeEmail(input: string): string | null {
  const email = input.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

export class AuthService {
  constructor(
    private readonly db: Client,
    private readonly mailer: Mailer,
    private readonly opts: { appUrl: string },
  ) {}

  /**
   * Sends a sign-in link. Always resolves the same way whether or not the email has an
   * account (no account enumeration). Returns the token only for tests/dev tooling.
   */
  async requestLink(rawEmail: string): Promise<{ sent: boolean; token?: string }> {
    const email = normalizeEmail(rawEmail);
    if (!email) return { sent: false };
    const recent = await this.db.execute({
      sql: 'SELECT COUNT(*) AS n FROM login_links WHERE email = ? AND created_at > ?',
      args: [email, Date.now() - 3_600_000],
    });
    if (Number(recent.rows[0]?.n ?? 0) >= MAX_LINKS_PER_HOUR) return { sent: false };
    const token = newToken();
    await this.db.execute({
      sql: 'INSERT INTO login_links (token_hash, email, expires_at, created_at) VALUES (?, ?, ?, ?)',
      args: [hash(token), email, Date.now() + LINK_TTL_MS, Date.now()],
    });
    const link = `${this.opts.appUrl.replace(/\/$/, '')}/sign-in?token=${encodeURIComponent(token)}`;
    await this.mailer.send({
      to: email,
      subject: 'Your Saywright sign-in link',
      text: `Tap to sign in to Saywright:\n\n${link}\n\nThe link works once and expires in 15 minutes. If you didn't ask for it, ignore this email.`,
    });
    return { sent: true, token };
  }

  /** Exchanges a sign-in link token (once) for a session. */
  async verify(token: string): Promise<{ session: string; user: User } | null> {
    const r = await this.db.execute({
      sql: 'UPDATE login_links SET used_at = ? WHERE token_hash = ? AND used_at IS NULL AND expires_at > ? RETURNING email',
      args: [Date.now(), hash(token), Date.now()],
    });
    const email = r.rows[0]?.email ? String(r.rows[0].email) : null;
    if (!email) return null;
    await this.db.execute({
      sql: 'INSERT INTO users (id, email, created_at) VALUES (?, ?, ?) ON CONFLICT(email) DO NOTHING',
      args: [`u_${randomBytes(8).toString('hex')}`, email, Date.now()],
    });
    const u = await this.db.execute({ sql: 'SELECT id, email FROM users WHERE email = ?', args: [email] });
    const user = { id: String(u.rows[0]!.id), email };
    const session = newToken();
    await this.db.execute({
      sql: 'INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)',
      args: [hash(session), user.id, Date.now() + SESSION_TTL_MS, Date.now()],
    });
    return { session, user };
  }

  async authenticate(session: string | undefined): Promise<User | null> {
    if (!session || session.length > 100) return null;
    const r = await this.db.execute({
      sql: 'SELECT u.id, u.email FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?',
      args: [hash(session), Date.now()],
    });
    const row = r.rows[0];
    return row ? { id: String(row.id), email: String(row.email) } : null;
  }

  async signOut(session: string): Promise<void> {
    await this.db.execute({ sql: 'DELETE FROM sessions WHERE token_hash = ?', args: [hash(session)] });
  }
}
