import { createHash } from 'node:crypto';

interface StateStore { get<T>(key: string): T | undefined; update(key: string, value: unknown): PromiseLike<void> }
interface Secrets { get(key: string): PromiseLike<string | undefined>; store(key: string, value: string): PromiseLike<void>; delete(key: string): PromiseLike<void> }
export class ConnectionSession {
  demo = false;
  environment?: string;
  constructor(private state: StateStore, private secrets: Secrets, private namespace: string) { this.environment = this.state.get<string>('environment'); }
  get url(): string | undefined { return this.state.get<string>('instanceUrl'); }
  private key(url: string) { return `pat.${createHash('sha256').update(`${this.namespace}|${url}`).digest('hex')}`; }
  enterDemo() { this.demo = true; this.environment = undefined; }
  async restore() {
    this.demo = false;
    this.environment = this.state.get<string>('environment');
    return this.savedProfile();
  }
  async savedProfile() {
    const url = this.url;
    const token = url && await this.secrets.get(this.key(url));
    return url && token ? { url, token } : undefined;
  }
  async selectEnvironment(environment?: string) {
    this.environment = environment;
    if (!this.demo) await this.state.update('environment', environment);
  }
  async save(url: string, token: string) {
    const previous = this.url;
    await this.secrets.store(this.key(url), token);
    if (previous && previous !== url) await this.secrets.delete(this.key(previous));
    await this.state.update('instanceUrl', url);
    if (previous !== url) await this.state.update('environment', undefined);
    this.demo = false;
    this.environment = this.state.get<string>('environment');
  }
  async forget() {
    if (this.url) await this.secrets.delete(this.key(this.url));
    await this.state.update('instanceUrl', undefined);
    await this.state.update('environment', undefined);
    this.demo = false; this.environment = undefined;
  }
}
