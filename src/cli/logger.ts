import kleur from 'kleur';
import ora, { type Ora } from 'ora';

export type Verbosity = 'quiet' | 'normal' | 'verbose';

export class Logger {
  private spinner: Ora | undefined;
  constructor(public level: Verbosity = 'normal') {}

  info(msg: string): void {
    if (this.level === 'quiet') return;
    if (this.spinner) this.spinner.text = msg;
    else console.error(kleur.gray('· ') + msg);
  }

  success(msg: string): void {
    if (this.level === 'quiet') return;
    this.stop();
    console.error(kleur.green('✓ ') + msg);
  }

  warn(msg: string): void {
    if (this.level === 'quiet') return;
    this.stop();
    console.error(kleur.yellow('! ') + msg);
  }

  error(msg: string): void {
    this.stop();
    console.error(kleur.red('✗ ') + msg);
  }

  debug(msg: string): void {
    if (this.level !== 'verbose') return;
    this.stop();
    console.error(kleur.gray('  ' + msg));
  }

  start(text: string): void {
    if (this.level === 'quiet') return;
    if (this.spinner) {
      this.spinner.text = text;
    } else {
      this.spinner = ora({ text, color: 'cyan' }).start();
    }
  }

  update(text: string): void {
    if (this.level === 'quiet') return;
    if (this.spinner) this.spinner.text = text;
    else this.start(text);
  }

  stop(): void {
    if (this.spinner) {
      this.spinner.stop();
      this.spinner = undefined;
    }
  }

  succeed(text: string): void {
    if (this.level === 'quiet') return;
    if (this.spinner) {
      this.spinner.succeed(text);
      this.spinner = undefined;
    } else {
      console.error(kleur.green('✓ ') + text);
    }
  }

  fail(text: string): void {
    if (this.spinner) {
      this.spinner.fail(text);
      this.spinner = undefined;
    } else {
      console.error(kleur.red('✗ ') + text);
    }
  }
}

export const k = kleur;
